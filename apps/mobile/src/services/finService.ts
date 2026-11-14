import type { FinEntry, FinRecurrence } from '../db/schema';
import {
  addMonthsYearMonth,
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

  async generateRecurrenceWindow(_windowStart: string, _windowEnd: string): Promise<FinEntry[]> {
    return [];
  }

  async pauseSubscription(_recurrenceId: string): Promise<FinRecurrence> {
    throw new Error('Not implemented: pauseSubscription');
  }

  async resumeSubscription(_recurrenceId: string): Promise<FinRecurrence> {
    throw new Error('Not implemented: resumeSubscription');
  }

  async cancelSubscription(_recurrenceId: string, _cancelDateIso?: string): Promise<FinRecurrence> {
    throw new Error('Not implemented: cancelSubscription');
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
