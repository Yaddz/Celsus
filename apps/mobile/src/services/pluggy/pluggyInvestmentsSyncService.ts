import type { PluggyClient } from './pluggyClient';
import type { PluggyInvestment } from './types';
import type {
  ClassCoverageStatus,
  InvestmentMatchStrategy,
} from '../../domain/openFinance/investments';

export interface InvestmentReconciliationProposal {
  pluggyInvestment: PluggyInvestment;
  suggestedAssetId: string | null;
  matchStrategy: InvestmentMatchStrategy;
  suggestedPortfolioId: string | null;
}

export interface InvestmentReconciliationChoice {
  pluggyInvestmentId: string;
  action: 'MATCH' | 'CREATE_NEW';
  targetAssetId?: string | null;
  targetPortfolioId: string;
}

export interface SyncInvestmentsOptions {
  client?: PluggyClient;
  now?: () => Date;
  defaultPortfolioId?: string;
  portfolioByItemId?: Record<string, string>;
  reconciliationChoices?: InvestmentReconciliationChoice[];
}

export interface SyncInvestmentsCounts {
  investmentsFetched: number;
  assetsCreated: number;
  assetsUpdated: number;
  assetsClosed: number;
  assetsMarkedMissing: number;
  transactionsArchived: number;
  transactionsCreated: number;
}

export interface SyncInvestmentsResult {
  runId: string;
  itemId: string;
  status: 'SUCCESS' | 'ERROR';
  counts: SyncInvestmentsCounts;
  coverageByClass: ClassCoverageStatus[];
  needsReconciliation: boolean;
  error?: string;
}

export interface B3ConflictWarning {
  ticker: string;
  assetId: string;
  message: string;
}

export interface DisconnectInvestmentsResult {
  revertedAssets: number;
  restoredTransactions: number;
}

export const pluggyInvestmentsSyncService = {
  async previewReconciliation(
    _itemId: string,
    _options?: { client?: PluggyClient; targetPortfolioId?: string }
  ): Promise<InvestmentReconciliationProposal[]> {
    throw new Error('Not implemented: pluggyInvestmentsSyncService.previewReconciliation');
  },

  async syncInvestments(
    _itemId: string,
    _options?: SyncInvestmentsOptions
  ): Promise<SyncInvestmentsResult> {
    throw new Error('Not implemented: pluggyInvestmentsSyncService.syncInvestments');
  },

  async disconnectItemInvestments(
    _itemId: string
  ): Promise<DisconnectInvestmentsResult> {
    throw new Error('Not implemented: pluggyInvestmentsSyncService.disconnectItemInvestments');
  },

  async checkB3ImportConflicts(
    _portfolioId: string,
    _tickers: string[]
  ): Promise<B3ConflictWarning[]> {
    throw new Error('Not implemented: pluggyInvestmentsSyncService.checkB3ImportConflicts');
  },
};
