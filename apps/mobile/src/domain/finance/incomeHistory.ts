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
  const normTicker = filters.ticker ? filters.ticker.trim().toUpperCase() : null;
  const normKind = filters.kind ? filters.kind.trim().toUpperCase() : null;
  const fromDate = filters.from
    ? filters.from.length === 7
      ? `${filters.from}-01`
      : filters.from
    : null;
  const toDate = filters.to
    ? filters.to.length === 7
      ? `${filters.to}-31`
      : filters.to
    : null;

  return events.filter((e) => {
    if (filters.portfolioIds && filters.portfolioIds.length > 0) {
      if (!filters.portfolioIds.includes(e.portfolioId)) return false;
    }
    if (normTicker && e.ticker.trim().toUpperCase() !== normTicker) {
      return false;
    }
    if (normKind && (e.kind || 'PROVENTO').trim().toUpperCase() !== normKind) {
      return false;
    }
    if (fromDate && e.payDate < fromDate) {
      return false;
    }
    if (toDate && e.payDate > toDate) {
      return false;
    }
    if (filters.assetClass && assetClassMap) {
      const eClass = assetClassMap[e.ticker.trim().toUpperCase()];
      if (eClass !== filters.assetClass) {
        return false;
      }
    }
    return true;
  });
}

function parseMonth(monthStr: string): { year: number; month: number } {
  const [y, m] = monthStr.slice(0, 7).split('-').map(Number);
  return { year: y, month: m };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthlySeries(
  events: IncomeHistoryEvent[],
  options: { from: string; to: string }
): MonthlyIncomePoint[] {
  const start = parseMonth(options.from);
  const end = parseMonth(options.to);

  // Mapear somas e contagens por YYYY-MM
  const map = new Map<string, { total: Decimal; count: number }>();
  for (const e of events) {
    const ym = e.payDate.slice(0, 7);
    const existing = map.get(ym) ?? { total: new Decimal(0), count: 0 };
    existing.total = existing.total.plus(new Decimal(e.amount || 0));
    existing.count += 1;
    map.set(ym, existing);
  }

  const result: MonthlyIncomePoint[] = [];
  let curY = start.year;
  let curM = start.month;

  while (curY < end.year || (curY === end.year && curM <= end.month)) {
    const ym = formatMonth(curY, curM);
    const data = map.get(ym) ?? { total: new Decimal(0), count: 0 };
    result.push({
      month: ym,
      total: data.total.toFixed(2),
      count: data.count,
    });

    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  return result;
}

export function yearlySeries(events: IncomeHistoryEvent[]): YearlyIncomePoint[] {
  const map = new Map<number, { total: Decimal; count: number }>();

  for (const e of events) {
    const y = Number(e.payDate.slice(0, 4));
    const existing = map.get(y) ?? { total: new Decimal(0), count: 0 };
    existing.total = existing.total.plus(new Decimal(e.amount || 0));
    existing.count += 1;
    map.set(y, existing);
  }

  const years = [...map.keys()].sort((a, b) => a - b);
  return years.map((y) => {
    const d = map.get(y)!;
    return {
      year: y,
      total: d.total.toFixed(2),
      monthlyAverage: d.total.div(12).toFixed(2),
      count: d.count,
    };
  });
}

export function groupByMonth(events: IncomeHistoryEvent[]): GroupedMonthIncomes[] {
  const map = new Map<string, { total: Decimal; items: IncomeHistoryEvent[] }>();

  for (const e of events) {
    const ym = e.payDate.slice(0, 7);
    const existing = map.get(ym) ?? { total: new Decimal(0), items: [] };
    existing.total = existing.total.plus(new Decimal(e.amount || 0));
    existing.items.push(e);
    map.set(ym, existing);
  }

  // Mais recente primeiro (YYYY-MM desc)
  const sortedMonths = [...map.keys()].sort((a, b) => b.localeCompare(a));

  return sortedMonths.map((m) => {
    const data = map.get(m)!;
    // Itens ordenados por payDate desc
    const sortedItems = [...data.items].sort((a, b) => b.payDate.localeCompare(a.payDate));
    return {
      month: m,
      total: data.total.toFixed(2),
      items: sortedItems,
    };
  });
}

export function rankByTicker(events: IncomeHistoryEvent[], limit?: number): TickerIncomeRank[] {
  const map = new Map<string, { total: Decimal; count: number }>();
  let grandTotal = new Decimal(0);

  for (const e of events) {
    const t = e.ticker.trim().toUpperCase();
    const amount = new Decimal(e.amount || 0);
    grandTotal = grandTotal.plus(amount);

    const existing = map.get(t) ?? { total: new Decimal(0), count: 0 };
    existing.total = existing.total.plus(amount);
    existing.count += 1;
    map.set(t, existing);
  }

  if (map.size === 0 || grandTotal.lte(0)) {
    return [];
  }

  let list = [...map.entries()].map(([ticker, d]) => ({
    ticker,
    total: d.total,
    count: d.count,
  }));

  // Ordena por maior valor desc
  list.sort((a, b) => b.total.comparedTo(a.total));

  if (limit && limit > 0) {
    list = list.slice(0, limit);
  }

  // Método do maior resto para somar exatamente 100.00% (ou a fatia proporcional)
  // Usamos pontos base (10000 = 100.00%)
  const itemsWithShares = list.map((item) => {
    const exactBp = item.total.div(grandTotal).times(10000);
    const floorBp = Math.floor(exactBp.toNumber());
    const remainder = exactBp.minus(floorBp).toNumber();
    return {
      ...item,
      floorBp,
      remainder,
    };
  });

  const targetTotalBp = list.length === map.size ? 10000 : itemsWithShares.reduce((s, i) => s + i.floorBp, 0);
  const currentSumBp = itemsWithShares.reduce((s, i) => s + i.floorBp, 0);
  let diffBp = targetTotalBp - currentSumBp;

  // Ordena por maior resto para distribuir as sobras
  const sortedByRemainder = [...itemsWithShares].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < diffBp && i < sortedByRemainder.length; i++) {
    sortedByRemainder[i].floorBp += 1;
  }

  return itemsWithShares.map((item) => ({
    ticker: item.ticker,
    total: item.total.toFixed(2),
    sharePercent: (item.floorBp / 100).toFixed(2),
    count: item.count,
  }));
}

export function trailing12m(
  events: IncomeHistoryEvent[],
  refDate?: string
): { total: string; count: number; from: string; to: string } {
  const ref = refDate || new Date().toISOString().slice(0, 10);
  const ry = Number(ref.slice(0, 4));
  const rm = Number(ref.slice(5, 7));

  let sy = ry - 1;
  let sm = rm + 1;
  if (sm > 12) {
    sm = 1;
    sy = ry;
  }

  const startMonth = formatMonth(sy, sm);
  const endMonth = formatMonth(ry, rm);

  let sum = new Decimal(0);
  let count = 0;

  for (const e of events) {
    const eMonth = e.payDate.slice(0, 7);
    if (eMonth >= startMonth && e.payDate <= ref) {
      sum = sum.plus(new Decimal(e.amount || 0));
      count++;
    }
  }

  return {
    total: sum.toFixed(2),
    count,
    from: startMonth,
    to: endMonth,
  };
}

export function yieldOnCost(
  events: IncomeHistoryEvent[],
  costBasis: string | number,
  refDate?: string
): string | null {
  const cost = new Decimal(costBasis || 0);
  if (cost.lte(0) || cost.isNaN()) {
    return null;
  }

  const t12 = trailing12m(events, refDate);
  const inc = new Decimal(t12.total);
  return inc.div(cost).times(100).toFixed(2);
}

export function averagePerMonth(
  events: IncomeHistoryEvent[],
  options: { from: string; to: string }
): string {
  const start = parseMonth(options.from);
  const end = parseMonth(options.to);

  const monthsCount = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  if (monthsCount <= 0) return '0.00';

  let sum = new Decimal(0);
  for (const e of events) {
    const ym = e.payDate.slice(0, 7);
    if (ym >= options.from.slice(0, 7) && ym <= options.to.slice(0, 7)) {
      sum = sum.plus(new Decimal(e.amount || 0));
    }
  }

  return sum.div(monthsCount).toFixed(2);
}

export function bestMonth(
  series: Array<{ month: string; total: string }>
): { month: string; total: string } | null {
  if (!series || series.length === 0) return null;

  let best: { month: string; total: string; dec: Decimal } | null = null;
  for (const s of series) {
    const dec = new Decimal(s.total || 0);
    if (dec.gt(0)) {
      if (!best || dec.gt(best.dec)) {
        best = { month: s.month, total: s.total, dec };
      }
    }
  }

  return best ? { month: best.month, total: best.total } : null;
}
