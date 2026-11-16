import { getDatabase, resetDatabase } from '../../db/client';
import { finBudgets } from '../../db/schema';
import { calculateAccountBalance } from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { backupService } from '../backupService';
import { finGoalsService } from '../finGoalsService';
import { finService } from '../finService';
import { PluggyClient, pluggyCredentialsService } from '../pluggy/pluggyClient';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import type { PluggyAccount, PluggyTransaction } from '../pluggy/types';
import { FAKE_PLUGGY_CREDENTIALS, makePluggyItem } from '../pluggy/__tests__/pluggyFixtures';
import { InMemorySecureStorage, setSecureStorageProvider } from '../secureStorage';

function makeTx(overrides: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: 'tx-1',
    description: 'Movimento',
    currencyCode: 'BRL',
    amount: 0,
    date: '2026-11-10T12:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    accountId: 'pg-chk-1',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  } as PluggyTransaction;
}

function makeMockClient(
  accounts: PluggyAccount[],
  transactionsByAccount: Record<string, PluggyTransaction[]>
): PluggyClient {
  const client = new PluggyClient({
    storage: new InMemorySecureStorage(),
    maxRetries: 0,
    baseDelayMs: 0,
  });
  client.getItem = jest.fn().mockResolvedValue(makePluggyItem({ id: 'item-s69' }));
  client.listAccounts = jest.fn().mockResolvedValue(accounts);
  client.listTransactions = jest
    .fn()
    .mockImplementation(async (accountId: string) => transactionsByAccount[accountId] ?? []);
  client.listBills = jest.fn().mockResolvedValue([]);
  return client;
}

const CHECKING: PluggyAccount = {
  id: 'pg-chk-1',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  number: '1234-5',
  name: 'Conta Banco',
  balance: 3200.5,
  itemId: 'item-s69',
  currencyCode: 'BRL',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
} as PluggyAccount;

const CHECKING_TXS: PluggyTransaction[] = [
  makeTx({ id: 'tx-in', description: 'Salário', amount: 5000, type: 'CREDIT' }),
  makeTx({ id: 'tx-out', description: 'Aluguel', amount: -1500, type: 'DEBIT' }),
  makeTx({ id: 'tx-pend', description: 'Agendado', amount: -200, type: 'DEBIT', status: 'PENDING' }),
];

