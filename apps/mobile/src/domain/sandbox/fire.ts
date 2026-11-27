import type { MonthSummaryR43 } from '../financeFlow/monthSummary';

export interface FireProjectionInput {
  investedCents: number;
  monthlyCents: number;
  realReturn: number;
  target: number;
  maxYears?: number;
  startYearMonth?: string;
}

export interface FireProjectionPoint {
  monthIndex: number;
  yearMonth: string;
  balanceCents: number;
}

export interface FireProjectionResult {
  series: FireProjectionPoint[];
  arrivalMonths: number | null;
  arrivalDate: string | null;
  reached: boolean;
}

export function averageMonthlyExpense(
  _monthSummaries: Array<Pick<MonthSummaryR43, 'yearMonth' | 'expenseCents'>>,
  _n = 12
): number | null {
  throw new Error('Not implemented (Phase A stub)');
}

export function averageMonthlyContribution(
  _monthSummaries: Array<Pick<MonthSummaryR43, 'yearMonth' | 'contributionCents'>>,
  _n = 12
): number {
  throw new Error('Not implemented (Phase A stub)');
}

export function fireNumber(_expense: number, _withdrawalRate: number): number | null {
  throw new Error('Not implemented (Phase A stub)');
}

export function projectToFire(_input: FireProjectionInput): FireProjectionResult {
  throw new Error('Not implemented (Phase A stub)');
}
