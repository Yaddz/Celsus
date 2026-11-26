import type { FinBill, FinEntry } from '../../db/schema';
import type {
  PluggyBill,
  PluggyBillPayment,
  PluggyTransaction,
} from '../../services/pluggy/types';
import { resolveBillMonth, type BillStatus } from '../financeFlow/cards';
import { toBrtDate, toBrtMonth } from './dates';
import { toCentsDecimal } from './index';

export type BillMonthSource = 'BILL_ID' | 'FORECAST' | 'POST_DATE' | 'CALENDAR';

export interface AssignBillMonthContext {
  bills: PluggyBill[];
  closingDay: number;
  dueDay: number | null;
  forecastOffset?: number;
}

export interface AssignBillMonthResult {
  billMonth: string;
  source: BillMonthSource;
}

export interface DerivedCardCalendar {
  closingDay: number;
  dueDay: number;
}

export type PaidSource =
  | 'NEXT_BILL_PAYMENTS'
  | 'SAME_BILL_PAYMENTS'
  | 'APP_ENTRIES'
  | 'NONE';

export interface OpenFinanceBillSummary {
  totalCents: number;
  itemsCents: number;
  itemsVsTotalDiffCents: number;
  chargeableNextCents: number;
  paidCents: number;
  paidSource: PaidSource;
  status: BillStatus;
}

function addMonthsYm(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function inferForecastOffset(
  transactions: PluggyTransaction[],
  bills: PluggyBill[]
): number {
  const billById = new Map(bills.map((b) => [b.id, b]));
  let total = 0;
  let dueMatches = 0;
  let closingMatches = 0;
  let closingBeforeDue = false;

  for (const tx of transactions) {
    const billId = tx.creditCardMetadata?.billId;
    const forecast = tx.creditCardMetadata?.billForecastDate;
    if (!billId || !forecast) continue;
    const bill = billById.get(billId);
    if (!bill?.dueDate) continue;

    total += 1;
    const forecastYm = forecast.slice(0, 7);
    const dueYm = toBrtMonth(bill.dueDate);
    if (forecastYm === dueYm) {
      dueMatches += 1;
    }
    if (bill.billClosingDate) {
      const closingYm = toBrtMonth(bill.billClosingDate);
      if (forecastYm === closingYm) {
        closingMatches += 1;
        if (closingYm < dueYm) {
          closingBeforeDue = true;
        }
      }
    }
  }

  if (total < 5) return 0;
  if (dueMatches / total >= 0.8) return 0;
  if (closingMatches / total >= 0.8 && closingBeforeDue) return 1;
  return 0;
}

export function assignBillMonth(
  tx: PluggyTransaction,
  ctx: AssignBillMonthContext
): AssignBillMonthResult {
  const billId = tx.creditCardMetadata?.billId;
  if (billId) {
    const bill = ctx.bills.find((b) => b.id === billId);
    if (bill?.dueDate) {
      return { billMonth: toBrtMonth(bill.dueDate), source: 'BILL_ID' };
    }
  }
  const result = assignWithoutBillId(tx, ctx);
  return { ...result, billMonth: keepPendingOutOfClosedBills(tx, result.billMonth, ctx.bills) };
}

function assignWithoutBillId(tx: PluggyTransaction, ctx: AssignBillMonthContext): AssignBillMonthResult {
  const forecast = tx.creditCardMetadata?.billForecastDate;
  if (forecast && /^\d{4}-\d{2}/.test(forecast)) {
    const baseYm = forecast.slice(0, 7);
    return {
      billMonth: addMonthsYm(baseYm, ctx.forecastOffset ?? 0),
      source: 'FORECAST',
    };
  }

  const postDate = tx.creditCardMetadata?.billPostDate;
  if (postDate && /^\d{4}-\d{2}-\d{2}/.test(postDate)) {
    return {
      billMonth: resolveBillMonth(toBrtDate(postDate), ctx.closingDay, ctx.dueDay),
      source: 'POST_DATE',
    };
  }

  return {
    billMonth: resolveBillMonth(toBrtDate(tx.date), ctx.closingDay, ctx.dueDay),
    source: 'CALENDAR',
  };
}

/**
 * Compra PENDENTE sem billId ainda não entrou em nenhuma fatura fechada (no Open Finance, a transação de uma
 * fatura fechada vem com billId). Se o mês previsto/calculado cair numa fatura que a Pluggy já devolveu
 * (ou antes dela), ela vai para a primeira fatura em aberto. Sem isso, a "Fatura atual" zerava quando o
 * billForecastDate da conexão segue outra convenção de mês.
 */
export function keepPendingOutOfClosedBills(
  tx: Pick<PluggyTransaction, 'status'>,
  billMonth: string,
  bills: Pick<PluggyBill, 'dueDate'>[]
): string {
  if (tx.status !== 'PENDING' || bills.length === 0) return billMonth;
  let latestClosed = '';
  for (const b of bills) {
    if (!b.dueDate) continue;
    const ym = toBrtMonth(b.dueDate);
    if (ym > latestClosed) latestClosed = ym;
  }
  if (!latestClosed || billMonth > latestClosed) return billMonth;
  return addMonthsYm(latestClosed, 1);
}

export function assignPaymentBillMonth(
  paymentDateIso: string,
  bills: Array<{ bill_month: string; closing_date: string | null; due_date: string }>
): string | null {
  if (bills.length === 0) return null;
  const sorted = [...bills].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const payDate = toBrtDate(paymentDateIso);

  for (let i = 0; i < sorted.length; i += 1) {
    const curr = sorted[i];
    const next = i + 1 < sorted.length ? sorted[i + 1] : null;
    const currStart = curr.closing_date ?? curr.due_date;
    const nextStart = next ? next.closing_date ?? next.due_date : null;
    if (payDate >= currStart && (!nextStart || payDate < nextStart)) {
      return curr.bill_month;
    }
  }

  const upcoming = sorted.find((b) => b.due_date >= payDate);
  return upcoming?.bill_month ?? sorted[sorted.length - 1].bill_month;
}

export function deriveCardCalendar(bills: PluggyBill[]): DerivedCardCalendar | null {
  if (!bills || bills.length === 0) return null;
  const sorted = [...bills].sort((a, b) =>
    toBrtDate(b.dueDate).localeCompare(toBrtDate(a.dueDate))
  );
  const latestDueIso = toBrtDate(sorted[0].dueDate);
  const dueDay = Number.parseInt(latestDueIso.slice(8, 10), 10);
  if (!Number.isFinite(dueDay)) return null;

  const withClose = sorted.find((b) => Boolean(b.billClosingDate));
  if (withClose?.billClosingDate) {
    const closeIso = toBrtDate(withClose.billClosingDate);
    const closingDay = Number.parseInt(closeIso.slice(8, 10), 10);
    if (Number.isFinite(closingDay)) {
      return { closingDay, dueDay };
    }
  }

  const diffs: number[] = [];
  for (const b of sorted) {
    if (!b.billClosingDate) continue;
    const dueMs = Date.parse(`${toBrtDate(b.dueDate)}T00:00:00Z`);
    const closeMs = Date.parse(`${toBrtDate(b.billClosingDate)}T00:00:00Z`);
    const diffDays = Math.round((dueMs - closeMs) / 86400000);
    if (diffDays > 0 && diffDays < 31) diffs.push(diffDays);
  }
  diffs.sort((a, b) => a - b);
  const medianDiff = diffs.length > 0 ? diffs[Math.floor(diffs.length / 2)] : 7;
  let closingDay = dueDay - medianDiff;
  if (closingDay <= 0) closingDay += 30;
  closingDay = Math.max(1, Math.min(31, closingDay));
  return { closingDay, dueDay };
}

function parsePaymentsJson(raw: string | null | undefined): PluggyBillPayment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PluggyBillPayment[]) : [];
  } catch {
    return [];
  }
}

