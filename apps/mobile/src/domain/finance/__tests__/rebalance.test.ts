import { calculateSmartContribution } from '../rebalance';
import { RebalanceAssetInput } from '../types';

describe('S3-T07: TestSmartContributionCalculator_NoSells', () => {
  it('should allocate 100% of contribution to underweight assets and NEVER suggest selling overweight assets', () => {
    // Portfolio with 2 assets:
    // Asset A: Target 40%, Current R$ 6,000.00 (Overweight: 60% of current R$ 10,000)
    // Asset B: Target 60%, Current R$ 4,000.00 (Underweight: 40% of current R$ 10,000)
    // Contribution: R$ 2,000.00
    // Projected Total: R$ 12,000.00
    // Target A: 12000 * 40% = 4,800.00 -> Deficit: max(0, 4800 - 6000) = 0 (NO SELL)
    // Target B: 12000 * 60% = 7,200.00 -> Deficit: max(0, 7200 - 4000) = 3,200.00
    // Suggested A: 0.00
    // Suggested B: 2,000.00
    const assets: RebalanceAssetInput[] = [
      {
        ticker: 'ASSET_A',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '6000',
        currentPrice: '1.00',
        globalTargetPercentage: 40,
      },
      {
        ticker: 'ASSET_B',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '4000',
        currentPrice: '1.00',
        globalTargetPercentage: 60,
      },
    ];

    const result = calculateSmartContribution('2000.00', assets);

    expect(result.portfolioCurrentValue).toBe('10000.00');
    expect(result.contributionAmount).toBe('2000.00');
    expect(result.projectedTotalValue).toBe('12000.00');

    const sugA = result.suggestions.find((s) => s.ticker === 'ASSET_A')!;
    const sugB = result.suggestions.find((s) => s.ticker === 'ASSET_B')!;

    expect(sugA.targetValue).toBe('4800.00');
    expect(sugA.deficit).toBe('0.00');
    expect(sugA.suggestedAmount).toBe('0.00');
    expect(Number(sugA.suggestedQuantity)).toBe(0);

    expect(sugB.targetValue).toBe('7200.00');
    expect(sugB.deficit).toBe('3200.00');
    expect(sugB.suggestedAmount).toBe('2000.00');
  });

  it('should proportionally distribute contribution across multiple underweight assets', () => {
    // 3 assets:
    // Asset 1 (Target 50%): Current 3000
    // Asset 2 (Target 30%): Current 3000
    // Asset 3 (Target 20%): Current 4000 (Overweight: 40% of current)
    // Contribution: 5000
    // Projected Total: 15000
    // Target 1: 15000 * 0.50 = 7500 -> Deficit: 7500 - 3000 = 4500
    // Target 2: 15000 * 0.30 = 4500 -> Deficit: 4500 - 3000 = 1500
    // Target 3: 15000 * 0.20 = 3000 -> Deficit: max(0, 3000 - 4000) = 0
    // Total Deficit: 4500 + 1500 = 6000
    // Delta A1: 5000 * (4500 / 6000) = 3750.00
    // Delta A2: 5000 * (1500 / 6000) = 1250.00
    // Delta A3: 0.00
    const assets: RebalanceAssetInput[] = [
      {
        ticker: 'ASSET_1',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '3000',
        currentPrice: '1.00',
        globalTargetPercentage: 50,
      },
      {
        ticker: 'ASSET_2',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '3000',
        currentPrice: '1.00',
        globalTargetPercentage: 30,
      },
      {
        ticker: 'ASSET_3',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '4000',
        currentPrice: '1.00',
        globalTargetPercentage: 20,
      },
    ];

    const result = calculateSmartContribution('5000.00', assets);

    const s1 = result.suggestions.find((s) => s.ticker === 'ASSET_1')!;
    const s2 = result.suggestions.find((s) => s.ticker === 'ASSET_2')!;
    const s3 = result.suggestions.find((s) => s.ticker === 'ASSET_3')!;

    expect(s1.deficit).toBe('4500.00');
    expect(s1.suggestedAmount).toBe('3750.00');

    expect(s2.deficit).toBe('1500.00');
    expect(s2.suggestedAmount).toBe('1250.00');

    expect(s3.deficit).toBe('0.00');
    expect(s3.suggestedAmount).toBe('0.00');
  });
});

