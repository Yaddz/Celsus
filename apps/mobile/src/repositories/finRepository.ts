import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { getDatabase } from '../db/client';
import { toCentsDecimal } from '../domain/openFinance';
import { computeChargeableChargesCents } from '../domain/openFinance/pluggyTruth';
import type { PluggyBillFinanceCharge, PluggyBillPayment } from '../services/pluggy/types';
import {
  finAccounts,
  finBills,
  finBudgets,
  finCategories,
  finCategoryRules,
  finEntries,
  finRecurrences,
  finRecurrenceSkips,
  type FinAccount,
  type FinBudget,
  type FinCategory,
  type FinCategoryRule,
  type FinEntry,
  type FinRecurrence,
  type FinRecurrenceSkip,
  type NewFinAccount,
  type NewFinBudget,
  type NewFinCategory,
  type NewFinEntry,
  type NewFinRecurrence,
} from '../db/schema';

/**
 * Máximo de variáveis por comando SQL. O SQLite do Android usado pelo app rejeita bem antes de 32.766
 * ("too many SQL variables" no aparelho com ~40 colunas por lançamento), então usamos o limite clássico de 999
 * com margem, que vale em qualquer build do SQLite.
 */
export const SQLITE_MAX_VARIABLES = 900;

import {
  getMonthDateRange,
  type FinAccountType,
  type FinEntryStatus,
  type FinKind,
} from '../domain/financeFlow';
import { appMetaRepository } from './appMetaRepository';

export const FIN_CATEGORIES_SEED_META_KEY = 'fin:categories:seeded:v1';
/** Sprint 91: Alimentação, Educação, Serviços e Compras entram uma única vez em bases já semeadas. */
export const FIN_CATEGORIES_SEED_S91_META_KEY = 'fin:categories:seeded:s91';
export const FIN_CATEGORIES_SEED_S100_META_KEY = 'fin:categories:seeded:s100';
const SPRINT91_CATEGORY_IDS = ['cat-alimentacao', 'cat-educacao', 'cat-servicos', 'cat-compras'];
const SPRINT100_CATEGORY_IDS = ['cat-taxas-bancarias', 'cat-emprestimos'];

export interface DefaultFinCategorySeed {
  id: string;
  name: string;
  kind: FinKind;
  icon: string;
  color: string;
}

export const DEFAULT_FIN_CATEGORIES: DefaultFinCategorySeed[] = [
  { id: 'cat-moradia', name: 'Moradia', kind: 'expense', icon: 'home', color: '#D96628' },
  { id: 'cat-mercado', name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: '#D5CAA8' },
  { id: 'cat-transporte', name: 'Transporte', kind: 'expense', icon: 'directions-car', color: '#C49A45' },
  { id: 'cat-saude', name: 'Saúde', kind: 'expense', icon: 'local-hospital', color: '#AECDC5' },
  { id: 'cat-lazer', name: 'Lazer', kind: 'expense', icon: 'movie', color: '#B8B2A6' },
  { id: 'cat-assinaturas', name: 'Assinaturas', kind: 'expense', icon: 'autorenew', color: '#E6DECA' },
  { id: 'cat-alimentacao', name: 'Alimentação', kind: 'expense', icon: 'restaurant', color: '#C8794A' },
  { id: 'cat-educacao', name: 'Educação', kind: 'expense', icon: 'school', color: '#7E9CB0' },
  { id: 'cat-servicos', name: 'Serviços', kind: 'expense', icon: 'build', color: '#9A8FB0' },
  { id: 'cat-compras', name: 'Compras', kind: 'expense', icon: 'shopping-bag', color: '#B07A8E' },
  { id: 'cat-taxas-bancarias', name: 'Taxas bancárias', kind: 'expense', icon: 'account-balance', color: '#A38B78' },
  { id: 'cat-emprestimos', name: 'Empréstimos', kind: 'expense', icon: 'request-quote', color: '#C47D6A' },
  { id: 'cat-outros-despesa', name: 'Outros', kind: 'expense', icon: 'category', color: '#8A8A8E' },
  { id: 'cat-salario', name: 'Salário', kind: 'income', icon: 'payments', color: '#AECDC5' },
  { id: 'cat-outros-receita', name: 'Outros recebimentos', kind: 'income', icon: 'attach-money', color: '#2E4A44' },
];

