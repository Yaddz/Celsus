import type { PriceSeriesPoint } from './priceAt';

export interface ExtremePoint {
  date: string;
  price: number;
}

function findExtremeInRange(
  series: PriceSeriesPoint[],
  from: string,
  to: string,
  mode: 'min' | 'max'
): ExtremePoint | null {
  if (!Array.isArray(series) || series.length === 0 || !from || !to || from > to) {
    return null;
  }

  const inRange = series
    .filter(
      (p) =>
        p &&
        p.date >= from &&
        p.date <= to &&
        Number.isFinite(p.close) &&
        p.close > 0
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (inRange.length === 0) return null;

  let best = inRange[0];
  for (let i = 1; i < inRange.length; i++) {
    const curr = inRange[i];
    if (mode === 'min' ? curr.close < best.close : curr.close > best.close) {
      best = curr;
    }
  }

  return { date: best.date, price: best.close };
}

/**
 * Retorna a primeira ocorrência da menor cotação no intervalo [from, to].
 */
export function minInRange(
  series: PriceSeriesPoint[],
  from: string,
  to: string
): ExtremePoint | null {
  return findExtremeInRange(series, from, to, 'min');
}

/**
 * Retorna a primeira ocorrência da maior cotação no intervalo [from, to].
 */
export function maxInRange(
  series: PriceSeriesPoint[],
  from: string,
  to: string
): ExtremePoint | null {
  return findExtremeInRange(series, from, to, 'max');
}
