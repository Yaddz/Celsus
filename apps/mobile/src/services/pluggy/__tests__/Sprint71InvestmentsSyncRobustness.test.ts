import { eq } from 'drizzle-orm';
import { applySchemaUpgrades, getDatabase, getRawSqliteDatabase, resetDatabase } from '../../../db/client';
import { assets, finAccounts, finEntries, incomeEvents, transactions } from '../../../db/schema';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { finRepository } from '../../../repositories/finRepository';
import { PluggyClient, PluggyConsentExpiredError } from '../pluggyClient';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { pluggySyncService } from '../pluggySyncService';
import type {
  PluggyAccount,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from '../types';

function makeMockItem(overrides: Partial<PluggyItem> = {}): PluggyItem {
  return {
    id: 'item-1',
    connector: { id: 201, name: 'Itaú' },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T10:00:00Z',
    consentExpiresAt: '2027-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeFakeFetchClient(opts: {
  item?: PluggyItem;
  investments?: PluggyInvestment[];
  txsByInv?: Record<string, PluggyInvestmentTransaction[]>;
  failInvIds?: Set<string>;
  accounts?: PluggyAccount[];
  accountTxs?: Record<string, PluggyTransaction[]>;
}): PluggyClient {
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.endsWith('/auth')) {
      return new Response(JSON.stringify({ apiKey: 'test-key' }), { status: 200 });
    }
    if (url.includes('/items/')) {
      return new Response(JSON.stringify(opts.item ?? makeMockItem()), { status: 200 });
    }
    if (url.includes('/investments/') && url.includes('/transactions')) {
      const invId = url.split('/investments/')[1].split('/transactions')[0];
      if (opts.failInvIds?.has(invId)) {
        return new Response(JSON.stringify({ message: 'Internal error' }), { status: 500 });
      }
      const list = opts.txsByInv?.[invId] ?? [];
      return new Response(
        JSON.stringify({ page: 1, total: list.length, totalPages: 1, results: list }),
        { status: 200 }
      );
    }
    if (url.includes('/investments')) {
      const list = opts.investments ?? [];
      return new Response(
        JSON.stringify({ page: 1, total: list.length, totalPages: 1, results: list }),
        { status: 200 }
      );
    }
    if (url.includes('/accounts')) {
      const list = opts.accounts ?? [];
      return new Response(
        JSON.stringify({ page: 1, total: list.length, totalPages: 1, results: list }),
        { status: 200 }
      );
    }
    if (url.includes('/v2/transactions')) {
      const u = new URL(url);
      const accId = u.searchParams.get('accountId') ?? '';
      return new Response(
        JSON.stringify({ results: opts.accountTxs?.[accId] ?? [], next: null }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  const storage = {
    getItem: jest.fn(async (k: string) =>
      k === 'pluggy.client_id' ? 'cid' : k === 'pluggy.client_secret' ? 'csec' : null
    ),
    setItem: jest.fn(async () => {}),
    deleteItem: jest.fn(async () => {}),
  };

  return new PluggyClient({ fetchImpl, storage, maxRetries: 0, baseDelayMs: 0 });
}

describe('Sprint 71 — Robustez e Limpeza no Sync de Investimentos (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S71-T09: syncInvestments grava apenas BUY e SELL em transactions e devolve INTEREST separado sem gravar em income_events', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const inv: PluggyInvestment = {
      id: 'inv-petr',
      itemId: 'item-1',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'PETROBRAS PN',
      quantity: 100,
      balance: 3500,
      amount: 3500,
      amountOriginal: 3000,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    };
    const txs: PluggyInvestmentTransaction[] = [
      { id: 't-buy', type: 'BUY', quantity: 100, value: 30, amount: 3000, date: '2026-01-10' },
      { id: 't-int', type: 'INTEREST', amount: 150, date: '2026-03-10', description: 'Dividendo' },
      { id: 't-tax', type: 'TAX', amount: 22.5, date: '2026-03-10' },
      { id: 't-amort', type: 'AMORTIZATION', amount: 100, date: '2026-04-10' },
      { id: 't-tr', type: 'TRANSFER', quantity: 0, amount: 0, date: '2026-05-10' },
    ];
    const client = makeFakeFetchClient({ investments: [inv], txsByInv: { 'inv-petr': txs } });

    const res = await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });

    const db = await getDatabase();
    const persistedTxs = await db.select().from(transactions);
    expect(persistedTxs).toHaveLength(1);
    expect(persistedTxs[0].type).toBe('BUY');

    const persistedIncome = await db.select().from(incomeEvents);
    expect(persistedIncome).toHaveLength(1);
    expect(persistedIncome[0].external_id).toBe('pluggy:t-int');
    expect(res.interestTransactions).toHaveLength(1);
    expect(res.interestTransactions?.[0].externalId).toBe('t-int');
  });

  it('S71-T10: ação e FII ficam com manual_position_value nulo após syncInvestments', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const stock: PluggyInvestment = {
      id: 'inv-stock',
      itemId: 'item-1',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'ITUB4',
      name: 'ITAUUNIBANCO PN',
      quantity: 50,
      balance: 1800,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    };
    const client = makeFakeFetchClient({ investments: [stock] });

    await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });

    const db = await getDatabase();
    const rows = await db.select().from(assets).where(eq(assets.external_id, 'inv-stock'));
    expect(rows[0].manual_position_value).toBeNull();
  });

  it('S71-T11: consentimento expirado lança PluggyConsentExpiredError e grava of_sync_runs com status ERROR', async () => {
    await openFinanceRepository.addItem('item-exp');
    const expiredItem = makeMockItem({
      id: 'item-exp',
      executionStatus: 'USER_AUTHORIZATION_EXPIRED',
    });
    const client = makeFakeFetchClient({ item: expiredItem });

    await expect(
      pluggyInvestmentsSyncService.syncInvestments('item-exp', { client })
    ).rejects.toBeInstanceOf(PluggyConsentExpiredError);

    const runs = await openFinanceRepository.listSyncRuns('item-exp');
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('ERROR');
  });

  it('S71-T12: falha ao buscar movimentações de UM investimento isola o erro e continua os demais', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const invOk: PluggyInvestment = {
      id: 'inv-ok',
      itemId: 'item-1',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'WEGE3',
      name: 'WEG ON',
      quantity: 30,
      balance: 1500,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    };
    const invFail: PluggyInvestment = {
      ...invOk,
      id: 'inv-fail',
      code: 'BBAS3',
      name: 'BANCO DO BRASIL ON',
    };
    const client = makeFakeFetchClient({
      investments: [invFail, invOk],
      failInvIds: new Set(['inv-fail']),
      txsByInv: {
        'inv-ok': [{ id: 'tx-ok-1', type: 'BUY', quantity: 30, value: 45, amount: 1350, date: '2026-02-01' }],
      },
    });

    const res = await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });

    expect(res.counts.investmentErrors).toBe(1);
    expect(res.counts.assetsCreated).toBe(2);
    expect(res.counts.transactionsCreated).toBe(1);
  });

  it('S71-T13: migração de limpeza remove transactions OPEN_FINANCE com type fora de BUY/SELL/SPLIT/INPLIT', async () => {
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const asset = await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras',
      quantity: '100',
      average_price: '30.00',
    });
    const db = await getDatabase();
    await db.insert(transactions).values([
      {
        id: 'tx-buy',
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'BUY',
        trade_date: '2026-01-10',
        quantity: '100',
        unit_price: '30.00',
        fees: '0.00',
        total_amount: '3000.00',
        source: 'OPEN_FINANCE',
        external_id: 'ext-1',
        created_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'tx-ghost-income',
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'INCOME',
        trade_date: '2026-02-10',
        quantity: '1',
        unit_price: '50.00',
        fees: '0.00',
        total_amount: '50.00',
        source: 'OPEN_FINANCE',
        external_id: 'ext-2',
        created_at: '2026-02-10T00:00:00Z',
      },
      {
        id: 'tx-ghost-transfer',
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'TRANSFER',
        trade_date: '2026-03-10',
        quantity: '100',
        unit_price: '30.00',
        fees: '0.00',
        total_amount: '3000.00',
        source: 'OPEN_FINANCE',
        external_id: 'ext-3',
        created_at: '2026-03-10T00:00:00Z',
      },
    ]);

    await applySchemaUpgrades(getRawSqliteDatabase());

    const remaining = await db.select().from(transactions);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('tx-buy');
  });

  it('S71-T14: nome editado pelo usuário em ativo, conta e lançamento não é sobrescrito na sincronização seguinte', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const inv: PluggyInvestment = {
      id: 'inv-cdb',
      itemId: 'item-1',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Banco BTG Pactual 110% CDI',
      issuer: 'Banco BTG Pactual S.A.',
      rate: 110,
      rateType: 'CDI',
      dueDate: '2028-03-01',
      quantity: 1,
      balance: 10500,
      amountOriginal: 10000,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    };
    const acc: PluggyAccount = {
      id: 'pg-acc-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      number: '00012345-6',
      name: 'Conta Corrente',
      balance: 2000,
      itemId: 'item-1',
      currencyCode: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    };
    const tx: PluggyTransaction = {
      id: 'pg-tx-1',
      description: 'PIX ENVIADO - PADARIA DO ZE 0012345',
      descriptionRaw: 'PIX ENVIADO - PADARIA DO ZE 0012345',
      currencyCode: 'BRL',
      amount: -35.0,
      date: '2026-11-10T10:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      accountId: 'pg-acc-1',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
    };

    const client = makeFakeFetchClient({
      investments: [inv],
      accounts: [acc],
      accountTxs: { 'pg-acc-1': [tx] },
    });

    await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });
    await pluggySyncService.syncFinance('item-1', { client });

    const db = await getDatabase();
    const [createdAsset] = await db.select().from(assets).where(eq(assets.external_id, 'inv-cdb'));
    const [createdAcc] = await db.select().from(finAccounts).where(eq(finAccounts.of_account_id, 'pg-acc-1'));
    const [createdEntry] = await db.select().from(finEntries).where(eq(finEntries.external_id, 'pg-tx-1'));

    // Usuário edita os nomes
    await db.update(assets).set({ name: 'Meu CDB Reserva' }).where(eq(assets.id, createdAsset.id));
    await finRepository.updateAccount(createdAcc.id, { name: 'Conta Principal' });
    await finRepository.updateEntry(createdEntry.id, {
      description: 'Café da manhã',
      user_edited_fields: JSON.stringify(['description']),
    });

    // Segunda sincronização não deve sobrescrever
    await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });
    await pluggySyncService.syncFinance('item-1', { client });

    const [afterAsset] = await db.select().from(assets).where(eq(assets.id, createdAsset.id));
    const [afterAcc] = await db.select().from(finAccounts).where(eq(finAccounts.id, createdAcc.id));
    const [afterEntry] = await db.select().from(finEntries).where(eq(finEntries.id, createdEntry.id));

    expect(afterAsset.name).toBe('Meu CDB Reserva');
    expect(afterAcc.name).toBe('Conta Principal');
    expect(afterEntry.description).toBe('Café da manhã');
    expect(afterEntry.description_raw).toBe('PIX ENVIADO - PADARIA DO ZE 0012345');
  });
});
