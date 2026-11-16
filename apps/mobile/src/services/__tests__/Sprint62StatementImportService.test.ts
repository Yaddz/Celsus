import fs from 'fs';
import path from 'path';
import {
  resetDatabase,
  SCHEMA_INDEXES_SQL,
  SCHEMA_SQL,
  SCHEMA_UPGRADES,
} from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { backupService } from '../backupService';
import { finService } from '../finService';
import { statementImportService } from '../statementImportService';

const FIXTURES_DIR = path.join(
  __dirname,
  '../../domain/statementImport/__tests__/fixtures'
);

function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
}

describe('Sprint 62 — Serviço de Importação, Banco, Regras e Backup (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S62-T10: schema e migrações incluem source, external_id, import_batch_id e fin_category_rules', () => {
    expect(SCHEMA_SQL).toContain('fin_category_rules');
    expect(SCHEMA_SQL).toContain('match_type');
    expect(SCHEMA_SQL).toContain('hits');
    expect(SCHEMA_SQL).toContain('source TEXT');
    expect(SCHEMA_SQL).toContain('external_id TEXT');
    expect(SCHEMA_SQL).toContain('import_batch_id TEXT');
    expect(SCHEMA_INDEXES_SQL).toContain('idx_fin_entries_account_external');
    expect(SCHEMA_INDEXES_SQL).toMatch(/UNIQUE\s+INDEX/i);
    expect(
      SCHEMA_UPGRADES.some(
        (u) => u.table === 'fin_entries' && u.column === 'source'
      )
    ).toBe(true);
    expect(
      SCHEMA_UPGRADES.some(
        (u) => u.table === 'fin_entries' && u.column === 'external_id'
      )
    ).toBe(true);
    expect(
      SCHEMA_UPGRADES.some(
        (u) => u.table === 'fin_entries' && u.column === 'import_batch_id'
      )
    ).toBe(true);
  });

  test('S62-T11: previewFile + commitImport grava lançamentos do OFX com bill_month, parcelas e source FILE_IMPORT', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank Cartão',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 500000,
    });

    const preview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('nubank_card.ofx'),
      fileName: 'nubank_card.ofx',
      accountId: card.id,
    });

    expect(preview.fileType).toBe('ofx');
    expect(preview.needsManualMapping).toBe(false);
    expect(preview.counts).toEqual({
      total: 14,
      newCount: 14,
      duplicateCount: 0,
      settlePendingCount: 0,
    });

    const commit = await statementImportService.commitImport({
      accountId: card.id,
      rows: preview.rows,
    });

    expect(commit.batchId).toBeTruthy();
    expect(commit.createdCount).toBe(14);
    expect(commit.settledCount).toBe(0);

    const allEntries = await finRepository.listAllEntries();
    const imported = allEntries.filter((e: any) => e.account_id === card.id);
    expect(imported).toHaveLength(14);
    expect(imported.every((e: any) => e.source === 'FILE_IMPORT')).toBe(true);
    expect(imported.every((e: any) => e.import_batch_id === commit.batchId)).toBe(true);

    const shopee = imported.find((e) => e.description.includes('Shopee'));
    expect(shopee?.installment_number).toBe(12);
    expect(shopee?.installment_total).toBe(12);
    expect(shopee?.bill_month).toBe('2026-11'); // 2026-11-02 <= closing_day 10

    const dlocal = imported.find((e) => e.description.includes('DLOCAL'));
    expect(dlocal?.bill_month).toBe('2026-12'); // 2026-11-15 > closing_day 10
  });

  test('S62-T12: idempotência — importar o mesmo arquivo duas vezes não duplica lançamentos', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank Cartão',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    const firstPreview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('nubank_card.csv'),
      fileName: 'nubank_card.csv',
      accountId: card.id,
    });
    expect(firstPreview.counts.newCount).toBe(14);
    await statementImportService.commitImport({
      accountId: card.id,
      rows: firstPreview.rows,
    });

    const secondPreview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('nubank_card.csv'),
      fileName: 'nubank_card.csv',
      accountId: card.id,
    });
    expect(secondPreview.counts.newCount).toBe(0);
    expect(secondPreview.counts.duplicateCount).toBe(14);

    const secondCommit = await statementImportService.commitImport({
      accountId: card.id,
      rows: secondPreview.rows,
    });
    expect(secondCommit.createdCount).toBe(0);
    expect(secondCommit.skippedDuplicateCount).toBe(14);

    const entries = await finRepository.listAllEntries();
    expect(entries.filter((e) => e.account_id === card.id)).toHaveLength(14);
  });

  test('S62-T13: reconciliação dá baixa em lançamento pendente em até 5 dias sem criar duplicata', async () => {
    const checking = await finRepository.createAccount({
      name: 'Inter',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    const pending = await finRepository.createEntry({
      kind: 'expense',
      amountCents: 11990,
      dueDate: '2026-11-12', // 3 dias após 2026-11-09 do inter.csv
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Internet Fibra',
      status: 'pending',
    });

    const preview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('inter.csv'),
      fileName: 'inter.csv',
      accountId: checking.id,
    });
    expect(preview.counts.settlePendingCount).toBe(1);
    expect(preview.counts.newCount).toBe(2);

    const commit = await statementImportService.commitImport({
      accountId: checking.id,
      rows: preview.rows,
    });
    expect(commit.settledCount).toBe(1);
    expect(commit.createdCount).toBe(2);

    const all = await finRepository.listAllEntries();
    const checkingEntries = all.filter((e) => e.account_id === checking.id);
    expect(checkingEntries).toHaveLength(3);

    const updatedPending = checkingEntries.find((e) => e.id === pending.id);
    expect(updatedPending?.status).toBe('paid');
    expect(updatedPending?.paid_date).toBe('2026-11-09');
    expect(updatedPending?.paid_amount_cents).toBe(11990);
  });

  test('S62-T14: undoImportBatch apaga lançamentos criados pelo batch_id e reverte baixas do lote', async () => {
    const checking = await finRepository.createAccount({
      name: 'Inter',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    const pending = await finRepository.createEntry({
      kind: 'expense',
      amountCents: 11990,
      dueDate: '2026-11-12',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Internet Fibra',
      status: 'pending',
    });

    const preview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('inter.csv'),
      fileName: 'inter.csv',
      accountId: checking.id,
    });
    const commit = await statementImportService.commitImport({
      accountId: checking.id,
      rows: preview.rows,
    });

    const undo = await statementImportService.undoImportBatch(commit.batchId);
    expect(undo.deletedCount).toBe(2);
    expect(undo.revertedSettledCount).toBe(1);

    const remaining = (await finRepository.listAllEntries()).filter(
      (e) => e.account_id === checking.id
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(pending.id);
    expect(remaining[0].status).toBe('pending');
    expect(remaining[0].paid_date).toBeNull();
  });

  test('S62-T15: regras de categoria (CRUD + hits + backup .celsus.zip)', async () => {
    const rule = await statementImportService.saveCategoryRule({
      pattern: 'ARCOs Dourados',
      matchType: 'contains',
      kind: 'expense',
      categoryId: 'cat-lazer',
    });
    expect(rule.pattern).toBe('arcos dourados');

    const rules = await statementImportService.listCategoryRules();
    expect(rules).toHaveLength(1);

    const card = await finRepository.createAccount({
      name: 'Nubank',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
    });

    const preview = await statementImportService.previewFile({
      fileBytes: readFixtureBytes('nubank_card.csv'),
      fileName: 'nubank_card.csv',
      accountId: card.id,
    });
    const arcosRows = preview.rows.filter((r) =>
      r.description.includes('ARCOS DOURADOS')
    );
    expect(arcosRows.length).toBe(3);
    expect(arcosRows.every((r) => r.categoryId === 'cat-lazer')).toBe(true);

    await statementImportService.commitImport({
      accountId: card.id,
      rows: preview.rows,
    });

    const afterCommitRules = await statementImportService.listCategoryRules();
    expect(afterCommitRules[0].hits).toBeGreaterThanOrEqual(3);

    // Backup e restore preservam regras e source/external_id
    const zipBytes = await backupService.createBackupZip();
    await resetDatabase();
    await backupService.restoreFromZip(zipBytes);

    const restoredRules = await statementImportService.listCategoryRules();
    expect(restoredRules).toHaveLength(1);
    expect(restoredRules[0].pattern).toBe('arcos dourados');

    const restoredEntries = await finRepository.listAllEntries();
    expect(restoredEntries.some((e: any) => e.source === 'FILE_IMPORT')).toBe(true);

    await statementImportService.updateCategoryRule(restoredRules[0].id, {
      category_id: 'cat-mercado',
    });
    const updatedRules = await statementImportService.listCategoryRules();
    expect(updatedRules[0].category_id).toBe('cat-mercado');

    await statementImportService.deleteCategoryRule(restoredRules[0].id);
    expect(await statementImportService.listCategoryRules()).toHaveLength(0);
  });
});
