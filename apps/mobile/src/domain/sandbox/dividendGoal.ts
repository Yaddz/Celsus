import type { Dividend } from '../finance/assetProfile';

export interface TrailingYieldResult {
  yield: number | null;
  total12m: number;
  shortHistory: boolean;
  count12m: number;
}

export interface DividendGoalCandidate {
  ticker: string;
  assetClass: string;
  yield: number;
  price?: number;
  targetWeight?: number;
  shortHistory?: boolean;
}

export interface SuggestPositionsInput {
  mode: 'follow_targets' | 'free';
  candidates: DividendGoalCandidate[];
  maxPerAsset?: number;
  minAssets?: number;
  gapCents: number;
  prices?: Record<string, number>;
}

export interface SuggestedPositionItem {
  ticker: string;
  assetClass: string;
  quantity: number;
  priceCents: number;
  investedCents: number;
  weight: number;
  yield: number;
  estimatedAnnualDividendCents: number;
}

export interface SuggestPositionsResult {
  items: SuggestedPositionItem[];
  totalInvestedCents: number;
  changeCents: number;
  weightedYield: number;
  insufficientAssets: boolean;
}

export interface IncomeCalendarMonth {
  month: number; // 1..12
  label: string;
  amountBRL: number;
  amountCents: number;
}

export interface SnowballInput {
  startCents: number;
  monthlyCents: number;
  yield: number; // annual decimal e.g. 0.12
  monthlyGoalCents: number;
  maxMonths?: number;
}

export interface SnowballPoint {
  month: number;
  capitalCents: number;
  monthlyIncomeCents: number;
}

export interface SnowballResult {
  monthsToGoal: number | null;
  reached: boolean;
  finalCapitalCents: number;
  finalMonthlyIncomeCents: number;
  timeline: SnowballPoint[];
}

export interface IncomeEventLike {
  pay_date?: string;
  payDate?: string;
  amount: string | number;
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function subtractOneYearIso(refDate: string): string {
  const [yStr, mStr, dStr] = refDate.split('-');
  const y = Number(yStr) - 1;
  const m = Number(mStr);
  const d = Number(dStr);
  if (m === 2 && d === 29) {
    return `${String(y).padStart(4, '0')}-02-28`;
  }
  return `${String(y).padStart(4, '0')}-${mStr}-${dStr}`;
}

function daysBetweenIso(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24));
}

export function trailingYield(
  dividends: Dividend[],
  price: number,
  refDate: string
): TrailingYieldResult {
  const valid = (dividends ?? []).filter(
    (d) =>
      d &&
      typeof d.date === 'string' &&
      d.date <= refDate &&
      Number.isFinite(d.amount) &&
      d.amount >= 0
  );

  const oneYearAgo = subtractOneYearIso(refDate);
  const divs12m = valid.filter((d) => d.date > oneYearAgo && d.date <= refDate);
  const total12m = divs12m.reduce((acc, d) => acc + d.amount, 0);

  const earliestDate = valid.reduce(
    (min, d) => (d.date < min ? d.date : min),
    valid[0]?.date ?? refDate
  );
  const spanDays = valid.length > 0 ? daysBetweenIso(earliestDate, refDate) : 0;
  const shortHistory = divs12m.length === 0 || spanDays < 270;

  if (shortHistory || !Number.isFinite(price) || price <= 0) {
    return {
      yield: null,
      total12m,
      shortHistory,
      count12m: divs12m.length,
    };
  }

  return {
    yield: total12m / price,
    total12m,
    shortHistory: false,
    count12m: divs12m.length,
  };
}

export function requiredCapital(
  monthlyGoal: number,
  weightedYield: number
): number | null {
  if (!Number.isFinite(monthlyGoal) || monthlyGoal < 0) return null;
  if (!Number.isFinite(weightedYield) || weightedYield <= 0) return null;
  if (monthlyGoal === 0) return 0;
  return (monthlyGoal * 12) / weightedYield;
}

