import type { Dividend } from '../domain/finance/assetProfile';
import type { DividendGoalCandidate } from '../domain/sandbox/dividendGoal';

export interface DividendGoalScenarioSpec {
  monthlyGoalBRL: number;
  useFixedExpenses: boolean;
  adjustByIpca: boolean;
  mode: 'follow_targets' | 'free';
  maxPerAssetPct: number;
  assetClassFilter: string;
  snowballMonthlyBRL: number;
}

export interface LoadCandidatesOptions {
  mode: 'follow_targets' | 'free';
  assetClass?: string;
  portfolioId?: string;
  refDate?: string;
}

export interface LoadedCandidatesResult {
  candidates: DividendGoalCandidate[];
  shortHistoryTickers: string[];
  dividendsByTicker: Record<string, Dividend[]>;
  pricesByTicker: Record<string, number>;
}

export class DividendGoalService {
  clearCache(): void {
    // stub
  }

  async getFixedExpensesMonthlyCents(): Promise<number | null> {
    throw new Error('Not implemented');
  }

  async getCurrentMonthlyIncomeBRL(_refDate?: string): Promise<number> {
    throw new Error('Not implemented');
  }

  async getIpca12mRate(): Promise<number | null> {
    throw new Error('Not implemented');
  }

  async getDividendsCached(
    _ticker: string,
    _assetClass?: string
  ): Promise<Dividend[]> {
    throw new Error('Not implemented');
  }

  async loadCandidates(
    _options: LoadCandidatesOptions
  ): Promise<LoadedCandidatesResult> {
    throw new Error('Not implemented');
  }
}

export const dividendGoalService = new DividendGoalService();
