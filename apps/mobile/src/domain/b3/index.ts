import Decimal from 'decimal.js';

export {
  B3ParsingError,
  EmptyFileError,
  UnrecognizedFormatError,
  MissingColumnError,
  UnsupportedStatementError,
} from '../../services/b3/readStatementFile';

export interface ParsedStatementRow {
  rowNo: number;
  entryExit: 'CREDIT' | 'DEBIT';
  rawDate: string;
  tradeDate: string;
  rawMovement: string;
  rawProduct: string;
  ticker: string;
  productName: string;
  institution: string;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
}

export type MovementKind = 'BUY' | 'SELL' | 'INCOME' | 'IGNORE' | 'REVIEW';

export interface MovementClassification {
  kind: MovementKind;
  reason: string;
}

export function parseStatementRows(rawRows: Array<Record<string, string>>): ParsedStatementRow[] {
  throw new Error('Not implemented');
}

export function classifyMovement(row: ParsedStatementRow): MovementClassification {
  throw new Error('Not implemented');
}

export function normalizeTicker(ticker: string): string {
  throw new Error('Not implemented');
}

export function inferAssetClass(params: {
  ticker: string;
  productName?: string;
  catalog?: any[];
  existingClass?: string;
}): { class: 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO'; confidence: 'sure' | 'guess' | 'unknown' } {
  throw new Error('Not implemented');
}

export function reconcileOpeningBalances(rows: ParsedStatementRow[]): Array<{
  ticker: string;
  missingQuantity: string;
  asOfDate: string;
  firstRowDate?: string;
}> {
  throw new Error('Not implemented');
}

export function buildImportPlan(params: {
  rows: Array<Record<string, string>>;
  existingExternalIds?: Set<string>;
  existingAssets?: any[];
  catalog?: any[];
}): any {
  throw new Error('Not implemented');
}
