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

const PT_BR_MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export const PRIVACY_MASK_BRL = 'R$ ••••••';

export function formatCentsBRL(cents: number, isPrivacyMode = false): string {
  if (isPrivacyMode) {
    return PRIVACY_MASK_BRL;
  }
  const safeCents = Math.round(Number.isFinite(cents) ? cents : 0);
  const sign = safeCents < 0 ? '-' : '';
  const abs = Math.abs(safeCents);
  const intPart = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = String(abs % 100).padStart(2, '0');
  return `${sign}R$ ${intPart},${decPart}`;
}

export function parseBRLToCents(raw: string | number): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    return Math.round(raw * 100);
  }
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return 0;

  const isNegative = trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  let intDigits = '';
  let decDigits = '00';

  if (cleaned.includes(',')) {
    const withoutThousands = cleaned.replace(/\./g, '');
    const [intRaw, decRaw = ''] = withoutThousands.split(',');
    intDigits = intRaw.replace(/\D/g, '') || '0';
    decDigits = decRaw.replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
  } else if (cleaned.includes('.')) {
    const lastDot = cleaned.lastIndexOf('.');
    const afterDot = cleaned.slice(lastDot + 1).replace(/\D/g, '');
    if (afterDot.length <= 2) {
      intDigits = cleaned.slice(0, lastDot).replace(/\D/g, '') || '0';
      decDigits = afterDot.padEnd(2, '0').slice(0, 2);
    } else {
      // Ex: "1.000" (separador de milhar sem decimais)
      intDigits = cleaned.replace(/\D/g, '') || '0';
      decDigits = '00';
    }
  } else {
    intDigits = cleaned.replace(/\D/g, '') || '0';
  }

  const cents = Number.parseInt(intDigits, 10) * 100 + Number.parseInt(decDigits, 10);
  if (!Number.isFinite(cents)) return 0;
  return isNegative ? -cents : cents;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  const daysByMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const idx = Math.min(11, Math.max(0, Math.trunc(month) - 1));
  return daysByMonth[idx];
}

export function clampDayOfMonth(year: number, month: number, day: number): number {
  const maxDay = getDaysInMonth(year, month);
  return Math.min(Math.max(1, Math.trunc(day)), maxDay);
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [yStr, mStr, dStr] = iso.slice(0, 10).split('-');
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  const day = Number.parseInt(dStr, 10);
  return {
    year: Number.isFinite(year) ? year : 2026,
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1,
    day: Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1,
  };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function addMonthsYearMonth(yearMonth: string, deltaMonths: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return getTodayIsoLocal().slice(0, 7);
  }
  const total = year * 12 + (month - 1) + deltaMonths;
  const targetYear = Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12 + 1;
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
}

export function formatYearMonthPtBr(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const monthIdx = Number.parseInt(mStr, 10) - 1;
  const name = PT_BR_MONTHS[monthIdx] ?? mStr;
  return `${name} ${yStr}`;
}

export function getMonthDateRange(yearMonth: string): { start: string; end: string } {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  const lastDay = getDaysInMonth(year, month);
  return {
    start: formatIsoDate(year, month, 1),
    end: formatIsoDate(year, month, lastDay),
  };
}

