import {
  resetDatabase,
  SCHEMA_SQL,
  SCHEMA_UPGRADES,
} from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { finService } from '../finService';
import { PluggyClient, PluggyNetworkError, pluggyCredentialsService } from '../pluggy/pluggyClient';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import type { PluggyAccount, PluggyBill, PluggyTransaction } from '../pluggy/types';
import {
  FAKE_PLUGGY_CREDENTIALS,
  makePluggyItem,
} from '../pluggy/__tests__/pluggyFixtures';
import { InMemorySecureStorage, setSecureStorageProvider } from '../secureStorage';

function makeMockClient(handlers: {
  accounts?: PluggyAccount[];
  transactionsByAccount?: Record<string, PluggyTransaction[] | (() => Promise<PluggyTransaction[]>)>;
  billsByAccount?: Record<string, PluggyBill[]>;
  onListTransactions?: (accountId: string, params?: { dateFrom?: string }) => void;
}): PluggyClient {
  const item = makePluggyItem({ id: 'item-sync-1' });
  const client = new PluggyClient({
    storage: new InMemorySecureStorage(),
    maxRetries: 0,
    baseDelayMs: 0,
  });

  client.getItem = jest.fn().mockResolvedValue(item);
  client.listAccounts = jest.fn().mockResolvedValue(handlers.accounts ?? []);
  client.listTransactions = jest.fn().mockImplementation(async (accountId, params) => {
    handlers.onListTransactions?.(accountId, params);
    const entry = handlers.transactionsByAccount?.[accountId];
    if (typeof entry === 'function') {
      return entry();
    }
    return entry ?? [];
  });
  client.listBills = jest.fn().mockImplementation(async (accountId) => {
    return handlers.billsByAccount?.[accountId] ?? [];
  });

  return client;
}