export function summarizeOpenFinanceBill(
  bill: FinBill,
  nextBill: FinBill | null,
  entries: FinEntry[],
  todayIso: string,
  options?: { firstSyncIso?: string | null }
): OpenFinanceBillSummary {
  const totalCents = bill.total_amount_cents;
  const chargeableNextCents = nextBill?.chargeable_charges_cents ?? 0;

  let itemsCents = 0;
  for (const e of entries) {
    if (e.account_id !== bill.account_id) continue;
    if (e.of_removed_at) continue;
    if (e.bill_month !== bill.bill_month) continue;
    if (e.kind === 'expense') {
      itemsCents += e.status === 'paid' ? e.paid_amount_cents ?? e.amount_cents : e.amount_cents;
    } else if (e.kind === 'income') {
      itemsCents -= e.status === 'paid' ? e.paid_amount_cents ?? e.amount_cents : e.amount_cents;
    }
  }

  let paidCents = 0;
  let paidSource: PaidSource = 'NONE';

  const nextPayments = parsePaymentsJson(nextBill?.payments_json);
  if (nextPayments.length > 0) {
    paidCents = nextPayments.reduce((sum, p) => sum + toCentsDecimal(p.amount), 0);
    paidSource = 'NEXT_BILL_PAYMENTS';
  } else if (!nextBill) {
    const samePayments = parsePaymentsJson(bill.payments_json).filter(
      (p) => !bill.closing_date || toBrtDate(p.paymentDate) >= bill.closing_date
    );
    if (samePayments.length > 0) {
      paidCents = samePayments.reduce((sum, p) => sum + toCentsDecimal(p.amount), 0);
      paidSource = 'SAME_BILL_PAYMENTS';
    }
  }

  if (paidSource === 'NONE') {
    const closingStart = bill.closing_date;
    const nextClosingEnd = nextBill?.closing_date ?? null;
    const appPayments = entries.filter((e) => {
      if (e.account_id !== bill.account_id) return false;
      if (e.of_removed_at) return false;
      if (e.kind !== 'transfer_in' || e.status !== 'paid') return false;
      if (e.of_class_reason === 'CARD_BILL_PAYMENT' && closingStart) {
        return e.due_date >= closingStart && (!nextClosingEnd || e.due_date < nextClosingEnd);
      }
      return e.bill_month === bill.bill_month;
    });
    if (appPayments.length > 0) {
      paidCents = appPayments.reduce(
        (sum, e) => sum + (e.paid_amount_cents ?? e.amount_cents),
        0
      );
      paidSource = 'APP_ENTRIES';
    }
  }

  const firstSyncDate = options?.firstSyncIso ? options.firstSyncIso.slice(0, 10) : null;
  let status: BillStatus = 'aberta';
  if (totalCents <= 0) {
    status = 'sem saldo';
  } else if (paidSource === 'NONE' && firstSyncDate && bill.due_date < firstSyncDate) {
    status = 'sem dados de pagamento';
  } else if (paidCents >= totalCents + chargeableNextCents) {
    status = 'paga';
  } else if (paidCents > 0 && paidCents < totalCents) {
    status = todayIso > bill.due_date ? 'atrasada' : 'parcial';
  } else if (todayIso > bill.due_date) {
    status = 'atrasada';
  } else if (bill.closing_date && todayIso >= bill.closing_date && todayIso <= bill.due_date) {
    status = 'fechada';
  }

  return {
    totalCents,
    itemsCents,
    itemsVsTotalDiffCents: itemsCents - totalCents,
    chargeableNextCents,
    paidCents,
    paidSource,
    status,
  };
}
