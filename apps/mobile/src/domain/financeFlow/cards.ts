import type { FinAccount, FinEntry } from '../../db/schema';

export type BillStatus = 'aberta' | 'fechada' | 'paga' | 'atrasada';

export interface BillSummary {
  billMonth: string;
  totalCents: number;
  paidCents: number;
  openCents: number;
  status: BillStatus;
}

export function resolveBillMonth(_purchaseIso: string, _closingDay: number): string {
  throw new Error('Not implemented: resolveBillMonth');
}

export function billDueDate(_billMonth: string, _dueDay: number): string {
  throw new Error('Not implemented: billDueDate');
}

export function summarizeBill(
  _entries: FinEntry[],
  _billMonth: string,
  _options?: { dueDate?: string; todayIso?: string; closingDay?: number }
): BillSummary {
  throw new Error('Not implemented: summarizeBill');
}

export function availableLimit(
  _limitCents: number | null | undefined,
  _openBillsTotalCents: number
): number | null {
  throw new Error('Not implemented: availableLimit');
}

export interface CardBillDueItem {
  account: FinAccount;
  billMonth: string;
  dueDate: string;
  openCents: number;
  status: BillStatus;
}
