import Decimal from 'decimal.js';

export interface IncomeHistoryEvent {
  id: string;
  portfolioId: string;
  ticker: string;
  payDate: string; // YYYY-MM-DD
  amount: string;
  notes?: string | null;
  source?: string;
  externalId?: string | null;
  kind?: string | null;
  quantity?: string | null;
  unitAmount?: string | null;
}

export interface IncomeFilters {
  portfolioIds?: string[];
  from?: string; // YYYY-MM-DD or YYYY-MM
  to?: string;   // YYYY-MM-DD or YYYY-MM
  assetClass?: string;
  kind?: string;
  ticker?: string;
}

export interface MonthlyIncomePoint {
  month: string; // YYYY-MM
  total: string;
  count: number;
}

export interface YearlyIncomePoint {
  year: number;
  total: string;
  monthlyAverage: string;
  count: number;
}

export interface GroupedMonthIncomes {
  month: string; // YYYY-MM
  total: string;
  items: IncomeHistoryEvent[];
}

export interface TickerIncomeRank {
  ticker: string;
  total: string;
  sharePercent: string;
  count: number;
}

export function filterIncomes(
  events: IncomeHistoryEvent[],
  filters: IncomeFilters,
  assetClassMap?: Record<string, string>
): IncomeHistoryEvent[] {
  return [];
}

export function monthlySeries(
  events: IncomeHistoryEvent[],
  options: { from: string; to: string }
): MonthlyIncomePoint[] {
  return [];
}

export function yearlySeries(events: IncomeHistoryEvent[]): YearlyIncomePoint[] {
  return [];
}

export function groupByMonth(events: IncomeHistoryEvent[]): GroupedMonthIncomes[] {
  return [];
}

export function rankByTicker(events: IncomeHistoryEvent[], limit?: number): TickerIncomeRank[] {
  return [];
}

export function trailing12m(
  events: IncomeHistoryEvent[],
  refDate?: string
): { total: string; count: number; from: string; to: string } {
  return { total: '0.00', count: 0, from: '', to: '' };
}

export function yieldOnCost(
  events: IncomeHistoryEvent[],
  costBasis: string | number,
  refDate?: string
): string | null {
  return null;
}

export function averagePerMonth(
  events: IncomeHistoryEvent[],
  options: { from: string; to: string }
): string {
  return '0.00';
}

export function bestMonth(
  series: Array<{ month: string; total: string }>
): { month: string; total: string } | null {
  return null;
}
