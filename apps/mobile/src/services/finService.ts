import * as Crypto from 'expo-crypto';
import { runInTransaction } from '../db/client';
import type { FinEntry, FinRecurrence } from '../db/schema';
import {
  addDaysIso,
  addMonthsYearMonth,
  buildInstallmentSchedule,
  clampDayOfMonth,
  formatIsoDate,
  generateRecurrenceOccurrences,
  getMonthDateRange,
  getTodayIsoLocal,
  parseIsoDate,
  resolveRecurrencePeriod,
  type FinKind,
  type InstallmentScope,
} from '../domain/financeFlow';
import { finRepository } from '../repositories/finRepository';

const MAX_RECURRENCE_MONTHS_AHEAD = 24;

export class FinService {
  async initializeFinanceModule(referenceDateIso?: string): Promise<void> {
    await finRepository.seedDefaultCategoriesIfNeeded();
    await this.migrateOrphanRecordsIfNeeded();
    const refIso = referenceDateIso ?? getTodayIsoLocal();
    const refMonth = refIso.slice(0, 7);
    const startMonth = addMonthsYearMonth(refMonth, -1);
    const endMonth = addMonthsYearMonth(refMonth, 2);
    const windowStart = getMonthDateRange(startMonth).start;
    const windowEnd = getMonthDateRange(endMonth).end;
    await this.generateRecurrenceWindow(windowStart, windowEnd);
  }

  async migrateOrphanRecordsIfNeeded(): Promise<void> {
    const [accounts, categories, entries, recurrences] = await Promise.all([
      finRepository.listAccounts(true),
      finRepository.listCategories(true),
      finRepository.listAllEntries(),
      finRepository.listRecurrences(),
    ]);
    const validAccountIds = new Set(accounts.map((a) => a.id));
    const validCategoryIds = new Set(categories.map((c) => c.id));

    const orphanEntries = entries.filter(
      (e) => e.account_id === 'default-account' || !validAccountIds.has(e.account_id)
    );
    const orphanRecurrences = recurrences.filter(
      (r) => r.account_id === 'default-account' || !validAccountIds.has(r.account_id)
    );

    let fallbackAccountId: string | null =
      accounts.find((a) => a.name === 'Sem conta')?.id ?? null;

    if ((orphanEntries.length > 0 || orphanRecurrences.length > 0) && !fallbackAccountId) {
      const created = await finRepository.createAccount({
        name: 'Sem conta',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#8A8A8E',
      });
      fallbackAccountId = created.id;
    }

    if (fallbackAccountId) {
      for (const entry of orphanEntries) {
        await finRepository.updateEntry(entry.id, { account_id: fallbackAccountId });
      }
      for (const rec of orphanRecurrences) {
        await finRepository.updateRecurrence(rec.id, { account_id: fallbackAccountId });
      }
    }

    for (const entry of entries) {
      if (!validCategoryIds.has(entry.category_id)) {
        const fallbackCat = entry.kind === 'income' ? 'cat-outros-receita' : 'cat-outros-despesa';
        if (validCategoryIds.has(fallbackCat)) {
          await finRepository.updateEntry(entry.id, { category_id: fallbackCat });
        }
      }
    }
    for (const rec of recurrences) {
      if (!validCategoryIds.has(rec.category_id)) {
        const fallbackCat = rec.kind === 'income' ? 'cat-outros-receita' : 'cat-outros-despesa';
        if (validCategoryIds.has(fallbackCat)) {
          await finRepository.updateRecurrence(rec.id, { category_id: fallbackCat });
        }
      }
    }
  }

