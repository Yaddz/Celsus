import type { PriceSeriesPoint } from './priceAt';
import type { SandboxTaxAssetClass, TaxEstimateResult } from './taxRules';

export interface SandboxDividendPoint {
  date: string;
  amountPerUnit: number;
  currency?: string;
}

export interface SandboxLegInput {
  id?: string;
  ticker: string;
  assetClass: SandboxTaxAssetClass;
  investedBRL?: number;
  quantity?: number;
  buyDate: string;
  sellDate: string;
  feesBRL?: number;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[];
  dividends?: SandboxDividendPoint[];
  fxAccountType?: 'cash' | 'non_remunerated_account';
}

export interface MacroSeriesPoint {
  date: string;
  ratePct: number;
}

export interface SandboxScenarioInput {
  legs: SandboxLegInput[];
  macro?: {
    cdi?: MacroSeriesPoint[];
    ipca?: MacroSeriesPoint[];
    poupanca?: MacroSeriesPoint[];
  };
  options: {
    reinvestDividends: boolean;
    taxEnabled: boolean;
  };
}

export interface MonthlySeriesPoint {
  month: string;
  valueBRL: number;
}

export interface SandboxLegResult {
  id?: string;
  ticker: string;
  assetClass: SandboxTaxAssetClass;
  status: 'ok' | 'missing_data';
  missingReason?: string;
  investedBRL: number;
  quantity: number | null;
  buyPriceBRL: number | null;
  sellPriceBRL: number | null;
  buyEffectiveDate: string | null;
  sellEffectiveDate: string | null;
  finalValueBRL: number | null;
  gainBRL: number | null;
  gainPct: number | null;
  gainUSD: number | null;
  gainPctUSD: number | null;
  dividendsGrossBRL: number;
  dividendsWithheldBRL: number;
  dividendsNetBRL: number;
  taxEstimate: TaxEstimateResult | null;
  estimatedTaxBRL: number | null;
  netFinalValueBRL: number | null;
  netGainBRL: number | null;
  netGainPct: number | null;
  monthlySeries: MonthlySeriesPoint[];
}

export interface BenchmarkResult {
  id: 'cdi' | 'ipca' | 'poupanca';
  label: string;
  status: 'ok' | 'missing_data';
  investedBRL: number;
  finalValueBRL: number | null;
  gainBRL: number | null;
  gainPct: number | null;
  estimatedTaxBRL: number | null;
  netFinalValueBRL: number | null;
  netGainBRL: number | null;
  netGainPct: number | null;
  taxLabel: string;
}

export interface SandboxScenarioResult {
  status: 'ok' | 'missing_data';
  legs: SandboxLegResult[];
  total: {
    investedBRL: number;
    finalValueBRL: number | null;
    gainBRL: number | null;
    gainPct: number | null;
    dividendsGrossBRL: number;
    dividendsWithheldBRL: number;
    dividendsNetBRL: number;
    estimatedTaxBRL: number | null;
    netFinalValueBRL: number | null;
    netGainBRL: number | null;
    netGainPct: number | null;
    taxLabel: string;
    monthlySeries: MonthlySeriesPoint[];
  };
  benchmarks: {
    cdi: BenchmarkResult;
    ipca: BenchmarkResult;
    poupanca: BenchmarkResult;
  };
}

export function runScenario(_input: SandboxScenarioInput): SandboxScenarioResult {
  throw new Error('Not implemented');
}
