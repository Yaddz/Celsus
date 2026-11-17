import { resetDatabase, getDatabase } from '../../../db/client';
import { assets, transactions } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  calculateInvestmentCostBasis,
  mapPluggyInvestment,
  matchInvestmentToAsset,
  resolvePluggyAssetClass,
  resolveVariableIncomeValueSource,
  type InvestmentMatchCandidate,
} from '../../../domain/openFinance/investments';
import { buildInvestmentDisplay } from '../../../domain/openFinance/naming';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { MarketSyncService } from '../../marketSyncService';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { transactionRepository } from '../../../repositories/transactionRepository';
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

describe('Sprint 85 — Valor de mercado, identidade e reparo (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S85-T01: CDB com 3 BUYs de 1.000 e amountOriginal 10.000 => OPENING_BALANCE sintética de 7.000 (D2)', async () => {
    await openFinanceRepository.addItem('item-cdb');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira RF',
      docket_code: 'RF01',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-cdb-opening',
      itemId: 'item-cdb',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Banco X',
      issuer: 'Banco X',
      rateType: 'CDI',
      rate: 105,
      quantity: 10,
      balance: 10800,
      amount: 10800,
      amountOriginal: 10000,
      purchaseDate: '2024-01-10T00:00:00Z',
    });
    const rawTxs: PluggyInvestmentTransaction[] = [
      makeSprint84OpenApiInvestmentTx({ id: 'b1', type: 'BUY', quantity: 1, value: 1000, amount: 1000, date: '2026-01-10T00:00:00Z' }),
      makeSprint84OpenApiInvestmentTx({ id: 'b2', type: 'BUY', quantity: 1, value: 1000, amount: 1000, date: '2026-02-10T00:00:00Z' }),
      makeSprint84OpenApiInvestmentTx({ id: 'b3', type: 'BUY', quantity: 1, value: 1000, amount: 1000, date: '2026-03-10T00:00:00Z' }),
    ];

    const client = makeMockClient([inv], { [inv.id]: rawTxs });
    await pluggyInvestmentsSyncService.syncInvestments('item-cdb', {
      client,
      defaultPortfolioId: portfolio.id,
    });

    const db = getDatabase();
    const txs = await db.select().from(transactions);
    const opening = txs.find((t) => t.external_id === `pluggy-opening:${inv.id}`);

    expect(opening).toBeDefined();
    expect(opening!.type).toBe('BUY');
    expect(opening!.total_amount).toBe('7000.00');
    expect(opening!.quantity).toBe('7');
    expect((opening as any).is_synthetic).toBe(1);
    expect(opening!.trade_date).toBe('2024-01-10');
  });

  it('S85-T02: re-sync com o livro completo => OPENING_BALANCE removida (R4)', async () => {
    await openFinanceRepository.addItem('item-cdb-2');
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira RF 2',
      docket_code: 'RF02',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-cdb-complete',
      itemId: 'item-cdb-2',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Completo',
      quantity: 10,
      balance: 10500,
      amountOriginal: 10000,
    });

    // 1o sync: livro incompleto (só 3 cotas de 10)
    await pluggyInvestmentsSyncService.syncInvestments('item-cdb-2', {
      client: makeMockClient([inv], {
        [inv.id]: [
          makeSprint84OpenApiInvestmentTx({ id: 'c1', type: 'BUY', quantity: 3, value: 1000, amount: 3000, date: '2026-02-01T00:00:00Z' }),
        ],
      }),
      defaultPortfolioId: portfolio.id,
    });

    const db = getDatabase();
    let txs = await db.select().from(transactions);
    expect(txs.some((t) => t.external_id === `pluggy-opening:${inv.id}`)).toBe(true);

    // 2o sync: livro agora completo (10 cotas)
    await pluggyInvestmentsSyncService.syncInvestments('item-cdb-2', {
      client: makeMockClient([inv], {
        [inv.id]: [
          makeSprint84OpenApiInvestmentTx({ id: 'c0', type: 'BUY', quantity: 7, value: 1000, amount: 7000, date: '2025-01-01T00:00:00Z' }),
          makeSprint84OpenApiInvestmentTx({ id: 'c1', type: 'BUY', quantity: 3, value: 1000, amount: 3000, date: '2026-02-01T00:00:00Z' }),
        ],
      }),
      defaultPortfolioId: portfolio.id,
    });

    txs = await db.select().from(transactions);
    expect(txs.some((t) => t.external_id === `pluggy-opening:${inv.id}`)).toBe(false);
    expect(txs).toHaveLength(2);
  });

  it('S85-T03: PETR4 qty 100, balance 3800, cotação 38 => QUOTE; cotação 380 => INSTITUTION valor 3800 (D6, R5)', async () => {
    expect(
      resolveVariableIncomeValueSource({
        ticker: 'PETR4',
        quantity: '100',
        balance: '3800.00',
        quote: '38.00',
      })
    ).toBe('QUOTE');

    expect(
      resolveVariableIncomeValueSource({
        ticker: 'PETR4',
        quantity: '100',
        balance: '3800.00',
        quote: '380.00',
      })
    ).toBe('INSTITUTION');

    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira RV',
      docket_code: 'RV01',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      quantity: '100',
      average_price: '30.00000000',
      of_reported_value: '3800.00',
      of_reported_at: '2026-11-16',
      value_source: 'QUOTE',
      source: 'OPEN_FINANCE',
      external_id: 'inv-petr4-outlier',
    } as any);

    const fakeMarketApi = {
      fetchQuotes: async () => [
        {
          ticker: 'PETR4',
          assetClass: 'STOCK',
          currentPrice: '380.00',
          changePercent24h: 0,
          updatedAt: '2026-11-16T12:00:00Z',
        },
      ],
      getCachedQuote: async () => null,
    } as any;

    const svc = new MarketSyncService(portfolioRepository, assetRepository, fakeMarketApi);
    const res = await svc.syncPortfolio(portfolio.id);
    expect(res.totalMarketValue).toBe('3800.00');
  });

  it('S85-T04: EQUITY sem code, nome "BANCO XYZ ON" => value_source INSTITUTION, sem busca de cotação (D7, R7)', () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-no-code',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: null,
      isin: null,
      name: 'BANCO XYZ ON',
      quantity: 100,
      balance: 2500,
    });

    const mapped = mapPluggyInvestment(inv);
    expect((mapped as any).valueSource).toBe('INSTITUTION');
    expect(mapped.marketValue).toBe('2500.00');
    expect((mapped as any).ofReportedValue).toBe('2500.00');
  });

  it('S85-T05: OPTION => classe FUNDS, valor = balance (R5)', () => {
    const opt = makeSprint84OpenApiInvestment({
      id: 'inv-option',
      type: 'EQUITY',
      subtype: 'OPTION',
      code: 'PETRK40',
      name: 'Opção PETR4',
      quantity: 1000,
      balance: 450.0,
    });

    const cls = resolvePluggyAssetClass(opt);
    expect(cls.assetClass).toBe('FUNDS');

    const mapped = mapPluggyInvestment(opt);
    expect(mapped.assetClass).toBe('FUNDS');
    expect(mapped.marketValue).toBe('450.00');
  });

  it('S85-T06: PETR4 no item A e no item B => dois ativos; sync alternado A, B, A não muda quantidade de nenhum (D8, R7)', async () => {
    await openFinanceRepository.addItem('item-A');
    await openFinanceRepository.addItem('item-B');
    const portA = await portfolioRepository.createPortfolio({ name: 'Corretora A', docket_code: 'CA01' });
    const portB = await portfolioRepository.createPortfolio({ name: 'Corretora B', docket_code: 'CB01' });

    const invA = makeSprint84OpenApiInvestment({
      id: 'inv-petr-A',
      itemId: 'item-A',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      isin: 'BRPETRACNPR6',
      name: 'Petrobras PN',
      quantity: 100,
      balance: 3800,
      amountOriginal: 3000,
    });
    const invB = makeSprint84OpenApiInvestment({
      id: 'inv-petr-B',
      itemId: 'item-B',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      isin: 'BRPETRACNPR6',
      name: 'Petrobras PN',
      quantity: 250,
      balance: 9500,
      amountOriginal: 8000,
    });

    const clientA = makeMockClient([invA], { [invA.id]: [] });
    const clientB = makeMockClient([invB], { [invB.id]: [] });

    await pluggyInvestmentsSyncService.syncInvestments('item-A', { client: clientA, defaultPortfolioId: portA.id });
    await pluggyInvestmentsSyncService.syncInvestments('item-B', { client: clientB, defaultPortfolioId: portB.id });
    await pluggyInvestmentsSyncService.syncInvestments('item-A', { client: clientA, defaultPortfolioId: portA.id });

    const db = getDatabase();
    const allAssets = await db.select().from(assets);
    const petrAssets = allAssets.filter((a) => a.ticker === 'PETR4');
    expect(petrAssets).toHaveLength(2);
    expect(petrAssets.find((a) => a.external_id === 'inv-petr-A')?.quantity).toBe('100');
    expect(petrAssets.find((a) => a.external_id === 'inv-petr-B')?.quantity).toBe('250');

    // matchInvestmentToAsset ignora candidatos OPEN_FINANCE de outro item
    const candidates: InvestmentMatchCandidate[] = petrAssets.map((a) => ({
      id: a.id,
      portfolioId: a.portfolio_id,
      ticker: a.ticker,
      name: a.name,
      assetClass: a.asset_class as any,
      isin: a.isin,
      externalId: a.external_id,
      source: a.source,
      institutionId: a.institution_id,
    }));
    const matchFromB = matchInvestmentToAsset(
      { ...invB, id: 'inv-petr-B-new' },
      candidates,
      'item-B'
    );
    expect(matchFromB.matchedAssetId).toBeNull();
  });

  it('S85-T07: PETR4 duas vezes no mesmo item => dois ativos com ticker "PETR4" e nomes distintos (R7)', async () => {
    await openFinanceRepository.addItem('item-same');
    const port = await portfolioRepository.createPortfolio({ name: 'Corretora Unica', docket_code: 'CU01' });

    const inv1 = makeSprint84OpenApiInvestment({
      id: 'inv-petr-1',
      itemId: 'item-same',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'PETROBRAS PN',
      number: '1111',
      quantity: 100,
      balance: 3800,
      amountOriginal: 3000,
    });
    const inv2 = makeSprint84OpenApiInvestment({
      id: 'inv-petr-2',
      itemId: 'item-same',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'PETROBRAS PN',
      number: '2222',
      quantity: 50,
      balance: 1900,
      amountOriginal: 1500,
    });

    const d1 = buildInvestmentDisplay(inv1);
    const d2 = buildInvestmentDisplay(inv2, new Set([d1.ticker]));
    expect(d1.ticker).toBe('PETR4');
    expect(d2.ticker).toBe('PETR4');
    expect(d1.name).not.toBe(d2.name);

    await pluggyInvestmentsSyncService.syncInvestments('item-same', {
      client: makeMockClient([inv1, inv2], {}),
      defaultPortfolioId: port.id,
    });

    const db = getDatabase();
    const allAssets = await db.select().from(assets);
    expect(allAssets).toHaveLength(2);
    expect(allAssets.every((a) => a.ticker === 'PETR4')).toBe(true);
    expect(allAssets[0].name).not.toBe(allAssets[1].name);
  });

  it('S85-T10: reparo separa um ativo sequestrado em dois, sem duplicar transações (D8)', async () => {
    await openFinanceRepository.addItem('item-A');
    await openFinanceRepository.addItem('item-B');
    const portA = await portfolioRepository.createPortfolio({ name: 'Port A', docket_code: 'PA01' });
    const portB = await portfolioRepository.createPortfolio({ name: 'Port B', docket_code: 'PB01' });

    // Estado corrompido: ativo único com external_id do item-B, mas contendo transações do item-A e item-B
    const hijacked = await assetRepository.createAsset({
      portfolio_id: portB.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      quantity: '250',
      average_price: '32.00000000',
      source: 'OPEN_FINANCE',
      external_id: 'inv-B',
      institution_id: 'item-B',
    });

    await transactionRepository.createTransaction({
      portfolio_id: portB.id,
      asset_id: hijacked.id,
      type: 'BUY',
      trade_date: '2026-01-10',
      quantity: '100',
      unit_price: '30.00000000',
      fees: '0.00',
      total_amount: '3000.00',
      source: 'OPEN_FINANCE',
      external_id: 'tx-from-A',
    });
    await transactionRepository.createTransaction({
      portfolio_id: portB.id,
      asset_id: hijacked.id,
      type: 'BUY',
      trade_date: '2026-02-10',
      quantity: '250',
      unit_price: '32.00000000',
      fees: '0.00',
      total_amount: '8000.00',
      source: 'OPEN_FINANCE',
      external_id: 'tx-from-B',
    });

    const invA = makeSprint84OpenApiInvestment({
      id: 'inv-A',
      itemId: 'item-A',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'Petrobras PN',
      quantity: 100,
      balance: 3800,
      amountOriginal: 3000,
    });
    const txA = makeSprint84OpenApiInvestmentTx({
      id: 'tx-from-A',
      type: 'BUY',
      quantity: 100,
      value: 30,
      amount: 3000,
      date: '2026-01-10T00:00:00Z',
    });

    const result = await pluggyInvestmentsSyncService.syncInvestments('item-A', {
      client: makeMockClient([invA], { 'inv-A': [txA] }),
      defaultPortfolioId: portA.id,
    });

    const db = getDatabase();
    const allAssets = await db.select().from(assets);
    expect(allAssets).toHaveLength(2);

    const assetA = allAssets.find((a) => a.external_id === 'inv-A');
    const assetB = allAssets.find((a) => a.external_id === 'inv-B');
    expect(assetA).toBeDefined();
    expect(assetB).toBeDefined();

    const allTxs = await db.select().from(transactions);
    expect(allTxs).toHaveLength(2);
    expect(allTxs.find((t) => t.external_id === 'tx-from-A')?.asset_id).toBe(assetA!.id);
    expect(allTxs.find((t) => t.external_id === 'tx-from-B')?.asset_id).toBe(assetB!.id);
    expect((result.counts as any).assetsRepaired).toBeGreaterThanOrEqual(1);
  });
});
