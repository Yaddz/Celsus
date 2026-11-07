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
