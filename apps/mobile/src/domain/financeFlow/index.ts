import type { FinAccount, FinEntry, FinRecurrence } from '../../db/schema';
import {
  billDueDate,
  resolveBillMonth,
  summarizeBill,
  type CardBillDueItem,
} from './cards';

export type FinKind = 'income' | 'expense';
export type FinEntryKind = 'income' | 'expense' | 'transfer_out' | 'transfer_in';
export type FinEntryStatus = 'pending' | 'paid';
export type FinAccountType = 'cash' | 'checking' | 'card';
export type FinFrequency = 'weekly' | 'monthly' | 'yearly';
export type InstallmentScope = 'only_this' | 'this_and_next' | 'all';
export type DueClassification = 'paid' | 'overdue' | 'due_soon' | 'upcoming';

export interface GeneratedOccurrence {
  recurrenceId: string;
  recurrencePeriod?: string;
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
  expensesCents: number;
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

export function resolveRecurrencePeriod(frequency: string, dueDate: string): string {
  return frequency === 'weekly' ? dueDate.slice(0, 10) : dueDate.slice(0, 7);
}

export function generateRecurrenceOccurrences(
  recurrence: FinRecurrence,
  windowStart: string,
  windowEnd: string,
  existingEntries: Array<Pick<FinEntry, 'recurrence_id' | 'due_date' | 'recurrence_period'>> = [],
  skippedPeriods: Set<string> | string[] = []
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

  const existingPeriods = new Set<string>();
  for (const entry of existingEntries) {
    if (entry.recurrence_id !== recurrence.id) continue;
    const period = entry.recurrence_period ?? resolveRecurrencePeriod(recurrence.frequency, entry.due_date);
    existingPeriods.add(period);
  }
  const skippedSet = skippedPeriods instanceof Set ? skippedPeriods : new Set(skippedPeriods);

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
    .filter((dueDate) => {
      const period = resolveRecurrencePeriod(recurrence.frequency, dueDate);
      return !existingPeriods.has(period) && !skippedSet.has(period);
    })
    .map((dueDate) => ({
      recurrenceId: recurrence.id,
      recurrencePeriod: resolveRecurrencePeriod(recurrence.frequency, dueDate),
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
  entries: Array<
    Pick<FinEntry, 'account_id' | 'kind' | 'status' | 'amount_cents' | 'paid_amount_cents'> & {
      of_removed_at?: string | null;
    }
  >,
  accountId?: string
): number {
  let balance = initialBalanceCents;
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (accountId !== undefined && entry.account_id !== accountId) continue;
    if (entry.status !== 'paid') continue;
    const realCents = entry.paid_amount_cents ?? entry.amount_cents;
    if (entry.kind === 'income' || entry.kind === 'transfer_in') {
      balance += realCents;
    } else {
      balance -= realCents;
    }
  }
  return balance;
}

/**
 * Saldo atual de uma conta. Em conta vinda do Open Finance o banco manda: usa o saldo informado
 * por ele (o histórico importado já está contido nesse saldo). Nas demais, inicial + lançamentos pagos.
 */
export function resolveAccountBalance(
  account: Pick<FinAccount, 'id' | 'initial_balance_cents' | 'source' | 'reported_balance_cents'>,
  entries: Array<Pick<FinEntry, 'account_id' | 'kind' | 'status' | 'amount_cents' | 'paid_amount_cents'>>
): number {
  if (account.source === 'OPEN_FINANCE' && account.reported_balance_cents != null) {
    return account.reported_balance_cents;
  }
  return calculateAccountBalance(account.initial_balance_cents, entries, account.id);
}

export function calculateMonthlySummary(entries: FinEntry[], yearMonth: string, _todayIso?: string): MonthlySummary {
  let paidIncomeCents = 0;
  let paidExpenseCents = 0;
  let pendingIncomeCents = 0;
  let pendingExpenseCents = 0;
  const categoryTotals = new Map<string, number>();

  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (!entry.due_date.startsWith(yearMonth)) continue;
    if (entry.kind === 'transfer_out' || entry.kind === 'transfer_in') continue;

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
    expensesCents: totalExpenseCents,
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
    if (entry.of_removed_at) continue;
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

/** Aceita "dd/mm/aaaa" ou ISO e devolve ISO válido ("AAAA-MM-DD"), ou null. */
export function brToIso(text: string): string | null {
  const t = (text || '').trim();
  let y: number;
  let mo: number;
  let d: number;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) {
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return null;
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return formatIsoDate(y, mo, d);
}

/** "2026-11-14" → "14/11/2026"; textos que já não são ISO são mantidos. */
export function isoToBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function nextOccurrenceIso(
  recurrence: FinRecurrence,
  todayIso: string,
  pendingEntries?: Array<Pick<FinEntry, 'recurrence_id' | 'status' | 'due_date'>>
): string | null {
  if (recurrence.active !== 1) return null;

  if (pendingEntries && pendingEntries.length > 0) {
    const upcomingPending = pendingEntries
      .filter(
        (e) =>
          e.recurrence_id === recurrence.id &&
          e.status === 'pending' &&
          e.due_date >= todayIso &&
          (!recurrence.end_date || e.due_date <= recurrence.end_date)
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (upcomingPending.length > 0) {
      return upcomingPending[0].due_date;
    }
  }

  const refIso = recurrence.start_date > todayIso ? recurrence.start_date : todayIso;
  const startParts = parseIsoDate(recurrence.start_date);
  const refParts = parseIsoDate(refIso);
  let candidate: string;

  if (recurrence.frequency === 'monthly') {
    const anchorDay = recurrence.day_of_month > 0 ? recurrence.day_of_month : startParts.day;
    const firstTry = formatIsoDate(
      refParts.year,
      refParts.month,
      clampDayOfMonth(refParts.year, refParts.month, anchorDay)
    );
    if (firstTry >= refIso) {
      candidate = firstTry;
    } else {
      const nextYm = addMonthsYearMonth(refIso.slice(0, 7), 1);
      const nextParts = parseIsoDate(`${nextYm}-01`);
      candidate = formatIsoDate(
        nextParts.year,
        nextParts.month,
        clampDayOfMonth(nextParts.year, nextParts.month, anchorDay)
      );
    }
  } else if (recurrence.frequency === 'yearly') {
    const anchorMonth = startParts.month;
    const anchorDay = recurrence.day_of_month > 0 ? recurrence.day_of_month : startParts.day;
    const firstTry = formatIsoDate(
      refParts.year,
      anchorMonth,
      clampDayOfMonth(refParts.year, anchorMonth, anchorDay)
    );
    if (firstTry >= refIso) {
      candidate = firstTry;
    } else {
      const nextYear = refParts.year + 1;
      candidate = formatIsoDate(
        nextYear,
        anchorMonth,
        clampDayOfMonth(nextYear, anchorMonth, anchorDay)
      );
    }
  } else {
    const diffMs = isoToUtcMs(refIso) - isoToUtcMs(recurrence.start_date);
    const diffDays = Math.floor(diffMs / 86_400_000);
    const stepOffset = diffDays > 0 ? Math.ceil(diffDays / 7) * 7 : 0;
    candidate = addDaysIso(recurrence.start_date, stepOffset);
  }

  if (recurrence.end_date && candidate > recurrence.end_date) {
    return null;
  }
  return candidate;
}

export * from './cards';

export interface OverdueAndDueSoonWithBillsResult extends OverdueAndDueSoonResult {
  overdueBills: import('./cards').CardBillDueItem[];
  dueSoonBills: import('./cards').CardBillDueItem[];
}

export function detectOverdueAndDueSoonWithBills(
  entries: FinEntry[],
  accounts: FinAccount[],
  todayIso: string,
  horizonDays = 7
): OverdueAndDueSoonWithBillsResult {
  const cardAccounts = accounts.filter((a) => a.type === 'card' && a.archived === 0);
  const cardAccountIds = new Set(cardAccounts.map((a) => a.id));

  const nonCardEntries = entries.filter(
    (e) =>
      !e.of_removed_at &&
      !cardAccountIds.has(e.account_id) &&
      e.kind !== 'transfer_out' &&
      e.kind !== 'transfer_in'
  );
  const base = detectOverdueAndDueSoon(nonCardEntries, todayIso, horizonDays);

  const horizonLimit = addDaysIso(todayIso, horizonDays);
  const overdueBills: CardBillDueItem[] = [];
  const dueSoonBills: CardBillDueItem[] = [];
  let overdueBillsTotalCents = 0;
  let dueSoonBillsTotalCents = 0;

  for (const card of cardAccounts) {
    const cardEntries = entries.filter((e) => e.account_id === card.id && !e.of_removed_at);
    const months = new Set<string>();
    for (const e of cardEntries) {
      const bm = e.bill_month ?? resolveBillMonth(e.due_date, card.closing_day ?? 1, card.due_day);
      months.add(bm);
    }
    const normalizedEntries = cardEntries.map((e) =>
      e.bill_month ? e : { ...e, bill_month: resolveBillMonth(e.due_date, card.closing_day ?? 1, card.due_day) }
    );

    for (const billMonth of months) {
      const dueDate = billDueDate(billMonth, card.due_day ?? 10);
      const summary = summarizeBill(normalizedEntries, billMonth, {
        dueDate,
        todayIso,
        closingDay: card.closing_day ?? undefined,
      });
      if (summary.openCents <= 0) continue;

      if (dueDate < todayIso) {
        overdueBills.push({
          account: card,
          billMonth,
          dueDate,
          openCents: summary.openCents,
          status: summary.status,
        });
        overdueBillsTotalCents += summary.openCents;
      } else if (dueDate <= horizonLimit) {
        dueSoonBills.push({
          account: card,
          billMonth,
          dueDate,
          openCents: summary.openCents,
          status: summary.status,
        });
        dueSoonBillsTotalCents += summary.openCents;
      }
    }
  }

  overdueBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  dueSoonBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    ...base,
    overdueTotalCents: base.overdueTotalCents + overdueBillsTotalCents,
    dueSoonTotalCents: base.dueSoonTotalCents + dueSoonBillsTotalCents,
    overduePayableCents: base.overduePayableCents + overdueBillsTotalCents,
    dueSoonPayableCents: base.dueSoonPayableCents + dueSoonBillsTotalCents,
    overdueBills,
    dueSoonBills,
  };
}

export * from './budgetsAndCashflow';