  async ensureMonthGenerated(yearMonth: string, referenceDateIso?: string): Promise<void> {
    const todayIso = referenceDateIso ?? getTodayIsoLocal();
    const todayMonth = todayIso.slice(0, 7);
    const maxMonth = addMonthsYearMonth(todayMonth, MAX_RECURRENCE_MONTHS_AHEAD);
    const targetMonth = yearMonth > maxMonth ? maxMonth : yearMonth;
    if (targetMonth < todayMonth) return;
    const windowStart = getMonthDateRange(todayMonth).start;
    const windowEnd = getMonthDateRange(targetMonth).end;
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
    return runInTransaction(async () => {
      const [recurrences, allRecEntries, allSkips] = await Promise.all([
        finRepository.listRecurrences({ onlyActive: true }),
        finRepository.listEntriesWithRecurrence(),
        finRepository.listAllRecurrenceSkips(),
      ]);

      const entriesByRec = new Map<string, FinEntry[]>();
      for (const entry of allRecEntries) {
        if (!entry.recurrence_id) continue;
        const list = entriesByRec.get(entry.recurrence_id);
        if (list) list.push(entry);
        else entriesByRec.set(entry.recurrence_id, [entry]);
      }

      const skipsByRec = new Map<string, Set<string>>();
      for (const skip of allSkips) {
        let set = skipsByRec.get(skip.recurrence_id);
        if (!set) {
          set = new Set<string>();
          skipsByRec.set(skip.recurrence_id, set);
        }
        set.add(skip.period);
      }

      const createdAll: FinEntry[] = [];
      const toInsert: Array<Parameters<typeof finRepository.createEntriesBatch>[0][number]> = [];
      const recUpdates: Array<{ id: string; generatedUntil: string }> = [];

      for (const rec of recurrences) {
        const existing = entriesByRec.get(rec.id) ?? [];
        const skipped = skipsByRec.get(rec.id) ?? new Set<string>();
        const { occurrences, generatedUntil } = generateRecurrenceOccurrences(
          rec,
          windowStart,
          windowEnd,
          existing,
          skipped
        );

        for (const occ of occurrences) {
          toInsert.push({
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
            recurrence_period: occ.recurrencePeriod ?? resolveRecurrencePeriod(rec.frequency, occ.dueDate),
            installment_group_id: null,
            installment_number: null,
            installment_total: null,
          });
        }

        if (generatedUntil && generatedUntil !== rec.generated_until) {
          recUpdates.push({ id: rec.id, generatedUntil });
        }
      }

      if (toInsert.length > 0) {
        const inserted = await finRepository.createEntriesBatch(toInsert);
        createdAll.push(...inserted);
      }

      for (const upd of recUpdates) {
        await finRepository.updateRecurrence(upd.id, { generated_until: upd.generatedUntil });
      }

      return createdAll;
    });
  }

  async pauseSubscription(recurrenceId: string, referenceDateIso?: string): Promise<FinRecurrence> {
    const todayIso = referenceDateIso ?? getTodayIsoLocal();
    return runInTransaction(async () => {
      const updated = await finRepository.updateRecurrence(recurrenceId, { active: 0 });
      const entries = await finRepository.listEntriesByRecurrence(recurrenceId);
      for (const entry of entries) {
        if (entry.status === 'pending' && entry.due_date >= todayIso) {
          await finRepository.deleteEntry(entry.id);
        }
      }
      return updated;
    });
  }

  async resumeSubscription(recurrenceId: string, referenceDateIso?: string): Promise<FinRecurrence> {
    const todayIso = referenceDateIso ?? getTodayIsoLocal();
    return runInTransaction(async () => {
      const updated = await finRepository.updateRecurrence(recurrenceId, {
        active: 1,
        generated_until: null,
      });
      const endMonth = addMonthsYearMonth(todayIso.slice(0, 7), 2);
      const windowEnd = getMonthDateRange(endMonth).end;
      await this.generateRecurrenceWindow(todayIso, windowEnd);
      return updated;
    });
  }

  async cancelSubscription(recurrenceId: string, cancelDateIso?: string): Promise<FinRecurrence> {
    const effectiveCancelDate = cancelDateIso ?? getTodayIsoLocal();
    return runInTransaction(async () => {
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
    });
  }

  async createInstallmentPurchase(params: {
    kind?: FinKind;
    totalAmountCents: number;
    installmentTotal: number;
    firstDueDate: string;
    accountId: string;
    categoryId: string;
    description: string;
    remainderOn?: 'first' | 'last';
  }): Promise<FinEntry[]> {
    const groupId = `inst-${Crypto.randomUUID()}`;
    const schedule = buildInstallmentSchedule({
      totalCents: params.totalAmountCents,
      installmentTotal: params.installmentTotal,
      firstDueDate: params.firstDueDate,
      remainderOn: params.remainderOn ?? 'first',
    });

    return runInTransaction(async () =>
      finRepository.createEntriesBatch(
        schedule.map((part) => ({
          kind: params.kind ?? 'expense',
          amount_cents: part.amountCents,
          due_date: part.dueDate,
          paid_date: null,
          paid_amount_cents: null,
          status: 'pending',
          account_id: params.accountId,
          category_id: params.categoryId,
          description: params.description,
          recurrence_id: null,
          recurrence_period: null,
          installment_group_id: groupId,
          installment_number: part.installmentNumber,
          installment_total: part.installmentTotal,
        }))
      )
    );
  }

