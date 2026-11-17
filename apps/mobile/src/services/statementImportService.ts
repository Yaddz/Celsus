import { eq } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDatabase, runInTransaction } from '../db/client';
import { finCategoryRules, finEntries, type FinCategoryRule } from '../db/schema';
import { normalizeCardEntry, type FinKind } from '../domain/financeFlow';
import {
  applyCategoryRules,
  decodeStatementBytes,
  normalizeRulePattern,
  normalizeStatementRow,
  parseCsv,
  parseOfx,
  reconcileImportedRows,
  type CategoryRuleLike,
  type CategoryRuleMatchType,
  type CsvColumnMapping,
  type CsvParseResult,
  type NormalizedStatementRow,
  type OfxParseResult,
  type RawStatementRowInput,
  type ReconciledStatementRow,
} from '../domain/statementImport';
import { finRepository } from '../repositories/finRepository';

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
  async previewFile(params: {
    fileBytes?: Uint8Array;
    fileText?: string;
    fileName: string;
    accountId: string;
    manualMapping?: CsvColumnMapping;
  }): Promise<StatementPreviewResult> {
    const decodedText =
      params.fileText !== undefined
        ? params.fileText
        : params.fileBytes
          ? decodeStatementBytes(params.fileBytes).text
          : '';

    const isOfx =
      /\.ofx$/i.test(params.fileName) ||
      /<OFX>|OFXHEADER:/i.test(decodedText.slice(0, 512));

    let rawRows: RawStatementRowInput[] = [];
    let ofxMeta: OfxParseResult | undefined;
    let csvMeta: CsvParseResult | undefined;

    if (isOfx) {
      ofxMeta = parseOfx(params.fileBytes ?? decodedText);
      rawRows = ofxMeta.transactions.map((t) => ({
        date: t.dtPosted,
        description: t.memo || t.name || '',
        amount: t.trnamt,
        fitid: t.fitid,
      }));
    } else {
      csvMeta = parseCsv(decodedText, params.manualMapping);
      if (csvMeta.needsManualMapping) {
        return {
          fileName: params.fileName,
          fileType: 'csv',
          accountId: params.accountId,
          needsManualMapping: true,
          csvMeta,
          rows: [],
          counts: {
            total: 0,
            newCount: 0,
            duplicateCount: 0,
            settlePendingCount: 0,
          },
        };
      }
      rawRows = csvMeta.rows;
    }

    const occurrenceCounter = new Map<string, number>();
    const normalized: NormalizedStatementRow[] = rawRows.map((raw) => {
      const key = `${raw.date}|${raw.amount}|${raw.description.trim()}`;
      const occurrenceIndex = occurrenceCounter.get(key) ?? 0;
      occurrenceCounter.set(key, occurrenceIndex + 1);
      return normalizeStatementRow(raw, {
        accountId: params.accountId,
        occurrenceIndex,
      });
    });

    const rules = await this.listCategoryRules();
    const ruleLikes: CategoryRuleLike[] = rules.map((r) => ({
      id: r.id,
      match_type: r.match_type as CategoryRuleMatchType,
      pattern: r.pattern,
      kind: r.kind as FinKind,
      category_id: r.category_id,
      hits: r.hits,
    }));

    const categorized = applyCategoryRules(normalized, ruleLikes);
    const existingEntries = await finRepository.listAllEntries();
    const reconciled = reconcileImportedRows(
      categorized,
      existingEntries,
      params.accountId
    );

    let newCount = 0;
    let duplicateCount = 0;
    let settlePendingCount = 0;
    for (const r of reconciled) {
      if (r.reconcileStatus === 'new') newCount++;
      else if (r.reconcileStatus === 'duplicate') duplicateCount++;
      else if (r.reconcileStatus === 'settle_pending') settlePendingCount++;
    }

    return {
      fileName: params.fileName,
      fileType: isOfx ? 'ofx' : 'csv',
      accountId: params.accountId,
      needsManualMapping: false,
      csvMeta,
      ofxMeta,
      rows: reconciled,
      counts: {
        total: reconciled.length,
        newCount,
        duplicateCount,
        settlePendingCount,
      },
    };
  }

  async commitImport(params: {
    accountId: string;
    rows: ReconciledStatementRow[];
  }): Promise<StatementCommitResult> {
    const batchId = Crypto.randomUUID();
    const account = await finRepository.getAccountById(params.accountId);
    const isCard = account?.type === 'card';
    const closingDay = account?.closing_day ?? 1;

    let createdCount = 0;
    let settledCount = 0;
    let skippedDuplicateCount = 0;
    const ruleHitCounts = new Map<string, number>();

    await runInTransaction(async () => {
      const entriesToCreate: Array<Record<string, any>> = [];

      for (const row of params.rows) {
        if (row.reconcileStatus === 'duplicate') {
          skippedDuplicateCount++;
          continue;
        }

        if (row.matchedRuleId) {
          ruleHitCounts.set(
            row.matchedRuleId,
            (ruleHitCounts.get(row.matchedRuleId) ?? 0) + 1
          );
        }

        if (row.reconcileStatus === 'settle_pending' && row.matchedEntryId) {
          await finRepository.updateEntry(row.matchedEntryId, {
            status: 'paid',
            paid_date: row.date,
            paid_amount_cents: row.amountCents,
            external_id: row.externalId,
            import_batch_id: batchId,
          });
          settledCount++;
          continue;
        }

        const kind: FinKind = row.direction === 'in' ? 'income' : 'expense';
        const normalized = normalizeCardEntry(
          {
            kind,
            dueDate: row.date,
            amountCents: row.amountCents,
            status: 'paid',
            paidDate: row.date,
            paidAmountCents: row.amountCents,
          },
          account
        );

        entriesToCreate.push({
          kind,
          amount_cents: row.amountCents,
          due_date: normalized.due_date,
          paid_date: normalized.paid_date,
          paid_amount_cents: normalized.paid_amount_cents,
          status: normalized.status,
          account_id: params.accountId,
          category_id: row.categoryId,
          description: row.description,
          installment_number: row.installment?.number ?? null,
          installment_total: row.installment?.total ?? null,
          bill_month: normalized.bill_month,
          source: 'FILE_IMPORT',
          external_id: row.externalId,
          import_batch_id: batchId,
        });
        createdCount++;
      }

      if (entriesToCreate.length > 0) {
        await finRepository.createEntriesBatch(entriesToCreate);
      }

      const db = getDatabase();
      if (db && ruleHitCounts.size > 0) {
        const existingRules = await db.select().from(finCategoryRules);
        for (const [ruleId, delta] of ruleHitCounts.entries()) {
          const found = existingRules.find((r) => r.id === ruleId);
          if (found) {
            await db
              .update(finCategoryRules)
              .set({ hits: (found.hits ?? 0) + delta })
              .where(eq(finCategoryRules.id, ruleId));
          }
        }
      }
    });

    return {
      batchId,
      createdCount,
      settledCount,
      skippedDuplicateCount,
    };
  }

  async undoImportBatch(batchId: string): Promise<UndoImportResult> {
    let deletedCount = 0;
    let revertedSettledCount = 0;

    await runInTransaction(async () => {
      const db = getDatabase();
      const all = await finRepository.listAllEntries();
      const batchEntries = all.filter((e) => e.import_batch_id === batchId);

      for (const entry of batchEntries) {
        if (entry.source === 'FILE_IMPORT') {
          if (db) {
            await db.delete(finEntries).where(eq(finEntries.id, entry.id));
          }
          deletedCount++;
        } else {
          await finRepository.updateEntry(entry.id, {
            status: 'pending',
            paid_date: null,
            paid_amount_cents: null,
            external_id: null,
            import_batch_id: null,
          });
          revertedSettledCount++;
        }
      }
    });

    return {
      batchId,
      deletedCount,
      revertedSettledCount,
    };
  }

  async saveCategoryRule(params: {
    pattern: string;
    matchType: CategoryRuleMatchType;
    kind: FinKind;
    categoryId: string;
  }): Promise<FinCategoryRule> {
    const db = getDatabase();
    const record: FinCategoryRule = {
      id: Crypto.randomUUID(),
      match_type: params.matchType,
      pattern: normalizeRulePattern(params.pattern),
      kind: params.kind,
      category_id: params.categoryId,
      created_at: new Date().toISOString(),
      hits: 0,
    };
    await db.insert(finCategoryRules).values(record);
    return record;
  }

  async listCategoryRules(): Promise<FinCategoryRule[]> {
    const db = getDatabase();
    if (!db) return [];
    const rows = await db.select().from(finCategoryRules);
    return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async updateCategoryRule(
    id: string,
    patch: Partial<{
      pattern: string;
      match_type: CategoryRuleMatchType;
      kind: FinKind;
      category_id: string;
    }>
  ): Promise<void> {
    const db = getDatabase();
    if (!db) return;
    const normalizedPatch: Record<string, any> = { ...patch };
    if (patch.pattern !== undefined) {
      normalizedPatch.pattern = normalizeRulePattern(patch.pattern);
    }
    await db
      .update(finCategoryRules)
      .set(normalizedPatch)
      .where(eq(finCategoryRules.id, id));
  }

  async deleteCategoryRule(id: string): Promise<void> {
    const db = getDatabase();
    if (!db) return;
    await db.delete(finCategoryRules).where(eq(finCategoryRules.id, id));
  }
}

export const statementImportService = new StatementImportService();
