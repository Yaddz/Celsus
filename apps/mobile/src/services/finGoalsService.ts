import type { FinGoal, NetWorthSnapshot } from '../db/schema';
import {
  evaluateGoal,
  validatePortfolioShareSlices,
  type FinGoalSourceInput,
  type GoalAccountContext,
  type GoalEvaluation,
  type GoalPortfolioContext,
  type NetWorthResult,
} from '../domain/finance/goal';
import { decimalToCents } from '../domain/money';
import { getTodayIsoLocal } from '../domain/financeFlow';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { finGoalsRepository, type SaveGoalInput } from '../repositories/finGoalsRepository';
import { patrimonyService } from './patrimonyService';

export const PORTFOLIO_GOALS_MIGRATION_META_KEY = 'migration:portfolio-goals-to-fin-goals:v1';

export interface EvaluatedGoalItem {
  goal: FinGoal;
  evaluation: GoalEvaluation;
}

async function buildGoalsContext(referenceDateIso?: string): Promise<{
  accounts: GoalAccountContext[];
  portfolios: GoalPortfolioContext[];
  contributions: Awaited<ReturnType<typeof finGoalsRepository.listContributions>>;
  netWorth: NetWorthResult;
}> {
  const refIso = referenceDateIso ?? getTodayIsoLocal();
  const [patrimony, contributions] = await Promise.all([
    patrimonyService.getPatrimony(refIso),
    finGoalsRepository.listContributions(),
  ]);

  const accountContexts: GoalAccountContext[] = patrimony.byAccount.map((a) => ({
    id: a.accountId,
    name: a.name,
    type: a.type,
    balance_cents: a.balanceCents,
  }));

  const portfolioContexts: GoalPortfolioContext[] = patrimony.byPortfolio.map((p) => ({
    id: p.portfolioId,
    name: p.name,
    total_cents: p.marketValueCents,
    by_class_cents: p.byClassCents,
    annual_return_percent: p.annualReturnPercent,
  }));

  const netWorth: NetWorthResult = {
    accountsCents: patrimony.accountsCents,
    investmentsCents: patrimony.investedCents,
    cardDebtCents: patrimony.cardsCents,
    totalCents: patrimony.totalCents,
  };

  return {
    accounts: accountContexts,
    portfolios: portfolioContexts,
    contributions,
    netWorth,
  };
}

