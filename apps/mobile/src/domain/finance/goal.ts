import Decimal from 'decimal.js';

export interface GoalProgress {
  /** Percentual atingido, limitado a 100. */
  progressPercent: string;
  /** Quanto falta para a meta (0 quando atingida). */
  remaining: string;
  reached: boolean;
}

/** Progresso da meta de patrimônio (ex.: R$ 100.000). */
export function calculateGoalProgress(
  currentValue: string | number,
  goalValue: string | number | null | undefined
): GoalProgress {
  const current = new Decimal(currentValue || 0);
  const goal = new Decimal(goalValue || 0);
  if (goal.lte(0)) {
    return { progressPercent: '0.00', remaining: '0.00', reached: false };
  }
  const pct = Decimal.min(100, Decimal.max(0, current.div(goal).mul(100)));
  const remaining = Decimal.max(0, goal.minus(current));
  return {
    progressPercent: pct.toFixed(2),
    remaining: remaining.toFixed(2),
    reached: current.gte(goal),
  };
}

const MAX_MONTHS = 1200;

/**
 * Meses até atingir a meta com aporte mensal fixo e retorno anual (%) composto.
 * 0 se já atingida; null se inalcançável em 100 anos.
 */
export function projectMonthsToGoal(
  currentValue: string | number,
  goalValue: string | number,
  monthlyContribution: string | number,
  annualReturnPercent: number = 0
): number | null {
  let value = new Decimal(currentValue || 0);
  const goal = new Decimal(goalValue || 0);
  const contribution = new Decimal(monthlyContribution || 0);
  if (goal.lte(0) || value.gte(goal)) return 0;
  const monthlyRate = new Decimal(1)
    .plus(new Decimal(annualReturnPercent || 0).div(100))
    .pow(new Decimal(1).div(12))
    .minus(1);
  if (contribution.lte(0) && monthlyRate.lte(0)) return null;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    value = value.mul(monthlyRate.plus(1)).plus(contribution);
    if (value.gte(goal)) return month;
  }
  return null;
}

/** Aporte mensal necessário para atingir a meta em `months` meses. */
export function requiredMonthlyContribution(
  currentValue: string | number,
  goalValue: string | number,
  months: number,
  annualReturnPercent: number = 0
): string {
  const current = new Decimal(currentValue || 0);
  const goal = new Decimal(goalValue || 0);
  if (months <= 0 || goal.lte(current)) return '0.00';
  const r = new Decimal(1)
    .plus(new Decimal(annualReturnPercent || 0).div(100))
    .pow(new Decimal(1).div(12))
    .minus(1);
  const growth = new Decimal(1).plus(r).pow(months);
  const needed = goal.minus(current.mul(growth));
  if (needed.lte(0)) return '0.00';
  const annuity = r.isZero() ? new Decimal(months) : growth.minus(1).div(r);
  return needed.div(annuity).toFixed(2);
}

// ---------------------------------------------------------------------------
// Sprint 68 — Metas unificadas & Patrimônio líquido (interfaces + stubs Fase A)
// ---------------------------------------------------------------------------

export type FinGoalSourceType = 'manual' | 'account' | 'portfolio' | 'net_worth';

export interface FinGoalInput {
  id: string;
  name: string;
  icon: string;
  color: string;
  target_cents: number;
  target_date?: string | null;
  source_type: FinGoalSourceType;
  monthly_contribution_cents?: number | null;
  archived?: number;
  created_at?: string;
}

export interface FinGoalSourceInput {
  id?: string;
  goal_id: string;
  ref_type: 'account' | 'portfolio';
  ref_id: string;
  asset_class?: string | null;
  share_percent: number;
}

export interface FinGoalContributionInput {
  id?: string;
  goal_id: string;
  amount_cents: number;
  date: string;
  notes?: string | null;
}

export interface GoalAccountContext {
  id: string;
  name?: string;
  type?: string;
  balance_cents: number;
}

export interface GoalPortfolioContext {
  id: string;
  name?: string;
  total_cents: number;
  by_class_cents?: Partial<Record<string, number>>;
  annual_return_percent?: number | null;
}

export interface GoalValueContext {
  accounts: GoalAccountContext[];
  portfolios: GoalPortfolioContext[];
  contributions?: FinGoalContributionInput[];
  netWorthCents?: number;
}

export interface GoalEvaluation {
  currentCents: number;
  targetCents: number;
  progressPercent: number;
  remainingCents: number;
  reached: boolean;
  unreachable: boolean;
  monthsToGoal: number | null;
  projectedYearMonth: string | null;
  projectedLabel: string | null;
  requiredMonthlyCents: number | null;
  annualReturnUsed: number;
  isReturnEstimated: boolean;
  sourceSummary: string;
}

export interface NetWorthAccountInput {
  id: string;
  type: string;
  balance_cents: number;
  archived?: number;
}

