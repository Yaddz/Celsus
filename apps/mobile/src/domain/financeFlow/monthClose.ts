import type { FinAccount, FinEntry } from '../../db/schema';
import type { MonthSummaryR43 } from './monthSummary';

export interface AvailableSurplusResult {
  surplusCents: number;
  pendingCents: number;
  availableCents: number;
  rawAvailableCents: number;
}

export interface EmergencyReserveResult {
  reserveCents: number;
  targetCents: number;
  months: number | null;
  status: 'completa' | 'incompleta' | '—';
  suggestedToReserveCents: number;
}

function addMonths(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10) - 1;
  const dt = new Date(Date.UTC(y, m + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Filtra despesas pendentes até o dia D do mês seguinte a `yearMonth`.
 */
export function filterPendingUntilDay(
  entries: FinEntry[],
  yearMonth: string,
  cutoffDay = 5
): FinEntry[] {
  const nextMonth = addMonths(yearMonth, 1);
  const clampedDay = Math.max(1, Math.min(31, Math.floor(cutoffDay)));
  const cutoffIso = `${nextMonth}-${String(clampedDay).padStart(2, '0')}`;
  const startIso = `${nextMonth}-01`;

  return entries.filter((entry) => {
    if (entry.of_removed_at) return false;
    if (entry.status !== 'pending') return false;
    if (entry.kind !== 'expense') return false;
    return entry.due_date >= startIso && entry.due_date <= cutoffIso;
  });
}

/**
 * R45 — Sobra disponível = sobra do mês (R43) - contas pendentes até o dia D do mês seguinte.
 */
export function availableSurplus(
  summary: Pick<MonthSummaryR43, 'yearMonth' | 'netCents'>,
  pendingUntilDay: Array<Pick<FinEntry, 'kind' | 'status' | 'amount_cents' | 'of_removed_at'>> | number
): AvailableSurplusResult {
  const surplusCents = summary.netCents;
  const pendingCents =
    typeof pendingUntilDay === 'number'
      ? Math.max(0, pendingUntilDay)
      : pendingUntilDay.reduce((sum, entry) => {
          if (entry.of_removed_at) return sum;
          if (entry.status !== 'pending' || entry.kind !== 'expense') return sum;
          return sum + entry.amount_cents;
        }, 0);

  const rawAvailableCents = surplusCents - pendingCents;
  const availableCents = Math.max(0, rawAvailableCents);

  return {
    surplusCents,
    pendingCents,
    availableCents,
    rawAvailableCents,
  };
}

/**
 * Média mensal de despesas nos últimos N meses fechados anteriores a `referenceYearMonth`.
 */
export function averageMonthlyExpenses(
  entries: FinEntry[],
  referenceYearMonth: string,
  monthsCount = 6
): number {
  const months = new Set<string>();
  for (let i = 1; i <= monthsCount; i++) {
    months.add(addMonths(referenceYearMonth, -i));
  }

  const totalsByMonth = new Map<string, number>();
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (entry.kind !== 'expense') continue;
    if (entry.of_class_reason === 'CARD_DEBT_ROLLOVER') continue;
    const ym = entry.due_date.slice(0, 7);
    if (!months.has(ym)) continue;
    const real =
      entry.status === 'paid'
        ? entry.paid_amount_cents ?? entry.amount_cents
        : entry.amount_cents;
    totalsByMonth.set(ym, (totalsByMonth.get(ym) ?? 0) + real);
  }

  if (totalsByMonth.size === 0) return 0;
  let sum = 0;
  for (const val of totalsByMonth.values()) sum += val;
  return Math.round(sum / totalsByMonth.size);
}

/**
 * R45 — Reserva de emergência = (checking + cash + RF líquida) / média de despesas 6m.
 */
export function emergencyReserve(
  accounts: Array<Pick<FinAccount, 'type'> & { balanceCents: number }>,
  liquidFixedIncomeCents: number,
  avgExpenses6mCents: number,
  targetMonths = 6,
  availableSurplusCents?: number
): EmergencyReserveResult {
  const liquidAccountsCents = accounts.reduce((sum, acc) => {
    if (acc.type !== 'checking' && acc.type !== 'cash') return sum;
    return sum + acc.balanceCents;
  }, 0);

  const reserveCents = Math.max(0, liquidAccountsCents + liquidFixedIncomeCents);

  if (avgExpenses6mCents <= 0) {
    return {
      reserveCents,
      targetCents: 0,
      months: null,
      status: '—',
      suggestedToReserveCents: 0,
    };
  }

  const months = Number((reserveCents / avgExpenses6mCents).toFixed(2));
  const targetCents = Math.round(avgExpenses6mCents * targetMonths);
  const deficitCents = Math.max(0, targetCents - reserveCents);
  const status = deficitCents === 0 ? 'completa' : 'incompleta';
  const suggestedToReserveCents =
    availableSurplusCents === undefined
      ? deficitCents
      : Math.min(Math.max(0, availableSurplusCents), deficitCents);

  return {
    reserveCents,
    targetCents,
    months,
    status,
    suggestedToReserveCents,
  };
}
