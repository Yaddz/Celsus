import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { ofItems, ofSyncRuns } from '../db/schema';

export const MAX_MEU_PLUGGY_ITEMS = 5;

export interface OfItemRecord {
  id: string;
  connector_name: string | null;
  status: string | null;
  execution_status: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface OfSyncRunRecord {
  id: string;
  item_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  kind?: 'FINANCE' | 'INVESTMENTS' | string;
  counts_json: string | null;
  error: string | null;
}

export class MeuPluggyItemLimitError extends Error {
  constructor() {
    super('O Meu Pluggy permite no máximo 5 conexões para uso pessoal.');
    this.name = 'MeuPluggyItemLimitError';
  }
}

export const openFinanceRepository = {
  async listItems(): Promise<OfItemRecord[]> {
    const db = await getDatabase();
    return db.select().from(ofItems);
  },

  async addItem(itemId: string): Promise<OfItemRecord> {
    const normalized = itemId.trim();
    if (!normalized) {
      throw new Error('Informe um itemId válido.');
    }

    const db = await getDatabase();
    const existing = await db.select().from(ofItems).where(eq(ofItems.id, normalized));
    if (existing.length > 0) {
      return existing[0];
    }

    const current = await db.select().from(ofItems);
    if (current.length >= MAX_MEU_PLUGGY_ITEMS) {
      throw new MeuPluggyItemLimitError();
    }

    const record: OfItemRecord = {
      id: normalized,
      connector_name: null,
      status: null,
      execution_status: null,
      consent_expires_at: null,
      last_synced_at: null,
      last_error: null,
    };
    await db.insert(ofItems).values(record);
    return record;
  },

  async upsertItem(record: OfItemRecord): Promise<void> {
    const db = await getDatabase();
    const existing = await db.select().from(ofItems).where(eq(ofItems.id, record.id));
    if (existing.length > 0) {
      await db
        .update(ofItems)
        .set({
          connector_name: record.connector_name,
          status: record.status,
          execution_status: record.execution_status,
          consent_expires_at: record.consent_expires_at,
          last_synced_at: record.last_synced_at,
          last_error: record.last_error,
        })
        .where(eq(ofItems.id, record.id));
      return;
    }

    const current = await db.select().from(ofItems);
    if (current.length >= MAX_MEU_PLUGGY_ITEMS) {
      throw new MeuPluggyItemLimitError();
    }
    await db.insert(ofItems).values(record);
  },

  async removeItem(itemId: string): Promise<void> {
    const db = await getDatabase();
    await db.delete(ofItems).where(eq(ofItems.id, itemId));
  },

  async recordSyncRun(
    run: Omit<OfSyncRunRecord, 'kind'> & { kind?: 'FINANCE' | 'INVESTMENTS' | string }
  ): Promise<void> {
    const db = await getDatabase();
    const resolvedKind =
      run.kind ?? (run.id.startsWith('of-inv-') ? 'INVESTMENTS' : 'FINANCE');
    await db.insert(ofSyncRuns).values({
      ...run,
      kind: resolvedKind,
    });
  },

  async listSyncRuns(itemId?: string): Promise<OfSyncRunRecord[]> {
    const db = await getDatabase();
    if (itemId) {
      return db
        .select()
        .from(ofSyncRuns)
        .where(eq(ofSyncRuns.item_id, itemId))
        .orderBy(desc(ofSyncRuns.started_at));
    }
    return db.select().from(ofSyncRuns).orderBy(desc(ofSyncRuns.started_at));
  },
};
