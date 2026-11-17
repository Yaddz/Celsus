import type { FinBill, FinEntry } from '../../db/schema';
import type { PluggyBill, PluggyTransaction } from '../../services/pluggy/types';
import type { BillStatus } from '../financeFlow/cards';

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

export function inferForecastOffset(
  _transactions: PluggyTransaction[],
  _bills: PluggyBill[]
): number {
  throw new Error('NOT_IMPLEMENTED');
}

export function assignBillMonth(
  _tx: PluggyTransaction,
  _ctx: AssignBillMonthContext
): AssignBillMonthResult {
  throw new Error('NOT_IMPLEMENTED');
}

export function assignPaymentBillMonth(
  _paymentDateIso: string,
  _bills: Array<{ bill_month: string; closing_date: string | null; due_date: string }>
): string | null {
  throw new Error('NOT_IMPLEMENTED');
}

export function deriveCardCalendar(_bills: PluggyBill[]): DerivedCardCalendar | null {
  throw new Error('NOT_IMPLEMENTED');
}

export function summarizeOpenFinanceBill(
  _bill: FinBill,
  _nextBill: FinBill | null,
  _entries: FinEntry[],
  _todayIso: string,
  _options?: { firstSyncIso?: string | null }
): OpenFinanceBillSummary {
  throw new Error('NOT_IMPLEMENTED');
}