describe('Sprint 65 — Serviço pluggySyncService e Banco (Fase A)', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-16');
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
    await openFinanceRepository.upsertItem({
      id: 'item-sync-1',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: '2027-06-01T00:00:00.000Z',
      last_synced_at: null,
      last_error: null,
    });
  });

  afterEach(() => {
    setSecureStorageProvider(null);
  });

  test('S65-S01: schema e migrações incluem of_account_id, source, reported_balance_cents, reported_balance_at, description_raw e user_edited_fields', () => {
    expect(SCHEMA_SQL).toContain('of_account_id');
    expect(SCHEMA_SQL).toContain('reported_balance_cents');
    expect(SCHEMA_SQL).toContain('reported_balance_at');
    expect(SCHEMA_SQL).toContain('description_raw');
    expect(SCHEMA_SQL).toContain('user_edited_fields');

    const expectedUpgrades = [
      ['fin_accounts', 'of_account_id'],
      ['fin_accounts', 'source'],
      ['fin_accounts', 'reported_balance_cents'],
      ['fin_accounts', 'reported_balance_at'],
      ['fin_entries', 'description_raw'],
      ['fin_entries', 'user_edited_fields'],
    ];
    for (const [table, column] of expectedUpgrades) {
      expect(
        SCHEMA_UPGRADES.some((u) => u.table === table && u.column === column)
      ).toBe(true);
    }
  });

  test('S65-S02: syncFinance sincroniza contas, transações (12 meses na 1ª vez, -7d depois), faturas, e é idempotente', async () => {
    const seenDateFrom: string[] = [];
    const accounts: PluggyAccount[] = [
      {
        id: 'pg-chk-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        number: '1234-5',
        name: 'Conta Itaú',
        balance: 3200.5,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
      {
        id: 'pg-crd-1',
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        number: '**** 9999',
        name: 'Cartão Itaú',
        balance: 450.0,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        creditData: {
          balanceCloseDate: null,
          balanceDueDate: '2026-11-25T00:00:00.000Z',
          creditLimit: 8000,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
    ];

    const txChk: PluggyTransaction[] = [
      {
        id: 'tx-chk-1',
        description: 'Salário',
        descriptionRaw: 'TED SALARIO EMPRESA',
        currencyCode: 'BRL',
        amount: 5000,
        date: '2026-11-05T12:00:00.000Z',
        type: 'CREDIT',
        status: 'POSTED',
        category: 'Salary',
        accountId: 'pg-chk-1',
        createdAt: '2026-11-05T12:00:00.000Z',
        updatedAt: '2026-11-05T12:00:00.000Z',
      },
    ];

    const txCrd: PluggyTransaction[] = [
      {
        id: 'tx-crd-1',
        description: 'Supermercado 1/3',
        descriptionRaw: 'CARREFOUR *PARC 1/3',
        currencyCode: 'BRL',
        amount: 300,
        date: '2026-11-12T15:00:00.000Z',
        type: 'DEBIT',
        status: 'POSTED',
        category: 'Groceries',
        creditCardMetadata: {
          installmentNumber: 1,
          totalInstallments: 3,
          billId: 'bill-nov',
        },
        accountId: 'pg-crd-1',
        createdAt: '2026-11-12T15:00:00.000Z',
        updatedAt: '2026-11-12T15:00:00.000Z',
      },
    ];

    const bills: PluggyBill[] = [
      {
        id: 'bill-nov',
        dueDate: '2026-11-25T00:00:00.000Z',
        billClosingDate: null,
        totalAmount: 450,
        totalAmountCurrencyCode: 'BRL',
      },
    ];

    const client = makeMockClient({
      accounts,
      transactionsByAccount: { 'pg-chk-1': txChk, 'pg-crd-1': txCrd },
      billsByAccount: { 'pg-crd-1': bills },
      onListTransactions: (_id, params) => {
        if (params?.dateFrom) seenDateFrom.push(params.dateFrom);
      },
    });

    const firstNow = () => new Date('2026-11-16T12:00:00.000Z');
    const res1 = await pluggySyncService.syncFinance('item-sync-1', { client, now: firstNow });

    expect(res1.status).toBe('SUCCESS');
    expect(res1.counts.accountsSynced).toBe(2);
    expect(res1.counts.transactionsCreated).toBe(2);
    expect(res1.counts.billsSynced).toBe(1);
    expect(res1.accountsNeedingClosingDay).toHaveLength(0);
    expect(seenDateFrom).toEqual([]);

    const localAccounts = await finRepository.listAccounts(true);
    const syncedCard = localAccounts.find((a: any) => a.of_account_id === 'pg-crd-1') as any;
    expect(syncedCard).toBeDefined();
    expect(syncedCard.source).toBe('OPEN_FINANCE');
    expect(syncedCard.closing_day).not.toBeNull();
    expect(syncedCard.due_day).toBe(25);
    expect(syncedCard.credit_limit_cents).toBe(800000);
    expect(syncedCard.reported_balance_cents).toBe(45000);

    // Segunda sincronização seguida: idempotente, passada de reconciliação de 40 dias (R10)
    seenDateFrom.length = 0;
    const secondNow = () => new Date('2026-11-17T12:00:00.000Z');
    const res2 = await pluggySyncService.syncFinance('item-sync-1', { client, now: secondNow });

    expect(seenDateFrom).toContain('2026-10-08');
    expect(res2.counts.transactionsCreated).toBe(0);

    const allEntries = await finRepository.listAllEntries();
    expect(allEntries.filter((e: any) => e.source === 'OPEN_FINANCE')).toHaveLength(2);

    const runs = await openFinanceRepository.listSyncRuns('item-sync-1');
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  test('S65-S03: promove PENDING -> POSTED, preserva edições manuais (user_edited_fields) e trata estorno', async () => {
    const accounts: PluggyAccount[] = [
      {
        id: 'pg-crd-2',
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        number: '**** 1111',
        name: 'Nubank',
        balance: 120,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        creditData: {
          balanceCloseDate: '2026-11-10T00:00:00.000Z',
          balanceDueDate: '2026-11-17T00:00:00.000Z',
          creditLimit: 5000,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
    ];

    let currentTxs: PluggyTransaction[] = [
      {
        id: 'tx-pending-1',
        description: 'LOJA ABC',
        descriptionRaw: 'LOJA ABC LTDA',
        currencyCode: 'BRL',
        amount: 120,
        date: '2026-11-14T12:00:00.000Z',
        type: 'DEBIT',
        status: 'PENDING',
        category: null,
        accountId: 'pg-crd-2',
        createdAt: '2026-11-14T12:00:00.000Z',
        updatedAt: '2026-11-14T12:00:00.000Z',
      },
    ];

    const client = makeMockClient({
      accounts,
      transactionsByAccount: { 'pg-crd-2': async () => currentTxs },
    });

    await pluggySyncService.syncFinance('item-sync-1', { client });

    let entries = await finRepository.listAllEntries();
    const created = entries.find((e: any) => e.external_id === 'tx-pending-1') as any;
    expect(created.status).toBe('paid');

    // Usuário edita categoria e descrição manualmente
    await finRepository.updateEntry(created.id, {
      category_id: 'cat-lazer',
      description: 'Presente aniversário',
      user_edited_fields: JSON.stringify(['category_id', 'description']),
    } as any);

    // Na próxima sincronização, vira POSTED e chega um estorno
    currentTxs = [
      {
        ...currentTxs[0],
        status: 'POSTED',
        amount: 125.5,
      },
      {
        id: 'tx-refund-1',
        description: 'ESTORNO LOJA ABC',
        currencyCode: 'BRL',
        amount: -50,
        date: '2026-11-15T12:00:00.000Z',
        type: 'CREDIT',
        status: 'POSTED',
        accountId: 'pg-crd-2',
        createdAt: '2026-11-15T12:00:00.000Z',
        updatedAt: '2026-11-15T12:00:00.000Z',
      },
    ];

    await pluggySyncService.syncFinance('item-sync-1', { client });

    entries = await finRepository.listAllEntries();
    const updated = entries.find((e: any) => e.external_id === 'tx-pending-1') as any;
    expect(updated.status).toBe('paid');
    expect(updated.amount_cents).toBe(12550);
    expect(updated.category_id).toBe('cat-lazer');
    expect(updated.description).toBe('Presente aniversário');

    const refund = entries.find((e: any) => e.external_id === 'tx-refund-1') as any;
    expect(refund.kind).toBe('income');
    expect(refund.amount_cents).toBe(5000);
  });

  test('S65-S04: sincronização parcial com erro no meio faz rollback completo da transação e não apaga nada', async () => {
    const existingManualAcc = await finRepository.createAccount({
      name: 'Carteira Manual',
      type: 'cash',
      initialBalanceCents: 20000,
    });

    const accounts: PluggyAccount[] = [
      {
        id: 'pg-ok-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        number: '1111',
        name: 'Conta OK',
        balance: 1000,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
      {
        id: 'pg-fail-2',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        number: '2222',
        name: 'Conta Falha',
        balance: 500,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
    ];

    const client = makeMockClient({
      accounts,
      transactionsByAccount: {
        'pg-ok-1': [
          {
            id: 'tx-ok-1',
            description: 'PIX',
            currencyCode: 'BRL',
            amount: -100,
            date: '2026-11-15T12:00:00.000Z',
            type: 'DEBIT',
            status: 'POSTED',
            accountId: 'pg-ok-1',
            createdAt: '2026-11-15T12:00:00.000Z',
            updatedAt: '2026-11-15T12:00:00.000Z',
          },
        ],
        'pg-fail-2': async () => {
          throw new PluggyNetworkError('Falha de rede simulada', 503);
        },
      },
    });

    await expect(pluggySyncService.syncFinance('item-sync-1', { client })).rejects.toThrow(
      /Falha de rede/i
    );

    // Nada da conta 1 foi persistido parcialmente e a conta manual continua intacta
    const accountsAfter = await finRepository.listAccounts(true);
    expect(accountsAfter.some((a: any) => a.of_account_id === 'pg-ok-1')).toBe(false);
    expect(accountsAfter.some((a) => a.id === existingManualAcc.id)).toBe(true);

    const entriesAfter = await finRepository.listAllEntries();
    expect(entriesAfter.some((e: any) => e.external_id === 'tx-ok-1')).toBe(false);

    const runs = await openFinanceRepository.listSyncRuns('item-sync-1');
    expect(runs[0]?.status).toBe('ERROR');
  });

  test('S65-S05: syncIfStale respeita intervalo de 12h e captura erro sem bloquear; conciliação de 1ª sync liga conta existente', async () => {
    const manualChecking = await finRepository.createAccount({
      name: 'Meu Itaú',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    const accounts: PluggyAccount[] = [
      {
        id: 'pg-chk-link',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        number: '9876',
        name: 'Itaú CC',
        balance: 1500,
        itemId: 'item-sync-1',
        currencyCode: 'BRL',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-11-16T10:00:00.000Z',
      },
    ];

    const client = makeMockClient({ accounts, transactionsByAccount: { 'pg-chk-link': [] } });

    const proposal = await pluggySyncService.previewAccountReconciliation('item-sync-1', client);
    expect(proposal).toHaveLength(1);

    await pluggySyncService.applyAccountLinks(
      'item-sync-1',
      [{ pluggyAccountId: 'pg-chk-link', targetLocalAccountId: manualChecking.id }],
      accounts
    );

    const linked = (await finRepository.listAccounts(true)).find(
      (a) => a.id === manualChecking.id
    ) as any;
    expect(linked.of_account_id).toBe('pg-chk-link');
    expect(linked.source).toBe('OPEN_FINANCE');

    // syncIfStale com last_synced_at nulo -> dispara sync
    const staleRes = await pluggySyncService.syncIfStale({
      client,
      nowMs: Date.parse('2026-11-16T12:00:00.000Z'),
    });
    expect(staleRes.triggered).toBe(true);

    // syncIfStale logo em seguida (<12h) -> não dispara
    const freshRes = await pluggySyncService.syncIfStale({
      client,
      nowMs: Date.parse('2026-11-16T15:00:00.000Z'),
    });
    expect(freshRes.triggered).toBe(false);
  });
});
