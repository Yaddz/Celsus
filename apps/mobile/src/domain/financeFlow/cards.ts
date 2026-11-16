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

export function resolveBillMonth(purchaseIso: string, closingDay: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(purchaseIso);
  if (!m) {
    return purchaseIso.slice(0, 7);
  }
  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const day = Number.parseInt(m[3], 10);
  const currentYm = `${year}-${pad2(month)}`;
  const effectiveClosingDay = clampDay(year, month, closingDay);
  if (day >= effectiveClosingDay) {
    return addMonthsYm(currentYm, 1);
  }
  return currentYm;
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
