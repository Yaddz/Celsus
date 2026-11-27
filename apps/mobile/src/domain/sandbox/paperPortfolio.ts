import type { PriceSeriesPoint } from './priceAt';
import type { MacroSeriesPoint } from './backtest';

export type PaperRebalanceMode = 'never' | 3 | 6 | 12 | 'on_contribution';

export interface PaperPortfolioItemInput {
  ticker: string;
  class: string;
  weight: number;
}

export interface PaperDividendEvent {
  date: string;
  amountPerUnit: number;
}

export interface PaperSimulateInput {
  items: PaperPortfolioItemInput[];
  start: string;
  end?: string;
  initialCents: number;
  monthlyCents: number;
  rebalance: PaperRebalanceMode;
  series: Record<string, PriceSeriesPoint[]>;
  dividends?: Record<string, PaperDividendEvent[]>;
  macro?: {
    cdi?: MacroSeriesPoint[];
  };
  taxEnabled?: boolean;
}

export interface PaperCurvePoint {
  date: string;
  valueBRL: number;
  investedBRL: number;
}

export interface PaperAssetResult {
  ticker: string;
  assetClass: string;
  weight: number;
  finalValueBRL: number;
  returnPct: number;
  dividendsBRL: number;
  effectiveStartDate: string | null;
}

export interface PaperLateStartNotice {
  ticker: string;
  requestedStart: string;
  effectiveStart: string;
}

export interface PaperSimulateResult {
  dailyCurve: PaperCurvePoint[];
  cdiCurve: Array<{ date: string; valueBRL: number }>;
  finalValueBRL: number;
  investedBRL: number;
  returnPct: number;
  maxDrawdownPct: number;
  dividendsBRL: number;
  byAsset: PaperAssetResult[];
  lateStartAssets: PaperLateStartNotice[];
}

export function simulate(_input: PaperSimulateInput): PaperSimulateResult {
  throw new Error('Not implemented');
}