describe('S3-T08: TestSmartContributionIntegerSharesAndCryptoFractions', () => {
  it('should round stock and FII allocations down to integer shares and report cash remainder', () => {
    // PETR4 (STOCK): Price R$ 38.50. Suggested delta: R$ 1,000.00
    // Integer shares: floor(1000 / 38.50) = floor(25.9740) = 25 shares
    // Allocated: 25 * 38.50 = 962.50. Remainder: 37.50.
    const assets: RebalanceAssetInput[] = [
      {
        ticker: 'PETR4',
        assetClass: 'STOCK',
        currentQuantity: '0',
        currentPrice: '38.50',
        globalTargetPercentage: 100,
      },
    ];

    const result = calculateSmartContribution('1000.00', assets);
    const petr4 = result.suggestions.find((s) => s.ticker === 'PETR4')!;

    expect(petr4.suggestedAmount).toBe('1000.00');
    expect(petr4.suggestedQuantity).toBe('25'); // Exact integer shares!
    expect(petr4.allocatedAmount).toBe('962.50');
    expect(result.totalAllocated).toBe('962.50');
    expect(result.remainingCash).toBe('37.50');
  });

  it('should allocate exact fractional crypto with 8 decimal places precision', () => {
    // BTC (CRYPTO): Price R$ 360,000.00. Suggested delta: R$ 750.00
    // Crypto fraction: 750 / 360000 = 0.00208333 BTC (up to 8 decimal places)
    const assets: RebalanceAssetInput[] = [
      {
        ticker: 'BTC',
        assetClass: 'CRYPTO',
        currentQuantity: '0',
        currentPrice: '360000.00',
        globalTargetPercentage: 100,
      },
    ];

    const result = calculateSmartContribution('750.00', assets);
    const btc = result.suggestions.find((s) => s.ticker === 'BTC')!;

    expect(btc.suggestedAmount).toBe('750.00');
    expect(btc.suggestedQuantity).toBe('0.00208333');
    expect(btc.allocatedAmount).toBe('750.00');
    expect(result.remainingCash).toBe('0.00');
  });

  it('should handle multi-class portfolio ensuring integer shares for stocks/FIIs, 8 decimals for crypto and monetary for fixed income', () => {
    // Portfolio with 4 assets across 4 real categories:
    // 1. STOCK: VALE3 @ R$ 60.00 (Target 30%) - Current: 0
    // 2. FII: HGLG11 @ R$ 160.00 (Target 20%) - Current: 0
    // 3. CRYPTO: ETH @ R$ 15,000.00 (Target 10%) - Current: 0
    // 4. FIXED_INCOME: CDB_DI @ R$ 1.00 (Target 40%) - Current: 0
    // Contribution: R$ 10,000.00
    // Targets / Deficits:
    // VALE3 (30%): 3,000.00 -> floor(3000 / 60) = 50 shares -> Allocated: 3000.00
    // HGLG11 (20%): 2,000.00 -> floor(2000 / 160) = 12 shares -> Allocated: 1920.00 (Remainder: 80.00)
    // ETH (10%): 1,000.00 -> 1000 / 15000 = 0.06666667 ETH -> Allocated: 1000.00
    // CDB_DI (40%): 4,000.00 -> Allocated: 4000.00
    // Total Allocated: 3000 + 1920 + 1000 + 4000 = 9920.00
    // Remaining Cash: 80.00
    const assets: RebalanceAssetInput[] = [
      {
        ticker: 'VALE3',
        assetClass: 'STOCK',
        currentQuantity: '0',
        currentPrice: '60.00',
        globalTargetPercentage: 30,
      },
      {
        ticker: 'HGLG11',
        assetClass: 'FII',
        currentQuantity: '0',
        currentPrice: '160.00',
        globalTargetPercentage: 20,
      },
      {
        ticker: 'ETH',
        assetClass: 'CRYPTO',
        currentQuantity: '0',
        currentPrice: '15000.00',
        globalTargetPercentage: 10,
      },
      {
        ticker: 'CDB_DI',
        assetClass: 'FIXED_INCOME',
        currentQuantity: '0',
        currentPrice: '1.00',
        globalTargetPercentage: 40,
      },
    ];

    const result = calculateSmartContribution('10000.00', assets);

    const vale3 = result.suggestions.find((s) => s.ticker === 'VALE3')!;
    const hglg11 = result.suggestions.find((s) => s.ticker === 'HGLG11')!;
    const eth = result.suggestions.find((s) => s.ticker === 'ETH')!;
    const cdb = result.suggestions.find((s) => s.ticker === 'CDB_DI')!;

    expect(vale3.suggestedQuantity).toBe('50');
    expect(vale3.allocatedAmount).toBe('3000.00');

    expect(hglg11.suggestedQuantity).toBe('12');
    expect(hglg11.allocatedAmount).toBe('1920.00');

    expect(eth.suggestedQuantity).toBe('0.06666667');
    expect(eth.allocatedAmount).toBe('1000.00');

    expect(cdb.suggestedQuantity).toBe('4000.00');
    expect(cdb.allocatedAmount).toBe('4000.00');

    expect(result.totalAllocated).toBe('9920.00');
    expect(result.remainingCash).toBe('80.00');
  });
});