const LEGACY_DEFAULT_CATEGORY_COLORS: Record<string, { legacy: string[]; target: string }> = {
  'cat-mercado': { legacy: ['#2E4A44'], target: '#D5CAA8' },
  'cat-transporte': { legacy: ['#3386B0'], target: '#C49A45' },
  'cat-saude': { legacy: ['#CD528F'], target: '#AECDC5' },
  'cat-lazer': { legacy: ['#A958E4'], target: '#B8B2A6' },
  'cat-assinaturas': { legacy: ['#D4A83B'], target: '#E6DECA' },
  'cat-salario': { legacy: ['#2A904C'], target: '#AECDC5' },
  'cat-outros-receita': { legacy: ['#178D84'], target: '#2E4A44' },
};

function generateUUID(): string {
  return Crypto.randomUUID();
}

export class FinRepository {
  async createAccount(params: {
    id?: string;
    name: string;
    type: FinAccountType;
    initialBalanceCents?: number;
    color?: string;
    closingDay?: number | null;
    dueDay?: number | null;
    creditLimitCents?: number | null;
    ofAccountId?: string | null;
    ofItemId?: string | null;
    source?: 'MANUAL' | 'OPEN_FINANCE';
    reportedBalanceCents?: number | null;
    reportedBalanceAt?: string | null;
    maskedNumber?: string | null;
    owner?: string | null;
    autoName?: string | null;
    ofLinkedAt?: string | null;
    closingBalanceCents?: number | null;
    autoInvestedCents?: number | null;
    creditUsedCents?: number | null;
    ofAvailableLimitCents?: number | null;
    ofMinimumPaymentCents?: number | null;
    ofBalanceDueDate?: string | null;
    ofOverdraftUsedCents?: number | null;
    ofReservedCents?: number | null;
    calendarSource?: string | null;
  }): Promise<FinAccount> {
    const db = getDatabase();
    const isCard = params.type === 'card';
    const record: NewFinAccount = {
      id: params.id ?? generateUUID(),
      name: params.name.trim(),
      type: params.type,
      initial_balance_cents: Math.round(params.initialBalanceCents ?? 0),
      color: params.color ?? '#D96628',
      archived: 0,
      closing_day: isCard ? (params.closingDay ?? null) : null,
      due_day: isCard ? (params.dueDay ?? null) : null,
      credit_limit_cents: isCard ? (params.creditLimitCents ?? null) : null,
      of_account_id: params.ofAccountId ?? null,
      of_item_id: params.ofItemId ?? null,
      source: params.source ?? 'MANUAL',
      reported_balance_cents: params.reportedBalanceCents ?? null,
      reported_balance_at: params.reportedBalanceAt ?? null,
      masked_number: params.maskedNumber ?? null,
      owner: params.owner ?? null,
      auto_name: params.autoName ?? null,
      of_linked_at: params.ofLinkedAt ?? null,
      closing_balance_cents: params.closingBalanceCents ?? null,
      auto_invested_cents: params.autoInvestedCents ?? null,
      credit_used_cents: isCard ? (params.creditUsedCents ?? null) : null,
      of_available_limit_cents: isCard ? (params.ofAvailableLimitCents ?? null) : null,
      of_minimum_payment_cents: isCard ? (params.ofMinimumPaymentCents ?? null) : null,
      of_balance_due_date: isCard ? (params.ofBalanceDueDate ?? null) : null,
      of_overdraft_used_cents: !isCard ? (params.ofOverdraftUsedCents ?? null) : null,
      of_reserved_cents: !isCard ? (params.ofReservedCents ?? null) : null,
      calendar_source: isCard ? (params.calendarSource ?? null) : null,
      created_at: new Date().toISOString(),
    };
    await db.insert(finAccounts).values(record);
    return record as FinAccount;
  }

