import {
  INITIAL_SCHEMA_SQL,
  SCHEMA_INDEXES_SQL,
  SCHEMA_UPGRADES,
  resetDatabase,
} from '../../db/client';
import { calculateAccountBalance, summarizeBill } from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import {
  BackupService,
  type BackupDatabaseSnapshot,
  type IBackupStorageAdapter,
} from '../backupService';
import { finService } from '../finService';

class Sprint61MemoryBackupAdapter implements IBackupStorageAdapter {
  private snapshot: BackupDatabaseSnapshot;
  constructor(initial?: Partial<BackupDatabaseSnapshot>) {
    this.snapshot = {
      portfolios: [],
      classTargets: [],
      assets: [],
      transactions: [],
      incomeEvents: [],
      finAccounts: [],
      finCategories: [],
      finEntries: [],
      finRecurrences: [],
      finRecurrenceSkips: [],
      ...initial,
    };
  }
  async getSnapshot(): Promise<BackupDatabaseSnapshot> {
    return this.snapshot;
  }
  async replaceAll(next: BackupDatabaseSnapshot): Promise<void> {
    this.snapshot = next;
  }
  async mergeByUuid(next: BackupDatabaseSnapshot): Promise<void> {
    this.snapshot = next;
  }
}

describe('Sprint 61 — Serviços de Cartão, Fatura, Transferências, Migração e Backup', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S61-T10: schema, migrações idempotentes e índices incluem colunas de cartão e transferência', () => {
    expect(INITIAL_SCHEMA_SQL).toMatch(/closing_day\s+INTEGER/i);
    expect(INITIAL_SCHEMA_SQL).toMatch(/due_day\s+INTEGER/i);
    expect(INITIAL_SCHEMA_SQL).toMatch(/credit_limit_cents\s+INTEGER/i);
    expect(INITIAL_SCHEMA_SQL).toMatch(/bill_month\s+TEXT/i);
    expect(INITIAL_SCHEMA_SQL).toMatch(/transfer_group_id\s+TEXT/i);

    const upgradeCols = SCHEMA_UPGRADES.map((u) => `${u.table}.${u.column}`);
    expect(upgradeCols).toContain('fin_accounts.closing_day');
    expect(upgradeCols).toContain('fin_accounts.due_day');
    expect(upgradeCols).toContain('fin_accounts.credit_limit_cents');
    expect(upgradeCols).toContain('fin_entries.bill_month');
    expect(upgradeCols).toContain('fin_entries.transfer_group_id');

    expect(SCHEMA_INDEXES_SQL).toMatch(/fin_entries\s*\(\s*bill_month\s*\)/i);
    expect(SCHEMA_INDEXES_SQL).toMatch(/fin_entries\s*\(\s*transfer_group_id\s*\)/i);
  });

  test('S61-T11: createTransfer e deleteTransferGroup são atômicos e mantêm saldos consistentes', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 200000,
    });
    const cash = await finRepository.createAccount({
      name: 'Carteira',
      type: 'cash',
      initialBalanceCents: 10000,
    });

    const result = await finService.createTransfer({
      fromAccountId: checking.id,
      toAccountId: cash.id,
      amountCents: 50000,
      dateIso: '2026-11-16',
      description: 'Saque ATM',
    });

    expect(result.transferGroupId).toBeTruthy();
    expect(result.outEntry.kind).toBe('transfer_out');
    expect(result.inEntry.kind).toBe('transfer_in');
    expect(result.outEntry.transfer_group_id).toBe(result.transferGroupId);
    expect(result.inEntry.transfer_group_id).toBe(result.transferGroupId);

    let entries = await finRepository.listAllEntries();
    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(150000);
    expect(calculateAccountBalance(cash.initial_balance_cents, entries, cash.id)).toBe(60000);

    // Reversível atomicamente
    await finService.deleteTransferGroup(result.transferGroupId);
    entries = await finRepository.listAllEntries();
    expect(entries).toHaveLength(0);
    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(200000);
    expect(calculateAccountBalance(cash.initial_balance_cents, entries, cash.id)).toBe(10000);
  });

  test('S61-T12: payCardBill realiza pagamento parcial/total atômico e reversível', async () => {
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 300000,
    });
    const card = await (finRepository as any).createAccount({
      name: 'Nubank',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 500000,
    });

    await (finRepository as any).createEntry({
      kind: 'expense',
      amountCents: 120000,
      dueDate: '2026-11-04',
      accountId: card.id,
      categoryId: 'cat-mercado',
      description: 'Supermercado',
      billMonth: '2026-11',
    });

    // Pagamento parcial de R$ 500,00
    const partial = await finService.payCardBill({
      cardAccountId: card.id,
      fromAccountId: checking.id,
      billMonth: '2026-11',
      amountCents: 50000,
      paidDateIso: '2026-11-16',
    });

    expect(partial.outEntry.kind).toBe('transfer_out');
    expect(partial.outEntry.account_id).toBe(checking.id);
    expect(partial.inEntry.kind).toBe('transfer_in');
    expect(partial.inEntry.account_id).toBe(card.id);
    expect(partial.inEntry.bill_month).toBe('2026-11');

    let entries = await finRepository.listAllEntries();
    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(250000);
    const cardEntries = entries.filter((e) => e.account_id === card.id);
    const summary = summarizeBill(cardEntries, '2026-11', {
      dueDate: '2026-11-17',
      todayIso: '2026-11-16',
      closingDay: 10,
    });
    expect(summary.totalCents).toBe(120000);
    expect(summary.paidCents).toBe(50000);
    expect(summary.openCents).toBe(70000);

    // Estornar / desfazer o pagamento
    await finService.deleteTransferGroup(partial.transferGroupId);
    entries = await finRepository.listAllEntries();
    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(300000);
    const summaryAfterUndo = summarizeBill(
      entries.filter((e) => e.account_id === card.id),
      '2026-11'
    );
    expect(summaryAfterUndo.paidCents).toBe(0);
    expect(summaryAfterUndo.openCents).toBe(120000);
  });

  test('S61-T13: createInstallmentPurchase em conta cartão atribui bill_month de cada parcela', async () => {
    const card = await (finRepository as any).createAccount({
      name: 'Nubank',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 500000,
    });

    // Compra em 15/11/2026 (após fechamento dia 10) em 3x:
    // Parcela 1: 2026-11-15 -> fatura 2026-12
    // Parcela 2: 2026-12-15 -> fatura 2027-01
    // Parcela 3: 2027-01-15 -> fatura 2027-02
    const created = await finService.createInstallmentPurchase({
      kind: 'expense',
      totalAmountCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-15',
      accountId: card.id,
      categoryId: 'cat-lazer',
      description: 'Fone Bluetooth',
    });

    expect(created).toHaveLength(3);
    expect((created[0] as any).bill_month).toBe('2026-12');
    expect((created[1] as any).bill_month).toBe('2027-01');
    expect((created[2] as any).bill_month).toBe('2027-02');
  });

  test('S61-T14: backup ida e volta preserva campos de cartão/transferência e aceita backup legado', async () => {
    const snapshot: BackupDatabaseSnapshot = {
      portfolios: [],
      classTargets: [],
      assets: [],
      transactions: [],
      incomeEvents: [],
      finAccounts: [
        {
          id: 'acc-card-1',
          name: 'Nubank',
          type: 'card',
          initial_balance_cents: 0,
          color: '#D96628',
          archived: 0,
          closing_day: 10,
          due_day: 17,
          credit_limit_cents: 800000,
          created_at: '2026-11-01T00:00:00.000Z',
        } as any,
      ],
      finCategories: [],
      finEntries: [
        {
          id: 'ent-card-1',
          kind: 'transfer_in',
          amount_cents: 25000,
          due_date: '2026-11-17',
          paid_date: '2026-11-17',
          paid_amount_cents: 25000,
          status: 'paid',
          account_id: 'acc-card-1',
          category_id: 'cat-outros-despesa',
          description: 'Pagamento fatura',
          recurrence_id: null,
          recurrence_period: null,
          installment_group_id: null,
          installment_number: null,
          installment_total: null,
          bill_month: '2026-11',
          transfer_group_id: 'tg-backup-1',
          created_at: '2026-11-17T00:00:00.000Z',
        } as any,
      ],
      finRecurrences: [],
      finRecurrenceSkips: [],
    };

    const sourceService = new BackupService(new Sprint61MemoryBackupAdapter(snapshot));
    const exported = await sourceService.exportDossierArchive();

    const targetAdapter = new Sprint61MemoryBackupAdapter();
    const targetService = new BackupService(targetAdapter);
    await targetService.importDossierArchive(exported.zipBytes, 'RESTORE');

    const restored = await targetAdapter.getSnapshot();
    const acc = restored.finAccounts?.[0] as any;
    const ent = restored.finEntries?.[0] as any;
    expect(acc.closing_day).toBe(10);
    expect(acc.due_day).toBe(17);
    expect(acc.credit_limit_cents).toBe(800000);
    expect(ent.kind).toBe('transfer_in');
    expect(ent.bill_month).toBe('2026-11');
    expect(ent.transfer_group_id).toBe('tg-backup-1');
  });
});
