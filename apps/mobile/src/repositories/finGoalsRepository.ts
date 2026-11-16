import type {
  FinGoal,
  FinGoalContribution,
  FinGoalSource,
  NetWorthSnapshot,
} from '../db/schema';
import type { FinGoalSourceType } from '../domain/finance/goal';

export interface SaveGoalInput {
  id?: string;
  name: string;
  icon: string;
  color: string;
  target_cents: number;
  target_date?: string | null;
  source_type: FinGoalSourceType;
  monthly_contribution_cents?: number | null;
  sources?: Array<{
    ref_type: 'account' | 'portfolio';
    ref_id: string;
    asset_class?: string | null;
    share_percent: number;
  }>;
}

export const finGoalsRepository = {
  async listGoals(_includeArchived = false): Promise<FinGoal[]> {
    throw new Error('Not implemented: finGoalsRepository.listGoals');
  },
  async getGoalById(_id: string): Promise<FinGoal | null> {
    throw new Error('Not implemented: finGoalsRepository.getGoalById');
  },
  async saveGoal(_input: SaveGoalInput): Promise<FinGoal> {
    throw new Error('Not implemented: finGoalsRepository.saveGoal');
  },
  async archiveGoal(_id: string, _archived = true): Promise<void> {
    throw new Error('Not implemented: finGoalsRepository.archiveGoal');
  },
  async listGoalSources(_goalId?: string): Promise<FinGoalSource[]> {
    throw new Error('Not implemented: finGoalsRepository.listGoalSources');
  },
  async listPortfolioGoalSources(_portfolioId: string): Promise<FinGoalSource[]> {
    throw new Error('Not implemented: finGoalsRepository.listPortfolioGoalSources');
  },
  async addContribution(_input: {
    goal_id: string;
    amount_cents: number;
    date: string;
    notes?: string | null;
  }): Promise<FinGoalContribution> {
    throw new Error('Not implemented: finGoalsRepository.addContribution');
  },
  async listContributions(_goalId?: string): Promise<FinGoalContribution[]> {
    throw new Error('Not implemented: finGoalsRepository.listContributions');
  },
  async listNetWorthSnapshots(): Promise<NetWorthSnapshot[]> {
    throw new Error('Not implemented: finGoalsRepository.listNetWorthSnapshots');
  },
  async recordMonthlySnapshot(
    _snapshot: NetWorthSnapshot,
    _options?: { forceUpdate?: boolean }
  ): Promise<NetWorthSnapshot> {
    throw new Error('Not implemented: finGoalsRepository.recordMonthlySnapshot');
  },
  async migrateLegacyPortfolioGoals(): Promise<number> {
    throw new Error('Not implemented: finGoalsRepository.migrateLegacyPortfolioGoals');
  },
};
