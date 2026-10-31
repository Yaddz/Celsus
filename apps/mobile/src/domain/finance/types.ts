export type AssetClass = 'FIXED_INCOME' | 'FII' | 'STOCK' | 'CRYPTO';

export interface ClassTarget {
  assetClass: AssetClass;
  targetPercentage: number;
}

export interface AssetTarget {
  id?: string;
  ticker: string;
  assetClass: AssetClass;
  targetPercentageInClass: number;
}

export interface GlobalTargetResult {
  ticker: string;
  assetClass: AssetClass;
  globalTargetPercentage: number;
}

export interface ValidationResult {
  isValid: boolean;
  sum: number;
  error?: string;
}

export interface BuyOperationParams {
  currentQuantity: string | number;
  currentAveragePrice: string | number;
  buyQuantity: string | number;
  buyPrice: string | number;
  fees?: string | number;
}

export interface BuyOperationResult {
  quantity: string;
  averagePrice: string;
  totalCost: string;
}

export interface SellOperationParams {
  currentQuantity: string | number;
  currentAveragePrice: string | number;
  sellQuantity: string | number;
  sellPrice: string | number;
  fees?: string | number;
}

export interface SellOperationResult {
  quantity: string;
  averagePrice: string;
  realizedPnl: string;
}

export interface PositionTransaction {
  type: 'BUY' | 'SELL';
  quantity: string | number;
  unitPrice: string | number;
  fees?: string | number;
  tradeDate?: string;
}

export interface PositionResult {
  quantity: string;
  averagePrice: string;
  totalInvested: string;
  realizedPnl: string;
}

export interface FixedIncomeParams {
  principal: string | number;
  indexer?: 'CDI' | 'PRE' | 'IPCA' | null;
  rate: number;
  businessDays?: number;
  dailyCDIRates?: number[];
  accumulatedIPCAVariation?: number;
  manualPriceOverride?: string | number | null;
}

export interface FixedIncomeResult {
  factor: string;
  currentValue: string;
  isOverridden: boolean;
}

export interface RebalanceAssetInput {
  ticker: string;
  assetClass: AssetClass;
  currentQuantity: string | number;
  currentPrice: string | number;
  currentValue?: string | number;
  globalTargetPercentage: number;
}

export interface RebalanceAssetSuggestion {
  ticker: string;
  assetClass: AssetClass;
  currentQuantity: string;
  currentPrice: string;
  currentValue: string;
  currentWeightPercent: string;
  targetWeightPercent: string;
  targetValue: string;
  deficit: string;
  suggestedAmount: string;
  suggestedQuantity: string;
  allocatedAmount: string;
}

export interface RebalanceResult {
  portfolioCurrentValue: string;
  contributionAmount: string;
  projectedTotalValue: string;
  suggestions: RebalanceAssetSuggestion[];
  totalAllocated: string;
  remainingCash: string;
}
