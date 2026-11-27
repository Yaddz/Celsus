import type { FinAccount, FinRecurrence } from '../db/schema';
import type { MonthSummaryR43 } from '../domain/financeFlow/monthSummary';

export interface FireContextData {
  investedCents: number;
  averageExpenseCents: number | null;
  monthsAvailable: number;
  averageContributionCents: number;
  latestSavingsRateLabel: string;
  reserveMonths: number | null;
  reserveStatus: 'completa' | 'incompleta' | '—';
  monthSummaries: MonthSummaryR43[];
}

export interface CategoryAverageItem {
  categoryId: string;
  categoryName: string;
  monthlyAverageCents: number;
}

export interface OpportunityCostContextData {
  subscriptions: FinRecurrence[];
  categoryAverages: CategoryAverageItem[];
  annualCdiRate: number | null;
  brokerAccounts: FinAccount[];
  defaultBrokerAccountId: string | null;
  defaultSourceAccountId: string | null;
  savedDividendGoalMonthlyBRL: number | null;
  savedDividendGoalYield: number | null;
}

export const fireService = {
  async loadFireContext(_referenceDateIso?: string): Promise<FireContextData> {
    throw new Error('Not implemented (Phase A stub)');
  },

  async createFireGoal(_input: {
    name?: string;
    targetCents: number;
    referenceDateIso?: string;
  }): Promise<string> {
    throw new Error('Not implemented (Phase A stub)');
  },

  async loadOpportunityCostContext(
    _referenceDateIso?: string
  ): Promise<OpportunityCostContextData> {
    throw new Error('Not implemented (Phase A stub)');
  },

  async createMonthlyContributionRecurrence(_input: {
    amountCents: number;
    sourceAccountId: string;
    brokerAccountId: string;
    description?: string;
    dayOfMonth?: number;
    startDate?: string;
  }): Promise<FinRecurrence> {
    throw new Error('Not implemented (Phase A stub)');
  },
};
