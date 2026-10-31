import {
  calculateDailyPatrimonyCurve,
  calculateMonthlyAggregatedPills,
  HistoricalAssetInput,
  HistoricalTransactionInput,
  DailyMacroRatesInput,
} from '../portfolioHistory';

describe('S5-T01: TestDailyPatrimonyEvolutionCurve', () => {
  it('should reconstruct daily curve accurately crossing stock buy transactions with COTAHIST quotes', () => {
    const assets: HistoricalAssetInput[] = [
      {
        id: 'asset-petr4',
        ticker: 'PETR4',
        assetClass: 'STOCK',
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        id: 'tx-1',
        assetId: 'asset-petr4',
        ticker: 'PETR4',
        type: 'BUY',
        tradeDate: '2026-01-10',
        quantity: '100',
        unitPrice: '30.00',
        fees: '5.00',
      },
      {
        id: 'tx-2',
        assetId: 'asset-petr4',
        ticker: 'PETR4',
        type: 'BUY',
        tradeDate: '2026-01-12',
        quantity: '50',
        unitPrice: '35.00',
        fees: '5.00',
      },
    ];

    const historicalQuotes = {
      PETR4: {
        '2026-01-10': '30.00',
        '2026-01-11': '32.50',
        '2026-01-12': '36.00',
        '2026-01-13': '34.00',
      },
    };

    const dates = ['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13'];

    const curve = calculateDailyPatrimonyCurve({
      assets,
      transactions,
      dates,
      historicalQuotes,
    });

    expect(curve).toHaveLength(4);

    // Day 1: 2026-01-10 (100 shares bought @ 30.00 + 5.00 fee = 3005.00 invested)
    expect(curve[0].date).toBe('2026-01-10');
    expect(curve[0].investedCapital).toBe('3005.00');
    expect(curve[0].marketValue).toBe('3000.00'); // 100 * 30.00
    expect(curve[0].profit).toBe('-5.00');
    expect(curve[0].profitPercentage).toBe('-0.17');

    // Day 2: 2026-01-11 (Quote rises to 32.50)
    expect(curve[1].date).toBe('2026-01-11');
    expect(curve[1].investedCapital).toBe('3005.00');
    expect(curve[1].marketValue).toBe('3250.00'); // 100 * 32.50
    expect(curve[1].profit).toBe('245.00');
    expect(curve[1].profitPercentage).toBe('8.15');

    // Day 3: 2026-01-12 (Buy 50 @ 35.00 + 5.00 fee -> Total invested = 3005 + 1755 = 4760.00)
    expect(curve[2].date).toBe('2026-01-12');
    expect(curve[2].investedCapital).toBe('4760.00');
    expect(curve[2].marketValue).toBe('5400.00'); // 150 * 36.00
    expect(curve[2].profit).toBe('640.00');
    expect(curve[2].profitPercentage).toBe('13.45');

    // Day 4: 2026-01-13 (Quote drops to 34.00)
    expect(curve[3].date).toBe('2026-01-13');
    expect(curve[3].investedCapital).toBe('4760.00');
    expect(curve[3].marketValue).toBe('5100.00'); // 150 * 34.00
    expect(curve[3].profit).toBe('340.00');
    expect(curve[3].profitPercentage).toBe('7.14');
  });

  it('should combine COTAHIST equity quotes with Fixed Income daily CDI and PRE accrual curves', () => {
    const assets: HistoricalAssetInput[] = [
      {
        id: 'asset-vale3',
        ticker: 'VALE3',
        assetClass: 'STOCK',
      },
      {
        id: 'asset-cdb',
        ticker: 'CDB DI 100%',
        assetClass: 'FIXED_INCOME',
        rfIndexer: 'CDI',
        rfRate: 100.0,
      },
      {
        id: 'asset-pre',
        ticker: 'LCI PRE 12%',
        assetClass: 'FIXED_INCOME',
        rfIndexer: 'PRE',
        rfRate: 12.0,
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        id: 'tx-v1',
        assetId: 'asset-vale3',
        ticker: 'VALE3',
        type: 'BUY',
        tradeDate: '2026-01-05',
        quantity: '100',
        unitPrice: '60.00',
        fees: '0.00',
      },
      {
        id: 'tx-cdb1',
        assetId: 'asset-cdb',
        ticker: 'CDB DI 100%',
        type: 'BUY',
        tradeDate: '2026-01-05',
        quantity: '1',
        unitPrice: '10000.00',
        fees: '0.00',
      },
      {
        id: 'tx-pre1',
        assetId: 'asset-pre',
        ticker: 'LCI PRE 12%',
        type: 'BUY',
        tradeDate: '2026-01-05',
        quantity: '1',
        unitPrice: '5000.00',
        fees: '0.00',
      },
    ];

    const historicalQuotes = {
      VALE3: {
        '2026-01-05': '60.00',
        '2026-01-06': '62.00',
        '2026-01-07': '61.00',
      },
    };

    const macroRates: DailyMacroRatesInput = {
      dailyCDI: {
        '2026-01-05': 0.00045,
        '2026-01-06': 0.00045,
        '2026-01-07': 0.00050,
      },
    };

    const dates = ['2026-01-05', '2026-01-06', '2026-01-07'];

    const curve = calculateDailyPatrimonyCurve({
      assets,
      transactions,
      dates,
      historicalQuotes,
      macroRates,
    });

    expect(curve).toHaveLength(3);

    // Initial total invested: 6000 + 10000 + 5000 = 21000.00
    expect(curve[0].investedCapital).toBe('21000.00');
    // On Day 1: VALE3=6000, CDB=10004.50, PRE=5000.00 -> Total = 21004.50
    expect(curve[0].marketValue).toBe('21004.50');

    // On Day 3 (2026-01-07):
    // VALE3 = 100 * 61.00 = 6100.00
    // CDB accrued over 3 days (10000 * 1.00045 * 1.00045 * 1.00050) = 10014.01
    // PRE accrued over 2 business days (5000 * (1.12)^(2/252)) = 5004.50
    // Combined Market Value = 6100.00 + 10014.01 + 5004.50 = 21118.51
    expect(curve[2].date).toBe('2026-01-07');
    expect(curve[2].investedCapital).toBe('21000.00');
    expect(curve[2].marketValue).toBe('21118.51');
    expect(curve[2].profit).toBe('118.51');
    expect(curve[2].profitPercentage).toBe('0.56');
  });

  it('should adjust invested capital and market value correctly when SELL operations occur', () => {
    const assets: HistoricalAssetInput[] = [
      {
        id: 'asset-wege3',
        ticker: 'WEGE3',
        assetClass: 'STOCK',
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        id: 'tx-w1',
        assetId: 'asset-wege3',
        ticker: 'WEGE3',
        type: 'BUY',
        tradeDate: '2026-01-01',
        quantity: '100',
        unitPrice: '40.00',
        fees: '0.00',
      },
      {
        id: 'tx-w2',
        assetId: 'asset-wege3',
        ticker: 'WEGE3',
        type: 'SELL',
        tradeDate: '2026-01-10',
        quantity: '40',
        unitPrice: '50.00',
        fees: '0.00',
      },
    ];

    const historicalQuotes = {
      WEGE3: {
        '2026-01-01': '40.00',
        '2026-01-09': '45.00',
        '2026-01-10': '50.00',
      },
    };

    const curve = calculateDailyPatrimonyCurve({
      assets,
      transactions,
      dates: ['2026-01-01', '2026-01-09', '2026-01-10'],
      historicalQuotes,
    });

    // Before sell: 100 shares @ PM 40 = 4000 invested. At 45 = 4500 market value.
    expect(curve[1].investedCapital).toBe('4000.00');
    expect(curve[1].marketValue).toBe('4500.00');

    // On sell date: 40 sold, 60 remaining @ PM 40 -> active invested capital = 2400.00.
    // Market value for remaining 60 shares @ 50 = 3000.00
    expect(curve[2].date).toBe('2026-01-10');
    expect(curve[2].investedCapital).toBe('2400.00');
    expect(curve[2].marketValue).toBe('3000.00');
    expect(curve[2].profit).toBe('600.00');
    expect(curve[2].profitPercentage).toBe('25.00');
  });

  it('should prioritize manualPriceOverride in Fixed Income assets over theoretical indexer calculation', () => {
    const assets: HistoricalAssetInput[] = [
      {
        id: 'asset-cra',
        ticker: 'CRA KLABIN',
        assetClass: 'FIXED_INCOME',
        rfIndexer: 'IPCA',
        rfRate: 6.5,
        manualPriceOverride: '10500.00',
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        id: 'tx-c1',
        assetId: 'asset-cra',
        ticker: 'CRA KLABIN',
        type: 'BUY',
        tradeDate: '2026-01-01',
        quantity: '1',
        unitPrice: '10000.00',
      },
    ];

    const curve = calculateDailyPatrimonyCurve({
      assets,
      transactions,
      dates: ['2026-01-15'],
    });

    expect(curve).toHaveLength(1);
    expect(curve[0].investedCapital).toBe('10000.00');
    expect(curve[0].marketValue).toBe('10500.00');
    expect(curve[0].profit).toBe('500.00');
  });

  it('should carry forward the latest available closing price during weekends or non-trading days', () => {
    const assets: HistoricalAssetInput[] = [
      {
        id: 'asset-itub4',
        ticker: 'ITUB4',
        assetClass: 'STOCK',
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        id: 'tx-i1',
        assetId: 'asset-itub4',
        ticker: 'ITUB4',
        type: 'BUY',
        tradeDate: '2026-01-09', // Friday
        quantity: '100',
        unitPrice: '32.00',
      },
    ];

    // Quote available only on Friday (2026-01-09), Saturday and Sunday have no quote
    const historicalQuotes = {
      ITUB4: {
        '2026-01-09': '33.00',
      },
    };

    const dates = ['2026-01-09', '2026-01-10', '2026-01-11']; // Fri, Sat, Sun

    const curve = calculateDailyPatrimonyCurve({
      assets,
      transactions,
      dates,
      historicalQuotes,
    });

    expect(curve).toHaveLength(3);
    // On Saturday and Sunday, market value retains Friday's 33.00 quote (3300.00)
    expect(curve[1].date).toBe('2026-01-10');
    expect(curve[1].marketValue).toBe('3300.00');
    expect(curve[2].date).toBe('2026-01-11');
    expect(curve[2].marketValue).toBe('3300.00');
  });

  it('should aggregate daily points into monthly pill capsules for the statistics dashboard', () => {
    const dailyCurve = [
      {
        date: '2026-01-31',
        investedCapital: '10000.00',
        marketValue: '10500.00',
        profit: '500.00',
        profitPercentage: '5.00',
      },
      {
        date: '2026-02-28',
        investedCapital: '15000.00',
        marketValue: '16200.00',
        profit: '1200.00',
        profitPercentage: '8.00',
      },
      {
        date: '2026-03-31',
        investedCapital: '20000.00',
        marketValue: '22000.00',
        profit: '2000.00',
        profitPercentage: '10.00',
      },
    ];

    const transactions: HistoricalTransactionInput[] = [
      {
        assetId: 'a1',
        type: 'BUY',
        tradeDate: '2026-01-10',
        quantity: '100',
        unitPrice: '100.00',
      },
      {
        assetId: 'a1',
        type: 'BUY',
        tradeDate: '2026-02-15',
        quantity: '50',
        unitPrice: '100.00',
      },
      {
        assetId: 'a1',
        type: 'BUY',
        tradeDate: '2026-03-20',
        quantity: '50',
        unitPrice: '100.00',
      },
    ];

    const monthlyPills = calculateMonthlyAggregatedPills(dailyCurve, transactions);

    expect(monthlyPills).toHaveLength(3);
    expect(monthlyPills[0].monthKey).toBe('2026-01');
    expect(monthlyPills[0].marketValue).toBe('10500.00');
    expect(monthlyPills[0].netContributions).toBe('10000.00');

    expect(monthlyPills[1].monthKey).toBe('2026-02');
    expect(monthlyPills[1].marketValue).toBe('16200.00');
    expect(monthlyPills[1].netContributions).toBe('5000.00');

    expect(monthlyPills[2].monthKey).toBe('2026-03');
    expect(monthlyPills[2].marketValue).toBe('22000.00');
    expect(monthlyPills[2].netContributions).toBe('5000.00');
  });
});
