import {
  consolidatePortfolios,
  PortfolioConsolidationInput,
} from '../consolidatedView';

describe('S5-T02: TestMultiPortfolioConsolidation', () => {
  it('should accurately consolidate multiple independent portfolios into a unified dossier', () => {
    const p1: PortfolioConsolidationInput = {
      id: 'p-main',
      name: 'Carteira Principal',
      docketCode: 'REV-CART-001',
      isArchived: 0,
      assets: [
        {
          id: 'a-petr4',
          ticker: 'PETR4',
          assetClass: 'STOCK',
          quantity: '100',
          averagePrice: '30.00',
          currentPrice: '35.00', // Invested: 3000, Market: 3500
        },
        {
          id: 'a-cdb',
          ticker: 'CDB 100%',
          assetClass: 'FIXED_INCOME',
          quantity: '1',
          averagePrice: '5000.00',
          currentPrice: '5200.00', // Invested: 5000, Market: 5200
        },
      ],
      classTargets: [
        { assetClass: 'FIXED_INCOME', targetPercentage: 50.0 },
        { assetClass: 'STOCK', targetPercentage: 50.0 },
        { assetClass: 'FII', targetPercentage: 0.0 },
        { assetClass: 'CRYPTO', targetPercentage: 0.0 },
      ],
    };

    const p2: PortfolioConsolidationInput = {
      id: 'p-fiis',
      name: 'Dossiê Dividendos & FIIs',
      docketCode: 'REV-CART-002',
      isArchived: 0,
      assets: [
        {
          id: 'a-hglg11',
          ticker: 'HGLG11',
          assetClass: 'FII',
          quantity: '50',
          averagePrice: '160.00',
          currentPrice: '165.00', // Invested: 8000, Market: 8250
        },
      ],
      classTargets: [
        { assetClass: 'FII', targetPercentage: 100.0 },
        { assetClass: 'FIXED_INCOME', targetPercentage: 0.0 },
        { assetClass: 'STOCK', targetPercentage: 0.0 },
        { assetClass: 'CRYPTO', targetPercentage: 0.0 },
      ],
    };

    const result = consolidatePortfolios([p1, p2]);

    // Total Invested: 8000 (P1) + 8000 (P2) = 16000.00
    expect(result.totalInvestedCapital).toBe('16000.00');

    // Total Market Value: 8700 (P1) + 8250 (P2) = 16950.00
    expect(result.totalMarketValue).toBe('16950.00');

    // Total Profit: 16950 - 16000 = 950.00
    expect(result.totalProfit).toBe('950.00');

    // Profit Percentage: (950 / 16000) * 100 = 5.9375 -> 5.94%
    expect(result.totalProfitPercentage).toBe('5.94');

    expect(result.activePortfolioCount).toBe(2);
    expect(result.archivedPortfolioCount).toBe(0);

    // Breakdown
    expect(result.portfolioBreakdown).toHaveLength(2);

    const b1 = result.portfolioBreakdown.find((b) => b.portfolioId === 'p-main')!;
    expect(b1.name).toBe('Carteira Principal');
    expect(b1.investedCapital).toBe('8000.00');
    expect(b1.marketValue).toBe('8700.00');
    expect(b1.profit).toBe('700.00');
    expect(b1.profitPercentage).toBe('8.75');
    // Share: 8700 / 16950 = 51.33%
    expect(b1.shareOfTotal).toBe('51.33%');

    const b2 = result.portfolioBreakdown.find((b) => b.portfolioId === 'p-fiis')!;
    expect(b2.name).toBe('Dossiê Dividendos & FIIs');
    expect(b2.investedCapital).toBe('8000.00');
    expect(b2.marketValue).toBe('8250.00');
    expect(b2.profit).toBe('250.00');
    expect(b2.profitPercentage).toBe('3.13');
    // Share: 8250 / 16950 = 48.67%
    expect(b2.shareOfTotal).toBe('48.67%');
  });

  it('should maintain strict financial isolation between independent portfolios', () => {
    // Both portfolios have VALE3, but with independent transactions and cost bases
    const p1: PortfolioConsolidationInput = {
      id: 'p1',
      name: 'Carteira A',
      docketCode: 'REV-001',
      assets: [
        {
          id: 'p1-vale',
          ticker: 'VALE3',
          assetClass: 'STOCK',
          quantity: '50',
          averagePrice: '50.00',
          currentPrice: '75.00',
        },
      ],
    };

    const p2: PortfolioConsolidationInput = {
      id: 'p2',
      name: 'Carteira B',
      docketCode: 'REV-002',
      assets: [
        {
          id: 'p2-vale',
          ticker: 'VALE3',
          assetClass: 'STOCK',
          quantity: '100',
          averagePrice: '70.00',
          currentPrice: '75.00',
        },
      ],
    };

    const result = consolidatePortfolios([p1, p2]);

    const item1 = result.portfolioBreakdown.find((b) => b.portfolioId === 'p1')!;
    expect(item1.investedCapital).toBe('2500.00'); // 50 * 50
    expect(item1.marketValue).toBe('3750.00'); // 50 * 75
    expect(item1.profit).toBe('1250.00');
    expect(item1.profitPercentage).toBe('50.00');

    const item2 = result.portfolioBreakdown.find((b) => b.portfolioId === 'p2')!;
    expect(item2.investedCapital).toBe('7000.00'); // 100 * 70
    expect(item2.marketValue).toBe('7500.00'); // 100 * 75
    expect(item2.profit).toBe('500.00');
    expect(item2.profitPercentage).toBe('7.14');
  });

  it('should aggregate identical tickers across portfolios into consolidated holdings', () => {
    const p1: PortfolioConsolidationInput = {
      id: 'p1',
      name: 'Carteira A',
      docketCode: 'REV-001',
      assets: [
        {
          id: 'a1',
          ticker: 'VALE3',
          assetClass: 'STOCK',
          quantity: '50',
          averagePrice: '50.00',
          currentPrice: '75.00',
        },
      ],
    };

    const p2: PortfolioConsolidationInput = {
      id: 'p2',
      name: 'Carteira B',
      docketCode: 'REV-002',
      assets: [
        {
          id: 'a2',
          ticker: 'VALE3',
          assetClass: 'STOCK',
          quantity: '100',
          averagePrice: '70.00',
          currentPrice: '75.00',
        },
      ],
    };

    const result = consolidatePortfolios([p1, p2]);

    expect(result.aggregatedHoldings).toHaveLength(1);
    const vale = result.aggregatedHoldings[0];
    expect(vale.ticker).toBe('VALE3');
    expect(vale.totalQuantity).toBe('150');
    // Total invested = (50 * 50) + (100 * 70) = 2500 + 7000 = 9500.00
    expect(vale.totalInvestedCapital).toBe('9500.00');
    // Consolidated PM = 9500 / 150 = 63.33
    expect(vale.consolidatedAveragePrice).toBe('63.33');
    // Total Market Value = 150 * 75 = 11250.00
    expect(vale.totalMarketValue).toBe('11250.00');
    expect(vale.profit).toBe('1750.00');
    expect(vale.profitPercentage).toBe('18.42');
    expect(vale.shareOfTotal).toBe('100.00%');
    expect(vale.portfolioIds).toEqual(['p1', 'p2']);
  });

  it('should exclude archived portfolios from default consolidated view while counting them', () => {
    const activePortfolio: PortfolioConsolidationInput = {
      id: 'p-active',
      name: 'Ativa',
      docketCode: 'REV-001',
      isArchived: 0,
      assets: [
        {
          id: 'a-active',
          ticker: 'ITUB4',
          assetClass: 'STOCK',
          quantity: '100',
          averagePrice: '30.00',
          currentPrice: '35.00',
        },
      ],
    };

    const archivedPortfolio: PortfolioConsolidationInput = {
      id: 'p-archived',
      name: 'Antiga Arquivada',
      docketCode: 'REV-OLD',
      isArchived: 1,
      assets: [
        {
          id: 'a-archived',
          ticker: 'BBDC4',
          assetClass: 'STOCK',
          quantity: '1000',
          averagePrice: '15.00',
          currentPrice: '16.00',
        },
      ],
    };

    // Default: exclude archived
    const resultDefault = consolidatePortfolios([activePortfolio, archivedPortfolio]);
    expect(resultDefault.activePortfolioCount).toBe(1);
    expect(resultDefault.archivedPortfolioCount).toBe(1);
    expect(resultDefault.totalMarketValue).toBe('3500.00');
    expect(resultDefault.portfolioBreakdown).toHaveLength(1);
    expect(resultDefault.portfolioBreakdown[0].portfolioId).toBe('p-active');

    // With includeArchived: true
    const resultWithArchived = consolidatePortfolios(
      [activePortfolio, archivedPortfolio],
      { includeArchived: true }
    );
    expect(resultWithArchived.totalMarketValue).toBe('19500.00'); // 3500 + 16000
    expect(resultWithArchived.portfolioBreakdown).toHaveLength(2);
  });

  it('should compute consolidated asset class allocation and portfolio-weighted target percentages', () => {
    // Portfolio 1 (Total Market = 60,000)
    const p1: PortfolioConsolidationInput = {
      id: 'p1',
      name: 'Carteira Conservadora',
      docketCode: 'REV-001',
      assets: [
        {
          id: 'a1',
          ticker: 'TESOURO SELIC',
          assetClass: 'FIXED_INCOME',
          quantity: '1',
          averagePrice: '24000.00',
          currentPrice: '24000.00',
        },
        {
          id: 'a2',
          ticker: 'BOVA11',
          assetClass: 'STOCK',
          quantity: '360',
          averagePrice: '100.00',
          currentPrice: '100.00', // 36,000
        },
      ],
      classTargets: [
        { assetClass: 'FIXED_INCOME', targetPercentage: 40.0 },
        { assetClass: 'STOCK', targetPercentage: 60.0 },
        { assetClass: 'FII', targetPercentage: 0.0 },
        { assetClass: 'CRYPTO', targetPercentage: 0.0 },
      ],
    };

    // Portfolio 2 (Total Market = 40,000)
    const p2: PortfolioConsolidationInput = {
      id: 'p2',
      name: 'Carteira Arrojada',
      docketCode: 'REV-002',
      assets: [
        {
          id: 'b1',
          ticker: 'CDB DI',
          assetClass: 'FIXED_INCOME',
          quantity: '1',
          averagePrice: '8000.00',
          currentPrice: '8000.00',
        },
        {
          id: 'b2',
          ticker: 'SMAL11',
          assetClass: 'STOCK',
          quantity: '320',
          averagePrice: '100.00',
          currentPrice: '100.00', // 32,000
        },
      ],
      classTargets: [
        { assetClass: 'FIXED_INCOME', targetPercentage: 20.0 },
        { assetClass: 'STOCK', targetPercentage: 80.0 },
        { assetClass: 'FII', targetPercentage: 0.0 },
        { assetClass: 'CRYPTO', targetPercentage: 0.0 },
      ],
    };

    const result = consolidatePortfolios([p1, p2]);

    // Total Market Value = 60,000 + 40,000 = 100,000.00
    expect(result.totalMarketValue).toBe('100000.00');

    // FIXED_INCOME:
    // Total Market: 24,000 + 8,000 = 32,000.00 (32.00%)
    // Weighted Target: (60,000 * 40% + 40,000 * 20%) / 100,000 = (24,000 + 8,000) / 100,000 = 32.00%
    const fi = result.classAllocation.FIXED_INCOME;
    expect(fi.marketValue).toBe('32000.00');
    expect(fi.currentPercentage).toBe('32.00');
    expect(fi.weightedTargetPercentage).toBe('32.00');
    expect(fi.differencePercentage).toBe('0.00');

    // STOCK:
    // Total Market: 36,000 + 32,000 = 68,000.00 (68.00%)
    // Weighted Target: (60,000 * 60% + 40,000 * 80%) / 100,000 = (36,000 + 32,000) / 100,000 = 68.00%
    const stock = result.classAllocation.STOCK;
    expect(stock.marketValue).toBe('68000.00');
    expect(stock.currentPercentage).toBe('68.00');
    expect(stock.weightedTargetPercentage).toBe('68.00');
    expect(stock.differencePercentage).toBe('0.00');
  });

  it('should gracefully handle empty portfolios or portfolios with zero assets without errors', () => {
    const emptyPortfolio: PortfolioConsolidationInput = {
      id: 'p-empty',
      name: 'Carteira Nova Vazia',
      docketCode: 'REV-NEW',
      assets: [],
    };

    const result = consolidatePortfolios([emptyPortfolio]);

    expect(result.totalInvestedCapital).toBe('0.00');
    expect(result.totalMarketValue).toBe('0.00');
    expect(result.totalProfit).toBe('0.00');
    expect(result.totalProfitPercentage).toBe('0.00');
    expect(result.activePortfolioCount).toBe(1);
    expect(result.portfolioBreakdown[0].marketValue).toBe('0.00');
    expect(result.portfolioBreakdown[0].shareOfTotal).toBe('0.00%');
  });
});
