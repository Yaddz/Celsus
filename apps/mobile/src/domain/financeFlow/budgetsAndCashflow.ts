import type { FinAccount, FinBudget, FinEntry, FinRecurrence, FinRecurrenceSkip } from '../../db/schema';

export type BudgetStatus = 'ok' | 'atencao' | 'estourado';

export interface BudgetUsageItem {
  categoryId: string;
  budgetId: string | null;
  yearMonth: string;
  isMonthlySpecific: boolean;
  spentCents: number;
  limitCents: number | null;
  percentage: number | null;
  status: BudgetStatus | null;
  projectedEndOfMonthCents: number;
  paceText: string | null;
  remainingCents: number | null;
  remainingPerDayCents: number | null;
}

export interface DailyCashflowPoint {
  date: string;
  balanceCents: number;
  deltaCents: number;
}

export interface CashflowProjection {
  startingBalanceCents: number;
  days: DailyCashflowPoint[];
  minBalanceCents: number;
  minBalanceDate: string;
  endBalanceCents: number;
  isNegativeAlert: boolean;
}

export function calculateBudgetUsage(
  _entries: FinEntry[],
  _budgets: FinBudget[],
  _yearMonth: string,
  _options?: { todayIso?: string }
): BudgetUsageItem[] {
  throw new Error('Not implemented (Sprint 67 Fase A stub)');
}

export function suggestBudgetLimit(
  _entries: FinEntry[],
  _categoryId: string,
  _yearMonth: string
): number {
  throw new Error('Not implemented (Sprint 67 Fase A stub)');
}

export function projectCashflow(
  _accounts: FinAccount[],
  _entries: FinEntry[],
  _todayIso: string,
  _untilIso: string,
  _options?: {
    recurrences?: FinRecurrence[];
    skips?: FinRecurrenceSkip[];
  }
): CashflowProjection {
  throw new Error('Not implemented (Sprint 67 Fase A stub)');
}
