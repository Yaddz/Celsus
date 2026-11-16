import type { PluggyAccount, PluggyBill, PluggyTransaction } from '../../services/pluggy/types';
import type { FinEntryStatus, FinKind } from '../financeFlow';
import type { CategoryRuleLike } from '../statementImport';

export interface MappedPluggyAccount {
  ofAccountId: string;
  name: string;
  type: 'checking' | 'card';
  source: 'OPEN_FINANCE';
  reportedBalanceCents: number;
  reportedBalanceAt: string;
  creditLimitCents: number | null;
  dueDay: number | null;
  closingDay: number | null;
  needsClosingDay: boolean;
}

export interface MappedPluggyTransaction {
  externalId: string;
  source: 'OPEN_FINANCE';
  accountId: string;
  kind: FinKind;
  status: FinEntryStatus;
  amountCents: number;
  dueDate: string;
  paidDate: string | null;
  paidAmountCents: number | null;
  description: string;
  descriptionRaw: string | null;
  categoryId: string;
  matchedRuleId?: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  billId: string | null;
  billMonth: string | null;
}

export interface MapPluggyTransactionOptions {
  accountId: string;
  accountType: 'checking' | 'card';
  closingDay?: number | null;
  bills?: PluggyBill[];
  rules?: CategoryRuleLike[];
}

export interface ReconcilableOpenFinanceEntry {
  id: string;
  account_id: string;
  external_id?: string | null;
  amount_cents: number;
  kind: string;
  status: string;
  due_date: string;
  category_id: string;
  description: string;
  user_edited_fields?: string | null;
  recurrence_id?: string | null;
  variable_amount?: number | null;
  transfer_group_id?: string | null;
}

export type OpenFinanceReconcileAction = 'create' | 'update' | 'settle_pending';

export interface ReconciledPluggyTransaction extends MappedPluggyTransaction {
  action: OpenFinanceReconcileAction;
  matchedEntryId?: string;
  transferGroupId?: string;
  transferPairExternalId?: string;
  transferRole?: 'transfer_out' | 'transfer_in';
}

export interface TransferPairMatch {
  outExternalId: string;
  inExternalId: string;
  transferGroupId: string;
  isBillPayment: boolean;
}

export interface ReconcilePluggyResult {
  transactions: ReconciledPluggyTransaction[];
  transferPairs: TransferPairMatch[];
}

export interface ReconcilePluggyOptions {
  accountTypesById?: Record<string, 'checking' | 'card'>;
}

export function toCentsDecimal(_value: number | string): number {
  throw new Error('Not implemented: toCentsDecimal');
}

export function mapPluggyAccount(_account: PluggyAccount): MappedPluggyAccount {
  throw new Error('Not implemented: mapPluggyAccount');
}

export function mapPluggyCategory(
  _pluggyCategory: string | null | undefined,
  _kind: 'income' | 'expense',
  _rules: CategoryRuleLike[],
  _description: string
): { categoryId: string; matchedRuleId?: string } {
  throw new Error('Not implemented: mapPluggyCategory');
}

export function mapPluggyTransaction(
  _tx: PluggyTransaction,
  _options: MapPluggyTransactionOptions
): MappedPluggyTransaction {
  throw new Error('Not implemented: mapPluggyTransaction');
}

export function reconcilePluggyTransactions(
  _mapped: MappedPluggyTransaction[],
  _existingEntries: ReconcilableOpenFinanceEntry[],
  _options?: ReconcilePluggyOptions
): ReconcilePluggyResult {
  throw new Error('Not implemented: reconcilePluggyTransactions');
}

export function parseUserEditedFields(_raw: string | null | undefined): string[] {
  throw new Error('Not implemented: parseUserEditedFields');
}

export function mergeUserEditedFields(
  _existingRaw: string | null | undefined,
  _editedFields: string[]
): string {
  throw new Error('Not implemented: mergeUserEditedFields');
}

export function applyUserEditedPreservation(
  _existing: { category_id: string; description: string; user_edited_fields?: string | null },
  _incoming: { category_id: string; description: string }
): { category_id: string; description: string } {
  throw new Error('Not implemented: applyUserEditedPreservation');
}

export function computeSyncWindowStart(
  _lastSuccessIso: string | null,
  _nowIso: string
): string {
  throw new Error('Not implemented: computeSyncWindowStart');
}

export function shouldAutoSync(
  _lastSyncIso: string | null,
  _nowMs: number,
  _thresholdHours?: number
): boolean {
  throw new Error('Not implemented: shouldAutoSync');
}

export function computeBalanceDivergence(
  _reportedCents: number | null | undefined,
  _calculatedCents: number
): { hasDivergence: boolean; diffCents: number } {
  throw new Error('Not implemented: computeBalanceDivergence');
}

export function formatReportedBalanceDate(_isoDate: string): string {
  throw new Error('Not implemented: formatReportedBalanceDate');
}

export function formatUpdatedAgo(_lastSyncIso: string | null, _nowMs: number): string {
  throw new Error('Not implemented: formatUpdatedAgo');
}
