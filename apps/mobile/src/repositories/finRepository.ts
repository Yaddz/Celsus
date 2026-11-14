import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import {
  finAccounts,
  finCategories,
  finEntries,
  finRecurrences,
  type FinAccount,
  type FinCategory,
  type FinEntry,
  type FinRecurrence,
  type NewFinAccount,
  type NewFinCategory,
  type NewFinEntry,
  type NewFinRecurrence,
} from '../db/schema';
import type { FinAccountType, FinEntryStatus, FinKind } from '../domain/financeFlow';
import { appMetaRepository } from './appMetaRepository';

export const FIN_CATEGORIES_SEED_META_KEY = 'fin:categories:seeded:v1';

export interface DefaultFinCategorySeed {
  id: string;
  name: string;
  kind: FinKind;
  icon: string;
  color: string;
}

export const DEFAULT_FIN_CATEGORIES: DefaultFinCategorySeed[] = [
  { id: 'cat-moradia', name: 'Moradia', kind: 'expense', icon: 'home', color: '#D96628' },
  { id: 'cat-mercado', name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: '#2E4A44' },
  { id: 'cat-transporte', name: 'Transporte', kind: 'expense', icon: 'directions-car', color: '#3386B0' },
  { id: 'cat-saude', name: 'Saúde', kind: 'expense', icon: 'local-hospital', color: '#CD528F' },
  { id: 'cat-lazer', name: 'Lazer', kind: 'expense', icon: 'movie', color: '#A958E4' },
  { id: 'cat-assinaturas', name: 'Assinaturas', kind: 'expense', icon: 'autorenew', color: '#D4A83B' },
  { id: 'cat-outros-despesa', name: 'Outros', kind: 'expense', icon: 'category', color: '#8A8A8E' },
  { id: 'cat-salario', name: 'Salário', kind: 'income', icon: 'payments', color: '#2A904C' },
  { id: 'cat-outros-receita', name: 'Outros recebimentos', kind: 'income', icon: 'attach-money', color: '#178D84' },
];

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class FinRepository {
  async createAccount(params: {
    id?: string;
    name: string;
    type: FinAccountType;
    initialBalanceCents?: number;
    color?: string;
  }): Promise<FinAccount> {
    const db = getDatabase();
    const record: NewFinAccount = {
      id: params.id ?? generateUUID(),
      name: params.name.trim(),
      type: params.type,
      initial_balance_cents: Math.round(params.initialBalanceCents ?? 0),
      color: params.color ?? '#D96628',
      archived: 0,
      created_at: new Date().toISOString(),
    };
    await db.insert(finAccounts).values(record);
    return record as FinAccount;
  }

  async updateAccount(
    id: string,
    patch: Partial<{ name: string; type: FinAccountType; initial_balance_cents: number; color: string; archived: number }>
  ): Promise<FinAccount> {
    const db = getDatabase();
    await db.update(finAccounts).set(patch).where(eq(finAccounts.id, id));
    const updated = await this.getAccountById(id);
    if (!updated) {
      throw new Error(`Conta não encontrada: ${id}`);
    }
    return updated;
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

  async getAccountById(id: string): Promise<FinAccount | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finAccounts).where(eq(finAccounts.id, id))) as FinAccount[];
    return rows[0] ?? null;
  }

  async seedDefaultCategoriesIfNeeded(): Promise<FinCategory[]> {
    const alreadySeeded = await appMetaRepository.get(FIN_CATEGORIES_SEED_META_KEY);
    const existing = await this.listCategories(true);

    if (alreadySeeded === '1' && existing.length > 0) {
      return existing;
    }

    const existingIds = new Set(existing.map((c) => c.id));
    const existingKeys = new Set(existing.map((c) => `${c.kind}:${c.name.trim().toLowerCase()}`));

    const toInsert: NewFinCategory[] = DEFAULT_FIN_CATEGORIES.filter(
      (cat) => !existingIds.has(cat.id) && !existingKeys.has(`${cat.kind}:${cat.name.trim().toLowerCase()}`)
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
    params: Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }
  ): Promise<FinEntry> {
    const created = await this.createEntriesBatch([params]);
    return created[0];
  }

  async createEntriesBatch(
    items: Array<Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }>
  ): Promise<FinEntry[]> {
    if (items.length === 0) return [];
    const db = getDatabase();
    const now = new Date().toISOString();
    const records: NewFinEntry[] = items.map((item) => ({
      id: item.id ?? generateUUID(),
      kind: item.kind,
      amount_cents: Math.round(item.amount_cents),
      due_date: item.due_date,
      paid_date: item.paid_date ?? null,
      paid_amount_cents: item.paid_amount_cents ?? null,
      status: item.status ?? 'pending',
      account_id: item.account_id,
      category_id: item.category_id,
      description: item.description ?? '',
      recurrence_id: item.recurrence_id ?? null,
      installment_group_id: item.installment_group_id ?? null,
      installment_number: item.installment_number ?? null,
      installment_total: item.installment_total ?? null,
      created_at: now,
    }));
    await db.insert(finEntries).values(records);
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

  async getEntryById(id: string): Promise<FinEntry | null> {
    const db = getDatabase();
    const rows = (await db.select().from(finEntries).where(eq(finEntries.id, id))) as FinEntry[];
    return rows[0] ?? null;
  }

  async listEntriesByMonth(yearMonth: string): Promise<FinEntry[]> {
    const all = await this.listAllEntries();
    return all.filter((entry) => entry.due_date.startsWith(yearMonth));
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
      category_id: params.category_id,
      frequency: params.frequency,
      day_of_month: params.day_of_month,
      start_date: params.start_date,
      end_date: params.end_date ?? null,
      is_subscription: params.is_subscription ?? 0,
      active: params.active ?? 1,
      generated_until: params.generated_until ?? null,
      created_at: new Date().toISOString(),
    };
    await db.insert(finRecurrences).values(record);
    return record as FinRecurrence;
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
}

export const finRepository = new FinRepository();
