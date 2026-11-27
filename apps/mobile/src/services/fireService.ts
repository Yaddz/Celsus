import { getDatabase } from '../db/client';
import { assets, type FinAccount, type FinRecurrence } from '../db/schema';
import { decimalToCents } from '../domain/money';
import {
  averageMonthlyExpenses,
  emergencyReserve,
  getTodayIsoLocal,
  monthSummary,
  type MonthSummaryR43,
} from '../domain/financeFlow';
import {
  averageMonthlyContribution,
  averageMonthlyExpense,
} from '../domain/sandbox/fire';
import { annualizeCdi12m } from '../domain/sandbox/opportunityCost';
import { finRepository } from '../repositories/finRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { sandboxRepository } from '../repositories/sandboxRepository';
import { finGoalsService } from './finGoalsService';
import { marketApiService } from './marketApi';
import { patrimonyService } from './patrimonyService';

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

function addMonthsYm(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10) - 1;
  const dt = new Date(Date.UTC(y, m + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const fireService = {
  async loadFireContext(referenceDateIso?: string): Promise<FireContextData> {
    const refIso = referenceDateIso ?? getTodayIsoLocal();
    const refYm = refIso.slice(0, 7);
    const db = getDatabase();

    const [patrimony, entries, accounts, allAssets] = await Promise.all([
      patrimonyService.getPatrimony(refIso),
      finRepository.listAllEntries(),
      finRepository.listAccounts(),
      db.select().from(assets),
    ]);

    // Últimos 12 meses fechados anteriores ao mês de referência
    const closedMonths: string[] = [];
    for (let i = 12; i >= 1; i--) {
      closedMonths.push(addMonthsYm(refYm, -i));
    }

    const activeMonths = new Set(
      entries
        .filter((e) => !e.of_removed_at && e.of_class_reason !== 'CARD_DEBT_ROLLOVER')
        .map((e) => e.due_date.slice(0, 7))
    );

    const monthSummaries = closedMonths
      .filter((ym) => activeMonths.has(ym))
      .map((ym) => monthSummary(entries, ym, { todayIso: refIso, accounts }));

    const averageExpenseCents = averageMonthlyExpense(monthSummaries, 12);
    const averageContributionCents = averageMonthlyContribution(monthSummaries, 12);
    const latestSummary = monthSummaries[monthSummaries.length - 1];
    const latestSavingsRateLabel = latestSummary?.savingsRateLabel ?? '—';

    // Reserva de emergência (R45)
    const avgExpenses6mCents = averageMonthlyExpenses(entries, refYm, 6);
    const liquidFixedIncomeCents = allAssets
      .filter((a) => a.rf_daily_liquidity === 1)
      .reduce((sum, a) => {
        const qty = Number.parseFloat(a.quantity || '0');
        const price = Number.parseFloat(
          a.manual_price_override || a.average_price || '0'
        );
        if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
        return sum + decimalToCents(qty * price);
      }, 0);

    const reserve = emergencyReserve(
      patrimony.byAccount,
      liquidFixedIncomeCents,
      avgExpenses6mCents,
      6
    );

    return {
      investedCents: patrimony.investedCents,
      averageExpenseCents,
      monthsAvailable: monthSummaries.length,
      averageContributionCents,
      latestSavingsRateLabel,
      reserveMonths: reserve.months,
      reserveStatus: reserve.status,
      monthSummaries,
    };
  },

  async createFireGoal(input: {
    name?: string;
    targetCents: number;
    monthlyContributionCents?: number | null;
    referenceDateIso?: string;
  }): Promise<string> {
    const goal = await finGoalsService.saveGoalWithSources({
      name: input.name?.trim() || 'Independência financeira',
      icon: 'flag',
      color: '#D96628',
      target_cents: Math.max(100, Math.round(input.targetCents)),
      target_date: null,
      source_type: 'net_worth',
      monthly_contribution_cents: input.monthlyContributionCents ?? null,
    });
    return goal.id;
  },

  async loadOpportunityCostContext(
    referenceDateIso?: string
  ): Promise<OpportunityCostContextData> {
    const refIso = referenceDateIso ?? getTodayIsoLocal();
    const refYm = refIso.slice(0, 7);

    const [
      subscriptions,
      entries,
      categories,
      accounts,
      allPortfolios,
      dividendScenarios,
    ] = await Promise.all([
      finRepository.listRecurrences({ onlyActive: true, onlySubscriptions: true }),
      finRepository.listAllEntries(),
      finRepository.listCategories(false),
      finRepository.listAccounts(),
      portfolioRepository.listPortfolios(false),
      sandboxRepository.listScenarios('dividend_goal'),
    ]);

    // Média mensal por categoria nos últimos 6 meses fechados
    const months6 = new Set<string>();
    for (let i = 1; i <= 6; i++) {
      months6.add(addMonthsYm(refYm, -i));
    }
    const categoryTotals = new Map<string, number>();
    for (const e of entries) {
      if (e.of_removed_at) continue;
      if (e.kind !== 'expense') continue;
      if (e.of_class_reason === 'CARD_DEBT_ROLLOVER') continue;
      if (!e.category_id) continue;
      const ym = e.due_date.slice(0, 7);
      if (!months6.has(ym)) continue;
      const real =
        e.status === 'paid' ? e.paid_amount_cents ?? e.amount_cents : e.amount_cents;
      categoryTotals.set(e.category_id, (categoryTotals.get(e.category_id) ?? 0) + real);
    }

    const catNameMap = new Map(
      categories.filter((c) => c.kind === 'expense').map((c) => [c.id, c.name])
    );
    const categoryAverages: CategoryAverageItem[] = Array.from(categoryTotals.entries())
      .map(([categoryId, totalCents]) => ({
        categoryId,
        categoryName: catNameMap.get(categoryId) ?? 'Outros',
        monthlyAverageCents: Math.round(totalCents / 6),
      }))
      .filter((c) => c.monthlyAverageCents > 0)
      .sort((a, b) => b.monthlyAverageCents - a.monthlyAverageCents);

    // CDI anualizado dos últimos 12 meses
    let annualCdiRate: number | null = null;
    try {
      const fromDate = new Date(Date.parse(`${refIso}T00:00:00Z`) - 380 * 86400 * 1000)
        .toISOString()
        .slice(0, 10);
      const rates = await marketApiService.fetchMacroRates(fromDate);
      annualCdiRate = annualizeCdi12m(rates);
    } catch {
      annualCdiRate = null;
    }

    const brokerAccounts = accounts.filter((a) => !a.archived && a.type === 'broker');
    const brokerIds = new Set(brokerAccounts.map((a) => a.id));
    const linkedPortfolio = allPortfolios.find(
      (p) => p.fin_account_id && brokerIds.has(p.fin_account_id)
    );
    const defaultBrokerAccountId = linkedPortfolio?.fin_account_id ?? null;

    const defaultSourceAccount =
      accounts.find((a) => !a.archived && a.type === 'checking') ??
      accounts.find((a) => !a.archived && a.type === 'cash') ??
      null;

    let savedDividendGoalMonthlyBRL: number | null = null;
    let savedDividendGoalYield: number | null = null;
    if (dividendScenarios.length > 0) {
      try {
        const parsed = JSON.parse(dividendScenarios[0].spec_json);
        if (typeof parsed?.monthlyGoalBRL === 'number' && parsed.monthlyGoalBRL > 0) {
          savedDividendGoalMonthlyBRL = parsed.monthlyGoalBRL;
          savedDividendGoalYield =
            typeof parsed?.weightedYield === 'number' && parsed.weightedYield > 0
              ? parsed.weightedYield
              : 0.08;
        }
      } catch {
        // Ignora spec inválido
      }
    }

    return {
      subscriptions,
      categoryAverages,
      annualCdiRate,
      brokerAccounts,
      defaultBrokerAccountId,
      defaultSourceAccountId: defaultSourceAccount?.id ?? null,
      savedDividendGoalMonthlyBRL,
      savedDividendGoalYield,
    };
  },

  async createMonthlyContributionRecurrence(input: {
    amountCents: number;
    sourceAccountId: string;
    brokerAccountId: string;
    description?: string;
    dayOfMonth?: number;
    startDate?: string;
  }): Promise<FinRecurrence> {
    return finRepository.createRecurrence({
      kind: 'transfer',
      amount_cents: Math.round(input.amountCents),
      description: input.description?.trim() || 'Aporte mensal (Custo de oportunidade)',
      account_id: input.sourceAccountId,
      target_account_id: input.brokerAccountId,
      category_id: 'cat-transferencia',
      frequency: 'monthly',
      day_of_month: input.dayOfMonth ?? 5,
      start_date: input.startDate ?? getTodayIsoLocal(),
      is_subscription: 0,
    });
  },
};
