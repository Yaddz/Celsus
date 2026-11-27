import type { MacroSeriesPoint } from './backtest';
import type { PriceSeriesPoint } from './priceAt';

export const MAX_COMPARE_ASSETS = 4;

export interface CompareAssetInput {
  ticker: string;
  label?: string;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[] | null;
}

export interface CompareInput {
  startDate: string;
  endDate: string;
  assets: CompareAssetInput[];
  cdi?: MacroSeriesPoint[];
  ipca?: MacroSeriesPoint[];
}

export interface CompareNormalizedPoint {
  date: string;
  value: number;
}

export interface CompareSeriesItem {
  id: string;
  label: string;
  kind: 'asset' | 'cdi' | 'ipca';
  status: 'ok' | 'missing_data';
  series: CompareNormalizedPoint[];
  finalValue: number | null;
  totalReturnPct: number | null;
}

export interface CompareResult {
  startDate: string;
  endDate: string;
  truncatedAssets: boolean;
  items: CompareSeriesItem[];
}

export function buildComparisonSeries(_input: CompareInput): CompareResult {
  throw new Error('Not implemented (Phase A stub)');
}