export function getTodayIsoLocal(): string {
  const now = new Date();
  return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function isoToUtcMs(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

export function generateRecurrenceOccurrences(
  recurrence: FinRecurrence,
  windowStart: string,
  windowEnd: string,
  existingEntries: Array<Pick<FinEntry, 'recurrence_id' | 'due_date'>> = []
): { occurrences: GeneratedOccurrence[]; generatedUntil: string | null } {
  const prevGeneratedUntil = recurrence.generated_until ?? null;

  if (recurrence.active === 0) {
    return { occurrences: [], generatedUntil: prevGeneratedUntil };
  }

  const effectiveEnd =
    recurrence.end_date && recurrence.end_date < windowEnd ? recurrence.end_date : windowEnd;
  const effectiveStart =
    recurrence.start_date > windowStart ? recurrence.start_date : windowStart;

  if (effectiveEnd < windowStart || recurrence.start_date > effectiveEnd || effectiveStart > effectiveEnd) {
    return { occurrences: [], generatedUntil: prevGeneratedUntil };
  }

  const existingDates = new Set(
    existingEntries
      .filter((entry) => entry.recurrence_id === recurrence.id)
      .map((entry) => entry.due_date)
  );

  const candidateDates: string[] = [];
  const startParts = parseIsoDate(recurrence.start_date);

  if (recurrence.frequency === 'monthly') {
    const anchorDay = recurrence.day_of_month > 0 ? recurrence.day_of_month : startParts.day;
    const effStartParts = parseIsoDate(effectiveStart);
    const effEndParts = parseIsoDate(effectiveEnd);
    let totalMonth = effStartParts.year * 12 + (effStartParts.month - 1);
    const maxMonth = effEndParts.year * 12 + (effEndParts.month - 1);

    while (totalMonth <= maxMonth) {
      const y = Math.floor(totalMonth / 12);
      const m = (totalMonth % 12) + 1;
      const dueDay = clampDayOfMonth(y, m, anchorDay);
      const iso = formatIsoDate(y, m, dueDay);
      if (iso >= effectiveStart && iso <= effectiveEnd) {
        candidateDates.push(iso);
      }
      totalMonth += 1;
    }
  } else if (recurrence.frequency === 'yearly') {
    const anchorMonth = startParts.month;
    const anchorDay = recurrence.day_of_month > 0 ? recurrence.day_of_month : startParts.day;
    const startYear = parseIsoDate(effectiveStart).year;
    const endYear = parseIsoDate(effectiveEnd).year;

    for (let y = startYear; y <= endYear; y += 1) {
      const dueDay = clampDayOfMonth(y, anchorMonth, anchorDay);
      const iso = formatIsoDate(y, anchorMonth, dueDay);
      if (iso >= effectiveStart && iso <= effectiveEnd) {
        candidateDates.push(iso);
      }
    }
  } else {
    // weekly: passos exatos de 7 dias a partir de start_date
    const diffMs = isoToUtcMs(effectiveStart) - isoToUtcMs(recurrence.start_date);
    const diffDays = Math.floor(diffMs / 86_400_000);
    const stepOffset = diffDays > 0 ? Math.ceil(diffDays / 7) * 7 : 0;
    let cursor = addDaysIso(recurrence.start_date, stepOffset);

    while (cursor <= effectiveEnd) {
      if (cursor >= effectiveStart) {
        candidateDates.push(cursor);
      }
      cursor = addDaysIso(cursor, 7);
    }
  }

  const occurrences: GeneratedOccurrence[] = candidateDates
    .filter((dueDate) => !existingDates.has(dueDate))
    .map((dueDate) => ({
      recurrenceId: recurrence.id,
      kind: recurrence.kind === 'income' ? 'income' : 'expense',
      amountCents: recurrence.amount_cents,
      dueDate,
      accountId: recurrence.account_id,
      categoryId: recurrence.category_id,
      description: recurrence.description,
    }));

  const nextGeneratedUntil =
    prevGeneratedUntil && prevGeneratedUntil > effectiveEnd ? prevGeneratedUntil : effectiveEnd;

  return {
    occurrences,
    generatedUntil: nextGeneratedUntil,
  };
}

export function splitInstallments(
  totalCents: number,
  installmentTotal: number,
  remainderOn: 'first' | 'last' = 'first'
): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('O valor total em centavos deve ser um inteiro positivo.');
  }
  if (!Number.isInteger(installmentTotal) || installmentTotal < 1) {
    throw new Error('O número de parcelas deve ser um inteiro >= 1.');
  }

  const base = Math.floor(totalCents / installmentTotal);
  const remainder = totalCents % installmentTotal;
  const parts: number[] = [];

  for (let i = 0; i < installmentTotal; i += 1) {
    const addCent =
      remainderOn === 'last'
        ? i >= installmentTotal - remainder
        : i < remainder;
    parts.push(base + (addCent ? 1 : 0));
  }

  return parts;
}

export function buildInstallmentSchedule(params: {
  totalCents: number;
  installmentTotal: number;
  firstDueDate: string;
  remainderOn?: 'first' | 'last';
}): InstallmentPart[] {
  const { totalCents, installmentTotal, firstDueDate, remainderOn = 'first' } = params;
  const amounts = splitInstallments(totalCents, installmentTotal, remainderOn);
  const { year, month, day: anchorDay } = parseIsoDate(firstDueDate);

  return amounts.map((amountCents, index) => {
    const totalMonths = year * 12 + (month - 1) + index;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    const d = clampDayOfMonth(y, m, anchorDay);
    const installmentNumber = index + 1;

    return {
      installmentNumber,
      installmentTotal,
      amountCents,
      dueDate: formatIsoDate(y, m, d),
      label: `${installmentNumber}/${installmentTotal}`,
    };
  });
}

export function calculateAccountBalance(
  initialBalanceCents: number,
  entries: Array<Pick<FinEntry, 'account_id' | 'kind' | 'status' | 'amount_cents' | 'paid_amount_cents'>>,
  accountId?: string
): number {
  let balance = initialBalanceCents;
  for (const entry of entries) {
    if (accountId !== undefined && entry.account_id !== accountId) continue;
    if (entry.status !== 'paid') continue;
    const realCents = entry.paid_amount_cents ?? entry.amount_cents;
    balance += entry.kind === 'income' ? realCents : -realCents;
  }
  return balance;
}

