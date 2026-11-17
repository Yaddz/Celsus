import { resetDatabase, getDatabase } from '../../../db/client';
import { assets, transactions } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import {
  calculateInvestmentCostBasis,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
} from '../../../domain/openFinance/investments';
import { consolidatePortfolios } from '../../../domain/finance/consolidatedView';
import { MarketSyncService } from '../../marketSyncService';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
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

describe('Sprint 84 — Investimentos: números corretos (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S84-T01: fundo BUY amount 5000, value 2, quantity null => quantity 1, unitPrice 5000.00000000 e warning registrado (D3)', () => {
    const tx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-fund-null-qty',
      type: 'BUY',
      amount: 5000,
      value: 2,
      quantity: null,
    });

    const mapped = mapPluggyInvestmentTransaction(tx, 'inv-fund-1');

    expect(mapped.quantity).toBe('1');
    expect(mapped.unitPrice).toBe('5000.00000000');
    expect(mapped.warnings).toBeDefined();
    expect(mapped.warnings!.length).toBeGreaterThan(0);
  });

  it('S84-T02: fundo BUY amount 5000, quantity 2500, value 2 => unitPrice 2.00000000 sem warning', () => {
    const tx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-fund-ok',
      type: 'BUY',
      amount: 5000,
      quantity: 2500,
      value: 2,
    });

    const mapped = mapPluggyInvestmentTransaction(tx, 'inv-fund-1');

    expect(mapped.quantity).toBe('2500');
    expect(mapped.unitPrice).toBe('2.00000000');
    expect(mapped.warnings ?? []).toEqual([]);
  });

  it('S84-T03: cota 0,0034 x 1.000.000 cotas => averagePrice 0.00340000 e investido 3400.00 (D4)', () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-micro-cota',
      quantity: 1000000,
      balance: 3600,
      amount: 3600,
      amountOriginal: 3400,
    });
    const tx = mapPluggyInvestmentTransaction(
      makeSprint84OpenApiInvestmentTx({
        id: 'tx-micro-cota',
        type: 'BUY',
        quantity: 1000000,
        value: 0.0034,
        amount: 3400,
      }),
      inv.id
    );

    expect(tx.unitPrice).toBe('0.00340000');

    const cost = calculateInvestmentCostBasis(inv, [tx]);
    expect(cost.costBasisSource).toBe('TRANSACTIONS');
    expect(cost.averagePrice).toBe('0.00340000');
    expect(cost.totalInvested).toBe('3400.00');
  });

  it('S84-T04: expenses com incomeTax 15 e iofProvision 3 => fees exclui 18 e notes cita o IR (D9)', () => {
    const tx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-expenses-tax',
      type: 'BUY',
      quantity: 100,
      value: 10,
      amount: 1000,
      description: 'Compra Cota',
      expenses: {
        brokerageFee: 4.5,
        clearingFee: 1.5,
        stockExchangeFee: null,
        custodyFee: null,
        operatingFee: null,
        settlementFee: null,
        serviceTax: null,
        maintenanceFee: null,
        registryFee: null,
        exchangeFee: null,
        tradingAssetsNoticeFee: null,
        iof: null,
        other: null,
        incomeTax: 15,
        iofProvision: 3,
      },
    });

    const mapped = mapPluggyInvestmentTransaction(tx, 'inv-1');

    expect(mapped.fees).toBe('6.00');
    expect(mapped.totalAmount).toBe('1006.00');
    expect(mapped.notes).toMatch(/IR retido.*15/i);
  });

  it('S84-T05: SELL amount 60000, fees 8.76, netAmount null => totalAmount 59991.24 (D9)', () => {
    const tx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-sell-net',
      type: 'SELL',
      movementType: 'CREDIT',
      quantity: 1000,
      value: 60,
      amount: 60000,
      netAmount: null,
      expenses: {
        brokerageFee: 8.76,
      },
    });

    const mapped = mapPluggyInvestmentTransaction(tx, 'inv-1');

    expect(mapped.fees).toBe('8.76');
    expect(mapped.totalAmount).toBe('59991.24');
  });

  it('S84-T06: IPCA rate 100, fixedAnnualRate 6.2 => rfRate 6.2 e rfIndexerPct 100 (D5)', () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-ipca',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB IPCA + 6,2%',
      rateType: 'IPCA',
      rate: 100,
      fixedAnnualRate: 6.2,
      balance: 10500,
      amountOriginal: 10000,
    });

    const mapped = mapPluggyInvestment(inv);

    expect(mapped.rfIndexer).toBe('IPCA');
    expect(mapped.rfRate).toBe(6.2);
    expect(mapped.rfIndexerPct).toBe(100);
  });

  it('S84-T07: CDI rate 110, fixedAnnualRate null => rfRate 110; PRE rate null, fixedAnnualRate 12.5 => rfRate 12.5 (D5)', () => {
    const cdi = mapPluggyInvestment(
      makeSprint84OpenApiInvestment({
        id: 'inv-cdi',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        rateType: 'CDI',
        rate: 110,
        fixedAnnualRate: null,
      })
    );
    expect(cdi.rfIndexer).toBe('CDI');
    expect(cdi.rfRate).toBe(110);

    const pre = mapPluggyInvestment(
      makeSprint84OpenApiInvestment({
        id: 'inv-pre',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        rateType: 'PRE',
        rate: null,
        fixedAnnualRate: 12.5,
      })
    );
    expect(pre.rfIndexer).toBe('PRE');
    expect(pre.rfRate).toBe(12.5);
  });

  it('S84-T08: rate 900 com CDI => rfRate null + warning (D5)', () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-cdi-outlier',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      rateType: 'CDI',
      rate: 900,
      fixedAnnualRate: null,
    });

    const mapped = mapPluggyInvestment(inv);

    expect(mapped.rfRate).toBeNull();
    expect(mapped.warnings).toBeDefined();
    expect(mapped.warnings!.length).toBeGreaterThan(0);
  });

  it('S84-T09: sem amountOriginal => costBasisSource UNKNOWN, averagePrice null, rentabilidade "—" na carteira', async () => {
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-no-cost',
      type: 'MUTUAL_FUND',
      subtype: 'MULTIMARKET_FUND',
      quantity: 100,
      balance: 5200,
      amount: 5200,
      amountOriginal: null,
    });

    const cost = calculateInvestmentCostBasis(inv, []);
    expect(cost.costBasisSource).toBe('UNKNOWN');
    expect(cost.averagePrice).toBeNull();

    const portfolio = await portfolioRepository.createPortfolio({ name: 'Carteira Fundo', docket_code: 'FD01' });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'FUNDS',
      ticker: 'FMM',
      name: 'Fundo Sem Custo',
      quantity: '100',
      average_price: '',
      manual_position_value: '5200.00',
      cost_basis_source: 'UNKNOWN',
      source: 'OPEN_FINANCE',
      external_id: inv.id,
    });

    const marketSync = new MarketSyncService(portfolioRepository, assetRepository);
    const patrimony = await marketSync.recalculatePortfolioPatrimony(portfolio.id);
    expect(patrimony.marketValue).toBe('5200.00');
    expect(patrimony.profitPercentage).toBe('—');

    const portAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    const dossier = consolidatePortfolios([
      {
        id: portfolio.id,
        name: portfolio.name,
        docketCode: portfolio.docket_code,
        assets: portAssets.map((a) => ({
          id: a.id,
          ticker: a.ticker,
          assetClass: a.asset_class as any,
          quantity: a.quantity,
          averagePrice: a.average_price,
          manualPositionValue: a.manual_position_value,
          costBasisSource: a.cost_basis_source,
        })),
      },
    ]);
    expect(dossier.totalMarketValue).toBe('5200.00');
    expect(dossier.totalProfitPercentage).toBe('—');
  });

  it('S84-T10: re-sync com transações antigas gravadas em 2 casas => atualiza in-place sem duplicar', async () => {
    await openFinanceRepository.addItem('item-s84');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Carteira Re-Sync', docket_code: 'RS01' });
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'FUNDS',
      ticker: 'FMICRO',
      name: 'Fundo Micro Cota',
      quantity: '1000000',
      average_price: '0.00',
      manual_position_value: '3600.00',
      source: 'OPEN_FINANCE',
      external_id: 'inv-resync-1',
      institution_id: 'item-s84',
    });

    await transactionRepository.createTransaction({
      portfolio_id: portfolio.id,
      asset_id: asset.id,
      type: 'BUY',
      trade_date: '2026-06-15',
      quantity: '1000000',
      unit_price: '0.00',
      fees: '0.00',
      total_amount: '3400.00',
      source: 'OPEN_FINANCE',
      external_id: 'tx-resync-1',
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-resync-1',
      itemId: 'item-s84',
      quantity: 1000000,
      balance: 3600,
      amount: 3600,
      amountOriginal: 3400,
    });
    const rawTx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-resync-1',
      type: 'BUY',
      quantity: 1000000,
      value: 0.0034,
      amount: 3400,
      date: '2026-06-15T00:00:00.000Z',
    });

    const client = makeMockClient([inv], { 'inv-resync-1': [rawTx] });
    await pluggyInvestmentsSyncService.syncInvestments('item-s84', {
      client,
      defaultPortfolioId: portfolio.id,
    });

    const db = getDatabase();
    const allTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.asset_id, asset.id));
    expect(allTxs).toHaveLength(1);
    expect(allTxs[0].unit_price).toBe('0.00340000');

    const [updatedAsset] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, asset.id));
    expect(updatedAsset.average_price).toBe('0.00340000');
  });
});
