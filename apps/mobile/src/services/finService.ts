import type { FinEntry, FinRecurrence } from '../db/schema';
import type { FinKind, InstallmentScope } from '../domain/financeFlow';

export class FinService {
  async initializeFinanceModule(_referenceDateIso?: string): Promise<void> {
    return;
  }

  async markEntryAsPaid(
    _entryId: string,
    _options?: { paidDate?: string; paidAmountCents?: number }
  ): Promise<FinEntry> {
    throw new Error('Not implemented: markEntryAsPaid');
  }

  async markEntryAsPending(_entryId: string): Promise<FinEntry> {
    throw new Error('Not implemented: markEntryAsPending');
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
