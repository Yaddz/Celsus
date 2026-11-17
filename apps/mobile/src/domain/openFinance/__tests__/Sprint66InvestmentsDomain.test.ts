import {
  calculateInvestmentCostBasis,
  computeClassCoverageReport,
  formatMissingSinceLabel,
  formatNullableOpenFinanceMetric,
  InvestmentMatchCandidate,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
  matchInvestmentToAsset,
  normalizeInvestmentTicker,
} from '../investments';
import { consolidatePortfolios } from '../../finance/consolidatedView';
import { calculateDailyPatrimonyCurve } from '../../finance/portfolioHistory';
import { ASSET_CLASS_COLORS } from '../../../theme/palettes';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from '../../../services/pluggy/types';

function makeBaseInvestment(overrides: Partial<PluggyInvestment> = {}): PluggyInvestment {
  return {
    id: 'inv-1',
    itemId: 'item-1',
    type: 'EQUITY',
    subtype: 'STOCK',
    balance: 3500.0,
    amount: 3500.0,
    amountOriginal: 3000.0,
    quantity: 100,
    code: 'PETR4',
    isin: 'BRPETRACNPR6',
    name: 'PETROBRAS PN',
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-11-16T10:00:00Z',
    ...overrides,
  };
}

describe('Sprint 66 — Domínio de Investimentos Open Finance (Fase A)', () => {
  describe('Mapeamento de tipos/subtipos Pluggy -> classes do app', () => {
    it('S66-D01: mapeia EQUITY/STOCK e EQUITY/BDR para STOCK, e EQUITY/REAL_ESTATE_FUND para FII', () => {
      const stock = mapPluggyInvestment(
        makeBaseInvestment({ id: 'inv-stock', type: 'EQUITY', subtype: 'STOCK', code: 'vale3' })
      );
      expect(stock.assetClass).toBe('STOCK');
      expect(stock.isEtf).toBe(false);
      expect(stock.ticker).toBe('VALE3');
      expect(stock.isin).toBe('BRPETRACNPR6');

      const bdr = mapPluggyInvestment(
        makeBaseInvestment({ id: 'inv-bdr', type: 'EQUITY', subtype: 'BDR', code: 'AAPL34' })
      );
      expect(bdr.assetClass).toBe('STOCK');
      expect(bdr.isEtf).toBe(false);
      expect(bdr.ticker).toBe('AAPL34');

      const fii = mapPluggyInvestment(
        makeBaseInvestment({
          id: 'inv-fii',
          type: 'EQUITY',
          subtype: 'REAL_ESTATE_FUND',
          code: 'HGLG11',
          isin: 'BRHGLGCTF004',
        })
      );
      expect(fii.assetClass).toBe('FII');
      expect(fii.ticker).toBe('HGLG11');
    });

    it('S66-D02: mapeia ETF (type ETF ou EQUITY/ETF) para STOCK com flag isEtf = true', () => {
      const etfByType = mapPluggyInvestment(
        makeBaseInvestment({ id: 'inv-etf-1', type: 'ETF', subtype: 'ETF', code: 'BOVA11' })
      );
      expect(etfByType.assetClass).toBe('STOCK');
      expect(etfByType.isEtf).toBe(true);
      expect(etfByType.ticker).toBe('BOVA11');

      const etfBySubtype = mapPluggyInvestment(
        makeBaseInvestment({ id: 'inv-etf-2', type: 'EQUITY', subtype: 'ETF', code: 'IVVB11' })
      );
      expect(etfBySubtype.assetClass).toBe('STOCK');
      expect(etfBySubtype.isEtf).toBe(true);
    });

    it('S66-D03: mapeia FIXED_INCOME/* e COE para FIXED_INCOME preservando taxa, indexador, vencimento e emissor', () => {
      const cdb = mapPluggyInvestment(
        makeBaseInvestment({
          id: 'inv-cdb',
          type: 'FIXED_INCOME',
          subtype: 'CDB',
          code: null,
          isin: null,
          name: 'CDB Banco Inter 110% CDI',
          quantity: 1,
          balance: 10850.25,
          amount: 11020.0,
          amountOriginal: 10000.0,
          rate: 110,
          rateType: 'CDI',
          fixedAnnualRate: null,
          dueDate: '2028-06-15T00:00:00Z',
          issuer: 'Banco Inter S.A.',
          taxExempt: false,
        })
      );
      expect(cdb.assetClass).toBe('FIXED_INCOME');
      expect(cdb.marketValue).toBe('10850.25');
      expect(cdb.grossAmount).toBe('11020.00');
      expect(cdb.rfIndexer).toBe('CDI');
      expect(cdb.rfRate).toBe(110);
      expect(cdb.rfMaturityDate).toBe('2028-06-15');
      expect(cdb.rfIssuer).toBe('Banco Inter S.A.');
      expect(cdb.rfIsTaxExempt).toBe(false);

      const coe = mapPluggyInvestment(
        makeBaseInvestment({
          id: 'inv-coe',
          type: 'COE',
          subtype: 'STRUCTURED_NOTE',
          code: 'COE-XP-01',
          rate: 12.5,
          rateType: 'PRE',
          fixedAnnualRate: 12.5,
          dueDate: '2027-12-01',
          issuer: 'XP Investimentos',
        })
      );
      expect(coe.assetClass).toBe('FIXED_INCOME');
      expect(coe.rfIndexer).toBe('PRE');
      expect(coe.rfFixedAnnualRate).toBe(12.5);
    });

    it('S66-D04: mapeia MUTUAL_FUND/* e SECURITY/* para FUNDS (Fundos e Previdência) com cor na paleta', () => {
      expect(ASSET_CLASS_COLORS.FUNDS).toBeDefined();
      expect(ASSET_CLASS_COLORS.FUNDS).toMatch(/^#[0-9A-Fa-f]{6}$/);

      const mutualFund = mapPluggyInvestment(
        makeBaseInvestment({
          id: 'inv-fund',
          type: 'MUTUAL_FUND',
          subtype: 'MULTIMARKET_FUND',
          code: null,
          isin: 'BRFUNDO00001',
          name: 'Alaska Black FIC FIA',
          quantity: 500,
          balance: 15000.0,
          amount: 15500.0,
        })
      );
      expect(mutualFund.assetClass).toBe('FUNDS');

      const security = mapPluggyInvestment(
        makeBaseInvestment({
          id: 'inv-prev',
          type: 'SECURITY',
          subtype: 'RETIREMENT',
          code: null,
          name: 'Brasilprev PGBL',
          quantity: 1000,
          balance: 42000.0,
        })
      );
      expect(security.assetClass).toBe('FUNDS');
    });

    it('S66-D05: campos nulos no Open Finance (amountProfit, rentabilidades) aparecem como "—", nunca zero', () => {
      expect(formatNullableOpenFinanceMetric(null)).toBe('—');
      expect(formatNullableOpenFinanceMetric(undefined, '%')).toBe('—');
      expect(formatNullableOpenFinanceMetric(0, '%')).toBe('0.00%');

      const mapped = mapPluggyInvestment(
        makeBaseInvestment({
          amountProfit: null,
          lastMonthRate: null,
          lastTwelveMonthsRate: null,
          annualRate: null,
        })
      );
      expect(mapped.amountProfitFormatted).toBe('—');
      expect(mapped.lastMonthRateFormatted).toBe('—');
      expect(mapped.lastTwelveMonthsRateFormatted).toBe('—');
      expect(mapped.annualRateFormatted).toBe('—');
    });
  });

  describe('Mapeamento de movimentações e cálculo de custo', () => {
    it('S66-D06: mapPluggyInvestmentTransaction mapeia BUY, SELL, INTEREST, AMORTIZATION, TAX, TRANSFER com fees da nota e external_id', () => {
      const buyTx: PluggyInvestmentTransaction = {
        id: 'pg-tx-buy-1',
        type: 'BUY',
        quantity: 100,
        value: 30.0,
        amount: 3000.0,
        netAmount: 3005.5,
        date: '2026-03-10T12:00:00Z',
        description: 'Compra PETR4',
      };
      const mappedBuy = mapPluggyInvestmentTransaction(buyTx, 'inv-1');
      expect(mappedBuy.externalId).toBe('pg-tx-buy-1');
      expect(mappedBuy.type).toBe('BUY');
      expect(mappedBuy.tradeDate).toBe('2026-03-10');
      expect(mappedBuy.quantity).toBe('100');
      expect(mappedBuy.unitPrice).toBe('30.00000000');
      expect(mappedBuy.fees).toBe('5.50');

      const interestTx: PluggyInvestmentTransaction = {
        id: 'pg-tx-int-1',
        type: 'INTEREST',
        amount: 125.4,
        date: '2026-04-15T00:00:00Z',
        description: 'Dividendos PETR4',
      };
      const mappedInt = mapPluggyInvestmentTransaction(interestTx, 'inv-1');
      expect(mappedInt.type).toBe('INCOME');
      expect(mappedInt.totalAmount).toBe('125.40');

      const amortTx: PluggyInvestmentTransaction = {
        id: 'pg-tx-amort-1',
        type: 'AMORTIZATION',
        amount: 500.0,
        date: '2026-05-01T00:00:00Z',
      };
      expect(mapPluggyInvestmentTransaction(amortTx, 'inv-1').type).toBe('AMORTIZATION');

      const taxTx: PluggyInvestmentTransaction = {
        id: 'pg-tx-tax-1',
        type: 'TAX',
        amount: 45.0,
        date: '2026-05-31T00:00:00Z',
      };
      expect(mapPluggyInvestmentTransaction(taxTx, 'inv-1').type).toBe('TAX');

      const transferTx: PluggyInvestmentTransaction = {
        id: 'pg-tx-tr-1',
        type: 'TRANSFER',
        quantity: 50,
        value: 20.0,
        amount: 1000.0,
        date: '2026-06-01T00:00:00Z',
      };
      expect(mapPluggyInvestmentTransaction(transferTx, 'inv-1').type).toBe('TRANSFER');
    });

    it('S66-D07: recalcula custo pelas movimentações quando o histórico cobre a posição inteira (costBasisSource = TRANSACTIONS)', () => {
      const inv = makeBaseInvestment({
        quantity: 150,
        amountOriginal: 9999.0, // deve ser ignorado quando histórico cobre tudo
      });
      const txs = [
        mapPluggyInvestmentTransaction(
          {
            id: 't1',
            type: 'BUY',
            quantity: 100,
            value: 30.0,
            amount: 3000.0,
            netAmount: 3010.0,
            date: '2026-01-10T00:00:00Z',
          },
          inv.id
        ),
        mapPluggyInvestmentTransaction(
          {
            id: 't2',
            type: 'BUY',
            quantity: 100,
            value: 36.0,
            amount: 3600.0,
            netAmount: 3600.0,
            date: '2026-02-10T00:00:00Z',
          },
          inv.id
        ),
        mapPluggyInvestmentTransaction(
          {
            id: 't3',
            type: 'SELL',
            quantity: 50,
            value: 40.0,
            amount: 2000.0,
            date: '2026-03-10T00:00:00Z',
          },
          inv.id
        ),
      ];

      const cost = calculateInvestmentCostBasis(inv, txs);
      // PM: (3010 + 3600) / 200 = 33.05; após venda de 50, restam 150 * 33.05 = 4957.50
      expect(cost.coveredByHistory).toBe(true);
      expect(cost.costBasisSource).toBe('TRANSACTIONS');
      expect(cost.averagePrice).toBe('33.05000000');
      expect(cost.totalInvested).toBe('4957.50');
    });

    it('S66-D08: usa amountOriginal ÷ quantity quando o histórico é incompleto (janela de 12 meses) e marca INSTITUTION', () => {
      const inv = makeBaseInvestment({
        quantity: 200,
        amountOriginal: 5500.0,
      });
      // Histórico só tem uma compra de 50 cotas, faltam as 150 anteriores
      const partialTxs = [
        mapPluggyInvestmentTransaction(
          {
            id: 't-recent',
            type: 'BUY',
            quantity: 50,
            value: 32.0,
            amount: 1600.0,
            date: '2026-09-01T00:00:00Z',
          },
          inv.id
        ),
      ];

      const cost = calculateInvestmentCostBasis(inv, partialTxs);
      expect(cost.coveredByHistory).toBe(false);
      expect(cost.costBasisSource).toBe('INSTITUTION');
      expect(cost.averagePrice).toBe('27.50000000'); // 5500 / 200
      expect(cost.totalInvested).toBe('5500.00');
    });
  });

  describe('Casamento (matching), cobertura e ausência', () => {
    const existing: InvestmentMatchCandidate[] = [
      {
        id: 'asset-petr',
        portfolioId: 'port-1',
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetClass: 'STOCK',
        isin: 'BRPETRACNPR6',
      },
      {
        id: 'asset-hglg',
        portfolioId: 'port-1',
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        assetClass: 'FII',
        isin: null,
      },
      {
        id: 'asset-cdb',
        portfolioId: 'port-1',
        ticker: 'CDB-INTER-110',
        name: 'CDB Banco Inter',
        assetClass: 'FIXED_INCOME',
        rfIssuer: 'Banco Inter S.A.',
        rfMaturityDate: '2028-06-15',
        rfRate: 110,
      },
    ];

    it('S66-D09: casa por ISIN primeiro, depois ticker normalizado, depois (emissor + vencimento + taxa) para RF', () => {
      expect(normalizeInvestmentTicker(' petr4f ')).toBe('PETR4');

      const byIsin = matchInvestmentToAsset(
        makeBaseInvestment({ code: 'PETR4F', isin: 'BRPETRACNPR6' }),
        existing
      );
      expect(byIsin.matchedAssetId).toBe('asset-petr');
      expect(byIsin.strategy).toBe('ISIN');

      const byTicker = matchInvestmentToAsset(
        makeBaseInvestment({ code: 'hglg11', isin: 'OTHERISIN', subtype: 'REAL_ESTATE_FUND' }),
        existing
      );
      expect(byTicker.matchedAssetId).toBe('asset-hglg');
      expect(byTicker.strategy).toBe('TICKER');

      const byRfKey = matchInvestmentToAsset(
        makeBaseInvestment({
          id: 'inv-cdb-2',
          type: 'FIXED_INCOME',
          subtype: 'CDB',
          code: null,
          isin: null,
          issuer: 'banco inter s.a.',
          dueDate: '2028-06-15T00:00:00Z',
          rate: 110,
        }),
        existing
      );
      expect(byRfKey.matchedAssetId).toBe('asset-cdb');
      expect(byRfKey.strategy).toBe('FIXED_INCOME_KEY');

      const unmatched = matchInvestmentToAsset(
        makeBaseInvestment({ id: 'inv-new', code: 'WEGE3', isin: 'BRWEGEACNOR0' }),
        existing
      );
      expect(unmatched.matchedAssetId).toBeNull();
      expect(unmatched.strategy).toBe('NONE');
    });

    it('S66-D10: relatório de cobertura aponta classes não expostas como B3/manual e formata ausência dd/mm', () => {
      const onlyFixedIncome = [
        makeBaseInvestment({ id: 'inv-rf', type: 'FIXED_INCOME', subtype: 'CDB', code: null }),
      ];
      const report = computeClassCoverageReport(onlyFixedIncome);
      const rfCov = report.find((c) => c.assetClass === 'FIXED_INCOME')!;
      const stockCov = report.find((c) => c.assetClass === 'STOCK')!;
      expect(rfCov.exposedByOpenFinance).toBe(true);
      expect(stockCov.exposedByOpenFinance).toBe(false);
      expect(stockCov.sourceHint).toMatch(/B3|manual/i);

      expect(formatMissingSinceLabel('2026-11-05T10:00:00Z')).toBe('não informado desde 05/11');
    });
  });

  describe('Item 1.1 + Ativos mistos em consolidatedView e portfolioHistory', () => {
    it('S66-D11: consolidatedView aplica manualPriceOverride (unitário) para manual e manualPositionValue (posição) para Open Finance/RF', () => {
      const result = consolidatePortfolios([
        {
          id: 'port-mixed',
          name: 'Carteira Mista',
          docketCode: 'MIX-01',
          assets: [
            {
              id: 'a-manual-stock',
              ticker: 'PETR4',
              assetClass: 'STOCK',
              quantity: '100',
              averagePrice: '30.00',
              manualPriceOverride: '36.00', // 100 * 36.00 = 3600.00
            },
            {
              id: 'a-of-rf',
              ticker: 'CDB-INTER',
              assetClass: 'FIXED_INCOME',
              quantity: '2',
              averagePrice: '1000.00',
              manualPositionValue: '2350.00', // valor da posição = 2350.00 (não 2 * 2350)
            },
            {
              id: 'a-of-funds',
              ticker: 'ALASKA',
              assetClass: 'FUNDS',
              quantity: '50',
              averagePrice: '20.00',
              manualPositionValue: '1250.00', // valor da posição = 1250.00
            },
          ],
          classTargets: [
            { assetClass: 'STOCK', targetPercentage: 50 },
            { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
            { assetClass: 'FUNDS', targetPercentage: 20 },
            { assetClass: 'FII', targetPercentage: 0 },
            { assetClass: 'CRYPTO', targetPercentage: 0 },
          ],
        },
      ]);

      // Invested: 3000 + 2000 + 1000 = 6000.00
      // Market: 3600 + 2350 + 1250 = 7200.00
      expect(result.totalInvestedCapital).toBe('6000.00');
      expect(result.totalMarketValue).toBe('7200.00');
      expect(result.totalProfit).toBe('1200.00');
      expect(result.classAllocation.STOCK.currentPercentage).toBe('50.00');
      expect(result.classAllocation.FUNDS.marketValue).toBe('1250.00');
    });

    it('S66-D12: portfolioHistory calcula curva histórica corretamente com ativos mistos (unitário × posição)', () => {
      const curve = calculateDailyPatrimonyCurve({
        assets: [
          {
            id: 'a-stock',
            ticker: 'VALE3',
            assetClass: 'STOCK',
            manualPriceOverride: '70.00', // unitário: 10 * 70 = 700.00
          },
          {
            id: 'a-rf',
            ticker: 'LCI-BTG',
            assetClass: 'FIXED_INCOME',
            manualPositionValue: '5400.00', // posição: 5400.00 (mesmo com qty = 5)
          },
        ],
        transactions: [
          {
            id: 'tx-1',
            assetId: 'a-stock',
            type: 'BUY',
            tradeDate: '2026-01-05',
            quantity: '10',
            unitPrice: '60.00',
          },
          {
            id: 'tx-2',
            assetId: 'a-rf',
            type: 'BUY',
            tradeDate: '2026-01-05',
            quantity: '5',
            unitPrice: '1000.00',
          },
        ],
        dates: ['2026-01-10'],
      });

      expect(curve).toHaveLength(1);
      // Invested: 600 + 5000 = 5600.00
      // Market: 700 + 5400 = 6100.00
      expect(curve[0].investedCapital).toBe('5600.00');
      expect(curve[0].marketValue).toBe('6100.00');
      expect(curve[0].profit).toBe('500.00');
    });
  });
});
