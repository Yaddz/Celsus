export interface PriceSeriesPoint {
  date: string;
  close: number;
  currency?: string;
}

export interface PriceAtResult {
  price: number;
  effectiveDate: string;
  currency?: string;
}

export interface ValueInBRLResult {
  valueBRL: number;
  assetPrice: number;
  assetEffectiveDate: string;
  fxRate: number;
  fxEffectiveDate: string;
}

export function priceAt(
  _series: PriceSeriesPoint[],
  _date: string,
  _maxLookbackDays = 7
): PriceAtResult | null {
  throw new Error('Not implemented');
}

export function valueInBRL(
  _assetSeries: PriceSeriesPoint[],
  _fxSeries: PriceSeriesPoint[] | null,
  _date: string
): ValueInBRLResult | null {
  throw new Error('Not implemented');
}
