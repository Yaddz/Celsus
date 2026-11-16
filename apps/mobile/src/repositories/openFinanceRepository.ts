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
    throw new Error('Not implemented');
  },
  async addItem(_itemId: string): Promise<OfItemRecord> {
    throw new Error('Not implemented');
  },
  async upsertItem(_record: OfItemRecord): Promise<void> {
    throw new Error('Not implemented');
  },
  async removeItem(_itemId: string): Promise<void> {
    throw new Error('Not implemented');
  },
  async recordSyncRun(_run: OfSyncRunRecord): Promise<void> {
    throw new Error('Not implemented');
  },
  async listSyncRuns(_itemId?: string): Promise<OfSyncRunRecord[]> {
    throw new Error('Not implemented');
  },
};
