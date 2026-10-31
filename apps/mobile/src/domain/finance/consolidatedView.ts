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

/**
 * S5-T02: Consolidação precisa de múltiplas carteiras independentes no Dossiê Geral (Home).
 *
 * (Assinatura / Stub para Fase A - TDD Red Phase)
 */
export function consolidatePortfolios(
  _portfolios: PortfolioConsolidationInput[],
  _options?: ConsolidatePortfoliosOptions
): ConsolidatedDossierResult {
  return {
    totalInvestedCapital: '0.00',
    totalMarketValue: '0.00',
    totalProfit: '0.00',
    totalProfitPercentage: '0.00',
    activePortfolioCount: 0,
    archivedPortfolioCount: 0,
    portfolioBreakdown: [],
    classAllocation: {
      FIXED_INCOME: {
        assetClass: 'FIXED_INCOME',
        investedCapital: '0.00',
        marketValue: '0.00',
        currentPercentage: '0.00',
        weightedTargetPercentage: '0.00',
        differencePercentage: '0.00',
      },
      FII: {
        assetClass: 'FII',
        investedCapital: '0.00',
        marketValue: '0.00',
        currentPercentage: '0.00',
        weightedTargetPercentage: '0.00',
        differencePercentage: '0.00',
      },
      STOCK: {
        assetClass: 'STOCK',
        investedCapital: '0.00',
        marketValue: '0.00',
        currentPercentage: '0.00',
        weightedTargetPercentage: '0.00',
        differencePercentage: '0.00',
      },
      CRYPTO: {
        assetClass: 'CRYPTO',
        investedCapital: '0.00',
        marketValue: '0.00',
        currentPercentage: '0.00',
        weightedTargetPercentage: '0.00',
        differencePercentage: '0.00',
      },
    },
    aggregatedHoldings: [],
  };
}
