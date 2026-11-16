import type { FinGoal, NetWorthSnapshot } from '../db/schema';
import type { GoalEvaluation, NetWorthResult } from '../domain/finance/goal';
import type { SaveGoalInput } from '../repositories/finGoalsRepository';

export interface EvaluatedGoalItem {
  goal: FinGoal;
  evaluation: GoalEvaluation;
}

export const finGoalsService = {
  async listEvaluatedGoals(_options?: {
    includeArchived?: boolean;
    referenceDateIso?: string;
  }): Promise<EvaluatedGoalItem[]> {
    throw new Error('Not implemented: finGoalsService.listEvaluatedGoals');
  },
  async listGoalsForPortfolio(
    _portfolioId: string,
    _referenceDateIso?: string
  ): Promise<EvaluatedGoalItem[]> {
    throw new Error('Not implemented: finGoalsService.listGoalsForPortfolio');
  },
  async saveGoalWithSources(_input: SaveGoalInput): Promise<FinGoal> {
    throw new Error('Not implemented: finGoalsService.saveGoalWithSources');
  },
  async addManualContribution(_input: {
    goalId: string;
    amountCents: number;
    date?: string;
    notes?: string | null;
  }): Promise<void> {
    throw new Error('Not implemented: finGoalsService.addManualContribution');
  },
  async computeCurrentNetWorth(_referenceDateIso?: string): Promise<NetWorthResult> {
    throw new Error('Not implemented: finGoalsService.computeCurrentNetWorth');
  },
  async captureMonthlySnapshot(_options?: {
    yearMonth?: string;
    forceUpdate?: boolean;
  }): Promise<NetWorthSnapshot> {
    throw new Error('Not implemented: finGoalsService.captureMonthlySnapshot');
  },
  async migrateLegacyGoalsIfNeeded(): Promise<number> {
    throw new Error('Not implemented: finGoalsService.migrateLegacyGoalsIfNeeded');
  },
};
