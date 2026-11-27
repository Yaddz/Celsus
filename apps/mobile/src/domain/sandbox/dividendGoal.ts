import type { Dividend } from '../finance/assetProfile';

export interface TrailingYieldResult {
  yield: number | null;
  total12m: number;
  shortHistory: boolean;
  count12m: number;
}

export interface DividendGoalCandidate {
  ticker: string;
  assetClass: string;
  yield: number;
  price?: number;
  targetWeight?: number;
  shortHistory?: boolean;
}

export interface SuggestPositionsInput {
  mode: 'follow_targets' | 'free';
  candidates: DividendGoalCandidate[];
  maxPerAsset?: number;
  minAssets?: number;
  gapCents: number;
  prices?: Record<string, number>;
}

export interface SuggestedPositionItem {
  ticker: string;
  assetClass: string;
  quantity: number;
  priceCents: number;
  investedCents: number;
  weight: number;
  yield: number;
  estimatedAnnualDividendCents: number;
}

export interface SuggestPositionsResult {
  items: SuggestedPositionItem[];
  totalInvestedCents: number;
  changeCents: number;
  weightedYield: number;
  insufficientAssets: boolean;
}

export interface IncomeCalendarMonth {
  month: number; // 1..12
  label: string;
  amountBRL: number;
  amountCents: number;
}

export interface SnowballInput {
  startCents: number;
  monthlyCents: number;
  yield: number; // annual decimal e.g. 0.12
  monthlyGoalCents: number;
  maxMonths?: number;
}

export interface SnowballPoint {
  month: number;
  capitalCents: number;
  monthlyIncomeCents: number;
}

export interface SnowballResult {
  monthsToGoal: number | null;
  reached: boolean;
  finalCapitalCents: number;
  finalMonthlyIncomeCents: number;
  timeline: SnowballPoint[];
}

export interface IncomeEventLike {
  pay_date?: string;
  payDate?: string;
  amount: string | number;
}

export function trailingYield(
  _dividends: Dividend[],
  _price: number,
  _refDate: string
): TrailingYieldResult {
  throw new Error('Not implemented');
}

export function requiredCapital(
  _monthlyGoal: number,
  _weightedYield: number
): number | null {
  throw new Error('Not implemented');
}

export function currentMonthlyIncome(
  _incomeEvents: IncomeEventLike[],
  _refDate: string
): number {
  throw new Error('Not implemented');
}

export function suggestPositions(
  _input: SuggestPositionsInput
): SuggestPositionsResult {
  throw new Error('Not implemented');
}

export function incomeCalendar(
  _dividendsByTicker: Record<string, Dividend[]>,
  _quantities: Record<string, number>,
  _refDate?: string
): IncomeCalendarMonth[] {
  throw new Error('Not implemented');
}

export function snowball(_input: SnowballInput): SnowballResult {
  throw new Error('Not implemented');
}
