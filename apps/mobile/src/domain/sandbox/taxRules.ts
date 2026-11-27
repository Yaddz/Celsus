export type SandboxTaxAssetClass =
  | 'STOCK'
  | 'FII'
  | 'ETF'
  | 'US_STOCK'
  | 'CRYPTO'
  | 'FX'
  | 'FIXED_INCOME'
  | 'POUPANCA'
  | 'FUNDS';

export interface TaxRuleSpec {
  rate: number;
  monthlySalesExemptionBRL: number | null;
  annualSalesExemptionUSD?: number | null;
  dividendWithholdingRate: number;
  description: string;
}

export interface TaxRulesVersion {
  validFrom: string;
  source: string;
  verifiedAt: string;
  rules: Record<SandboxTaxAssetClass, TaxRuleSpec>;
}

export interface TaxLegContext {
  assetClass: SandboxTaxAssetClass;
  gainBRL: number;
  saleAmountBRL: number;
  saleDate?: string;
  holdingDays?: number;
  fxAccountType?: 'cash' | 'non_remunerated_account';
  saleAmountUSD?: number;
}

export interface MonthlySalesContext {
  totalStockSalesInMonthBRL?: number;
  totalCryptoSalesInMonthBRL?: number;
  totalFxSalesInYearUSD?: number;
  taxEnabled?: boolean;
}

export interface TaxEstimateResult {
  taxBRL: number;
  effectiveRate: number;
  isExempt: boolean;
  reason: string;
  label: string;
  validFrom: string;
}

export const TAX_RULES_VERSIONS: TaxRulesVersion[] = [];

export function getTaxRulesVersion(_asOfDate?: string): TaxRulesVersion {
  throw new Error('Not implemented');
}

export function regressiveFixedIncomeRate(_holdingDays: number): number {
  throw new Error('Not implemented');
}

export function estimateTax(
  _leg: TaxLegContext,
  _monthlySalesContext?: MonthlySalesContext
): TaxEstimateResult {
  throw new Error('Not implemented');
}