export interface NetWorthPortfolioInput {
  id: string;
  totalValueReais: string | number | Decimal;
  is_archived?: number;
}

export interface NetWorthResult {
  accountsCents: number;
  investmentsCents: number;
  cardDebtCents: number;
  totalCents: number;
}

export const PRUDENT_ANNUAL_RETURN_MIN = 0;
export const PRUDENT_ANNUAL_RETURN_MAX = 15;

const SHORT_MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const ASSET_CLASS_LABELS_PT: Record<string, string> = {
  FIXED_INCOME: 'Renda fixa',
  FII: 'FIIs',
  STOCK: 'Ações',
  CRYPTO: 'Cripto',
};

function addMonthsYm(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function formatYearMonthShortPt(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const mIdx = Number(mStr) - 1;
  const mon = SHORT_MONTHS_PT[mIdx] ?? mStr;
  return `${mon}/${yStr}`;
}

function monthsBetweenDates(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toIso.slice(0, 7).split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Único ponto de conversão de valores Decimal/string/number (em R$) para centavos inteiros. */
export function decimalReaisToCents(value: string | number | Decimal): number {
  return new Decimal(value || 0).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Limita a rentabilidade anual histórica à faixa prudente [0%, 15%]. */
export function clampPrudentAnnualReturn(annualReturnPercent: number | null | undefined): number {
  if (annualReturnPercent === null || annualReturnPercent === undefined || !Number.isFinite(annualReturnPercent)) {
    return 0;
  }
  return Math.max(PRUDENT_ANNUAL_RETURN_MIN, Math.min(PRUDENT_ANNUAL_RETURN_MAX, annualReturnPercent));
}

/** Valida que todas as fatias estão entre 1–100 e a soma por carteira ativa não passa de 100%. */
export function validatePortfolioShareSlices(
  allSources: FinGoalSourceInput[],
  archivedGoalIds: Set<string> = new Set()
): { valid: boolean; offendingPortfolioIds: string[] } {
  const totalsByPortfolio = new Map<string, number>();
  const offending = new Set<string>();

  for (const src of allSources) {
    if (archivedGoalIds.has(src.goal_id)) continue;
    if (!Number.isFinite(src.share_percent) || src.share_percent < 1 || src.share_percent > 100) {
      offending.add(src.ref_id);
      continue;
    }
    if (src.ref_type === 'portfolio') {
      const next = (totalsByPortfolio.get(src.ref_id) ?? 0) + src.share_percent;
      totalsByPortfolio.set(src.ref_id, next);
      if (next > 100) {
        offending.add(src.ref_id);
      }
    }
  }

  return {
    valid: offending.size === 0,
    offendingPortfolioIds: Array.from(offending),
  };
}

/** Calcula o valor atual (em centavos) de uma meta a partir da sua origem e fatias. */
export function calculateGoalValue(
  goal: FinGoalInput,
  sources: FinGoalSourceInput[],
  context: GoalValueContext
): number {
  const goalSources = sources.filter((s) => s.goal_id === goal.id);

  switch (goal.source_type) {
    case 'manual': {
      const sum = (context.contributions ?? [])
        .filter((c) => c.goal_id === goal.id)
        .reduce((acc, c) => acc + c.amount_cents, 0);
      return Math.max(0, sum);
    }
    case 'account': {
      const accMap = new Map(context.accounts.map((a) => [a.id, a]));
      let total = 0;
      for (const src of goalSources) {
        if (src.ref_type !== 'account') continue;
        const acc = accMap.get(src.ref_id);
        if (!acc) continue;
        total += Math.round((acc.balance_cents * src.share_percent) / 100);
      }
      return total;
    }
    case 'portfolio': {
      const portMap = new Map(context.portfolios.map((p) => [p.id, p]));
      let total = 0;
      for (const src of goalSources) {
        if (src.ref_type !== 'portfolio') continue;
        const port = portMap.get(src.ref_id);
        if (!port) continue;
        const baseCents = src.asset_class
          ? port.by_class_cents?.[src.asset_class] ?? 0
          : port.total_cents;
        total += Math.round((baseCents * src.share_percent) / 100);
      }
      return total;
    }
    case 'net_worth': {
      return context.netWorthCents ?? 0;
    }
    default:
      return 0;
  }
}

function buildSourceSummary(
  goal: FinGoalInput,
  goalSources: FinGoalSourceInput[],
  context: GoalValueContext
): string {
  switch (goal.source_type) {
    case 'manual':
      return 'Aportes manuais';
    case 'net_worth':
      return 'Patrimônio líquido';
    case 'account': {
      const names = goalSources
        .filter((s) => s.ref_type === 'account')
        .map((s) => context.accounts.find((a) => a.id === s.ref_id)?.name ?? 'Conta');
      return names.length > 0 ? names.join(' + ') : 'Conta';
    }
    case 'portfolio': {
      const parts = goalSources
        .filter((s) => s.ref_type === 'portfolio')
        .map((s) => {
          const pName = context.portfolios.find((p) => p.id === s.ref_id)?.name ?? 'Carteira';
          const cls = s.asset_class ? ASSET_CLASS_LABELS_PT[s.asset_class] ?? s.asset_class : null;
          const base = cls ? `${pName} · ${cls}` : pName;
          return s.share_percent < 100 ? `${base} (${s.share_percent}%)` : base;
        });
      return parts.length > 0 ? parts.join(' + ') : 'Carteira';
    }
    default:
      return '';
  }
}

/** Avalia progresso, projeção de data, aporte mensal necessário e resumo de origem da meta. */
export function evaluateGoal(
  goal: FinGoalInput,
  sources: FinGoalSourceInput[],
  context: GoalValueContext,
  options?: { referenceDateIso?: string }
): GoalEvaluation {
  const refIso = options?.referenceDateIso ?? new Date().toISOString().slice(0, 10);
  const refYm = refIso.slice(0, 7);
  const goalSources = sources.filter((s) => s.goal_id === goal.id);

  const currentCents = calculateGoalValue(goal, goalSources, context);
  const targetCents = Math.max(0, goal.target_cents);

  const currentReais = new Decimal(currentCents).div(100).toFixed(2);
  const targetReais = new Decimal(targetCents).div(100).toFixed(2);
  const progress = calculateGoalProgress(currentReais, targetReais);

  let annualReturnUsed = 0;
  let isReturnEstimated = false;

  if (goal.source_type === 'portfolio') {
    isReturnEstimated = true;
    const portSources = goalSources.filter((s) => s.ref_type === 'portfolio');
    const rates: number[] = [];
    for (const src of portSources) {
      const p = context.portfolios.find((item) => item.id === src.ref_id);
      if (p && p.annual_return_percent !== null && p.annual_return_percent !== undefined) {
        rates.push(clampPrudentAnnualReturn(p.annual_return_percent));
      }
    }
    if (rates.length > 0) {
      annualReturnUsed = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
  }

  const monthlyReais = new Decimal(goal.monthly_contribution_cents ?? 0).div(100).toFixed(2);
  const monthsToGoal = projectMonthsToGoal(currentReais, targetReais, monthlyReais, annualReturnUsed);
  const unreachable = !progress.reached && monthsToGoal === null;

  let projectedYearMonth: string | null = null;
  let projectedLabel: string | null = null;
  if (progress.reached) {
    projectedYearMonth = refYm;
    projectedLabel = `atingida em ${formatYearMonthShortPt(refYm)}`;
  } else if (monthsToGoal !== null) {
    projectedYearMonth = addMonthsYm(refYm, monthsToGoal);
    projectedLabel = `no ritmo atual: ${formatYearMonthShortPt(projectedYearMonth)}`;
  }

  let requiredMonthlyCents: number | null = null;
  if (goal.target_date) {
    const monthsUntilTarget = monthsBetweenDates(refIso, goal.target_date);
    if (progress.reached) {
      requiredMonthlyCents = 0;
    } else if (monthsUntilTarget > 0) {
      const reqReais = requiredMonthlyContribution(
        currentReais,
        targetReais,
        monthsUntilTarget,
        annualReturnUsed
      );
      requiredMonthlyCents = decimalReaisToCents(reqReais);
    }
  }

  return {
    currentCents,
    targetCents,
    progressPercent: Number(progress.progressPercent),
    remainingCents: decimalReaisToCents(progress.remaining),
    reached: progress.reached,
    unreachable,
    monthsToGoal,
    projectedYearMonth,
    projectedLabel,
    requiredMonthlyCents,
    annualReturnUsed,
    isReturnEstimated,
    sourceSummary: buildSourceSummary(goal, goalSources, context),
  };
}

/**
 * Calcula o patrimônio líquido unificado:
 * contas (excluindo cartão) + investimentos (convertidos de Decimal) − dívida de cartão.
 */
export function calculateNetWorth(
  accounts: NetWorthAccountInput[],
  portfolios: NetWorthPortfolioInput[],
  openBillsCents: number
): NetWorthResult {
  const accountsCents = accounts
    .filter((a) => !a.archived && a.type !== 'card')
    .reduce((sum, a) => sum + a.balance_cents, 0);

  const investmentsCents = portfolios
    .filter((p) => !p.is_archived)
    .reduce((sum, p) => sum + decimalReaisToCents(p.totalValueReais), 0);

  const cardDebtCents = Math.max(0, Math.round(openBillsCents || 0));
  const totalCents = accountsCents + investmentsCents - cardDebtCents;

  return {
    accountsCents,
    investmentsCents,
    cardDebtCents,
    totalCents,
  };
}

