import { resetDatabase, getDatabase } from '../../../db/client';
import { assets, transactions } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  calculateInvestmentCostBasis,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
} from '../../../domain/openFinance/investments';
import { buildPortfolioHistory } from '../../../domain/finance/portfolioHistory';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import {
  makePluggyItem,
  makeSprint84OpenApiInvestment,
  makeSprint84OpenApiInvestmentTx,
} from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '../types';

function makeMockClient(
  invs: PluggyInvestment[],
  txsByInv: Record<string, PluggyInvestmentTransaction[]>
): PluggyClient {
  return {
    getItem: async (id: string) => makePluggyItem({ id }),
    listInvestments: async () => invs,
    listInvestmentTransactions: async (invId: string) => txsByInv[invId] ?? [],
  } as unknown as PluggyClient;
}

describe('Sprint 89 — Correções da validação Pluggy (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S89-T01: posição 100 lotes, priceFactor 1000, transações com mesmo fator => quantidade da posição = quantidade do livro, sem OPENING_BALANCE', async () => {
    await openFinanceRepository.addItem('item-pf');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Lote',
      docket_code: 'LT01',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-pf-1',
      itemId: 'item-pf',
      type: 'FIXED_INCOME',
      subtype: 'LCI',
      code: 'LCI-PF',
      name: 'LCI Banco Lote',
      quantity: 100,
      priceFactor: 1000,
      balance: 105000,
      amount: 105000,
      amountOriginal: 100000,
    });

    const rawTxs: PluggyInvestmentTransaction[] = [
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-pf-1',
        type: 'BUY',
        quantity: 100,
        priceFactor: 1000,
        value: 1,
        amount: 100000,
        date: '2026-01-15T00:00:00Z',
      }),
    ];

    const mappedInv = mapPluggyInvestment(inv, undefined, undefined, rawTxs.map((t) => t.priceFactor));
    expect(Number(mappedInv.quantity)).toBe(100000);
    expect(mappedInv.warnings).toHaveLength(0);

    const mappedTxs = rawTxs.map((t) => mapPluggyInvestmentTransaction(t, inv.id));
    expect(Number(mappedTxs[0].quantity)).toBe(100000);

    const cost = calculateInvestmentCostBasis(inv, mappedTxs, rawTxs.map((t) => t.priceFactor));
    expect(cost.coveredByHistory).toBe(true);
    expect(cost.openingAdjustment).toBeNull();
    expect(cost.closingAdjustment).toBeNull();

    const client = makeMockClient([inv], { [inv.id]: rawTxs });
    await pluggyInvestmentsSyncService.syncInvestments('item-pf', {
      client,
      reconcileChoices: [{ pluggyInvestmentId: inv.id, targetPortfolioId: portfolio.id }],
    });

    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    expect(dbAssets).toHaveLength(1);
    expect(Number(dbAssets[0].quantity)).toBe(100000);

    const db = getDatabase();
    const txs = await db.select().from(transactions).where(eq(transactions.asset_id, dbAssets[0].id));
    expect(txs.some((t) => t.external_id?.startsWith('pluggy-opening:'))).toBe(false);
    expect(txs.some((t) => t.external_id?.startsWith('pluggy-closing-adj:'))).toBe(false);
  });

  it('S89-T02: fatores divergentes entre posição e transações => warning e posição sem multiplicar', () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-pf-div',
      itemId: 'item-pf',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'Petrobras PN',
      quantity: 100,
      priceFactor: null,
      balance: 3800,
    });

    const mapped = mapPluggyInvestment(inv, undefined, undefined, [1000, 100]);
    expect(Number(mapped.quantity)).toBe(100);
    expect(mapped.warnings.length).toBeGreaterThan(0);

    const invWithFactor = makeSprint84OpenApiInvestment({
      ...inv,
      priceFactor: 1000,
    });
    const mappedConflict = mapPluggyInvestment(invWithFactor, undefined, undefined, [100]);
    expect(Number(mappedConflict.quantity)).toBe(100);
    expect(mappedConflict.warnings.length).toBeGreaterThan(0);
  });

  it('S89-T03: ação com 40 no livro, 100 na posição e sem amountOriginal => OPENING_BALANCE de 60 (UNKNOWN) e histórico com 100 unidades', async () => {
    await openFinanceRepository.addItem('item-open');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Ações',
      docket_code: 'AC01',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-eq-open',
      itemId: 'item-open',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'VALE3',
      name: 'Vale ON',
      quantity: 100,
      balance: 6000,
      amount: 6000,
      amountOriginal: null,
      purchaseDate: null,
      issueDate: null,
      date: '2026-11-17T00:00:00Z',
    });

    const rawTxs: PluggyInvestmentTransaction[] = [
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-vale-1',
        type: 'BUY',
        quantity: 40,
        value: 55,
        amount: 2200,
        date: '2026-06-10T00:00:00Z',
      }),
    ];

    const mappedTxs = rawTxs.map((t) => mapPluggyInvestmentTransaction(t, inv.id));
    const cost = calculateInvestmentCostBasis(inv, mappedTxs);
    expect(cost.costBasisSource).toBe('UNKNOWN');
    expect(cost.averagePrice).toBeNull();
    expect(cost.openingAdjustment).not.toBeNull();
    expect(Number(cost.openingAdjustment!.quantity)).toBe(60);

    const client = makeMockClient([inv], { [inv.id]: rawTxs });
    await pluggyInvestmentsSyncService.syncInvestments('item-open', {
      client,
      reconcileChoices: [{ pluggyInvestmentId: inv.id, targetPortfolioId: portfolio.id }],
    });

    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    expect(dbAssets).toHaveLength(1);
    expect(dbAssets[0].cost_basis_source).toBe('UNKNOWN');

    const db = getDatabase();
    const assetTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.asset_id, dbAssets[0].id));
    const opening = assetTxs.find((t) => t.external_id === `pluggy-opening:${inv.id}`);
    expect(opening).toBeDefined();
    expect(opening?.is_synthetic).toBe(1);
    expect(Number(opening?.quantity)).toBe(60);

    const totalQtyFromLedger = assetTxs.reduce(
      (sum, t) => sum + (t.type === 'BUY' ? Number(t.quantity) : -Number(t.quantity)),
      0
    );
    expect(totalQtyFromLedger).toBe(100);

    const history = buildPortfolioHistory({
      assets: [
        {
          id: dbAssets[0].id,
          ticker: dbAssets[0].ticker,
          assetClass: dbAssets[0].asset_class as any,
          currentQuantity: 100,
          currentPrice: 60,
          manualPositionValue: 6000,
          ofReportedValue: 6000,
          ofReportedAt: '2026-11-17',
          valueSource: 'INSTITUTION',
        },
      ],
      transactions: assetTxs.map((t) => ({
        id: t.id,
        assetId: t.asset_id,
        type: t.type as 'BUY' | 'SELL',
        tradeDate: t.trade_date,
        quantity: Number(t.quantity),
        unitPrice: Number(t.unit_price),
        fees: Number(t.fees),
      })),
      quotesByTicker: {},
      todayIso: '2026-11-17',
      range: '1Y',
    });

    expect(history.points.length).toBeGreaterThan(0);
    expect(history.points[history.points.length - 1].marketValue).toBeCloseTo(6000, 1);
  });

  it('S89-T04: livro com 150 e posição com 100 => ajuste SELL sintético de 50 unidades (pluggy-closing-adj)', async () => {
    await openFinanceRepository.addItem('item-close');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Ajuste',
      docket_code: 'AJ01',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-eq-close',
      itemId: 'item-close',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'ITUB4',
      name: 'Itaú PN',
      quantity: 100,
      balance: 3500,
      amount: 3500,
      amountOriginal: null,
    });

    const rawTxs: PluggyInvestmentTransaction[] = [
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-itub-1',
        type: 'BUY',
        quantity: 150,
        value: 30,
        amount: 4500,
        date: '2026-05-10T00:00:00Z',
      }),
    ];

    const mappedTxs = rawTxs.map((t) => mapPluggyInvestmentTransaction(t, inv.id));
    const cost = calculateInvestmentCostBasis(inv, mappedTxs);
    expect(cost.closingAdjustment).not.toBeNull();
    expect(Number(cost.closingAdjustment!.quantity)).toBe(50);
    expect(cost.closingAdjustment!.tradeDate).toBe('2026-05-11');

    const client = makeMockClient([inv], { [inv.id]: rawTxs });
    await pluggyInvestmentsSyncService.syncInvestments('item-close', {
      client,
      reconcileChoices: [{ pluggyInvestmentId: inv.id, targetPortfolioId: portfolio.id }],
    });

    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    const db = getDatabase();
    const assetTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.asset_id, dbAssets[0].id));
    const closing = assetTxs.find((t) => t.external_id === `pluggy-closing-adj:${inv.id}`);
    expect(closing).toBeDefined();
    expect(closing?.type).toBe('SELL');
    expect(closing?.is_synthetic).toBe(1);
    expect(Number(closing?.quantity)).toBe(50);
  });

  it('S89-T05: re-sync com o livro completo remove ambos os sintéticos (pluggy-opening e pluggy-closing-adj)', async () => {
    await openFinanceRepository.addItem('item-resync');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Resync',
      docket_code: 'RS01',
    });

    // 1o sync: livro menor (40 vs 100) => cria pluggy-opening
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-resync-1',
      itemId: 'item-resync',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'BBAS3',
      name: 'Banco do Brasil ON',
      quantity: 100,
      balance: 2800,
      amountOriginal: null,
    });
    const txsStep1: PluggyInvestmentTransaction[] = [
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-bb-1',
        type: 'BUY',
        quantity: 40,
        value: 25,
        amount: 1000,
        date: '2026-04-10T00:00:00Z',
      }),
    ];

    await pluggyInvestmentsSyncService.syncInvestments('item-resync', {
      client: makeMockClient([inv], { [inv.id]: txsStep1 }),
      reconcileChoices: [{ pluggyInvestmentId: inv.id, targetPortfolioId: portfolio.id }],
    });

    const db = getDatabase();
    let dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    let assetTxs = await db.select().from(transactions).where(eq(transactions.asset_id, dbAssets[0].id));
    expect(assetTxs.some((t) => t.external_id === `pluggy-opening:${inv.id}`)).toBe(true);

    // 2o sync: livro maior (150 vs 100) => remove pluggy-opening e cria pluggy-closing-adj
    const txsStep2: PluggyInvestmentTransaction[] = [
      ...txsStep1,
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-bb-2',
        type: 'BUY',
        quantity: 110,
        value: 26,
        amount: 2860,
        date: '2026-05-10T00:00:00Z',
      }),
    ];
    await pluggyInvestmentsSyncService.syncInvestments('item-resync', {
      client: makeMockClient([inv], { [inv.id]: txsStep2 }),
    });

    assetTxs = await db.select().from(transactions).where(eq(transactions.asset_id, dbAssets[0].id));
    expect(assetTxs.some((t) => t.external_id === `pluggy-opening:${inv.id}`)).toBe(false);
    expect(assetTxs.some((t) => t.external_id === `pluggy-closing-adj:${inv.id}`)).toBe(true);

    // 3o sync: livro completo (150 - 50 = 100) => remove pluggy-closing-adj também
    const txsStep3: PluggyInvestmentTransaction[] = [
      ...txsStep2,
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-bb-3',
        type: 'SELL',
        quantity: 50,
        value: 27,
        amount: 1350,
        date: '2026-06-10T00:00:00Z',
      }),
    ];
    await pluggyInvestmentsSyncService.syncInvestments('item-resync', {
      client: makeMockClient([inv], { [inv.id]: txsStep3 }),
    });

    assetTxs = await db.select().from(transactions).where(eq(transactions.asset_id, dbAssets[0].id));
    expect(assetTxs.some((t) => t.external_id === `pluggy-opening:${inv.id}`)).toBe(false);
    expect(assetTxs.some((t) => t.external_id === `pluggy-closing-adj:${inv.id}`)).toBe(false);
  });
});
