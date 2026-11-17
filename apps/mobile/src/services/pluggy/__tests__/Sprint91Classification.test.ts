import { getDatabase, resetDatabase } from '../../../db/client';
import { finEntries } from '../../../db/schema';
import { calculateMonthlySummary } from '../../../domain/financeFlow';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { backupService } from '../../backupService';
import { pluggyClassificationService } from '../pluggyClassificationService';
import { pluggyDiagnosticsService } from '../pluggyDiagnosticsService';
import { pluggySyncService } from '../pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyAccount, PluggyTransaction } from '../types';

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function mkTx(overrides: Partial<PluggyTransaction> & { id: string; accountId: string }): PluggyTransaction {
  const date = overrides.date ?? `${isoDaysAgo(3)}T12:00:00Z`;
  return {
    description: 'X',
    currencyCode: 'BRL',
    amount: -1,
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    categoryId: null,
    createdAt: date,
    updatedAt: date,
    date,
    ...overrides,
  } as PluggyTransaction;
}

function mkClient(itemId: string, accounts: PluggyAccount[], txsByAccount: Record<string, PluggyTransaction[]>) {
  return {
    getItem: async () => makePluggyItem({ id: itemId }),
    listAccounts: async () => accounts.map((a) => ({ ...a, itemId })),
    listTransactions: async (accId: string) => txsByAccount[accId] ?? [],
    listBills: async () => [],
    listInvestments: async () => [],
    listInvestmentTransactions: async () => [],
  } as unknown as PluggyClient;
}

const checking = (id: string): PluggyAccount => ({ ...makePluggyAccounts()[0], id });
const card = (id: string): PluggyAccount => ({ ...makePluggyAccounts()[1], id });