  async updateInstallmentEntries(
    entryId: string,
    scope: InstallmentScope,
    patch: Partial<Pick<FinEntry, 'amount_cents' | 'description' | 'category_id' | 'account_id' | 'due_date'>>
  ): Promise<void> {
    return runInTransaction(async () => {
      const target = await finRepository.getEntryById(entryId);
      if (!target) {
        throw new Error(`Parcela não encontrada: ${entryId}`);
      }
      if (!target.installment_group_id || scope === 'only_this') {
        await finRepository.updateEntry(entryId, patch);
        return;
      }

      const group = await finRepository.listEntriesByInstallmentGroup(target.installment_group_id);
      const anchorNum = target.installment_number ?? 0;
      const targets =
        scope === 'this_and_next'
          ? group.filter((item) => (item.installment_number ?? 0) >= anchorNum)
          : group;

      for (const item of targets) {
        await finRepository.updateEntry(item.id, patch);
      }
    });
  }

  async deleteRecurrenceOccurrence(entryId: string, scope: InstallmentScope = 'only_this'): Promise<void> {
    return runInTransaction(async () => {
      const target = await finRepository.getEntryById(entryId);
      if (!target) return;

      if (!target.recurrence_id || scope === 'only_this') {
        if (target.recurrence_id) {
          const rec = await finRepository.getRecurrenceById(target.recurrence_id);
          const period =
            target.recurrence_period ??
            resolveRecurrencePeriod(rec?.frequency ?? 'monthly', target.due_date);
          await finRepository.addRecurrenceSkip(target.recurrence_id, period);
        }
        await finRepository.deleteEntry(entryId);
        return;
      }

      const all = await finRepository.listEntriesByRecurrence(target.recurrence_id);
      if (scope === 'this_and_next') {
        for (const item of all) {
          if (item.status === 'pending' && item.due_date >= target.due_date) {
            await finRepository.deleteEntry(item.id);
          }
        }
        await finRepository.updateRecurrence(target.recurrence_id, {
          active: 0,
          end_date: addDaysIso(target.due_date, -1),
        });
        return;
      }

      for (const item of all) {
        if (item.status === 'pending') {
          await finRepository.deleteEntry(item.id);
        }
      }
      await finRepository.updateRecurrence(target.recurrence_id, { active: 0 });
    });
  }

  async updateRecurrence(
    recurrenceId: string,
    patch: Partial<Omit<FinRecurrence, 'id' | 'created_at'>>,
    referenceDateIso?: string
  ): Promise<FinRecurrence> {
    const todayIso = referenceDateIso ?? getTodayIsoLocal();
    return runInTransaction(async () => {
      const updated = await finRepository.updateRecurrence(recurrenceId, patch);
      const entries = await finRepository.listEntriesByRecurrence(recurrenceId);

      for (const entry of entries) {
        if (entry.status !== 'pending' || entry.due_date < todayIso) continue;

        const entryPatch: Partial<Omit<FinEntry, 'id' | 'created_at'>> = {};
        if (patch.kind !== undefined) entryPatch.kind = patch.kind;
        if (patch.amount_cents !== undefined) entryPatch.amount_cents = patch.amount_cents;
        if (patch.description !== undefined) entryPatch.description = patch.description;
        if (patch.account_id !== undefined) entryPatch.account_id = patch.account_id;
        if (patch.category_id !== undefined) entryPatch.category_id = patch.category_id;

        if (patch.day_of_month !== undefined && updated.frequency !== 'weekly') {
          const period = entry.recurrence_period ?? entry.due_date.slice(0, 7);
          const { year, month } = parseIsoDate(`${period.slice(0, 7)}-01`);
          const newDay = clampDayOfMonth(year, month, updated.day_of_month);
          entryPatch.due_date = formatIsoDate(year, month, newDay);
          entryPatch.recurrence_period = period.slice(0, 7);
        }

        if (Object.keys(entryPatch).length > 0) {
          await finRepository.updateEntry(entry.id, entryPatch);
        }
      }

      return updated;
    });
  }

  async deleteInstallmentEntries(entryId: string, scope: InstallmentScope): Promise<void> {
    return runInTransaction(async () => {
      const target = await finRepository.getEntryById(entryId);
      if (!target) return;

      if (!target.installment_group_id || scope === 'only_this') {
        await finRepository.deleteEntry(entryId);
        return;
      }

      const group = await finRepository.listEntriesByInstallmentGroup(target.installment_group_id);
      const anchorNum = target.installment_number ?? 0;
      const targets =
        scope === 'this_and_next'
          ? group.filter((item) => (item.installment_number ?? 0) >= anchorNum)
          : group;

      for (const item of targets) {
        await finRepository.deleteEntry(item.id);
      }
    });
  }
}

export const finService = new FinService();
