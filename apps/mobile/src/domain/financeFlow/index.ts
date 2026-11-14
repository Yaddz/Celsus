import type { FinEntry, FinRecurrence } from '../../db/schema';

export type FinKind = 'income' | 'expense';
export type FinEntryStatus = 'pending' | 'paid';
export type FinAccountType = 'cash' | 'checking' | 'card';
export type FinFrequency = 'weekly' | 'monthly' | 'yearly';
export type InstallmentScope = 'only_this' | 'this_and_next' | 'all';
export type DueClassification = 'paid' | 'overdue' | 'due_soon' | 'upcoming';

export interface GeneratedOccurrence {
  recurrenceId: string;
  kind: FinKind;
  amountCents: number;
  dueDate: string;
  accountId: string;
  categoryId: string;
  description: string;
}

export interface CategoryExpenseBreakdown {
  categoryId: string;
  amountCents: number;
  percentage: number;
}

export interface MonthlySummary {
  yearMonth: string;
  totalIncomeCents: number;
  totalExpenseCents: number;
  paidIncomeCents: number;
  paidExpenseCents: number;
  pendingIncomeCents: number;
  pendingExpenseCents: number;
  balanceCents: number;
  projectedBalanceCents: number;
  expenseByCategory: CategoryExpenseBreakdown[];
}

export interface OverdueAndDueSoonResult {
  overdue: FinEntry[];
  dueSoon: FinEntry[];
  upcoming: FinEntry[];
  overdueTotalCents: number;
  dueSoonTotalCents: number;
  overduePayableCents: number;
  dueSoonPayableCents: number;
}

export interface SubscriptionsSummary {
  activeCount: number;
  pausedCount: number;
  monthlyTotalCents: number;
  annualTotalCents: number;
}

export interface InstallmentPart {
  installmentNumber: number;
  installmentTotal: number;
  amountCents: number;
  dueDate: string;
  label: string;
}

export function formatCentsBRL(_cents: number, _isPrivacyMode = false): string {
  return '';
}

export function parseBRLToCents(_raw: string | number): number {
  return 0;
}

export function isLeapYear(_year: number): boolean {
  return false;
}

export function clampDayOfMonth(_year: number, _month: number, _day: number): number {
  return 0;
}

export function generateRecurrenceOccurrences(
  _recurrence: FinRecurrence,
  _windowStart: string,
  _windowEnd: string,
  _existingEntries: Array<Pick<FinEntry, 'recurrence_id' | 'due_date'>> = []
): { occurrences: GeneratedOccurrence[]; generatedUntil: string | null } {
  return { occurrences: [], generatedUntil: null };
}

export function splitInstallments(
  _totalCents: number,
  _installmentTotal: number,
  _remainderOn: 'first' | 'last' = 'first'
): number[] {
  return [];
}

export function buildInstallmentSchedule(_params: {
  totalCents: number;
  installmentTotal: number;
  firstDueDate: string;
  remainderOn?: 'first' | 'last';
}): InstallmentPart[] {
  return [];
}

export function calculateAccountBalance(
  _initialBalanceCents: number,
  _entries: Array<Pick<FinEntry, 'account_id' | 'kind' | 'status' | 'amount_cents' | 'paid_amount_cents'>>,
  _accountId?: string
): number {
  return 0;
}

export function calculateMonthlySummary(_entries: FinEntry[], yearMonth: string): MonthlySummary {
  return {
    yearMonth,
    totalIncomeCents: 0,
    totalExpenseCents: 0,
    paidIncomeCents: 0,
    paidExpenseCents: 0,
    pendingIncomeCents: 0,
    pendingExpenseCents: 0,
    balanceCents: 0,
    projectedBalanceCents: 0,
    expenseByCategory: [],
  };
}

export function classifyEntryDueStatus(
  _entry: Pick<FinEntry, 'status' | 'due_date'>,
  _todayIso: string,
  _horizonDays = 7
): DueClassification {
  return 'upcoming';
}

export function detectOverdueAndDueSoon(
  _entries: FinEntry[],
  _todayIso: string,
  _horizonDays = 7
): OverdueAndDueSoonResult {
  return {
    overdue: [],
    dueSoon: [],
    upcoming: [],
    overdueTotalCents: 0,
    dueSoonTotalCents: 0,
    overduePayableCents: 0,
    dueSoonPayableCents: 0,
  };
}

export function calculateSubscriptionsSummary(_recurrences: FinRecurrence[]): SubscriptionsSummary {
  return {
    activeCount: 0,
    pausedCount: 0,
    monthlyTotalCents: 0,
    annualTotalCents: 0,
  };
}
