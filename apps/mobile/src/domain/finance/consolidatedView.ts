import Decimal from 'decimal.js';
import { AssetClass } from './types';

export interface PortfolioAssetInput {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  quantity: string | number;
  averagePrice: string | number;
  currentPrice?: string | number | null;
  manualPriceOverride?: string | number | null;
}

export interface PortfolioClassTargetInput {
  assetClass: AssetClass;
  targetPercentage: number;
}

export interface PortfolioConsolidationInput {
  id: string;
  name: string;
  docketCode: string;
  isArchived?: boolean | number;
  assets: PortfolioAssetInput[];
  classTargets?: PortfolioClassTargetInput[];
}

export interface PortfolioBreakdownItem {
  portfolioId: string;
  name: string;
  docketCode: string;
  investedCapital: string;
  marketValue: string;
  profit: string;
  profitPercentage: string;
  shareOfTotal: string; // e.g. "51.33%"
}

export interface ClassAllocationSummary {
  assetClass: AssetClass;
  investedCapital: string;
  marketValue: string;
  currentPercentage: string; // e.g. "32.00"
  weightedTargetPercentage: string; // e.g. "30.00"
  differencePercentage: string; // currentPercentage - weightedTargetPercentage
}

export interface ConsolidatedHolding {
  ticker: string;
  assetClass: AssetClass;
  totalQuantity: string;
  totalInvestedCapital: string;
  consolidatedAveragePrice: string;
  currentPrice: string;
  totalMarketValue: string;
  profit: string;
  profitPercentage: string;
  shareOfTotal: string;
  portfolioIds: string[];
}

export interface ConsolidatedDossierResult {
  totalInvestedCapital: string;
  totalMarketValue: string;
  totalProfit: string;
  totalProfitPercentage: string;
  activePortfolioCount: number;
  archivedPortfolioCount: number;
  portfolioBreakdown: PortfolioBreakdownItem[];
  classAllocation: Record<AssetClass, ClassAllocationSummary>;
  aggregatedHoldings: ConsolidatedHolding[];
}

export interface ConsolidatePortfoliosOptions {
  includeArchived?: boolean;
  marketQuotes?: Record<string, string | number>;
}

const ALL_ASSET_CLASSES: AssetClass[] = ['FIXED_INCOME', 'FII', 'STOCK', 'CRYPTO'];

/**
 * S5-T02: Consolidação precisa de múltiplas carteiras independentes no Dossiê Geral (Home).
 */
