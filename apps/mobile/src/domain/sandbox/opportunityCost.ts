import type { MacroSeriesPoint } from './backtest';

export interface FutureValueResult {
  totalCents: number;
  contributedCents: number;
  interestCents: number;
}

export type MacroCdiInput =
  | MacroSeriesPoint[]
  | Array<{ date: string; cdi?: number; ratePct?: number }>
  | null
  | undefined;

export function futureValueOfSeries(
  _monthlyCents: number,
  _annualRate: number,
  _years: number
): FutureValueResult {
  throw new Error('Not implemented (Phase A stub)');
}

export function futureValueOfLumpSum(
  _principalCents: number,
  _annualRate: number,
  _years: number
): FutureValueResult {
  throw new Error('Not implemented (Phase A stub)');
}

export function annualizeCdi12m(_macro: MacroCdiInput): number | null {
  throw new Error('Not implemented (Phase A stub)');
}
