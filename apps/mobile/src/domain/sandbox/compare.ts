import type { MacroSeriesPoint } from './backtest';
import { priceAt, valueInBRL, type PriceSeriesPoint } from './priceAt';

export const MAX_COMPARE_ASSETS = 4;

export interface CompareAssetInput {
  ticker: string;
  label?: string;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[] | null;
}

export interface CompareInput {
  startDate: string;
  endDate: string;
  assets: CompareAssetInput[];
  cdi?: MacroSeriesPoint[];
  ipca?: MacroSeriesPoint[];
}

export interface CompareNormalizedPoint {
  date: string;
  value: number;
}

export interface CompareSeriesItem {
  id: string;
  label: string;
  kind: 'asset' | 'cdi' | 'ipca';
  status: 'ok' | 'missing_data';
  series: CompareNormalizedPoint[];
  finalValue: number | null;
  totalReturnPct: number | null;
}

export interface CompareResult {
  startDate: string;
  endDate: string;
  truncatedAssets: boolean;
  items: CompareSeriesItem[];
}

function getAssetPriceBRL(asset: CompareAssetInput, date: string): number | null {
  if (asset.fxSeries && asset.fxSeries.length > 0) {
    const res = valueInBRL(asset.priceSeries, asset.fxSeries, date);
    return res ? res.valueBRL : null;
  }
  const res = priceAt(asset.priceSeries, date);
  return res ? res.price : null;
}

function normalizeMacroSeries(
  id: 'CDI' | 'IPCA',
  kind: 'cdi' | 'ipca',
  macro: MacroSeriesPoint[] | undefined,
  startDate: string,
  endDate: string
): CompareSeriesItem {
  if (!Array.isArray(macro) || macro.length === 0) {
    return {
      id,
      label: id,
      kind,
      status: 'missing_data',
      series: [],
      finalValue: null,
      totalReturnPct: null,
    };
  }

  const inRange = macro
    .filter(
      (p) =>
        p &&
        p.date >= startDate &&
        p.date <= endDate &&
        Number.isFinite(p.ratePct)
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (inRange.length === 0) {
    return {
      id,
      label: id,
      kind,
      status: 'missing_data',
      series: [],
      finalValue: null,
      totalReturnPct: null,
    };
  }

  const series: CompareNormalizedPoint[] = [];
  let factor = 1;

  for (let i = 0; i < inRange.length; i++) {
    const pt = inRange[i];
    if (i === 0 && pt.date === startDate) {
      series.push({ date: pt.date, value: 100 });
      continue;
    }
    if (i === 0 && pt.date > startDate) {
      series.push({ date: startDate, value: 100 });
    }
    factor *= 1 + pt.ratePct / 100;
    series.push({ date: pt.date, value: 100 * factor });
  }

  const finalValue = series[series.length - 1]?.value ?? 100;
  return {
    id,
    label: id,
    kind,
    status: 'ok',
    series,
    finalValue,
    totalReturnPct: finalValue - 100,
  };
}

/**
 * Normaliza até 4 ativos + CDI + IPCA em base 100 no início do período [startDate, endDate].
 */
export function buildComparisonSeries(input: CompareInput): CompareResult {
  const { startDate, endDate, cdi, ipca } = input;
  const rawAssets = Array.isArray(input.assets) ? input.assets : [];
  const truncatedAssets = rawAssets.length > MAX_COMPARE_ASSETS;
  const selectedAssets = rawAssets.slice(0, MAX_COMPARE_ASSETS);

  const items: CompareSeriesItem[] = [];

  for (const asset of selectedAssets) {
    const inRange = (asset.priceSeries ?? [])
      .filter(
        (p) =>
          p &&
          p.date >= startDate &&
          p.date <= endDate &&
          Number.isFinite(p.close) &&
          p.close > 0
      )
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    if (inRange.length === 0) {
      items.push({
        id: asset.ticker,
        label: asset.label ?? asset.ticker,
        kind: 'asset',
        status: 'missing_data',
        series: [],
        finalValue: null,
        totalReturnPct: null,
      });
      continue;
    }

    const baseDate = inRange[0].date;
    const basePrice = getAssetPriceBRL(asset, baseDate) ?? inRange[0].close;

    if (!basePrice || basePrice <= 0) {
      items.push({
        id: asset.ticker,
        label: asset.label ?? asset.ticker,
        kind: 'asset',
        status: 'missing_data',
        series: [],
        finalValue: null,
        totalReturnPct: null,
      });
      continue;
    }

    const series: CompareNormalizedPoint[] = [];
    for (const pt of inRange) {
      const px = getAssetPriceBRL(asset, pt.date) ?? pt.close;
      series.push({
        date: pt.date,
        value: (px / basePrice) * 100,
      });
    }

    const finalValue = series[series.length - 1]?.value ?? 100;
    items.push({
      id: asset.ticker,
      label: asset.label ?? asset.ticker,
      kind: 'asset',
      status: 'ok',
      series,
      finalValue,
      totalReturnPct: finalValue - 100,
    });
  }

  items.push(normalizeMacroSeries('CDI', 'cdi', cdi, startDate, endDate));
  items.push(normalizeMacroSeries('IPCA', 'ipca', ipca, startDate, endDate));

  return {
    startDate,
    endDate,
    truncatedAssets,
    items,
  };
}