export function consolidatePortfolios(
  portfolios: PortfolioConsolidationInput[],
  options?: ConsolidatePortfoliosOptions
): ConsolidatedDossierResult {
  const includeArchived = options?.includeArchived ?? false;
  const marketQuotes = options?.marketQuotes;

  let archivedCount = 0;
  const activePortfolios: PortfolioConsolidationInput[] = [];

  for (const p of portfolios) {
    const isArchived = p.isArchived === 1 || p.isArchived === true;
    if (isArchived) {
      archivedCount++;
      if (includeArchived) {
        activePortfolios.push(p);
      }
    } else {
      activePortfolios.push(p);
    }
  }

  let grandInvested = new Decimal(0);
  let grandMarketValue = new Decimal(0);

  interface ComputedPortfolioData {
    portfolio: PortfolioConsolidationInput;
    invested: Decimal;
    marketValue: Decimal;
    profit: Decimal;
    profitPct: Decimal;
  }

  const computedPortfolios: ComputedPortfolioData[] = [];

  // Intermediate holding aggregation
  interface IntermediateHolding {
    ticker: string;
    assetClass: AssetClass;
    totalQty: Decimal;
    totalInvested: Decimal;
    price: Decimal;
    portfolioIds: Set<string>;
  }
  const holdingsMap = new Map<string, IntermediateHolding>();

  // Intermediate class allocation aggregation
  const classInvestedMap: Record<AssetClass, Decimal> = {
    FIXED_INCOME: new Decimal(0),
    FII: new Decimal(0),
    STOCK: new Decimal(0),
    CRYPTO: new Decimal(0),
  };
  const classMarketValueMap: Record<AssetClass, Decimal> = {
    FIXED_INCOME: new Decimal(0),
    FII: new Decimal(0),
    STOCK: new Decimal(0),
    CRYPTO: new Decimal(0),
  };
  const classWeightedTargetSum: Record<AssetClass, Decimal> = {
    FIXED_INCOME: new Decimal(0),
    FII: new Decimal(0),
    STOCK: new Decimal(0),
    CRYPTO: new Decimal(0),
  };

  for (const p of activePortfolios) {
    let pInvested = new Decimal(0);
    let pMarketValue = new Decimal(0);

    for (const asset of p.assets) {
      const qty = new Decimal(asset.quantity || 0);
      const avgPrice = new Decimal(asset.averagePrice || 0);
      const invested = qty.mul(avgPrice);

      let price = avgPrice;
      if (
        asset.manualPriceOverride !== null &&
        asset.manualPriceOverride !== undefined &&
        asset.manualPriceOverride !== ''
      ) {
        price = new Decimal(asset.manualPriceOverride);
      } else if (marketQuotes && marketQuotes[asset.ticker] !== undefined) {
        price = new Decimal(marketQuotes[asset.ticker]);
      } else if (
        asset.currentPrice !== null &&
        asset.currentPrice !== undefined &&
        asset.currentPrice !== ''
      ) {
        price = new Decimal(asset.currentPrice);
      }

      const mv = qty.mul(price);

      pInvested = pInvested.plus(invested);
      pMarketValue = pMarketValue.plus(mv);

      // Track class totals
      if (classInvestedMap[asset.assetClass]) {
        classInvestedMap[asset.assetClass] = classInvestedMap[asset.assetClass].plus(invested);
        classMarketValueMap[asset.assetClass] = classMarketValueMap[asset.assetClass].plus(mv);
      }

      // Track aggregated holdings by ticker
      const upperTicker = asset.ticker.toUpperCase();
      let holding = holdingsMap.get(upperTicker);
      if (!holding) {
        holding = {
          ticker: upperTicker,
          assetClass: asset.assetClass,
          totalQty: new Decimal(0),
          totalInvested: new Decimal(0),
          price,
          portfolioIds: new Set<string>(),
        };
        holdingsMap.set(upperTicker, holding);
      }
      holding.totalQty = holding.totalQty.plus(qty);
      holding.totalInvested = holding.totalInvested.plus(invested);
      holding.price = price;
      holding.portfolioIds.add(p.id);
    }

    const pProfit = pMarketValue.minus(pInvested);
    const pProfitPct = pInvested.gt(0)
      ? pProfit.div(pInvested).mul(100)
      : new Decimal(0);

    computedPortfolios.push({
      portfolio: p,
      invested: pInvested,
      marketValue: pMarketValue,
      profit: pProfit,
      profitPct: pProfitPct,
    });

    grandInvested = grandInvested.plus(pInvested);
    grandMarketValue = grandMarketValue.plus(pMarketValue);

    // Track targets weighted by portfolio market value
    if (p.classTargets && p.classTargets.length > 0) {
      for (const ct of p.classTargets) {
        const targetPercent = new Decimal(ct.targetPercentage || 0);
        const targetValue = pMarketValue.mul(targetPercent).div(100);
        if (classWeightedTargetSum[ct.assetClass]) {
          classWeightedTargetSum[ct.assetClass] = classWeightedTargetSum[ct.assetClass].plus(targetValue);
        }
      }
    }
  }

  const grandProfit = grandMarketValue.minus(grandInvested);
  const grandProfitPct = grandInvested.gt(0)
    ? grandProfit.div(grandInvested).mul(100)
    : new Decimal(0);

  // Portfolio breakdown
  const breakdown: PortfolioBreakdownItem[] = computedPortfolios.map((cp) => {
    const share = grandMarketValue.gt(0)
      ? cp.marketValue.div(grandMarketValue).mul(100).toFixed(2) + '%'
      : '0.00%';

    return {
      portfolioId: cp.portfolio.id,
      name: cp.portfolio.name,
      docketCode: cp.portfolio.docketCode,
      investedCapital: cp.invested.toFixed(2),
      marketValue: cp.marketValue.toFixed(2),
      profit: cp.profit.toFixed(2),
      profitPercentage: cp.profitPct.toFixed(2),
      shareOfTotal: share,
    };
  });

  // Aggregated holdings
  const aggregatedHoldings: ConsolidatedHolding[] = Array.from(holdingsMap.values()).map(
    (h) => {
      const consolidatedAvg = h.totalQty.gt(0)
        ? h.totalInvested.div(h.totalQty)
        : new Decimal(0);
      const totalMv = h.totalQty.mul(h.price);
      const profit = totalMv.minus(h.totalInvested);
      const profitPct = h.totalInvested.gt(0)
        ? profit.div(h.totalInvested).mul(100)
        : new Decimal(0);
      const share = grandMarketValue.gt(0)
        ? totalMv.div(grandMarketValue).mul(100).toFixed(2) + '%'
        : '0.00%';

      let qtyStr = h.totalQty.toString();
      if (h.totalQty.isInteger()) {
        qtyStr = h.totalQty.toFixed(0);
      } else if (h.totalQty.decimalPlaces() <= 4) {
        qtyStr = h.totalQty.toFixed(2);
      }

      return {
        ticker: h.ticker,
        assetClass: h.assetClass,
        totalQuantity: qtyStr,
        totalInvestedCapital: h.totalInvested.toFixed(2),
        consolidatedAveragePrice: consolidatedAvg.toFixed(2),
        currentPrice: h.price.toFixed(2),
        totalMarketValue: totalMv.toFixed(2),
        profit: profit.toFixed(2),
        profitPercentage: profitPct.toFixed(2),
        shareOfTotal: share,
        portfolioIds: Array.from(h.portfolioIds),
      };
    }
  );

  // Class allocation summary
  const classAllocation = {} as Record<AssetClass, ClassAllocationSummary>;
  for (const ac of ALL_ASSET_CLASSES) {
    const cInvested = classInvestedMap[ac];
    const cMv = classMarketValueMap[ac];
    const curPct = grandMarketValue.gt(0)
      ? cMv.div(grandMarketValue).mul(100)
      : new Decimal(0);
    const weightedTargetPct = grandMarketValue.gt(0)
      ? classWeightedTargetSum[ac].div(grandMarketValue).mul(100)
      : new Decimal(0);
    const diffPct = curPct.minus(weightedTargetPct);

    classAllocation[ac] = {
      assetClass: ac,
      investedCapital: cInvested.toFixed(2),
      marketValue: cMv.toFixed(2),
      currentPercentage: curPct.toFixed(2),
      weightedTargetPercentage: weightedTargetPct.toFixed(2),
      differencePercentage: diffPct.toFixed(2),
    };
  }

  return {
    totalInvestedCapital: grandInvested.toFixed(2),
    totalMarketValue: grandMarketValue.toFixed(2),
    totalProfit: grandProfit.toFixed(2),
    totalProfitPercentage: grandProfitPct.toFixed(2),
    activePortfolioCount: activePortfolios.length,
    archivedPortfolioCount: archivedCount,
    portfolioBreakdown: breakdown,
    classAllocation,
    aggregatedHoldings,
  };
}
