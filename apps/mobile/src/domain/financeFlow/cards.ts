import type { FinAccount, FinEntry } from '../../db/schema';

export type BillStatus = 'aberta' | 'fechada' | 'paga' | 'atrasada';

export interface BillSummary {
  billMonth: string;
  totalCents: number;
  paidCents: number;
  openCents: number;
  status: BillStatus;
}

export interface CardBillDueItem {
  account: FinAccount;
  billMonth: string;
  dueDate: string;
  openCents: number;
  status: BillStatus;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDay(year: number, month: number, day: number): number {
  const max = daysInMonth(year, month);
  return Math.max(1, Math.min(day, max));
}

function addMonthsYm(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

/**
 * Mês da fatura (o mês em que ela VENCE) de uma compra.
 * Quando o cartão fecha depois do dia do vencimento (ex.: fecha 28, vence 5), a fatura que fecha
 * em um mês só vence no mês seguinte; informe `dueDay` para que esse deslocamento seja aplicado.
 */
export function resolveBillMonth(
  purchaseIso: string,
  closingDay: number,
  dueDay?: number | null
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(purchaseIso);
  if (!m) {
    return purchaseIso.slice(0, 7);
  }
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const day = Number.parseInt(m[3], 10);
  const currentYm = `${year}-${pad2(month)}`;
  const effectiveClosingDay = clampDay(year, month, closingDay);
  const closingYm = day >= effectiveClosingDay ? addMonthsYm(currentYm, 1) : currentYm;
  return closesAfterDueDay(closingDay, dueDay) ? addMonthsYm(closingYm, 1) : closingYm;
}

/** Cartão cujo fechamento cai depois do dia do vencimento: a fatura vence no mês seguinte ao do fechamento. */
export function closesAfterDueDay(
  closingDay: number | null | undefined,
  dueDay: number | null | undefined
): boolean {
  return closingDay != null && dueDay != null && closingDay > dueDay;
}

export function billDueDate(billMonth: string, dueDay: number): string {
  const [yStr, mStr] = billMonth.split('-');
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  const day = clampDay(year, month, dueDay);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function summarizeBill(
  entries: FinEntry[],
  billMonth: string,
  options?: { dueDate?: string; todayIso?: string; closingDay?: number }
): BillSummary {
  let expensesCents = 0;
  let refundsCents = 0;
  let paidCents = 0;

  for (const entry of entries) {
    if (entry.bill_month !== billMonth) continue;
    if (entry.kind === 'expense') {
      expensesCents +=
        entry.status === 'paid' ? entry.paid_amount_cents ?? entry.amount_cents : entry.amount_cents;
    } else if (entry.kind === 'income') {
      refundsCents +=
        entry.status === 'paid' ? entry.paid_amount_cents ?? entry.amount_cents : entry.amount_cents;
    } else if (entry.kind === 'transfer_in' && entry.status === 'paid') {
      paidCents += entry.paid_amount_cents ?? entry.amount_cents;
    }
  }

  const totalCents = expensesCents - refundsCents;
  const openCents = Math.max(0, totalCents - paidCents);

  let status: BillStatus = 'aberta';
  if (totalCents > 0 && openCents === 0) {
    status = 'paga';
  } else if (openCents > 0) {
    const todayIso = options?.todayIso;
    const dueDate = options?.dueDate;
    if (todayIso && dueDate && todayIso > dueDate) {
      status = 'atrasada';
    } else if (todayIso && options?.closingDay != null) {
      const dueDay = dueDate ? Number.parseInt(dueDate.slice(8, 10), 10) : null;
      const closingYm =
        dueDay !== null && options.closingDay > dueDay ? addMonthsYm(billMonth, -1) : billMonth;
      const closingDate = billDueDate(closingYm, options.closingDay);
      if (todayIso >= closingDate) {
        status = 'fechada';
      }
    }
  }

  return {
    billMonth,
    totalCents,
    paidCents,
    openCents,
    status,
  };
}

export function availableLimit(
  limitCents: number | null | undefined,
  openBillsTotalCents: number
): number | null {
  if (limitCents === null || limitCents === undefined) {
    return null;
  }
  return limitCents - Math.max(0, openBillsTotalCents);
}

export const DEFAULT_CARD_CLOSING_DAY = 1;
export const DEFAULT_CARD_DUE_DAY = 10;

export interface NormalizeCardEntryInput {
  kind: 'income' | 'expense' | 'transfer_out' | 'transfer_in';
  dueDate: string;
  amountCents: number;
  status?: 'pending' | 'paid';
  paidDate?: string | null;
  paidAmountCents?: number | null;
  billMonth?: string | null;
}

export interface NormalizeCardEntryAccount {
  type: string;
  closing_day?: number | null;
  due_day?: number | null;
}

export interface NormalizedCardEntryFields {
  due_date: string;
  status: 'pending' | 'paid';
  paid_date: string | null;
  paid_amount_cents: number | null;
  bill_month: string | null;
}

export function hasEstimatedBillDates(
  _account: Pick<FinAccount, 'closing_day' | 'due_day'> | null | undefined
): boolean {
  return false;
}

export function normalizeCardEntry(
  input: NormalizeCardEntryInput,
  _account: NormalizeCardEntryAccount | null | undefined
): NormalizedCardEntryFields {
  return {
    due_date: input.dueDate,
    status: input.status ?? 'pending',
    paid_date: input.paidDate ?? null,
    paid_amount_cents: input.paidAmountCents ?? null,
    bill_month: input.billMonth ?? null,
  };
}

export interface BillPeriodInfo {
  startIso: string;
  endIso: string;
  closingIso: string;
  dueIso: string;
}

export function getBillPeriod(
  billMonth: string,
  _closingDay: number,
  _dueDay?: number | null
): BillPeriodInfo {
  return {
    startIso: `${billMonth}-01`,
    endIso: `${billMonth}-01`,
    closingIso: `${billMonth}-01`,
    dueIso: `${billMonth}-10`,
  };
}

export interface BillDayGroup {
  dateIso: string;
  entries: FinEntry[];
}

export function groupBillEntriesByDay(_entries: FinEntry[]): BillDayGroup[] {
  return [];
}
