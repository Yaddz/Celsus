import type { PluggyAccount } from './types';
import type { PluggyClient } from './pluggyClient';

export interface PluggySyncCounts {
  accountsSynced: number;
  transactionsFetched: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  transactionsSettled: number;
  transfersMatched: number;
  billsSynced: number;
}

export interface PluggySyncResult {
  runId: string;
  itemId: string;
  status: 'SUCCESS' | 'ERROR';
  counts: PluggySyncCounts;
  accountsNeedingClosingDay: string[];
  error?: string;
}

export interface AccountReconciliationProposal {
  pluggyAccount: PluggyAccount;
  suggestedLocalAccountId: string | null;
}

export interface AccountReconciliationChoice {
  pluggyAccountId: string;
  targetLocalAccountId: string | 'CREATE_NEW';
  closingDay?: number | null;
}

export interface SyncFinanceOptions {
  client?: PluggyClient;
  now?: () => Date;
  accountChoices?: AccountReconciliationChoice[];
}

export const pluggySyncService = {
  async syncFinance(
    _itemId: string,
    _options?: SyncFinanceOptions
  ): Promise<PluggySyncResult> {
    throw new Error('Not implemented: pluggySyncService.syncFinance');
  },

  async previewAccountReconciliation(
    _itemId: string,
    _client?: PluggyClient
  ): Promise<AccountReconciliationProposal[]> {
    throw new Error('Not implemented: pluggySyncService.previewAccountReconciliation');
  },

  async applyAccountLinks(
    _itemId: string,
    _choices: AccountReconciliationChoice[],
    _pluggyAccounts: PluggyAccount[]
  ): Promise<void> {
    throw new Error('Not implemented: pluggySyncService.applyAccountLinks');
  },

  async syncIfStale(_options?: {
    client?: PluggyClient;
    nowMs?: number;
    thresholdHours?: number;
  }): Promise<{ triggered: boolean; results: PluggySyncResult[]; errors: string[] }> {
    throw new Error('Not implemented: pluggySyncService.syncIfStale');
  },
};
