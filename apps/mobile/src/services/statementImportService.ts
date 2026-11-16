import type {
  CsvColumnMapping,
  CsvParseResult,
  OfxParseResult,
  ReconciledStatementRow,
} from '../domain/statementImport';
import type { FinKind } from '../domain/financeFlow';

export interface StatementPreviewResult {
  fileName: string;
  fileType: 'ofx' | 'csv';
  accountId: string;
  needsManualMapping: boolean;
  csvMeta?: CsvParseResult;
  ofxMeta?: OfxParseResult;
  rows: ReconciledStatementRow[];
  counts: {
    total: number;
    newCount: number;
    duplicateCount: number;
    settlePendingCount: number;
  };
}

export interface StatementCommitResult {
  batchId: string;
  createdCount: number;
  settledCount: number;
  skippedDuplicateCount: number;
}

export interface UndoImportResult {
  batchId: string;
  deletedCount: number;
  revertedSettledCount: number;
}

export class StatementImportService {
  async previewFile(_params: {
    fileBytes?: Uint8Array;
    fileText?: string;
    fileName: string;
    accountId: string;
    manualMapping?: CsvColumnMapping;
  }): Promise<StatementPreviewResult> {
    throw new Error('Not implemented');
  }

  async commitImport(_params: {
    accountId: string;
    rows: ReconciledStatementRow[];
  }): Promise<StatementCommitResult> {
    throw new Error('Not implemented');
  }

  async undoImportBatch(_batchId: string): Promise<UndoImportResult> {
    throw new Error('Not implemented');
  }

  async saveCategoryRule(_params: {
    pattern: string;
    matchType: 'contains' | 'starts_with' | 'exact';
    kind: FinKind;
    categoryId: string;
  }): Promise<any> {
    throw new Error('Not implemented');
  }

  async listCategoryRules(): Promise<any[]> {
    throw new Error('Not implemented');
  }

  async updateCategoryRule(
    _id: string,
    _patch: Partial<{
      pattern: string;
      match_type: 'contains' | 'starts_with' | 'exact';
      kind: FinKind;
      category_id: string;
    }>
  ): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteCategoryRule(_id: string): Promise<void> {
    throw new Error('Not implemented');
  }
}

export const statementImportService = new StatementImportService();
