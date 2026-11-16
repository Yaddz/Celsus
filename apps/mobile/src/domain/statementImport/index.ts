import type { FinKind } from '../financeFlow';

export type StatementEncoding = 'utf-8' | 'latin1';

export interface OfxAccount {
  bankId?: string;
  acctId: string;
  acctType: 'checking' | 'card';
}

export interface OfxTransaction {
  fitid: string;
  dtPosted: string;
  trnamt: string;
  memo: string;
  name?: string;
  trnType?: string;
  accountId?: string;
}

export interface OfxParseResult {
  format: 'sgml' | 'xml';
  encoding: StatementEncoding;
  accounts: OfxAccount[];
  transactions: OfxTransaction[];
}

export type CsvProfileId =
  | 'nubank_card'
  | 'nubank_checking'
  | 'inter'
  | 'c6'
  | 'itau'
  | 'manual'
  | 'unknown';

export interface CsvColumnMapping {
  dateCol: number | string;
  descriptionCol: number | string;
  amountCol: number | string;
  invertSign?: boolean;
}

export interface CsvRawRow {
  date: string;
  description: string;
  amount: string;
  fitid?: string;
  installmentHint?: string;
  invertSign?: boolean;
}

export interface CsvParseResult {
  profile: CsvProfileId;
  delimiter: ',' | ';' | '\t';
  headers: string[];
  needsManualMapping: boolean;
  sampleRows: string[][];
  rows: CsvRawRow[];
}

export interface RawStatementRowInput {
  date: string;
  description: string;
  amount: string;
  fitid?: string;
  installmentHint?: string;
  invertSign?: boolean;
}

export interface NormalizeRowContext {
  accountId: string;
  occurrenceIndex?: number;
}

export interface NormalizedStatementRow {
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // positive integer
  direction: 'in' | 'out';
  externalId: string;
  installment?: {
    number: number;
    total: number;
  };
}

export type CategoryRuleMatchType = 'contains' | 'starts_with' | 'exact';

export interface CategoryRuleLike {
  id: string;
  match_type: CategoryRuleMatchType;
  pattern: string;
  kind: FinKind;
  category_id: string;
  hits: number;
}

export interface CategorizedStatementRow extends NormalizedStatementRow {
  categoryId: string;
  matchedRuleId?: string;
}

export type ReconcileStatus = 'new' | 'duplicate' | 'settle_pending';

export interface ReconcilableExistingEntry {
  id: string;
  account_id: string;
  external_id?: string | null;
  amount_cents: number;
  kind: string;
  status: string;
  due_date: string;
}

export interface ReconciledStatementRow extends CategorizedStatementRow {
  reconcileStatus: ReconcileStatus;
  matchedEntryId?: string;
}

export function decodeStatementBytes(_bytes: Uint8Array): {
  text: string;
  encoding: StatementEncoding;
} {
  throw new Error('Not implemented');
}

export function parseOfx(_input: string | Uint8Array): OfxParseResult {
  throw new Error('Not implemented');
}

export function parseCsv(
  _text: string,
  _manualMapping?: CsvColumnMapping
): CsvParseResult {
  throw new Error('Not implemented');
}

export function normalizeStatementRow(
  _raw: RawStatementRowInput,
  _context: NormalizeRowContext
): NormalizedStatementRow {
  throw new Error('Not implemented');
}

export function normalizeRulePattern(_text: string): string {
  throw new Error('Not implemented');
}

export function suggestRulePattern(_description: string): string {
  throw new Error('Not implemented');
}

export function applyCategoryRules<T extends NormalizedStatementRow>(
  _rows: T[],
  _rules: CategoryRuleLike[]
): Array<T & { categoryId: string; matchedRuleId?: string }> {
  throw new Error('Not implemented');
}

export function reconcileImportedRows<T extends CategorizedStatementRow>(
  _rows: T[],
  _existingEntries: ReconcilableExistingEntry[],
  _accountId: string
): Array<T & { reconcileStatus: ReconcileStatus; matchedEntryId?: string }> {
  throw new Error('Not implemented');
}
