import type { PriceSeriesPoint } from './priceAt';

export interface ExtremePoint {
  date: string;
  price: number;
}

export function minInRange(
  _series: PriceSeriesPoint[],
  _from: string,
  _to: string
): ExtremePoint | null {
  throw new Error('Not implemented');
}

export function maxInRange(
  _series: PriceSeriesPoint[],
  _from: string,
  _to: string
): ExtremePoint | null {
  throw new Error('Not implemented');
}
