import { eq } from 'drizzle-orm';
import { getDatabase, getRawSqlite, resetDatabase } from '../../../db/client';
import { assets, transactions } from '../../../db/schema';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { transactionRepository } from '../../../repositories/transactionRepository';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import type { PluggyClient } from '../pluggyClient';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from '../types';

function makeMockPluggyClient(
  investments: PluggyInvestment[],
  txsByInvestmentId: Record<string, PluggyInvestmentTransaction[]> = {}
): PluggyClient {
  return {
    fetchItem: jest.fn(),
    fetchAccounts: jest.fn(),
    fetchTransactions: jest.fn(),
    fetchBills: jest.fn(),
    fetchInvestments: jest.fn().mockResolvedValue(investments),
    fetchInvestmentTransactions: jest.fn().mockImplementation((invId: string) =>
      Promise.resolve(txsByInvestmentId[invId] || [])
    ),
  } as unknown as PluggyClient;
}

describe('Sprint 66 — Orquestração, Migração 1.1 e Precedência Pluggy (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S66-S01: migração do item 1.1 adiciona manual_position_value e migra FIXED_INCOME existente sem alterar STOCK/FII', async () => {
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Principal' });
    const raw = getRawSqlite();

    // Simula ativos já existentes antes da regra 1.1
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'FIXED_INCOME',
      ticker: 'CDB-OLD',
      name: 'CDB Antigo',
      quantity: '1',
      average_price: '5000.00',
      manual_price_override: '5320.00',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras',
      quantity: '100',
      average_price: '30.00',
      manual_price_override: '35.00',
    });

    // Verifica que a coluna existe e que a migração idempotente funciona
    const cols = raw.getAllSync<{ name: string }>('PRAGMA table_info(assets)');
    expect(cols.some((c) => c.name === 'manual_position_value')).toBe(true);

    const txCols = raw.getAllSync<{ name: string }>('PRAGMA table_info(transactions)');
    expect(txCols.some((c) => c.name === 'archived_at')).toBe(true);
  });

  it('S66-S02: previewReconciliation sugere casamento por ISIN/ticker e syncInvestments arquiva movimentações antigas e aplica precedência', async () => {
    await openFinanceRepository.addItem('item-itau');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Carteira Itaú' });

    const existingPetr = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      quantity: '50',
      average_price: '28.00',
    });
    await transactionRepository.createTransaction({
      portfolio_id: portfolio.id,
      asset_id: existingPetr.id,
      type: 'BUY',
      trade_date: '2025-05-10',
      quantity: '50',
      unit_price: '28.00',
      fees: '0.00',
      total_amount: '1400.00',
      source: 'MANUAL',
    });

    const pluggyInvs: PluggyInvestment[] = [
      {
        id: 'pg-inv-petr',
        itemId: 'item-itau',
        type: 'EQUITY',
        subtype: 'STOCK',
        code: 'PETR4',
        isin: 'BRPETRACNPR6',
        name: 'PETROBRAS PN',
        quantity: 100,
        balance: 3600.0,
        amount: 3600.0,
        amountOriginal: 3100.0,
        currencyCode: 'BRL',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-11-16T10:00:00Z',
      },
    ];
    const client = makeMockPluggyClient(pluggyInvs, {
      'pg-inv-petr': [
        {
          id: 'pg-tx-1',
          type: 'BUY',
          quantity: 100,
          value: 31.0,
          amount: 3100.0,
          date: '2026-02-01T00:00:00Z',
        },
      ],
    });

    const proposals = await pluggyInvestmentsSyncService.previewReconciliation('item-itau', {
      client,
      targetPortfolioId: portfolio.id,
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0].suggestedAssetId).toBe(existingPetr.id);

    const result = await pluggyInvestmentsSyncService.syncInvestments('item-itau', {
      client,
      defaultPortfolioId: portfolio.id,
      reconciliationChoices: [
        {
          pluggyInvestmentId: 'pg-inv-petr',
          action: 'MATCH',
          targetAssetId: existingPetr.id,
          targetPortfolioId: portfolio.id,
        },
      ],
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.counts.transactionsArchived).toBe(1);

    const db = await getDatabase();
    const updatedAssets = await db.select().from(assets).where(eq(assets.id, existingPetr.id));
    expect(updatedAssets[0].source).toBe('OPEN_FINANCE');
    expect(updatedAssets[0].external_id).toBe('pg-inv-petr');
    expect(updatedAssets[0].quantity).toBe('100');
    expect(updatedAssets[0].manual_position_value).toBe('3600.00');

    const allTxs = await db.select().from(transactions).where(eq(transactions.asset_id, existingPetr.id));
    const archivedManual = allTxs.filter((t) => t.source === 'MANUAL');
    const ofTxs = allTxs.filter((t) => t.source === 'OPEN_FINANCE');
    expect(archivedManual[0].archived_at).toBeTruthy();
    expect(ofTxs).toHaveLength(1);
    expect(ofTxs[0].external_id).toBe('pg-tx-1');
  });

  it('S66-S03: idempotência — segunda sincronização não duplica ativos nem movimentações', async () => {
    await openFinanceRepository.addItem('item-xp');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'XP' });

    const pluggyInvs: PluggyInvestment[] = [
      {
        id: 'pg-inv-cdb',
        itemId: 'item-xp',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        name: 'CDB XP 120% CDI',
        quantity: 1,
        balance: 11200.0,
        amount: 11500.0,
        amountOriginal: 10000.0,
        rate: 120,
        rateType: 'CDI',
        dueDate: '2028-01-01',
        issuer: 'Banco XP',
        currencyCode: 'BRL',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-11-16T10:00:00Z',
      },
    ];
    const client = makeMockPluggyClient(pluggyInvs, {
      'pg-inv-cdb': [
        {
          id: 'pg-tx-cdb-1',
          type: 'BUY',
          quantity: 1,
          value: 10000.0,
          amount: 10000.0,
          date: '2026-01-15T00:00:00Z',
        },
      ],
    });

    await pluggyInvestmentsSyncService.syncInvestments('item-xp', {
      client,
      defaultPortfolioId: portfolio.id,
      reconciliationChoices: [
        {
          pluggyInvestmentId: 'pg-inv-cdb',
          action: 'CREATE_NEW',
          targetPortfolioId: portfolio.id,
        },
      ],
    });

    const second = await pluggyInvestmentsSyncService.syncInvestments('item-xp', {
      client,
      defaultPortfolioId: portfolio.id,
    });
    expect(second.counts.assetsCreated).toBe(0);
    expect(second.counts.assetsUpdated).toBe(1);
    expect(second.counts.transactionsCreated).toBe(0);

    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    expect(dbAssets).toHaveLength(1);
  });

  it('S66-S04: investimento que some NÃO zera posição (marca missing_since); TOTAL_WITHDRAWAL encerra posição', async () => {
    await openFinanceRepository.addItem('item-btg');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'BTG' });

    const invMissing: PluggyInvestment = {
      id: 'pg-inv-miss',
      itemId: 'item-btg',
      type: 'EQUITY',
      subtype: 'REAL_ESTATE_FUND',
      code: 'MXRF11',
      name: 'Maxi Renda FII',
      quantity: 200,
      balance: 2040.0,
      amount: 2040.0,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
    };
    const invWithdrawn: PluggyInvestment = {
      id: 'pg-inv-out',
      itemId: 'item-btg',
      type: 'FIXED_INCOME',
      subtype: 'LCI',
      name: 'LCI Vencida',
      quantity: 1,
      balance: 5000.0,
      amount: 5000.0,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
    };

    const client1 = makeMockPluggyClient([invMissing, invWithdrawn]);
    await pluggyInvestmentsSyncService.syncInvestments('item-btg', {
      client: client1,
      defaultPortfolioId: portfolio.id,
      reconciliationChoices: [
        { pluggyInvestmentId: 'pg-inv-miss', action: 'CREATE_NEW', targetPortfolioId: portfolio.id },
        { pluggyInvestmentId: 'pg-inv-out', action: 'CREATE_NEW', targetPortfolioId: portfolio.id },
      ],
    });

    // Na segunda sync: invMissing sumiu da resposta; invWithdrawn veio como TOTAL_WITHDRAWAL
    const client2 = makeMockPluggyClient([
      { ...invWithdrawn, status: 'TOTAL_WITHDRAWAL', balance: 0, quantity: 0 },
    ]);
    const nowFixed = () => new Date('2026-11-16T14:00:00.000Z');
    const res2 = await pluggyInvestmentsSyncService.syncInvestments('item-btg', {
      client: client2,
      defaultPortfolioId: portfolio.id,
      now: nowFixed,
    });
    expect(res2.counts.assetsMarkedMissing).toBe(1);
    expect(res2.counts.assetsClosed).toBe(1);

    const all = await assetRepository.getAssetsByPortfolio(portfolio.id);
    const mxrf = all.find((a) => a.ticker === 'MXRF11')!;
    expect(mxrf.quantity).toBe('200'); // NÃO zerou!
    expect(mxrf.manual_position_value).toBe('2040.00');
    expect(mxrf.missing_since).toBe('2026-11-16T14:00:00.000Z');

    const lci = all.find((a) => a.external_id === 'pg-inv-out')!;
    expect(lci.quantity).toBe('0');
    expect(lci.of_status).toBe('TOTAL_WITHDRAWAL');
  });

  it('S66-S05: desligar sincronização restaura movimentações arquivadas e reverte source para MANUAL', async () => {
    await openFinanceRepository.addItem('item-rico');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Rico' });
    const manualAsset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'FII',
      ticker: 'KNRI11',
      name: 'Kinea Renda',
      quantity: '10',
      average_price: '150.00',
    });
    await transactionRepository.createTransaction({
      portfolio_id: portfolio.id,
      asset_id: manualAsset.id,
      type: 'BUY',
      trade_date: '2025-08-01',
      quantity: '10',
      unit_price: '150.00',
      fees: '0.00',
      total_amount: '1500.00',
      source: 'MANUAL',
    });

    const client = makeMockPluggyClient([
      {
        id: 'pg-inv-knri',
        itemId: 'item-rico',
        type: 'EQUITY',
        subtype: 'REAL_ESTATE_FUND',
        code: 'KNRI11',
        name: 'KNRI11',
        quantity: 20,
        balance: 3100.0,
        amount: 3100.0,
        currencyCode: 'BRL',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-11-16T10:00:00Z',
      },
    ]);

    await pluggyInvestmentsSyncService.syncInvestments('item-rico', {
      client,
      defaultPortfolioId: portfolio.id,
      reconciliationChoices: [
        {
          pluggyInvestmentId: 'pg-inv-knri',
          action: 'MATCH',
          targetAssetId: manualAsset.id,
          targetPortfolioId: portfolio.id,
        },
      ],
    });

    const disconnectRes = await pluggyInvestmentsSyncService.disconnectItemInvestments('item-rico');
    expect(disconnectRes.revertedAssets).toBe(1);
    expect(disconnectRes.restoredTransactions).toBe(1);

    const db = await getDatabase();
    const restoredAsset = await db.select().from(assets).where(eq(assets.id, manualAsset.id));
    expect(restoredAsset[0].source).toBe('MANUAL');

    const txs = await db.select().from(transactions).where(eq(transactions.asset_id, manualAsset.id));
    expect(txs[0].archived_at).toBeNull();
  });

  it('S66-S06: importação B3 avisa quando ativo já é governado pela Pluggy (source = OPEN_FINANCE)', async () => {
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Itaú' });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'STOCK',
      ticker: 'ITUB4',
      name: 'Itaú Unibanco',
      quantity: '100',
      average_price: '32.00',
      source: 'OPEN_FINANCE',
      external_id: 'pg-itub4',
    });

    const warnings = await pluggyInvestmentsSyncService.checkB3ImportConflicts(portfolio.id, [
      'ITUB4',
      'BBAS3',
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].ticker).toBe('ITUB4');
    expect(warnings[0].message).toMatch(/Open Finance|Pluggy/i);
  });
});