export const finGoalsService = {
  async listEvaluatedGoals(options?: {
    includeArchived?: boolean;
    referenceDateIso?: string;
  }): Promise<EvaluatedGoalItem[]> {
    const [goals, allSources, ctx] = await Promise.all([
      finGoalsRepository.listGoals(options?.includeArchived ?? false),
      finGoalsRepository.listGoalSources(),
      buildGoalsContext(options?.referenceDateIso),
    ]);

    return goals.map((goal) => ({
      goal,
      evaluation: evaluateGoal(
        {
          ...goal,
          source_type: goal.source_type as FinGoal['source_type'] & ('manual' | 'account' | 'portfolio' | 'net_worth'),
        },
        allSources.map((s) => ({
          ...s,
          ref_type: s.ref_type as 'account' | 'portfolio',
        })),
        {
          accounts: ctx.accounts,
          portfolios: ctx.portfolios,
          contributions: ctx.contributions,
          netWorthCents: ctx.netWorth.totalCents,
        },
        { referenceDateIso: options?.referenceDateIso }
      ),
    }));
  },

  async listGoalsForPortfolio(
    portfolioId: string,
    referenceDateIso?: string
  ): Promise<EvaluatedGoalItem[]> {
    const [allEvaluated, portSources] = await Promise.all([
      this.listEvaluatedGoals({ referenceDateIso }),
      finGoalsRepository.listPortfolioGoalSources(portfolioId),
    ]);
    const linkedGoalIds = new Set(portSources.map((s) => s.goal_id));
    return allEvaluated.filter((item) => linkedGoalIds.has(item.goal.id));
  },

  async saveGoalWithSources(input: SaveGoalInput): Promise<FinGoal> {
    if (input.source_type === 'portfolio' && input.sources && input.sources.length > 0) {
      const [allGoals, allSources] = await Promise.all([
        finGoalsRepository.listGoals(true),
        finGoalsRepository.listGoalSources(),
      ]);
      const archivedIds = new Set(allGoals.filter((g) => g.archived).map((g) => g.id));
      const targetId = input.id ?? '__new_goal__';

      const remainingSources: FinGoalSourceInput[] = allSources
        .filter((s) => s.goal_id !== targetId)
        .map((s) => ({
          goal_id: s.goal_id,
          ref_type: s.ref_type as 'account' | 'portfolio',
          ref_id: s.ref_id,
          asset_class: s.asset_class,
          share_percent: s.share_percent,
        }));

      const newSources: FinGoalSourceInput[] = input.sources.map((s) => ({
        goal_id: targetId,
        ref_type: s.ref_type,
        ref_id: s.ref_id,
        asset_class: s.asset_class ?? null,
        share_percent: s.share_percent,
      }));

      const validation = validatePortfolioShareSlices(
        [...remainingSources, ...newSources],
        archivedIds
      );
      if (!validation.valid) {
        throw new Error(
          'A soma das fatias de uma carteira não pode ultrapassar 100%.'
        );
      }
    }

    return finGoalsRepository.saveGoal(input);
  },

  async addManualContribution(input: {
    goalId: string;
    amountCents: number;
    date?: string;
    notes?: string | null;
  }): Promise<void> {
    await finGoalsRepository.addContribution({
      goal_id: input.goalId,
      amount_cents: input.amountCents,
      date: input.date ?? getTodayIsoLocal(),
      notes: input.notes ?? null,
    });
  },

  async computeCurrentNetWorth(referenceDateIso?: string): Promise<NetWorthResult> {
    const ctx = await buildGoalsContext(referenceDateIso);
    return ctx.netWorth;
  },

  getGoalsContext: buildGoalsContext,

  async captureMonthlySnapshot(options?: {
    yearMonth?: string;
    forceUpdate?: boolean;
  }): Promise<NetWorthSnapshot> {
    const yearMonth = options?.yearMonth ?? getTodayIsoLocal().slice(0, 7);
    const nw = await this.computeCurrentNetWorth();
    return finGoalsRepository.recordMonthlySnapshot(
      {
        year_month: yearMonth,
        accounts_cents: nw.accountsCents,
        investments_cents: nw.investmentsCents,
        card_debt_cents: nw.cardDebtCents,
        total_cents: nw.totalCents,
      },
      { forceUpdate: options?.forceUpdate }
    );
  },

  async migrateLegacyGoalsIfNeeded(): Promise<number> {
    const done = await appMetaRepository.get(PORTFOLIO_GOALS_MIGRATION_META_KEY);
    if (done === '1') return 0;
    const count = await finGoalsRepository.migrateLegacyPortfolioGoals();
    await appMetaRepository.set(PORTFOLIO_GOALS_MIGRATION_META_KEY, '1');
    return count;
  },

  /**
   * R44: Grava/atualiza a meta da carteira diretamente em `fin_goals` (fonte `'portfolio'`).
   * As colunas legadas `portfolios.patrimony_goal` e `monthly_contribution` não são mais lidas.
   */
  async savePortfolioGoal(
    portfolioId: string,
    params: {
      portfolioName: string;
      patrimonyGoal: string | null;
      monthlyContribution: string | null;
    }
  ): Promise<FinGoal | null> {
    const existing = await this.listGoalsForPortfolio(portfolioId);
    const primary = existing.find((item) => item.goal.source_type === 'portfolio') ?? existing[0];
    if (!params.patrimonyGoal || Number(params.patrimonyGoal) <= 0) {
      if (primary) {
        await finGoalsRepository.archiveGoal(primary.goal.id, true);
      }
      return null;
    }
    const targetCents = decimalToCents(params.patrimonyGoal);
    const monthlyCents =
      params.monthlyContribution && Number(params.monthlyContribution) > 0
        ? decimalToCents(params.monthlyContribution)
        : 0;

    return this.saveGoalWithSources({
      id: primary?.goal.id,
      name: primary?.goal.name ?? `Meta · ${params.portfolioName}`,
      icon: primary?.goal.icon ?? 'flag',
      color: primary?.goal.color ?? '#4F9A65',
      target_cents: targetCents,
      monthly_contribution_cents: monthlyCents,
      source_type: 'portfolio',
      sources: [{ ref_type: 'portfolio', ref_id: portfolioId, share_percent: 100 }],
    });
  },
};
