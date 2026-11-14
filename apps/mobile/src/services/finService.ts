import type { FinEntry, FinRecurrence } from '../db/schema';
import {
  addMonthsYearMonth,
  generateRecurrenceOccurrences,
  getMonthDateRange,
  getTodayIsoLocal,
  type FinKind,
  type InstallmentScope,
} from '../domain/financeFlow';
import { finRepository } from '../repositories/finRepository';

export class FinService {
  async initializeFinanceModule(referenceDateIso?: string): Promise<void> {
    await finRepository.seedDefaultCategoriesIfNeeded();
    const refIso = referenceDateIso ?? getTodayIsoLocal();
    const refMonth = refIso.slice(0, 7);
    const startMonth = addMonthsYearMonth(refMonth, -1);
    const endMonth = addMonthsYearMonth(refMonth, 2);
    const windowStart = getMonthDateRange(startMonth).start;
    const windowEnd = getMonthDateRange(endMonth).end;
    await this.generateRecurrenceWindow(windowStart, windowEnd);
  }

  async markEntryAsPaid(
    entryId: string,
    options?: { paidDate?: string; paidAmountCents?: number }
  ): Promise<FinEntry> {
    const entry = await finRepository.getEntryById(entryId);
    if (!entry) {
      throw new Error(`Lançamento não encontrado: ${entryId}`);
    }
    const paidDate = options?.paidDate ?? getTodayIsoLocal();
    const paidAmountCents =
      options?.paidAmountCents !== undefined
        ? Math.round(options.paidAmountCents)
        : entry.amount_cents;

    return finRepository.updateEntry(entryId, {
      status: 'paid',
      paid_date: paidDate,
      paid_amount_cents: paidAmountCents,
    });
  }

  async markEntryAsPending(entryId: string): Promise<FinEntry> {
    const entry = await finRepository.getEntryById(entryId);
    if (!entry) {
      throw new Error(`Lançamento não encontrado: ${entryId}`);
    }
    return finRepository.updateEntry(entryId, {
      status: 'pending',
      paid_date: null,
      paid_amount_cents: null,
    });
  }

  async generateRecurrenceWindow(windowStart: string, windowEnd: string): Promise<FinEntry[]> {
    const recurrences = await finRepository.listRecurrences({ onlyActive: true });
    const createdAll: FinEntry[] = [];

    for (const rec of recurrences) {
      const existing = await finRepository.listEntriesByRecurrence(rec.id);
      const { occurrences, generatedUntil } = generateRecurrenceOccurrences(
        rec,
        windowStart,
        windowEnd,
        existing
      );

      if (occurrences.length > 0) {
        const inserted = await finRepository.createEntriesBatch(
          occurrences.map((occ) => ({
            kind: occ.kind,
            amount_cents: occ.amountCents,
            due_date: occ.dueDate,
            paid_date: null,
            paid_amount_cents: null,
            status: 'pending',
            account_id: occ.accountId,
            category_id: occ.categoryId,
            description: occ.description,
            recurrence_id: rec.id,
            installment_group_id: null,
            installment_number: null,
            installment_total: null,
          }))
        );
        createdAll.push(...inserted);
      }

      if (generatedUntil && generatedUntil !== rec.generated_until) {
        await finRepository.updateRecurrence(rec.id, { generated_until: generatedUntil });
      }
    }

    return createdAll;
  }

  async pauseSubscription(recurrenceId: string): Promise<FinRecurrence> {
    return finRepository.updateRecurrence(recurrenceId, { active: 0 });
  }

  async resumeSubscription(recurrenceId: string): Promise<FinRecurrence> {
    return finRepository.updateRecurrence(recurrenceId, { active: 1 });
  }

  async cancelSubscription(recurrenceId: string, cancelDateIso?: string): Promise<FinRecurrence> {
    const effectiveCancelDate = cancelDateIso ?? getTodayIsoLocal();
    const updated = await finRepository.updateRecurrence(recurrenceId, {
      active: 0,
      end_date: effectiveCancelDate,
    });
    const entries = await finRepository.listEntriesByRecurrence(recurrenceId);
    for (const entry of entries) {
      if (entry.status === 'pending' && entry.due_date >= effectiveCancelDate) {
        await finRepository.deleteEntry(entry.id);
      }
    }
    return updated;
  }

  async createInstallmentPurchase(_params: {
    kind?: FinKind;
    totalAmountCents: number;
    installmentTotal: number;
    firstDueDate: string;
    accountId: string;
    categoryId: string;
    description: string;
    remainderOn?: 'first' | 'last';
  }): Promise<FinEntry[]> {
    return [];
  }

  async updateInstallmentEntries(
    _entryId: string,
    _scope: InstallmentScope,
    _patch: Partial<Pick<FinEntry, 'amount_cents' | 'description' | 'category_id' | 'account_id' | 'due_date'>>
  ): Promise<void> {
    throw new Error('Not implemented: updateInstallmentEntries');
  }

  async deleteInstallmentEntries(_entryId: string, _scope: InstallmentScope): Promise<void> {
    throw new Error('Not implemented: deleteInstallmentEntries');
  }
}

export const finService = new FinService();
