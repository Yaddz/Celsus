import type {
  FinAccount,
  FinCategory,
  FinEntry,
  FinRecurrence,
  NewFinEntry,
  NewFinRecurrence,
} from '../db/schema';
import type { FinAccountType, FinEntryStatus, FinKind } from '../domain/financeFlow';

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

export class FinRepository {
  async createAccount(_params: {
    id?: string;
    name: string;
    type: FinAccountType;
    initialBalanceCents?: number;
    color?: string;
  }): Promise<FinAccount> {
    throw new Error('Not implemented: createAccount');
  }

  async updateAccount(
    _id: string,
    _patch: Partial<{ name: string; type: FinAccountType; initial_balance_cents: number; color: string; archived: number }>
  ): Promise<FinAccount> {
    throw new Error('Not implemented: updateAccount');
  }

  async archiveAccount(_id: string): Promise<FinAccount> {
    throw new Error('Not implemented: archiveAccount');
  }

  async listAccounts(_includeArchived = false): Promise<FinAccount[]> {
    return [];
  }

  async getAccountById(_id: string): Promise<FinAccount | null> {
    return null;
  }

  async seedDefaultCategoriesIfNeeded(): Promise<FinCategory[]> {
    return [];
  }

  async createCategory(_params: {
    id?: string;
    name: string;
    kind: FinKind;
    icon?: string;
    color?: string;
    parentId?: string | null;
  }): Promise<FinCategory> {
    throw new Error('Not implemented: createCategory');
  }

  async updateCategory(
    _id: string,
    _patch: Partial<{ name: string; kind: FinKind; icon: string; color: string; parent_id: string | null; archived: number }>
  ): Promise<FinCategory> {
    throw new Error('Not implemented: updateCategory');
  }

  async archiveCategory(_id: string): Promise<FinCategory> {
    throw new Error('Not implemented: archiveCategory');
  }

  async listCategories(_includeArchived = false): Promise<FinCategory[]> {
    return [];
  }

  async getCategoryById(_id: string): Promise<FinCategory | null> {
    return null;
  }

  async createEntry(
    _params: Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }
  ): Promise<FinEntry> {
    throw new Error('Not implemented: createEntry');
  }

  async createEntriesBatch(
    _items: Array<Omit<NewFinEntry, 'id' | 'created_at' | 'status'> & { id?: string; status?: FinEntryStatus }>
  ): Promise<FinEntry[]> {
    return [];
  }

  async updateEntry(_id: string, _patch: Partial<Omit<FinEntry, 'id' | 'created_at'>>): Promise<FinEntry> {
    throw new Error('Not implemented: updateEntry');
  }

  async deleteEntry(_id: string): Promise<void> {
    throw new Error('Not implemented: deleteEntry');
  }

  async getEntryById(_id: string): Promise<FinEntry | null> {
    return null;
  }

  async listEntriesByMonth(_yearMonth: string): Promise<FinEntry[]> {
    return [];
  }

  async listAllEntries(): Promise<FinEntry[]> {
    return [];
  }

  async listEntriesByInstallmentGroup(_groupId: string): Promise<FinEntry[]> {
    return [];
  }

  async listEntriesByRecurrence(_recurrenceId: string): Promise<FinEntry[]> {
    return [];
  }

  async createRecurrence(
    _params: Omit<NewFinRecurrence, 'id' | 'created_at' | 'active' | 'is_subscription'> & {
      id?: string;
      active?: number;
      is_subscription?: number;
    }
  ): Promise<FinRecurrence> {
    throw new Error('Not implemented: createRecurrence');
  }

  async updateRecurrence(_id: string, _patch: Partial<Omit<FinRecurrence, 'id' | 'created_at'>>): Promise<FinRecurrence> {
    throw new Error('Not implemented: updateRecurrence');
  }

  async deleteRecurrence(_id: string): Promise<void> {
    throw new Error('Not implemented: deleteRecurrence');
  }

  async getRecurrenceById(_id: string): Promise<FinRecurrence | null> {
    return null;
  }

  async listRecurrences(_options?: { onlySubscriptions?: boolean; onlyActive?: boolean }): Promise<FinRecurrence[]> {
    return [];
  }
}

export const finRepository = new FinRepository();
