import type { MonthSummaryR43 } from '../financeFlow/monthSummary';

export interface FireProjectionInput {
  investedCents: number;
  monthlyCents: number;
  realReturn: number;
  target: number;
  maxYears?: number;
  startYearMonth?: string;
}

export interface FireProjectionPoint {
  monthIndex: number;
  yearMonth: string;
  balanceCents: number;
}

export interface FireProjectionResult {
  series: FireProjectionPoint[];
  arrivalMonths: number | null;
  arrivalDate: string | null;
  reached: boolean;
}

function addMonthsYm(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10) - 1;
  const dt = new Date(Date.UTC(y, m + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * R52 — Média de gasto mensal dos últimos `n` meses fechados (padrão 12).
 * Retorna `null` quando há menos de 3 meses de histórico.
 */
export function averageMonthlyExpense(
  monthSummaries: Array<Pick<MonthSummaryR43, 'yearMonth' | 'expenseCents'>>,
  n = 12
): number | null {
  if (!Array.isArray(monthSummaries) || monthSummaries.length < 3 || n <= 0) {
    return null;
  }
  const sorted = monthSummaries
    .slice()
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const slice = sorted.slice(-n);
  if (slice.length < 3) return null;

  const total = slice.reduce((acc, item) => acc + Math.max(0, item.expenseCents), 0);
  return Math.round(total / slice.length);
}

/**
 * R52 — Aporte médio mensal dos últimos `n` meses fechados (R43).
 */
export function averageMonthlyContribution(
  monthSummaries: Array<Pick<MonthSummaryR43, 'yearMonth' | 'contributionCents'>>,
  n = 12
): number {
  if (!Array.isArray(monthSummaries) || monthSummaries.length === 0 || n <= 0) {
    return 0;
  }
  const sorted = monthSummaries
    .slice()
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const slice = sorted.slice(-n);
  const total = slice.reduce((acc, item) => acc + item.contributionCents, 0);
  return Math.max(0, Math.round(total / slice.length));
}

/**
 * R52 — Número da independência financeira = gasto mensal × 12 ÷ taxa de retirada.
 */
export function fireNumber(expense: number, withdrawalRate: number): number | null {
  if (
    !Number.isFinite(expense) ||
    !Number.isFinite(withdrawalRate) ||
    expense < 0 ||
    withdrawalRate <= 0
  ) {
    return null;
  }
  if (expense === 0) return 0;
  return Math.round((expense * 12) / withdrawalRate);
}

/**
 * R52 — Projeção mês a mês em valores de hoje até atingir `target` ou completar `maxYears` (padrão 60 anos).
 * Retorna série mensal e data de chegada (`null` se não chega no horizonte).
 */
export function projectToFire(input: FireProjectionInput): FireProjectionResult {
  const maxMonths = Math.max(1, Math.round((input.maxYears ?? 60) * 12));
  const startYm =
    input.startYearMonth ?? new Date().toISOString().slice(0, 7);
  const monthlyRate =
    input.realReturn > -1 ? Math.pow(1 + input.realReturn, 1 / 12) - 1 : 0;

  let balance = Math.max(0, input.investedCents);
  const monthlyCents = Math.max(0, input.monthlyCents);
  const target = Math.max(0, input.target);

  const series: FireProjectionPoint[] = [
    {
      monthIndex: 0,
      yearMonth: startYm,
      balanceCents: Math.round(balance),
    },
  ];

  let arrivalMonths: number | null = balance >= target && target > 0 ? 0 : null;

  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + monthlyRate) + monthlyCents;
    const rounded = Math.round(balance);
    series.push({
      monthIndex: m,
      yearMonth: addMonthsYm(startYm, m),
      balanceCents: rounded,
    });
    if (arrivalMonths === null && target > 0 && rounded >= target) {
      arrivalMonths = m;
    }
  }

  return {
    series,
    arrivalMonths,
    arrivalDate: arrivalMonths !== null ? addMonthsYm(startYm, arrivalMonths) : null,
    reached: arrivalMonths !== null,
  };
}