export function currentMonthlyIncome(
  incomeEvents: IncomeEventLike[],
  refDate: string
): number {
  const oneYearAgo = subtractOneYearIso(refDate);
  let total = 0;
  for (const ev of incomeEvents ?? []) {
    const date = ev.pay_date ?? ev.payDate ?? '';
    if (!date || date <= oneYearAgo || date > refDate) continue;
    const val = typeof ev.amount === 'number' ? ev.amount : parseFloat(ev.amount);
    if (Number.isFinite(val) && val > 0) {
      total += val;
    }
  }
  return total / 12;
}

function capWeights(rawWeights: number[], maxPerAsset: number): number[] {
  const n = rawWeights.length;
  if (n === 0) return [];
  const totalRaw = rawWeights.reduce((a, b) => a + b, 0);
  let weights =
    totalRaw > 0 ? rawWeights.map((w) => w / totalRaw) : rawWeights.map(() => 1 / n);

  const cap = Math.min(1, Math.max(0.01, maxPerAsset));
  for (let iter = 0; iter < n + 2; iter++) {
    let excess = 0;
    const uncappedIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (weights[i] > cap + 1e-9) {
        excess += weights[i] - cap;
        weights[i] = cap;
      } else if (weights[i] < cap - 1e-9) {
        uncappedIndices.push(i);
      }
    }
    if (excess <= 1e-9 || uncappedIndices.length === 0) break;
    const uncappedSum = uncappedIndices.reduce((acc, idx) => acc + weights[idx], 0);
    for (const idx of uncappedIndices) {
      const share =
        uncappedSum > 0 ? weights[idx] / uncappedSum : 1 / uncappedIndices.length;
      weights[idx] += excess * share;
    }
  }

  return weights;
}

export function suggestPositions(
  input: SuggestPositionsInput
): SuggestPositionsResult {
  const maxPerAsset = input.maxPerAsset ?? 0.2;
  const minAssets = input.minAssets ?? 4;
  const gapCents = Math.max(0, Math.round(input.gapCents));
  const prices = input.prices ?? {};

  const eligible = (input.candidates ?? [])
    .map((c) => {
      const price = prices[c.ticker] ?? c.price ?? 0;
      return { ...c, resolvedPrice: price };
    })
    .filter(
      (c) =>
        !c.shortHistory &&
        Number.isFinite(c.yield) &&
        c.yield > 0 &&
        Number.isFinite(c.resolvedPrice) &&
        c.resolvedPrice > 0
    );

  if (eligible.length === 0 || gapCents === 0) {
    return {
      items: [],
      totalInvestedCents: 0,
      changeCents: gapCents,
      weightedYield: 0,
      insufficientAssets: eligible.length < minAssets,
    };
  }

  const sorted = [...eligible].sort((a, b) => {
    if (input.mode === 'follow_targets') {
      const wa = a.targetWeight ?? 0;
      const wb = b.targetWeight ?? 0;
      if (wb !== wa) return wb - wa;
    }
    return b.yield - a.yield;
  });

  const minNeededForCap = Math.ceil(1 / Math.max(0.01, maxPerAsset));
  const targetCount =
    input.mode === 'follow_targets'
      ? sorted.length
      : Math.min(sorted.length, Math.max(minAssets, minNeededForCap));

  const selected = sorted.slice(0, targetCount);
  const rawWeights = selected.map((c) => {
    if (input.mode === 'follow_targets') {
      return c.targetWeight && c.targetWeight > 0 ? c.targetWeight : 1;
    }
    return c.yield;
  });

  const cappedWeights = capWeights(rawWeights, maxPerAsset);
  const maxAllowedCents = Math.floor(gapCents * maxPerAsset);

  const items: SuggestedPositionItem[] = selected.map((c, idx) => {
    const priceCents = Math.round(c.resolvedPrice * 100);
    const targetCents = Math.min(
      maxAllowedCents,
      Math.floor(gapCents * cappedWeights[idx])
    );
    const quantity = priceCents > 0 ? Math.floor(targetCents / priceCents) : 0;
    const investedCents = quantity * priceCents;
    return {
      ticker: c.ticker,
      assetClass: c.assetClass,
      quantity,
      priceCents,
      investedCents,
      weight: gapCents > 0 ? investedCents / gapCents : 0,
      yield: c.yield,
      estimatedAnnualDividendCents: Math.round(investedCents * c.yield),
    };
  });

  let totalInvestedCents = items.reduce((acc, it) => acc + it.investedCents, 0);
  let remaining = gapCents - totalInvestedCents;

  // Passo guloso para aproveitar troco sem violar teto por ativo
  let bought = true;
  while (bought && remaining > 0) {
    bought = false;
    for (const it of items) {
      if (
        it.priceCents > 0 &&
        it.priceCents <= remaining &&
        it.investedCents + it.priceCents <= maxAllowedCents
      ) {
        it.quantity += 1;
        it.investedCents += it.priceCents;
        it.weight = it.investedCents / gapCents;
        it.estimatedAnnualDividendCents = Math.round(it.investedCents * it.yield);
        totalInvestedCents += it.priceCents;
        remaining -= it.priceCents;
        bought = true;
      }
    }
  }

  const weightedYield =
    totalInvestedCents > 0
      ? items.reduce((acc, it) => acc + it.yield * it.investedCents, 0) /
        totalInvestedCents
      : cappedWeights.reduce((acc, w, idx) => acc + w * selected[idx].yield, 0);

  return {
    items,
    totalInvestedCents,
    changeCents: gapCents - totalInvestedCents,
    weightedYield,
    insufficientAssets: items.length < minAssets,
  };
}