describe('Sprint 91 — Classificação Open Finance (serviços, Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S91-T05: Pix −432,79 (04000000) na conexão A e +432,79 na conexão B dois dias depois => mesmo transfer_group_id e receitas/despesas não mudam (D22, R18)', async () => {
    await openFinanceRepository.addItem('item-a');
    await openFinanceRepository.addItem('item-b');
    const day = isoDaysAgo(5);
    const dayPlus2 = isoDaysAgo(3);

    await pluggySyncService.syncFinance('item-a', {
      client: mkClient('item-a', [checking('acc-a')], {
        'acc-a': [
          mkTx({
            id: 'tx-out',
            accountId: 'acc-a',
            description: 'Pix enviado',
            amount: -432.79,
            type: 'DEBIT',
            category: 'Same person transfer - PIX',
            categoryId: '04010000',
            date: `${day}T12:00:00Z`,
          }),
        ],
      }),
    });
    await pluggySyncService.syncFinance('item-b', {
      client: mkClient('item-b', [checking('acc-b')], {
        'acc-b': [
          mkTx({
            id: 'tx-in',
            accountId: 'acc-b',
            description: 'Pix recebido',
            amount: 432.79,
            type: 'CREDIT',
            category: 'Transfers',
            categoryId: '05070000',
            date: `${dayPlus2}T12:00:00Z`,
          }),
        ],
      }),
    });

    const entries = await finRepository.listAllEntries();
    const out = entries.find((e) => e.external_id === 'tx-out')!;
    const inn = entries.find((e) => e.external_id === 'tx-in')!;
    expect(out.kind).toBe('transfer_out');
    expect(inn.kind).toBe('transfer_in');
    expect(out.transfer_group_id).toMatch(/^of-tr-/);
    expect(out.transfer_group_id).toBe(inn.transfer_group_id);

    const ym = (day > dayPlus2 ? dayPlus2 : day).slice(0, 7);
    const summary = calculateMonthlySummary(entries, ym);
    expect(summary.paidExpenseCents).toBe(0);
    expect(summary.paidIncomeCents).toBe(0);

    // idempotente: sincronizar de novo não muda nada
    await pluggySyncService.syncFinance('item-b', {
      client: mkClient('item-b', [checking('acc-b')], {
        'acc-b': [
          mkTx({
            id: 'tx-in',
            accountId: 'acc-b',
            description: 'Pix recebido',
            amount: 432.79,
            type: 'CREDIT',
            category: 'Transfers',
            categoryId: '05070000',
            date: `${dayPlus2}T12:00:00Z`,
          }),
        ],
      }),
    });
    const again = (await finRepository.listAllEntries()).find((e) => e.external_id === 'tx-in')!;
    expect(again.kind).toBe('transfer_in');
    expect(again.transfer_group_id).toBe(out.transfer_group_id);
  });

  it('S91-T07 (sync): Pix para o titular com 04000000 e sem par fica transfer_out OWN_ACCOUNT_UNPAIRED e o diagnóstico separa por reason (G)', async () => {
    await openFinanceRepository.addItem('item-u');
    const client = mkClient('item-u', [checking('acc-u')], {
      'acc-u': [
        mkTx({
          id: 'tx-own',
          accountId: 'acc-u',
          description: 'Pix enviado para TITULAR',
          amount: -2000,
          category: 'Same person transfer - PIX',
          categoryId: '04010000',
        }),
        mkTx({
          id: 'tx-inv',
          accountId: 'acc-u',
          description: 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA',
          amount: -227.17,
          category: 'Investments',
          categoryId: '03000000',
        }),
        mkTx({
          id: 'tx-food',
          accountId: 'acc-u',
          description: 'RESTAURANTE',
          amount: -30,
          category: 'Eating out',
          categoryId: '11010000',
        }),
      ],
    });
    await pluggySyncService.syncFinance('item-u', { client });

    const entries = await finRepository.listAllEntries();
    const own = entries.find((e) => e.external_id === 'tx-own')!;
    expect(own.kind).toBe('transfer_out');
    expect(own.of_class_reason).toBe('OWN_ACCOUNT_UNPAIRED');
    expect(own.of_category_id).toBe('04010000');
    const inv = entries.find((e) => e.external_id === 'tx-inv')!;
    expect(inv.of_class_reason).toBe('INVESTMENT_MOVE');
    expect(entries.find((e) => e.external_id === 'tx-food')!.category_id).toBe('cat-alimentacao');

    const report = await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: ['item-u'],
    });
    const acc = report.items[0].accounts[0] as any;
    expect(acc.entriesLast90d.transfersByReason.OWN_ACCOUNT_UNPAIRED).toBe(1);
    expect(acc.entriesLast90d.transfersByReason.INVESTMENT_MOVE).toBe(1);
    expect(acc.stalePendingCount).toBe(0);
  });

  it('S91-T04 (diagnóstico): PENDING de conta com mais de 40 dias conta em stalePendingCount = 1 (R17)', async () => {
    await openFinanceRepository.addItem('item-s');
    const acc = checking('acc-s');
    const local = await finRepository.createAccount({
      name: 'Conta S',
      type: 'checking',
      initialBalanceCents: 0,
      color: '#000000',
      ofAccountId: acc.id,
      source: 'OPEN_FINANCE',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 109742,
      due_date: '2025-12-22',
      status: 'pending',
      account_id: local.id,
      category_id: 'cat-outros-despesa',
      description: 'OPERAÇÕES EM BOLSA - NOTA',
      source: 'OPEN_FINANCE',
      external_id: 'tx-stale',
    });
    const report = await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client: mkClient('item-s', [acc], {}),
      itemIds: ['item-s'],
    });
    expect((report.items[0].accounts[0] as any).stalePendingCount).toBe(1);
  });

  it('S91-T09: recarga pelo cartão — "Valor adicionado na conta por cartão" +10 e RENOVAPAY −10 na mesma conta e dia viram par of-topup; o gasto de 10,42 no cartão continua despesa (D23, R19)', async () => {
    await openFinanceRepository.addItem('item-t');
    const day = isoDaysAgo(2);
    const client = mkClient('item-t', [checking('acc-t'), card('card-t')], {
      'acc-t': [
        mkTx({
          id: 'tx-topup-in',
          accountId: 'acc-t',
          description: 'Valor adicionado na conta por cartão',
          amount: 10,
          type: 'CREDIT',
          category: 'Transfers',
          categoryId: '05070000',
          date: `${day}T12:00:00Z`,
        }),
        mkTx({
          id: 'tx-topup-out',
          accountId: 'acc-t',
          description: 'Transferência enviada|RENOVAPAY',
          amount: -10,
          type: 'DEBIT',
          category: 'Transfers',
          categoryId: '05070000',
          date: `${day}T12:00:00Z`,
        }),
      ],
      'card-t': [
        mkTx({
          id: 'tx-card-spend',
          accountId: 'card-t',
          description: 'RENOVAPAY',
          amount: 10.42,
          type: 'DEBIT',
          category: 'Services',
          categoryId: '07000000',
          date: `${day}T12:00:00Z`,
        }),
      ],
    });
    await pluggySyncService.syncFinance('item-t', { client });

    const entries = await finRepository.listAllEntries();
    const inn = entries.find((e) => e.external_id === 'tx-topup-in')!;
    const out = entries.find((e) => e.external_id === 'tx-topup-out')!;
    expect(inn.kind).toBe('transfer_in');
    expect(out.kind).toBe('transfer_out');
    expect(inn.transfer_group_id).toMatch(/^of-topup-/);
    expect(inn.transfer_group_id).toBe(out.transfer_group_id);

    const spend = entries.find((e) => e.external_id === 'tx-card-spend')!;
    expect(spend.kind).toBe('expense');
    expect(spend.amount_cents).toBe(1042);
    expect(spend.category_id).toBe('cat-servicos');
  });

  it('S91-T11: reclassificação única — 11020000 em Outros vira Alimentação; category_id editado não muda; rodar duas vezes dá o mesmo resultado (F)', async () => {
    await finRepository.seedDefaultCategoriesIfNeeded();
    const local = await finRepository.createAccount({
      name: 'Conta R',
      type: 'checking',
      initialBalanceCents: 0,
      color: '#000000',
      ofAccountId: 'acc-r',
      source: 'OPEN_FINANCE',
    });
    const base = {
      kind: 'expense',
      amount_cents: 3000,
      due_date: isoDaysAgo(10),
      paid_date: isoDaysAgo(10),
      paid_amount_cents: 3000,
      status: 'paid',
      account_id: local.id,
      category_id: 'cat-outros-despesa',
      source: 'OPEN_FINANCE',
    };
    await finRepository.createEntry({
      ...base,
      description: 'IFOOD',
      external_id: 'old-food',
      of_category_id: '11020000',
    });
    await finRepository.createEntry({
      ...base,
      description: 'MERCADO X',
      external_id: 'old-edited',
      of_category_id: '10000000',
      user_edited_fields: '["category_id"]',
    });
    await finRepository.createEntry({
      ...base,
      description: 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA',
      external_id: 'old-inv',
      of_category_id: null,
    });

    const first = await pluggyClassificationService.reclassifyOpenFinanceEntries();
    expect(first.ran).toBe(true);
    expect(first.changed).toBe(2);
    expect(first.byReason.INVESTMENT_MOVE).toBe(1);

    const snapshot = async () =>
      (await finRepository.listAllEntries())
        .map((e) => `${e.external_id}|${e.kind}|${e.category_id}`)
        .sort();
    const afterFirst = await snapshot();
    expect(afterFirst).toContain('old-food|expense|cat-alimentacao');
    expect(afterFirst).toContain('old-edited|expense|cat-outros-despesa');
    expect(afterFirst).toContain('old-inv|transfer_out|cat-outros-despesa');

    const second = await pluggyClassificationService.reclassifyOpenFinanceEntries();
    expect(second.ran).toBe(false);
    expect(second.changed).toBe(0);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it('S91-T12: backup/restore preserva as categorias novas e os transfer_group_id of-topup- e of-tr- entre conexões (R20)', async () => {
    await finRepository.seedDefaultCategoriesIfNeeded();
    const ids = (await finRepository.listCategories(true)).map((c) => c.id);
    for (const id of ['cat-alimentacao', 'cat-educacao', 'cat-servicos', 'cat-compras']) {
      expect(ids).toContain(id);
    }

    const a = await finRepository.createAccount({ name: 'A', type: 'checking', initialBalanceCents: 0, color: '#000000' });
    const b = await finRepository.createAccount({ name: 'B', type: 'checking', initialBalanceCents: 0, color: '#000000' });
    const mk = (extra: Record<string, unknown>) => ({
      amount_cents: 1000,
      due_date: isoDaysAgo(2),
      status: 'paid',
      paid_date: isoDaysAgo(2),
      paid_amount_cents: 1000,
      category_id: 'cat-alimentacao',
      description: 'x',
      source: 'OPEN_FINANCE',
      ...extra,
    });
    await finRepository.createEntry(
      mk({ kind: 'transfer_out', account_id: a.id, external_id: 'bk-1', transfer_group_id: 'of-topup-bk-1-bk-2', of_category_id: '05070000', of_class_reason: 'OWN_ACCOUNT_UNPAIRED' })
    );
    await finRepository.createEntry(
      mk({ kind: 'transfer_in', account_id: a.id, external_id: 'bk-2', transfer_group_id: 'of-topup-bk-1-bk-2' })
    );
    await finRepository.createEntry(
      mk({ kind: 'transfer_out', account_id: a.id, external_id: 'bk-3', transfer_group_id: 'of-tr-bk-3-bk-4' })
    );
    await finRepository.createEntry(
      mk({ kind: 'transfer_in', account_id: b.id, external_id: 'bk-4', transfer_group_id: 'of-tr-bk-3-bk-4' })
    );

    const zip = await backupService.createBackupZip();
    resetDatabase();
    await backupService.restoreFromZip(zip);

    const restoredCats = (await finRepository.listCategories(true)).map((c) => c.id);
    for (const id of ['cat-alimentacao', 'cat-educacao', 'cat-servicos', 'cat-compras']) {
      expect(restoredCats).toContain(id);
    }
    const rows = await getDatabase().select().from(finEntries);
    const byExt = new Map(rows.map((r) => [r.external_id, r]));
    expect(byExt.get('bk-1')!.transfer_group_id).toBe('of-topup-bk-1-bk-2');
    expect(byExt.get('bk-2')!.transfer_group_id).toBe('of-topup-bk-1-bk-2');
    expect(byExt.get('bk-3')!.transfer_group_id).toBe('of-tr-bk-3-bk-4');
    expect(byExt.get('bk-4')!.transfer_group_id).toBe('of-tr-bk-3-bk-4');
    expect(byExt.get('bk-3')!.account_id).not.toBe(byExt.get('bk-4')!.account_id);
    expect(byExt.get('bk-1')!.of_category_id).toBe('05070000');
    expect(byExt.get('bk-1')!.of_class_reason).toBe('OWN_ACCOUNT_UNPAIRED');
  });
});