describe('Sprint 69 — Correções: fatura, saldo Open Finance e backup', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
  });

  afterEach(() => {
    setSecureStorageProvider(null);
  });

  test('S69-S01: parcelamento em cartão que fecha depois do vencimento usa o mês em que cada fatura vence', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão 28/5',
      type: 'card',
      closingDay: 28,
      dueDay: 5,
    });
    const parts = await finService.createInstallmentPurchase({
      totalAmountCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-10',
      accountId: card.id,
      categoryId: 'cat-outros-despesa',
      description: 'Compra parcelada',
    });
    expect(parts.map((p) => p.bill_month)).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  test('S69-S02: migração desloca um mês as faturas já gravadas de cartões que fecham depois do vencimento, uma única vez', async () => {
    const shifted = await finRepository.createAccount({
      name: 'Cartão 28/5',
      type: 'card',
      closingDay: 28,
      dueDay: 5,
    });
    const untouched = await finRepository.createAccount({
      name: 'Cartão 3/10',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
    });
    const base = {
      amount_cents: 10000,
      due_date: '2026-11-10',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      category_id: 'cat-outros-despesa',
      description: 'Compra',
    };
    const purchase = await finRepository.createEntry({
      ...base,
      kind: 'expense',
      account_id: shifted.id,
      bill_month: '2026-11',
    });
    const payment = await finRepository.createEntry({
      ...base,
      kind: 'transfer_in',
      status: 'paid',
      paid_date: '2026-11-05',
      paid_amount_cents: 10000,
      account_id: shifted.id,
      bill_month: '2026-11',
      transfer_group_id: 'bill-x',
    });
    const fromBank = await finRepository.createEntry({
      ...base,
      kind: 'expense',
      account_id: shifted.id,
      bill_month: '2026-12',
      source: 'OPEN_FINANCE',
      external_id: 'pg-tx-1',
    });
    const otherCard = await finRepository.createEntry({
      ...base,
      kind: 'expense',
      account_id: untouched.id,
      bill_month: '2026-12',
    });

    await finService.migrateCardBillMonthsIfNeeded();

    expect((await finRepository.getEntryById(purchase.id))?.bill_month).toBe('2026-12');
    expect((await finRepository.getEntryById(payment.id))?.bill_month).toBe('2026-12');
    expect((await finRepository.getEntryById(fromBank.id))?.bill_month).toBe('2026-12');
    expect((await finRepository.getEntryById(otherCard.id))?.bill_month).toBe('2026-12');

    await finService.migrateCardBillMonthsIfNeeded();
    expect((await finRepository.getEntryById(purchase.id))?.bill_month).toBe('2026-12');
    expect((await finRepository.getEntryById(payment.id))?.bill_month).toBe('2026-12');
  });

  test('S69-S03: conta corrente criada pela sincronização fecha com o saldo informado pelo banco', async () => {
    await openFinanceRepository.addItem('item-s69');
    const client = makeMockClient([CHECKING], { 'pg-chk-1': CHECKING_TXS });

    await pluggySyncService.syncFinance('item-s69', {
      client,
      now: () => new Date('2026-11-16T12:00:00.000Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const created = accounts.find((a) => a.of_account_id === 'pg-chk-1');
    expect(created).toBeDefined();
    const entries = await finRepository.listAllEntries();
    expect(entries.filter((e) => e.account_id === created!.id)).toHaveLength(3);
    // inicial + lançamentos pagos importados = saldo do banco (R$ 3.200,50)
    expect(calculateAccountBalance(created!.initial_balance_cents, entries, created!.id)).toBe(320050);
    expect(created!.initial_balance_cents).toBe(320050 - (500000 - 150000));
  });

  test('S69-S04: ligar a uma conta manual existente não altera o saldo inicial dela', async () => {
    await openFinanceRepository.addItem('item-s69');
    const manual = await finRepository.createAccount({
      name: 'Conta Banco',
      type: 'checking',
      initialBalanceCents: 20000,
    });
    const client = makeMockClient([CHECKING], { 'pg-chk-1': CHECKING_TXS });

    await pluggySyncService.syncFinance('item-s69', {
      client,
      now: () => new Date('2026-11-16T12:00:00.000Z'),
      accountChoices: [{ pluggyAccountId: 'pg-chk-1', targetLocalAccountId: manual.id }],
    });

    const linked = await finRepository.getAccountById(manual.id);
    expect(linked?.of_account_id).toBe('pg-chk-1');
    expect(linked?.initial_balance_cents).toBe(20000);
  });

  test('S69-S05: segunda sincronização não mexe no saldo inicial já ajustado', async () => {
    await openFinanceRepository.addItem('item-s69');
    const client = makeMockClient([CHECKING], { 'pg-chk-1': CHECKING_TXS });
    await pluggySyncService.syncFinance('item-s69', {
      client,
      now: () => new Date('2026-11-16T12:00:00.000Z'),
    });
    const first = (await finRepository.listAccounts(true)).find(
      (a) => a.of_account_id === 'pg-chk-1'
    );
    await pluggySyncService.syncFinance('item-s69', {
      client,
      now: () => new Date('2026-11-17T12:00:00.000Z'),
    });
    const second = (await finRepository.listAccounts(true)).find(
      (a) => a.of_account_id === 'pg-chk-1'
    );
    expect(second?.initial_balance_cents).toBe(first?.initial_balance_cents);
  });

  test('S69-S06: patrimônio usa o saldo informado pelo banco nas contas Open Finance', async () => {
    const ofAcc = await finRepository.createAccount({
      name: 'Conta OF',
      type: 'checking',
      initialBalanceCents: 0,
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-x',
      reportedBalanceCents: 320050,
      reportedBalanceAt: '2026-11-16T10:00:00.000Z',
    });
    const manual = await finRepository.createAccount({
      name: 'Carteira',
      type: 'cash',
      initialBalanceCents: 50000,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 100000,
      due_date: '2026-11-01',
      paid_date: '2026-11-01',
      paid_amount_cents: 100000,
      status: 'paid',
      account_id: ofAcc.id,
      category_id: 'cat-outros-receita',
      description: 'Histórico importado',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 10000,
      due_date: '2026-11-02',
      paid_date: '2026-11-02',
      paid_amount_cents: 10000,
      status: 'paid',
      account_id: manual.id,
      category_id: 'cat-outros-despesa',
      description: 'Feira',
    });

    const nw = await finGoalsService.computeCurrentNetWorth('2026-11-16');
    expect(nw.accountsCents).toBe(320050 + 40000);
  });

  test('S69-S07: backup faz ida e volta de orçamentos, conexões e vínculos do Open Finance', async () => {
    const db = getDatabase();
    await db.insert(finBudgets).values({
      id: 'bud-1',
      category_id: 'cat-mercado',
      year_month: null,
      limit_cents: 80000,
      created_at: '2026-11-16T12:00:00.000Z',
    });
    await db.insert(finBudgets).values({
      id: 'bud-2',
      category_id: 'cat-lazer',
      year_month: '2026-11',
      limit_cents: 30000,
      created_at: '2026-11-16T12:00:00.000Z',
    });
    await openFinanceRepository.upsertItem({
      id: 'item-bk',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: '2027-06-01T00:00:00.000Z',
      last_synced_at: '2026-11-16T10:00:00.000Z',
      last_error: null,
    });
    const acc = await finRepository.createAccount({
      name: 'Conta OF',
      type: 'checking',
      initialBalanceCents: 1234,
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-bk-1',
      reportedBalanceCents: 320050,
      reportedBalanceAt: '2026-11-16T10:00:00.000Z',
    });
    const entry = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 4590,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 4590,
      status: 'paid',
      account_id: acc.id,
      category_id: 'cat-lazer',
      description: 'Cinema',
      description_raw: 'PAG*CINEMARK 0042',
      user_edited_fields: '["category_id","description"]',
      source: 'OPEN_FINANCE',
      external_id: 'pg-tx-bk',
    });

    const exported = await backupService.exportDossierArchive();
    expect(exported.files['fin_budgets.csv']).toBeDefined();
    expect(exported.files['of_items.csv']).toBeDefined();

    resetDatabase();
    await backupService.importDossierArchive(exported.zipBytes, 'RESTORE');

    const budgets = await finRepository.listBudgets();
    expect(budgets).toHaveLength(2);
    expect(budgets.find((b) => b.id === 'bud-1')?.year_month).toBeNull();
    expect(budgets.find((b) => b.id === 'bud-2')?.limit_cents).toBe(30000);

    const items = await openFinanceRepository.listItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('item-bk');
    expect(items[0].consent_expires_at).toBe('2027-06-01T00:00:00.000Z');
    expect(items[0].last_synced_at).toBe('2026-11-16T10:00:00.000Z');

    const restoredAcc = await finRepository.getAccountById(acc.id);
    expect(restoredAcc?.source).toBe('OPEN_FINANCE');
    expect(restoredAcc?.of_account_id).toBe('pg-bk-1');
    expect(restoredAcc?.reported_balance_cents).toBe(320050);
    expect(restoredAcc?.reported_balance_at).toBe('2026-11-16T10:00:00.000Z');

    const restoredEntry = await finRepository.getEntryById(entry.id);
    expect(restoredEntry?.external_id).toBe('pg-tx-bk');
    expect(restoredEntry?.description_raw).toBe('PAG*CINEMARK 0042');
    expect(restoredEntry?.user_edited_fields).toBe('["category_id","description"]');
  });
});