export function incomeCalendar(
  dividendsByTicker: Record<string, Dividend[]>,
  quantities: Record<string, number>,
  refDate?: string
): IncomeCalendarMonth[] {
  const totals = new Array<number>(12).fill(0);
  const oneYearAgo = refDate ? subtractOneYearIso(refDate) : null;

  for (const [ticker, qty] of Object.entries(quantities ?? {})) {
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const divs = dividendsByTicker[ticker] ?? [];
    for (const d of divs) {
      if (!d || typeof d.date !== 'string') continue;
      if (refDate && oneYearAgo && (d.date <= oneYearAgo || d.date > refDate)) {
        continue;
      }
      const monthNum = parseInt(d.date.slice(5, 7), 10);
      if (monthNum >= 1 && monthNum <= 12 && Number.isFinite(d.amount) && d.amount > 0) {
        totals[monthNum - 1] += d.amount * qty;
      }
    }
  }

  return totals.map((amountBRL, idx) => ({
    month: idx + 1,
    label: MONTH_LABELS[idx],
    amountBRL,
    amountCents: Math.round(amountBRL * 100),
  }));
}

export function snowball(input: SnowballInput): SnowballResult {
  const maxMonths = input.maxMonths ?? 600;
  const monthlyRate = input.yield / 12;
  let capitalCents = Math.max(0, Math.round(input.startCents));
  const monthlyCents = Math.max(0, Math.round(input.monthlyCents));
  const timeline: SnowballPoint[] = [];

  for (let m = 1; m <= maxMonths; m++) {
    const dividendCents = Math.round(capitalCents * monthlyRate);
    capitalCents = capitalCents + monthlyCents + dividendCents;
    const monthlyIncomeCents = Math.round(capitalCents * monthlyRate);
    timeline.push({
      month: m,
      capitalCents,
      monthlyIncomeCents,
    });
    if (monthlyIncomeCents >= input.monthlyGoalCents) {
      return {
        monthsToGoal: m,
        reached: true,
        finalCapitalCents: capitalCents,
        finalMonthlyIncomeCents: monthlyIncomeCents,
        timeline,
      };
    }
  }

  return {
    monthsToGoal: null,
    reached: false,
    finalCapitalCents: capitalCents,
    finalMonthlyIncomeCents: Math.round(capitalCents * monthlyRate),
    timeline,
  };
}
