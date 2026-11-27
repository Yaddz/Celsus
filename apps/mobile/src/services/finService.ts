import * as Crypto from 'expo-crypto';
import { eq } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '../db/client';
import { incomeEvents, transactions, type FinEntry, type FinRecurrence } from '../db/schema';
import {
  addDaysIso,
  addMonthsYearMonth,
  buildInstallmentSchedule,
  clampDayOfMonth,
  closesAfterDueDay,
  formatIsoDate,
  generateRecurrenceOccurrences,
  getMonthDateRange,
  getTodayIsoLocal,
  isInvestmentKind,
  normalizeCardEntry,
  parseIsoDate,
  resolveBillMonth,
  resolveRecurrencePeriod,
  type FinKind,
  type InstallmentScope,
} from '../domain/financeFlow';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { finRepository } from '../repositories/finRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { finReminderService } from './finReminderService';

const MAX_RECURRENCE_MONTHS_AHEAD = 24;
const BILL_MONTH_DUE_SHIFT_META_KEY = 'fin:bill_month_due_shift_v1';
export const BROKER_ACCOUNTS_MIGRATION_META_KEY = 'migration:broker-accounts:v1';

export class FinService {
  async initializeFinanceModule(referenceDateIso?: string): Promise<void> {
    await finRepository.seedDefaultCategoriesIfNeeded();
    await finRepository.migrateDefaultCategoryColors();
    await this.migrateOrphanRecordsIfNeeded();
    await this.migrateCardBillMonthsIfNeeded();
    await this.migrateBrokerAccountsIfNeeded();
    const refIso = referenceDateIso ?? getTodayIsoLocal();
    const refMonth = refIso.slice(0, 7);
    const startMonth = addMonthsYearMonth(refMonth, -1);
    const endMonth = addMonthsYearMonth(refMonth, 2);
    const windowStart = getMonthDateRange(startMonth).start;
    const windowEnd = getMonthDateRange(endMonth).end;
    await this.generateRecurrenceWindow(windowStart, windowEnd);
    await this.notifyRemindersChanged(refMonth);
  }