  async updateAccount(
    id: string,
    patch: Partial<{
      name: string;
      type: FinAccountType;
      initial_balance_cents: number;
      color: string;
      archived: number;
      closing_day: number | null;
      due_day: number | null;
      credit_limit_cents: number | null;
      of_account_id: string | null;
      source: 'MANUAL' | 'OPEN_FINANCE';
      reported_balance_cents: number | null;
      reported_balance_at: string | null;
      masked_number: string | null;
      owner: string | null;
      auto_name: string | null;
      of_linked_at: string | null;
      closing_balance_cents: number | null;
      auto_invested_cents: number | null;
      credit_used_cents: number | null;
      of_available_limit_cents: number | null;
      of_minimum_payment_cents: number | null;
      of_balance_due_date: string | null;
      of_overdraft_used_cents: number | null;
      of_reserved_cents: number | null;
      calendar_source: string | null;
    }>
  ): Promise<FinAccount> {
    const db = getDatabase();
    await db.update(finAccounts).set(patch).where(eq(finAccounts.id, id));
    const updated = await this.getAccountById(id);
    if (!updated) {
      throw new Error(`Conta não encontrada: ${id}`);
    }
    return updated;
  }

  async upsertBill(params: {
    accountId: string;
    externalId: string;
    billMonth: string;
    closingDate: string | null;
    dueDate: string;
    totalAmountCents: number;
    minimumPaymentCents: number | null;
    allowsInstallments?: boolean | null;
    payments?: PluggyBillPayment[] | null;
    financeCharges?: PluggyBillFinanceCharge[] | null;
  }): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();
    const paymentsJson = params.payments ? JSON.stringify(params.payments) : null;
    const paymentsTotalCents = params.payments
      ? params.payments.reduce((sum, p) => sum + toCentsDecimal(p.amount), 0)
      : null;
    const financeChargesJson = params.financeCharges
      ? JSON.stringify(params.financeCharges)
      : null;
    const chargeableChargesCents = params.financeCharges
      ? computeChargeableChargesCents(params.financeCharges)
      : null;
    const allowsInstallments =
      params.allowsInstallments == null ? null : params.allowsInstallments ? 1 : 0;