export function calculateMonthlySummary(entries: FinEntry[], yearMonth: string): MonthlySummary {
  let paidIncomeCents = 0;
  let paidExpenseCents = 0;
  let pendingIncomeCents = 0;
  let pendingExpenseCents = 0;
  const categoryTotals = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.due_date.startsWith(yearMonth)) continue;

    if (entry.status === 'paid') {
      const realCents = entry.paid_amount_cents ?? entry.amount_cents;
      if (entry.kind === 'income') {
        paidIncomeCents += realCents;
      } else {
        paidExpenseCents += realCents;
        categoryTotals.set(
          entry.category_id,
          (categoryTotals.get(entry.category_id) ?? 0) + realCents
        );
      }
    } else {
      if (entry.kind === 'income') {
        pendingIncomeCents += entry.amount_cents;
      } else {
        pendingExpenseCents += entry.amount_cents;
        categoryTotals.set(
          entry.category_id,
          (categoryTotals.get(entry.category_id) ?? 0) + entry.amount_cents
        );
      }
    }
  }

  const totalIncomeCents = paidIncomeCents + pendingIncomeCents;
  const totalExpenseCents = paidExpenseCents + pendingExpenseCents;

  const expenseByCategory: CategoryExpenseBreakdown[] = Array.from(categoryTotals.entries())
    .map(([categoryId, amountCents]) => ({
      categoryId,
      amountCents,
      percentage:
        totalExpenseCents > 0 ? Math.round((amountCents / totalExpenseCents) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  return {
    yearMonth,
    totalIncomeCents,
    totalExpenseCents,
    paidIncomeCents,
    paidExpenseCents,
    pendingIncomeCents,
    pendingExpenseCents,
    balanceCents: paidIncomeCents - paidExpenseCents,
    projectedBalanceCents: totalIncomeCents - totalExpenseCents,
    expenseByCategory,
  };
}

export function classifyEntryDueStatus(
  entry: Pick<FinEntry, 'status' | 'due_date'>,
  todayIso: string,
  horizonDays = 7
): DueClassification {
  if (entry.status === 'paid') {
    return 'paid';
  }
  if (entry.due_date < todayIso) {
    return 'overdue';
  }
  const horizonLimit = addDaysIso(todayIso, horizonDays);
  if (entry.due_date <= horizonLimit) {
    return 'due_soon';
  }
  return 'upcoming';
}

export function detectOverdueAndDueSoon(
  entries: FinEntry[],
  todayIso: string,
  horizonDays = 7
): OverdueAndDueSoonResult {
  const overdue: FinEntry[] = [];
  const dueSoon: FinEntry[] = [];
  const upcoming: FinEntry[] = [];

  for (const entry of entries) {
    const status = classifyEntryDueStatus(entry, todayIso, horizonDays);
    if (status === 'overdue') {
      overdue.push(entry);
    } else if (status === 'due_soon') {
      dueSoon.push(entry);
    } else if (status === 'upcoming') {
      upcoming.push(entry);
    }
  }

  const byDueDate = (a: FinEntry, b: FinEntry) => a.due_date.localeCompare(b.due_date);
  overdue.sort(byDueDate);
  dueSoon.sort(byDueDate);
  upcoming.sort(byDueDate);

  let overdueTotalCents = 0;
  let overduePayableCents = 0;
  for (const e of overdue) {
    overdueTotalCents += e.amount_cents;
    if (e.kind === 'expense') overduePayableCents += e.amount_cents;
  }

  let dueSoonTotalCents = 0;
  let dueSoonPayableCents = 0;
  for (const e of dueSoon) {
    dueSoonTotalCents += e.amount_cents;
    if (e.kind === 'expense') dueSoonPayableCents += e.amount_cents;
  }

  return {
    overdue,
    dueSoon,
    upcoming,
    overdueTotalCents,
    dueSoonTotalCents,
    overduePayableCents,
    dueSoonPayableCents,
  };
}

export function calculateSubscriptionsSummary(recurrences: FinRecurrence[]): SubscriptionsSummary {
  const subscriptions = recurrences.filter((r) => r.is_subscription === 1);
  let activeCount = 0;
  let pausedCount = 0;
  let monthlyTotalCents = 0;
  let annualTotalCents = 0;

  for (const sub of subscriptions) {
    if (sub.active !== 1) {
      pausedCount += 1;
      continue;
    }
    activeCount += 1;
    if (sub.frequency === 'monthly') {
      monthlyTotalCents += sub.amount_cents;
      annualTotalCents += sub.amount_cents * 12;
    } else if (sub.frequency === 'yearly') {
      monthlyTotalCents += Math.round(sub.amount_cents / 12);
      annualTotalCents += sub.amount_cents;
    } else {
      // weekly (52 semanas por ano)
      monthlyTotalCents += Math.round((sub.amount_cents * 52) / 12);
      annualTotalCents += sub.amount_cents * 52;
    }
  }

  return {
    activeCount,
    pausedCount,
    monthlyTotalCents,
    annualTotalCents,
  };
}