  async notifyRemindersChanged(yearMonth?: string): Promise<void> {
    try {
      await finReminderService.rescheduleReminders();
      if (yearMonth) {
        await finReminderService.checkAndNotifyBudgetAlerts(yearMonth);
      }
    } catch {
      // Nunca interromper fluxo financeiro se permissão de notificação não estiver disponível
    }
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

  /**
   * Antes da Sprint 69 o mês da fatura ignorava o dia do vencimento: em cartões que fecham depois
   * do vencimento (ex.: fecha 28, vence 5) a compra caía na fatura que já tinha vencido. Desloca
   * um mês, uma única vez, os lançamentos locais desses cartões. Os vindos do Open Finance ficam
   * como estão: o mês deles é o da fatura informada pelo banco.
   */
  async migrateCardBillMonthsIfNeeded(): Promise<number> {
    const alreadyDone = await appMetaRepository.get(BILL_MONTH_DUE_SHIFT_META_KEY);
    if (alreadyDone) return 0;

    return runInTransaction(async () => {
      const accounts = await finRepository.listAccounts(true);
      const affectedCardIds = new Set(
        accounts
          .filter((a) => a.type === 'card' && closesAfterDueDay(a.closing_day, a.due_day))
          .map((a) => a.id)
      );

      let shifted = 0;
      if (affectedCardIds.size > 0) {
        const entries = await finRepository.listAllEntries();
        for (const entry of entries) {
          if (!affectedCardIds.has(entry.account_id)) continue;
          if (!entry.bill_month || entry.source === 'OPEN_FINANCE') continue;
          await finRepository.updateEntry(entry.id, {
            bill_month: addMonthsYearMonth(entry.bill_month, 1),
          });
          shifted += 1;
        }
      }

      await appMetaRepository.set(BILL_MONTH_DUE_SHIFT_META_KEY, '1');
      return shifted;
    });
  }

  /**
   * Sprint 103 (R39): Para cada carteira criada pela Pluggy por corretora (of_item_id != null)
   * que ainda não tenha conta vinculada, cria uma conta 'broker' com o mesmo nome e saldo 0 e vincula.
   * Idempotente; não toca carteiras manuais.
   */
  async migrateBrokerAccountsIfNeeded(): Promise<number> {
    const alreadyDone = await appMetaRepository.get(BROKER_ACCOUNTS_MIGRATION_META_KEY);
    if (alreadyDone) return 0;

    const portfolios = await portfolioRepository.listPortfolios(true);
    let createdCount = 0;

    for (const p of portfolios) {
      if (!p.of_item_id || p.fin_account_id) continue;
      const brokerAccount = await finRepository.createAccount({
        name: p.name,
        type: 'broker',
        initialBalanceCents: 0,
      });
      await portfolioRepository.linkFinAccount(p.id, brokerAccount.id);
      createdCount += 1;
    }

    await appMetaRepository.set(BROKER_ACCOUNTS_MIGRATION_META_KEY, '1');
    return createdCount;
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

    const updated = await finRepository.updateEntry(entryId, {
      status: 'paid',
      paid_date: paidDate,
      paid_amount_cents: paidAmountCents,
    });
    await this.notifyRemindersChanged(updated.due_date.slice(0, 7));
    return updated;
  }

  async markEntryAsPending(entryId: string): Promise<FinEntry> {
    const entry = await finRepository.getEntryById(entryId);
    if (!entry) {
      throw new Error(`Lançamento não encontrado: ${entryId}`);
    }
    const updated = await finRepository.updateEntry(entryId, {
      status: 'pending',
      paid_date: null,
      paid_amount_cents: null,
    });
    await this.notifyRemindersChanged(updated.due_date.slice(0, 7));
    return updated;
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

    return runInTransaction(async () => {
      const account = await finRepository.getAccountById(params.accountId);
      const kind = params.kind ?? 'expense';

      return finRepository.createEntriesBatch(
        schedule.map((part) => {
          const normalized = normalizeCardEntry(
            {
              kind,
              dueDate: part.dueDate,
              amountCents: part.amountCents,
              status: 'pending',
            },
            account
          );
          return {
            kind,
            amount_cents: part.amountCents,
            due_date: normalized.due_date,
            paid_date: normalized.paid_date,
            paid_amount_cents: normalized.paid_amount_cents,
            status: normalized.status,
            account_id: params.accountId,
            category_id: params.categoryId,
            description: params.description,
            recurrence_id: null,
            recurrence_period: null,
            installment_group_id: groupId,
            installment_number: part.installmentNumber,
            installment_total: part.installmentTotal,
            bill_month: normalized.bill_month,
          };
        })
      );
    });
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
        await this.updateEntryRecalculatingBill(entryId, patch);
        return;
      }

      const group = await finRepository.listEntriesByInstallmentGroup(target.installment_group_id);
      const anchorNum = target.installment_number ?? 0;
      const targets =
        scope === 'this_and_next'
          ? group.filter((item) => (item.installment_number ?? 0) >= anchorNum)
          : group;

      // A data nova vale para a parcela editada; as demais mantêm o espaçamento mensal:
      // deslocam o mesmo número de meses e adotam o novo dia (limitado ao tamanho do mês).
      const { due_date: newDueDate, ...restPatch } = patch;
      let monthDelta = 0;
      let newDay = 0;
      if (newDueDate !== undefined) {
        const from = parseIsoDate(target.due_date);
        const to = parseIsoDate(newDueDate);
        monthDelta = to.year * 12 + to.month - (from.year * 12 + from.month);
        newDay = to.day;
      }

      for (const item of targets) {
        const itemPatch: typeof patch = { ...restPatch };
        if (newDueDate !== undefined) {
          if (item.id === target.id) {
            itemPatch.due_date = newDueDate;
          } else {
            const shiftedYm = addMonthsYearMonth(item.due_date.slice(0, 7), monthDelta);
            const { year, month } = parseIsoDate(`${shiftedYm}-01`);
            itemPatch.due_date = formatIsoDate(year, month, clampDayOfMonth(year, month, newDay));
          }
        }
        await this.updateEntryRecalculatingBill(item.id, itemPatch);
      }
    });
  }

  /**
   * Atualiza um lançamento mantendo o mês da fatura coerente: recalcula quando a data ou a conta
   * mudam e a conta é cartão, limpa quando sai do cartão. Lançamento do Open Finance preserva o
   * mês informado pelo banco.
   */
  async updateEntryRecalculatingBill(
    entryId: string,
    patch: Partial<Omit<FinEntry, 'id' | 'created_at'>>
  ): Promise<FinEntry> {
    const current = await finRepository.getEntryById(entryId);
    if (!current) {
      throw new Error(`Lançamento não encontrado: ${entryId}`);
    }
    const nextPatch = { ...patch };
    const nextAccountId = patch.account_id ?? current.account_id;
    const nextDueDate = patch.due_date ?? current.due_date;
    const changedPlacement =
      nextAccountId !== current.account_id || nextDueDate !== current.due_date;

    if (changedPlacement && current.source !== 'OPEN_FINANCE' && patch.bill_month === undefined) {
      const account = await finRepository.getAccountById(nextAccountId);
      if (account?.type === 'card' && (current.kind === 'expense' || current.kind === 'income')) {
        const normalized = normalizeCardEntry(
          {
            kind: current.kind,
            dueDate: nextDueDate,
            amountCents: patch.amount_cents ?? current.amount_cents,
            status: (patch.status ?? current.status) as 'pending' | 'paid',
          },
          account
        );
        nextPatch.bill_month = normalized.bill_month;
        nextPatch.status = normalized.status;
        nextPatch.paid_date = normalized.paid_date;
        nextPatch.paid_amount_cents = normalized.paid_amount_cents;
      } else {
        nextPatch.bill_month = null;
      }
    }
    return finRepository.updateEntry(entryId, nextPatch);
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

  async resolveInvestmentEntryPortfolioName(entry: FinEntry): Promise<string> {
    const db = getDatabase();
    if (entry.linked_transaction_id) {
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, entry.linked_transaction_id));
      if (rows[0]?.portfolio_id) {
        const p = await portfolioRepository.getPortfolioById(rows[0].portfolio_id);
        if (p?.name) return p.name;
      }
    }
    if (entry.linked_income_id) {
      const rows = await db
        .select()
        .from(incomeEvents)
        .where(eq(incomeEvents.id, entry.linked_income_id));
      if (rows[0]?.portfolio_id) {
        const p = await portfolioRepository.getPortfolioById(rows[0].portfolio_id);
        if (p?.name) return p.name;
      }
    }
    const allPortfolios = await portfolioRepository.listPortfolios(true);
    const linked = allPortfolios.find((p) => p.fin_account_id === entry.account_id);
    return linked?.name || 'Investimentos';
  }

  async deleteEntry(entryId: string): Promise<void> {
    const target = await finRepository.getEntryById(entryId);
    if (!target) return;
    if (isInvestmentKind(target.kind)) {
      const portfolioName = await this.resolveInvestmentEntryPortfolioName(target);
      throw new Error(
        `Esse lançamento vem da carteira ${portfolioName}. Exclua a movimentação por lá.`
      );
    }
    if (target.transfer_group_id) {
      await this.deleteTransferGroup(target.transfer_group_id);
      return;
    }
    await finRepository.deleteEntry(entryId);
  }

  async createTransfer(params: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    dateIso: string;
    description?: string;
    linkedTransactionId?: string | null;
  }): Promise<{ transferGroupId: string; outEntry: FinEntry; inEntry: FinEntry }> {
    const amountCents = Math.round(params.amountCents);
    if (amountCents <= 0) {
      throw new Error('O valor da transferência deve ser maior que zero.');
    }
    if (!params.fromAccountId || !params.toAccountId || params.fromAccountId === params.toAccountId) {
      throw new Error('Escolha contas de origem e destino diferentes.');
    }

    const transferGroupId = `tr-${Crypto.randomUUID()}`;
    const desc = params.description?.trim() || 'Transferência entre contas';

    return runInTransaction(async () => {
      const [outEntry, inEntry] = await finRepository.createEntriesBatch([
        {
          kind: 'transfer_out',
          amount_cents: amountCents,
          due_date: params.dateIso,
          paid_date: params.dateIso,
          paid_amount_cents: amountCents,
          status: 'paid',
          account_id: params.fromAccountId,
          category_id: 'cat-outros-despesa',
          description: desc,
          transfer_group_id: transferGroupId,
          linked_transaction_id: params.linkedTransactionId ?? null,
        },
        {
          kind: 'transfer_in',
          amount_cents: amountCents,
          due_date: params.dateIso,
          paid_date: params.dateIso,
          paid_amount_cents: amountCents,
          status: 'paid',
          account_id: params.toAccountId,
          category_id: 'cat-outros-receita',
          description: desc,
          transfer_group_id: transferGroupId,
          linked_transaction_id: params.linkedTransactionId ?? null,
        },
      ]);
      return { transferGroupId, outEntry, inEntry };
    });
  }

  async payCardBill(params: {
    cardAccountId: string;
    fromAccountId: string;
    billMonth: string;
    amountCents: number;
    paidDateIso: string;
  }): Promise<{ transferGroupId: string; outEntry: FinEntry; inEntry: FinEntry }> {
    const amountCents = Math.round(params.amountCents);
    if (amountCents <= 0) {
      throw new Error('O valor do pagamento deve ser maior que zero.');
    }
    if (!params.fromAccountId || !params.cardAccountId || params.fromAccountId === params.cardAccountId) {
      throw new Error('Selecione a conta pagadora.');
    }

    const transferGroupId = `bill-${Crypto.randomUUID()}`;
    const desc = `Pagamento fatura ${params.billMonth}`;

    return runInTransaction(async () => {
      const [outEntry, inEntry] = await finRepository.createEntriesBatch([
        {
          kind: 'transfer_out',
          amount_cents: amountCents,
          due_date: params.paidDateIso,
          paid_date: params.paidDateIso,
          paid_amount_cents: amountCents,
          status: 'paid',
          account_id: params.fromAccountId,
          category_id: 'cat-outros-despesa',
          description: desc,
          bill_month: null,
          transfer_group_id: transferGroupId,
        },
        {
          kind: 'transfer_in',
          amount_cents: amountCents,
          due_date: params.paidDateIso,
          paid_date: params.paidDateIso,
          paid_amount_cents: amountCents,
          status: 'paid',
          account_id: params.cardAccountId,
          category_id: 'cat-outros-receita',
          description: desc,
          bill_month: params.billMonth,
          transfer_group_id: transferGroupId,
        },
      ]);
      return { transferGroupId, outEntry, inEntry };
    });
  }

  async deleteTransferGroup(transferGroupId: string): Promise<void> {
    if (!transferGroupId) return;
    return runInTransaction(async () => {
      await finRepository.deleteEntriesByTransferGroup(transferGroupId);
    });
  }
}

export const finService = new FinService();