    const existing = await db
      .select()
      .from(finBills)
      .where(eq(finBills.account_id, params.accountId));
    const match = existing.find(
      (b) => b.external_id === params.externalId || b.bill_month === params.billMonth
    );
    if (match) {
      await db
        .update(finBills)
        .set({
          external_id: params.externalId,
          bill_month: params.billMonth,
          closing_date: params.closingDate,
          due_date: params.dueDate,
          total_amount_cents: params.totalAmountCents,
          minimum_payment_cents: params.minimumPaymentCents,
          payments_json: paymentsJson,
          payments_total_cents: paymentsTotalCents,
          finance_charges_json: financeChargesJson,
          chargeable_charges_cents: chargeableChargesCents,
          allows_installments: allowsInstallments,
          updated_at: nowIso,
        })
        .where(eq(finBills.id, match.id));
    } else {
      await db.insert(finBills).values({
        id: generateUUID(),
        account_id: params.accountId,
        external_id: params.externalId,
        bill_month: params.billMonth,
        closing_date: params.closingDate,
        due_date: params.dueDate,
        total_amount_cents: params.totalAmountCents,
        minimum_payment_cents: params.minimumPaymentCents,
        payments_json: paymentsJson,
        payments_total_cents: paymentsTotalCents,
        finance_charges_json: financeChargesJson,
        chargeable_charges_cents: chargeableChargesCents,
        allows_installments: allowsInstallments,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  async listBillsByAccount(accountId: string) {
    const db = getDatabase();
    return db.select().from(finBills).where(eq(finBills.account_id, accountId));
  }

  async listAllBills() {
    const db = getDatabase();
    return db.select().from(finBills);
  }

  async archiveAccount(id: string): Promise<FinAccount> {
    return this.updateAccount(id, { archived: 1 });
  }

  async listAccounts(includeArchived = false): Promise<FinAccount[]> {
    const db = getDatabase();
    const rows = (await db.select().from(finAccounts)) as FinAccount[];
    const filtered = includeArchived ? rows : rows.filter((row) => row.archived === 0);
    return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listBrokerAccounts(includeArchived = false): Promise<FinAccount[]> {
    const accounts = await this.listAccounts(includeArchived);
    return accounts.filter((a) => a.type === 'broker');
  }

  async getAccountById(id: string): Promise<FinAccount | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finAccounts).where(eq(finAccounts.id, id))) as FinAccount[];
    return rows[0] ?? null;
  }

  async seedDefaultCategoriesIfNeeded(): Promise<FinCategory[]> {
    const alreadySeeded = await appMetaRepository.get(FIN_CATEGORIES_SEED_META_KEY);
    const existing = await this.listCategories(true);

    const s91Done = await appMetaRepository.get(FIN_CATEGORIES_SEED_S91_META_KEY);
    const s100Done = await appMetaRepository.get(FIN_CATEGORIES_SEED_S100_META_KEY);
    const previouslySeeded = alreadySeeded === '1' && existing.length > 0;

    if (previouslySeeded && s91Done === '1' && s100Done === '1') {
      return existing;
    }

    const existingIds = new Set(existing.map((c) => c.id));
    const existingKeys = new Set(existing.map((c) => `${c.kind}:${c.name.trim().toLowerCase()}`));

    const toInsert: NewFinCategory[] = DEFAULT_FIN_CATEGORIES.filter(
      (cat) =>
        (!previouslySeeded ||
          SPRINT91_CATEGORY_IDS.includes(cat.id) ||
          SPRINT100_CATEGORY_IDS.includes(cat.id)) &&
        !existingIds.has(cat.id) &&
        !existingKeys.has(`${cat.kind}:${cat.name.trim().toLowerCase()}`)
    ).map((cat) => ({
      id: cat.id,
      name: cat.name,
      kind: cat.kind,
      icon: cat.icon,
      color: cat.color,
      parent_id: null,
      archived: 0,
    }));

    if (toInsert.length > 0) {
      const db = getDatabase();
      await db.insert(finCategories).values(toInsert);
    }

    await appMetaRepository.set(FIN_CATEGORIES_SEED_META_KEY, '1');
    await appMetaRepository.set(FIN_CATEGORIES_SEED_S91_META_KEY, '1');
    await appMetaRepository.set(FIN_CATEGORIES_SEED_S100_META_KEY, '1');
    return this.listCategories(true);
  }

  async createCategory(params: {
    id?: string;
    name: string;
    kind: FinKind;
    icon?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<FinCategory> {
    const db = getDatabase();
    const record: NewFinCategory = {
      id: params.id ?? generateUUID(),
      name: params.name.trim(),
      kind: params.kind,
      icon: params.icon ?? 'category',
      color: params.color ?? '#8A8A8E',
      parent_id: params.parentId ?? null,
      archived: 0,
    };
    await db.insert(finCategories).values(record);
    return record as FinCategory;
  }

  async updateCategory(
    id: string,
    patch: Partial<{ name: string; kind: FinKind; icon: string; color: string; parent_id: string | null; archived: number }>
  ): Promise<FinCategory> {
    const db = getDatabase();
    await db.update(finCategories).set(patch).where(eq(finCategories.id, id));
    const updated = await this.getCategoryById(id);
    if (!updated) {
      throw new Error(`Categoria não encontrada: ${id}`);
    }
    return updated;
  }

  async archiveCategory(id: string): Promise<FinCategory> {
    return this.updateCategory(id, { archived: 1 });
  }

  async listCategories(includeArchived = false): Promise<FinCategory[]> {
    const db = getDatabase();
    const rows = (await db.select().from(finCategories)) as FinCategory[];
    return includeArchived ? rows : rows.filter((row) => row.archived === 0);
  }

  async getCategoryById(id: string): Promise<FinCategory | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finCategories).where(eq(finCategories.id, id))) as FinCategory[];
    return rows[0] ?? null;
  }

