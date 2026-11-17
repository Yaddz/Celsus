import Decimal from 'decimal.js';
import { isUnknownCost } from '../domain/finance/averagePrice';
import { getDatabase } from '../db/client';
import {
  assets,
  finAccounts,
  finBills,
  finEntries,
  marketPriceCache,
  portfolios,
  type FinGoal,
  type NetWorthSnapshot,
} from '../db/schema';
import { summarizeOpenFinanceBill } from '../domain/openFinance/cardBills';
import {
  calculateNetWorth,
  decimalReaisToCents,
  evaluateGoal,
  validatePortfolioShareSlices,
  type FinGoalSourceInput,
  type GoalAccountContext,
  type GoalEvaluation,
  type GoalPortfolioContext,
  type NetWorthResult,
} from '../domain/finance/goal';
import {
  resolveAccountBalance,
  getTodayIsoLocal,
  resolveBillMonth,
  summarizeBill,
} from '../domain/financeFlow';

type DomainFinEntry = Parameters<typeof summarizeBill>[0][number];
import { finGoalsRepository, type SaveGoalInput } from '../repositories/finGoalsRepository';

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
  const db = getDatabase();
  const refIso = referenceDateIso ?? getTodayIsoLocal();

  const [allAccounts, allEntries, allBills, allPortfolios, allAssets, allPrices, contributions] =
    await Promise.all([
      db.select().from(finAccounts),
      db.select().from(finEntries),
      db.select().from(finBills),
      db.select().from(portfolios),
      db.select().from(assets),
      db.select().from(marketPriceCache),
      finGoalsRepository.listContributions(),
    ]);

  const priceMap = new Map(allPrices.map((p) => [p.ticker, p.current_price]));
  const normalizedEntries = allEntries.map((e) => ({
    ...e,
    kind: e.kind as DomainFinEntry['kind'],
    status: e.status as DomainFinEntry['status'],
  })) as DomainFinEntry[];

  const accountContexts: GoalAccountContext[] = allAccounts
    .filter((a) => !a.archived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance_cents: resolveAccountBalance(a, normalizedEntries),
    }));

  // Dívida de cartão: soma do saldo em aberto de todas as faturas não quitadas
  let openCardBillsCents = 0;
  const cardAccounts = allAccounts.filter((a) => !a.archived && a.type === 'card');
  for (const card of cardAccounts) {
    // Lançamento sem mês de fatura gravado (recorrência no cartão) entra pela regra de fechamento
    const cardEntries = normalizedEntries
      .filter((e) => e.account_id === card.id)
      .map((e) =>
        e.bill_month
          ? e
          : {
              ...e,
              bill_month: resolveBillMonth(e.due_date, card.closing_day ?? 1, card.due_day),
            }
      );
    const cardBills = allBills
      .filter((b) => b.account_id === card.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const billByMonth = new Map(cardBills.map((b, idx) => [b.bill_month, { bill: b, idx }]));
    const months = new Set([
      ...cardEntries.map((e) => e.bill_month).filter((m): m is string => Boolean(m)),
      ...cardBills.map((b) => b.bill_month),
    ]);
    for (const bm of months) {
      const ofBillInfo = billByMonth.get(bm);
      if (card.source === 'OPEN_FINANCE' && ofBillInfo) {
        const nextBill =
          ofBillInfo.idx + 1 < cardBills.length ? cardBills[ofBillInfo.idx + 1] : null;
        const ofSummary = summarizeOpenFinanceBill(
          ofBillInfo.bill,
          nextBill,
          cardEntries,
          refIso,
          { firstSyncIso: card.of_linked_at }
        );
        if (
          ofSummary.status !== 'paga' &&
          ofSummary.status !== 'sem saldo' &&
          ofSummary.status !== 'sem dados de pagamento'
        ) {
          openCardBillsCents += Math.max(0, ofSummary.totalCents - ofSummary.paidCents);
        }
        continue;
      }
      const summary = summarizeBill(cardEntries, bm, {
        closingDay: card.closing_day ?? 1,
        todayIso: refIso,
      });
      if (summary.status !== 'paga' && summary.openCents > 0) {
        openCardBillsCents += summary.openCents;
      }
    }
  }

  const portfolioContexts: GoalPortfolioContext[] = [];
  const nwPortfolios: Array<{ id: string; totalValueReais: Decimal; is_archived: number }> = [];

  for (const p of allPortfolios) {
    if (p.is_archived) continue;
    const pAssets = allAssets.filter((a) => a.portfolio_id === p.id);
    let totalReais = new Decimal(0);
    let profitMarketReais = new Decimal(0);
    let totalCostReais = new Decimal(0);
    const byClass: Record<string, number> = {};

    for (const a of pAssets) {
      const qty = new Decimal(a.quantity || 0);
      const unknownCost = isUnknownCost(a);
      const fallbackAvg = unknownCost ? 0 : a.average_price || 0;
      const unitPrice = new Decimal(
        a.manual_price_override ?? priceMap.get(a.ticker) ?? fallbackAvg
      );
      // Valor de posição informado (Open Finance / manual) vence quantidade × preço, como na carteira
      const hasPositionValue =
        a.value_source === 'INSTITUTION' &&
        a.of_reported_value !== null &&
        a.of_reported_value !== undefined &&
        a.of_reported_value !== ''
          ? true
          : a.manual_position_value !== null &&
            a.manual_position_value !== undefined &&
            a.manual_position_value !== '';
      const rawPosVal =
        a.value_source === 'INSTITUTION' && a.of_reported_value
          ? a.of_reported_value
          : a.manual_position_value;
      const valReais = hasPositionValue
        ? new Decimal(rawPosVal as string)
        : qty.mul(unitPrice);
      totalReais = totalReais.plus(valReais);
      if (!unknownCost) {
        const costReais = qty.mul(new Decimal(a.average_price || 0));
        totalCostReais = totalCostReais.plus(costReais);
        profitMarketReais = profitMarketReais.plus(valReais);
      }
      const clsCents = decimalReaisToCents(valReais);
      byClass[a.asset_class] = (byClass[a.asset_class] ?? 0) + clsCents;
    }

    const totalCents = decimalReaisToCents(totalReais);
    const annualReturnPercent = totalCostReais.gt(0)
      ? profitMarketReais.minus(totalCostReais).div(totalCostReais).mul(100).toNumber()
      : 0;

    portfolioContexts.push({
      id: p.id,
      name: p.name,
      total_cents: totalCents,
      by_class_cents: byClass,
      annual_return_percent: annualReturnPercent,
    });
    nwPortfolios.push({ id: p.id, totalValueReais: totalReais, is_archived: p.is_archived });
  }

  const netWorth = calculateNetWorth(
    accountContexts.map((a) => ({
      id: a.id,
      type: a.type ?? 'checking',
      balance_cents: a.balance_cents,
      archived: 0,
    })),
    nwPortfolios,
    openCardBillsCents
  );

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
    return finGoalsRepository.migrateLegacyPortfolioGoals();
  },
};
