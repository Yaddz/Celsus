import type { PriceSeriesPoint } from './priceAt';

export interface StressTestPositionInput {
  ticker: string;
  weight: number;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[] | null;
}

export interface StressTestInput {
  todayPortfolioValueBRL: number;
  startDate: string;
  endDate: string;
  recoveryEndDate?: string;
  positions: StressTestPositionInput[];
}

export interface StressTestAssetResult {
  ticker: string;
  weight: number;
  normalizedWeight: number;
  status: 'ok' | 'missing_data';
  statusLabel: string;
  drawdownPct: number | null;
}

export interface StressTestCurvePoint {
  date: string;
  normalizedValue: number;
  drawdownPct: number;
  projectedValueBRL: number;
}

export interface StressTestResult {
  status: 'ok' | 'missing_data';
  startDate: string;
  endDate: string;
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
  troughValueBRL: number | null;
  recovered: boolean;
  recoveryDate: string | null;
  recoveryDays: number | null;
  warnings: string[];
  assets: StressTestAssetResult[];
  curve: StressTestCurvePoint[];
}

export interface WorstDrawdownWindow {
  startDate: string;
  endDate: string;
  peakPrice: number;
  troughPrice: number;
  drawdownPct: number;
}

export function findWorstDrawdownWindow(
  _indexSeries: PriceSeriesPoint[],
  _years: number,
  _referenceDate?: string
): WorstDrawdownWindow | null {
  throw new Error('Not implemented (Phase A stub)');
}

export function runStressTest(_input: StressTestInput): StressTestResult {
  throw new Error('Not implemented (Phase A stub)');
}