  async createEntry(
    params: (Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }) | Record<string, any>
  ): Promise<FinEntry> {
    const created = await this.createEntriesBatch([params as any]);
    return created[0];
  }

  async createEntriesBatch(
    items: Array<
      (Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }) | Record<string, any>
    >
  ): Promise<FinEntry[]> {
    if (items.length === 0) return [];
    const db = getDatabase();
    const now = new Date().toISOString();
    const records: NewFinEntry[] = items.map((item: any) => ({
      id: item.id ?? generateUUID(),
      kind: item.kind,
      amount_cents: Math.round(item.amount_cents ?? item.amountCents ?? 0),
      due_date: item.due_date ?? item.dueDate,
      paid_date: item.paid_date ?? item.paidDate ?? null,
      paid_amount_cents: item.paid_amount_cents ?? item.paidAmountCents ?? null,
      status: item.status ?? 'pending',
      account_id: item.account_id ?? item.accountId,
      category_id: item.category_id ?? item.categoryId ?? 'cat-outros-despesa',
      description: item.description ?? '',
      recurrence_id: item.recurrence_id ?? item.recurrenceId ?? null,
      recurrence_period: item.recurrence_period ?? item.recurrencePeriod ?? null,
      installment_group_id: item.installment_group_id ?? item.installmentGroupId ?? null,
      installment_number: item.installment_number ?? item.installmentNumber ?? null,
      installment_total: item.installment_total ?? item.installmentTotal ?? null,
      bill_month: item.bill_month ?? item.billMonth ?? null,
      transfer_group_id: item.transfer_group_id ?? item.transferGroupId ?? null,
      source: item.source ?? 'MANUAL',
      external_id: item.external_id ?? item.externalId ?? null,
      import_batch_id: item.import_batch_id ?? item.importBatchId ?? null,
      description_raw: item.description_raw ?? item.descriptionRaw ?? null,
      user_edited_fields: item.user_edited_fields ?? item.userEditedFields ?? null,
      linked_income_id: item.linked_income_id ?? item.linkedIncomeId ?? null,
      linked_transaction_id: item.linked_transaction_id ?? item.linkedTransactionId ?? null,
      of_removed_at: item.of_removed_at ?? item.ofRemovedAt ?? null,
      of_category_id: item.of_category_id ?? item.ofCategoryId ?? null,
      of_class_reason: item.of_class_reason ?? item.ofClassReason ?? null,
      of_provider_id: item.of_provider_id ?? item.ofProviderId ?? null,
      of_bill_id: item.of_bill_id ?? item.ofBillId ?? null,
      of_bill_forecast_month: item.of_bill_forecast_month ?? item.ofBillForecastMonth ?? null,
      of_bill_post_date: item.of_bill_post_date ?? item.ofBillPostDate ?? null,
      of_operation_type: item.of_operation_type ?? item.ofOperationType ?? null,
      of_raw_status: item.of_raw_status ?? item.ofRawStatus ?? null,
      of_raw_type: item.of_raw_type ?? item.ofRawType ?? null,
      of_raw_amount_cents: item.of_raw_amount_cents ?? item.ofRawAmountCents ?? null,
      of_created_at: item.of_created_at ?? item.ofCreatedAt ?? null,
      of_installment_number: item.of_installment_number ?? item.ofInstallmentNumber ?? null,
      of_installment_total: item.of_installment_total ?? item.ofInstallmentTotal ?? null,
      of_bill_month_source: item.of_bill_month_source ?? item.ofBillMonthSource ?? null,
      created_at: now,
    }));
    // Com ~41 colunas por lançamento, um único INSERT com muitas linhas novas (histórico completo da R37)
    // estourava o limite de variáveis do SQLite (SQLITE_MAX_VARIABLES). Grava em lotes.
    const columnsPerRow = Math.max(1, Object.keys(records[0]).length);
    const chunkSize = Math.max(1, Math.floor(SQLITE_MAX_VARIABLES / columnsPerRow));
    for (let i = 0; i < records.length; i += chunkSize) {
      await db.insert(finEntries).values(records.slice(i, i + chunkSize));
    }
    return records as FinEntry[];
  }

  async updateEntry(id: string, patch: Partial<Omit<FinEntry, 'id' | 'created_at'>>): Promise<FinEntry> {
    const db = getDatabase();
    await db.update(finEntries).set(patch).where(eq(finEntries.id, id));
    const updated = await this.getEntryById(id);
    if (!updated) {
      throw new Error(`Lançamento não encontrado: ${id}`);
    }
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(finEntries).where(eq(finEntries.id, id));
  }

  async deleteEntriesByTransferGroup(transferGroupId: string): Promise<void> {
    const db = getDatabase();
    await db.delete(finEntries).where(eq(finEntries.transfer_group_id, transferGroupId));
  }

  async listEntriesByLinkedTransactionId(transactionId: string): Promise<FinEntry[]> {
    const db = getDatabase();
    return (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.linked_transaction_id, transactionId))) as FinEntry[];
  }

  async deleteEntriesByLinkedTransactionId(transactionId: string): Promise<void> {
    const db = getDatabase();
    await db.delete(finEntries).where(eq(finEntries.linked_transaction_id, transactionId));
  }

  async listEntriesByLinkedIncomeId(incomeId: string): Promise<FinEntry[]> {
    const db = getDatabase();
    return (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.linked_income_id, incomeId))) as FinEntry[];
  }

  async deleteInvestmentIncomeByLinkedIncomeId(incomeId: string): Promise<void> {
    const db = getDatabase();
    const linked = await this.listEntriesByLinkedIncomeId(incomeId);
    for (const row of linked) {
      if (row.kind === 'investment_income') {
        await db.delete(finEntries).where(eq(finEntries.id, row.id));
      }
    }
  }

  async getEntryById(id: string): Promise<FinEntry | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finEntries).where(eq(finEntries.id, id))) as FinEntry[];
    return rows[0] ?? null;
  }

  async listEntriesByMonth(yearMonth: string): Promise<FinEntry[]> {
    const { start, end } = getMonthDateRange(yearMonth);
    return this.listEntriesBetween(start, end);
  }

  async listEntriesBetween(startIso: string, endIso: string): Promise<FinEntry[]> {
    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(and(gte(finEntries.due_date, startIso), lte(finEntries.due_date, endIso)))) as FinEntry[];
    return [...rows].sort((a, b) => {
      const dateCmp = a.due_date.localeCompare(b.due_date);
      if (dateCmp !== 0) return dateCmp;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  async listPendingEntriesUntil(iso: string): Promise<FinEntry[]> {
    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(and(eq(finEntries.status, 'pending'), lte(finEntries.due_date, iso)))) as FinEntry[];
    return [...rows]
      .filter((r) => !r.of_removed_at)
      .sort((a, b) => {
      const dateCmp = a.due_date.localeCompare(b.due_date);
      if (dateCmp !== 0) return dateCmp;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  async listEntriesWithRecurrence(): Promise<FinEntry[]> {
    const db = getDatabase();
    return (await db
      .select()
      .from(finEntries)
      .where(isNotNull(finEntries.recurrence_id))) as FinEntry[];
  }

  async listAllEntries(): Promise<FinEntry[]> {
    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as FinEntry[];
    return [...rows].sort((a, b) => {
      const dateCmp = a.due_date.localeCompare(b.due_date);
      if (dateCmp !== 0) return dateCmp;
      return a.created_at.localeCompare(b.created_at);
    });
  }

  async listEntriesByInstallmentGroup(groupId: string): Promise<FinEntry[]> {
    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.installment_group_id, groupId))) as FinEntry[];
    return [...rows].sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0));
  }

  async listEntriesByRecurrence(recurrenceId: string): Promise<FinEntry[]> {
    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.recurrence_id, recurrenceId))) as FinEntry[];
    return [...rows].sort((a, b) => a.due_date.localeCompare(b.due_date));
  }

  async createRecurrence(
    params: Omit<NewFinRecurrence, 'id' | 'created_at' | 'active' | 'is_subscription'> & {
      id?: string;
      active?: number;
      is_subscription?: number;
    }
  ): Promise<FinRecurrence> {
    const db = getDatabase();
    const record: NewFinRecurrence = {
      id: params.id ?? generateUUID(),
      kind: params.kind,
      amount_cents: Math.round(params.amount_cents),
      description: params.description ?? '',
      account_id: params.account_id,
      target_account_id: params.target_account_id ?? null,
      category_id: params.category_id,
      frequency: params.frequency,
      day_of_month: params.day_of_month,
      start_date: params.start_date,
      end_date: params.end_date ?? null,
      is_subscription: params.is_subscription ?? 0,
      active: params.active ?? 1,
      variable_amount: params.variable_amount ?? 0,
      generated_until: params.generated_until ?? null,
      created_at: new Date().toISOString(),
    };
    await db.insert(finRecurrences).values(record);
    return record as FinRecurrence;
  }

  /**
   * Atualiza categorias padrão cuja cor ainda é a original pré-Sprint 60 para a paleta do artifact,
   * preservando qualquer categoria cuja cor já tenha sido customizada pelo usuário.
   */
  async migrateDefaultCategoryColors(): Promise<void> {
    const existing = await this.listCategories(true);
    for (const cat of existing) {
      const rule = LEGACY_DEFAULT_CATEGORY_COLORS[cat.id];
      if (!rule) continue;
      const upper = (cat.color ?? '').trim().toUpperCase();
      if (rule.legacy.includes(upper)) {
        await this.updateCategory(cat.id, { color: rule.target });
      }
    }
  }

  async updateRecurrence(
    id: string,
    patch: Partial<Omit<FinRecurrence, 'id' | 'created_at'>>
  ): Promise<FinRecurrence> {
    const db = getDatabase();
    await db.update(finRecurrences).set(patch).where(eq(finRecurrences.id, id));
    const updated = await this.getRecurrenceById(id);
    if (!updated) {
      throw new Error(`Recorrência não encontrada: ${id}`);
    }
    return updated;
  }

  async deleteRecurrence(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(finRecurrences).where(eq(finRecurrences.id, id));
  }

  async getRecurrenceById(id: string): Promise<FinRecurrence | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finRecurrences).where(eq(finRecurrences.id, id))) as FinRecurrence[];
    return rows[0] ?? null;
  }

  async listRecurrences(options?: { onlySubscriptions?: boolean; onlyActive?: boolean }): Promise<FinRecurrence[]> {
    const db = getDatabase();
    const rows = (await db.select().from(finRecurrences)) as FinRecurrence[];
    return rows
      .filter((row) => {
        if (options?.onlySubscriptions && row.is_subscription !== 1) return false;
        if (options?.onlyActive && row.active !== 1) return false;
        return true;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async addRecurrenceSkip(recurrenceId: string, period: string): Promise<void> {
    const existing = await this.listAllRecurrenceSkips(recurrenceId);
    if (existing.some((s) => s.period === period)) return;
    const db = getDatabase();
    await db.insert(finRecurrenceSkips).values({ recurrence_id: recurrenceId, period });
  }

  async listAllRecurrenceSkips(recurrenceId?: string): Promise<FinRecurrenceSkip[]> {
    const db = getDatabase();
    if (recurrenceId) {
      return (await db
        .select()
        .from(finRecurrenceSkips)
        .where(eq(finRecurrenceSkips.recurrence_id, recurrenceId))) as FinRecurrenceSkip[];
    }
    return (await db.select().from(finRecurrenceSkips)) as FinRecurrenceSkip[];
  }

  async findEntryByExternalId(externalId: string): Promise<FinEntry | null> {
    if (!externalId) return null;
    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.external_id, externalId))) as FinEntry[];
    return rows[0] ?? null;
  }

  async listCategoryRules(kind?: FinKind): Promise<FinCategoryRule[]> {
    const db = getDatabase();
    const rows = (await db.select().from(finCategoryRules)) as FinCategoryRule[];
    return kind ? rows.filter((r) => r.kind === kind) : rows;
  }

  async listBudgets(): Promise<FinBudget[]> {
    const db = getDatabase();
    return (await db.select().from(finBudgets)) as FinBudget[];
  }

  async upsertBudget(input: {
    categoryId: string;
    yearMonth: string | null;
    limitCents: number;
  }): Promise<FinBudget> {
    const db = getDatabase();
    const all = await this.listBudgets();
    const existing = all.find(
      (b) => b.category_id === input.categoryId && (b.year_month ?? null) === (input.yearMonth ?? null)
    );
    const limitCents = Math.max(0, Math.round(input.limitCents));
    if (existing) {
      await db
        .update(finBudgets)
        .set({ limit_cents: limitCents })
        .where(eq(finBudgets.id, existing.id));
      return { ...existing, limit_cents: limitCents };
    }
    const row: NewFinBudget = {
      id: Crypto.randomUUID(),
      category_id: input.categoryId,
      year_month: input.yearMonth ?? null,
      limit_cents: limitCents,
      created_at: new Date().toISOString(),
    };
    await db.insert(finBudgets).values(row);
    return row as FinBudget;
  }

  async deleteBudget(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(finBudgets).where(eq(finBudgets.id, id));
  }
}

export const finRepository = new FinRepository();
