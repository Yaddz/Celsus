import { minInRange } from './extremes';
import { parseIsoDateDays, priceAt, valueInBRL, type PriceSeriesPoint } from './priceAt';

export interface StressTestPositionInput {
  ticker: string;
  weight: number;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[] | null;
}

export interface StressTestInput {
  todayPortfolioValueBRL: number;
  startDate: string;
  endDate: string;
  recoveryEndDate?: string;
  positions: StressTestPositionInput[];
}

export interface StressTestAssetResult {
  ticker: string;
  weight: number;
  normalizedWeight: number;
  status: 'ok' | 'missing_data';
  statusLabel: string;
  drawdownPct: number | null;
}

export interface StressTestCurvePoint {
  date: string;
  normalizedValue: number;
  drawdownPct: number;
  projectedValueBRL: number;
}

export interface StressTestResult {
  status: 'ok' | 'missing_data';
  startDate: string;
  endDate: string;
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
  troughValueBRL: number | null;
  recovered: boolean;
  recoveryDate: string | null;
  recoveryDays: number | null;
  warnings: string[];
  assets: StressTestAssetResult[];
  curve: StressTestCurvePoint[];
}

export interface WorstDrawdownWindow {
  startDate: string;
  endDate: string;
  peakPrice: number;
  troughPrice: number;
  drawdownPct: number;
}

function subtractYearsIso(dateIso: string, years: number): string {
  const [yStr, mStr, dStr] = dateIso.split('-');
  const y = Number(yStr) - years;
  const m = Number(mStr);
  const d = Number(dStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Clamp Feb 29 -> Feb 28 in non-leap years
  if (dt.getUTCMonth() !== m - 1) {
    return `${y}-02-28`;
  }
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * Calcula dinamicamente a pior janela de queda (pico -> fundo) nos últimos `years` anos
 * a partir da própria série do índice (ex: IBOV/BOVA11) usando `extremes.minInRange`.
 */
export function findWorstDrawdownWindow(
  indexSeries: PriceSeriesPoint[],
  years: number,
  referenceDate?: string
): WorstDrawdownWindow | null {
  if (!Array.isArray(indexSeries) || indexSeries.length < 2 || years <= 0) {
    return null;
  }

  const valid = indexSeries
    .filter((p) => p && p.date && Number.isFinite(p.close) && p.close > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length < 2) return null;

  const toDate = referenceDate ?? valid[valid.length - 1].date;
  const fromDate = subtractYearsIso(toDate, years);

  const inRange = valid.filter((p) => p.date >= fromDate && p.date <= toDate);
  if (inRange.length < 2) return null;

  let runningPeak = -Infinity;
  let best: WorstDrawdownWindow | null = null;

  for (const point of inRange) {
    if (point.close <= runningPeak) continue;
    runningPeak = point.close;

    const trough = minInRange(inRange, point.date, toDate);
    if (!trough) continue;

    const ddPct = ((point.close - trough.price) / point.close) * 100;
    if (!best || ddPct > best.drawdownPct) {
      best = {
        startDate: point.date,
        endDate: trough.date,
        peakPrice: point.close,
        troughPrice: trough.price,
        drawdownPct: ddPct,
      };
    }
  }

  return best;
}

function getAssetPriceBRL(
  pos: StressTestPositionInput,
  date: string
): number | null {
  if (pos.fxSeries && pos.fxSeries.length > 0) {
    const res = valueInBRL(pos.priceSeries, pos.fxSeries, date);
    return res ? res.valueBRL : null;
  }
  const res = priceAt(pos.priceSeries, date);
  return res ? res.price : null;
}

function computeAssetDrawdownPct(
  series: PriceSeriesPoint[],
  startDate: string,
  endDate: string,
  fxSeries?: PriceSeriesPoint[] | null
): number | null {
  const dates = series
    .filter((p) => p && p.date >= startDate && p.date <= endDate && Number.isFinite(p.close) && p.close > 0)
    .map((p) => p.date)
    .sort();
  if (dates.length === 0) return null;

  let peak = -Infinity;
  let maxDd = 0;
  for (const d of dates) {
    const px = fxSeries && fxSeries.length > 0
      ? valueInBRL(series, fxSeries, d)?.valueBRL ?? null
      : priceAt(series, d)?.price ?? null;
    if (px === null || px <= 0) continue;
    if (px > peak) peak = px;
    if (peak > 0) {
      const dd = ((peak - px) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return peak > 0 ? maxDd : null;
}

/**
 * Aplica a composição atual da carteira ativa (pesos de hoje) a uma janela histórica,
 * retornando queda máxima, tempo de recuperação e valor no fundo com o patrimônio de hoje.
 * Ativos sem série na janela são marcados como "sem dado" e excluídos do cálculo com aviso.
 */
export function runStressTest(input: StressTestInput): StressTestResult {
  const { todayPortfolioValueBRL, startDate, endDate, recoveryEndDate, positions } = input;
  const warnings: string[] = [];

  if (!Array.isArray(positions) || positions.length === 0 || !startDate || !endDate || startDate > endDate) {
    return {
      status: 'missing_data',
      startDate,
      endDate,
      maxDrawdownPct: null,
      peakDate: null,
      troughDate: null,
      troughValueBRL: null,
      recovered: false,
      recoveryDate: null,
      recoveryDays: null,
      warnings: ['Nenhuma posição ativa ou janela inválida para o teste de estresse.'],
      assets: [],
      curve: [],
    };
  }

  const missingTickers: string[] = [];
  const activePositions: Array<{ pos: StressTestPositionInput; basePrice: number; weight: number }> = [];
  const assetResults: StressTestAssetResult[] = [];

  for (const pos of positions) {
    const windowPoints = (pos.priceSeries ?? []).filter(
      (p) => p && p.date >= startDate && p.date <= endDate && Number.isFinite(p.close) && p.close > 0
    );
    const basePrice = windowPoints.length > 0 ? getAssetPriceBRL(pos, startDate) ?? windowPoints.sort((a, b) => a.date.localeCompare(b.date))[0].close : null;

    if (windowPoints.length === 0 || basePrice === null || basePrice <= 0) {
      missingTickers.push(pos.ticker);
      assetResults.push({
        ticker: pos.ticker,
        weight: pos.weight,
        normalizedWeight: 0,
        status: 'missing_data',
        statusLabel: 'sem dado',
        drawdownPct: null,
      });
      continue;
    }

    activePositions.push({
      pos,
      basePrice,
      weight: Math.max(0, pos.weight),
    });
  }

  if (missingTickers.length > 0) {
    warnings.push(
      `Ativo(s) sem série na janela foram excluídos do cálculo: ${missingTickers.join(', ')}.`
    );
  }

  if (activePositions.length === 0) {
    return {
      status: 'missing_data',
      startDate,
      endDate,
      maxDrawdownPct: null,
      peakDate: null,
      troughDate: null,
      troughValueBRL: null,
      recovered: false,
      recoveryDate: null,
      recoveryDays: null,
      warnings,
      assets: assetResults,
      curve: [],
    };
  }

  const totalActiveWeight = activePositions.reduce((acc, p) => acc + p.weight, 0);
  const equalWeight = 1 / activePositions.length;

  const normalizedActive = activePositions.map((item) => {
    const normW = totalActiveWeight > 0 ? item.weight / totalActiveWeight : equalWeight;
    const assetDd = computeAssetDrawdownPct(
      item.pos.priceSeries,
      startDate,
      endDate,
      item.pos.fxSeries
    );
    assetResults.push({
      ticker: item.pos.ticker,
      weight: item.pos.weight,
      normalizedWeight: normW,
      status: 'ok',
      statusLabel: 'ok',
      drawdownPct: assetDd,
    });
    return {
      ...item,
      normalizedWeight: normW,
    };
  });

  // Coleta todas as datas a partir de startDate (até recoveryEndDate ou fim da série)
  const dateSet = new Set<string>();
  let maxSeriesDate = endDate;
  for (const item of normalizedActive) {
    for (const pt of item.pos.priceSeries) {
      if (pt && pt.date >= startDate && Number.isFinite(pt.close) && pt.close > 0) {
        if (!recoveryEndDate || pt.date <= recoveryEndDate) {
          dateSet.add(pt.date);
          if (pt.date > maxSeriesDate) maxSeriesDate = pt.date;
        }
      }
    }
  }

  const allDates = Array.from(dateSet).sort();
  const windowDates = allDates.filter((d) => d <= endDate);
  if (windowDates.length === 0) {
    return {
      status: 'missing_data',
      startDate,
      endDate,
      maxDrawdownPct: null,
      peakDate: null,
      troughDate: null,
      troughValueBRL: null,
      recovered: false,
      recoveryDate: null,
      recoveryDays: null,
      warnings,
      assets: assetResults,
      curve: [],
    };
  }

  const evalPortfolio = (date: string): number | null => {
    let sum = 0;
    let usedWeight = 0;
    for (const item of normalizedActive) {
      const px = getAssetPriceBRL(item.pos, date);
      if (px !== null && px > 0) {
        sum += item.normalizedWeight * (px / item.basePrice);
        usedWeight += item.normalizedWeight;
      }
    }
    if (usedWeight <= 0) return null;
    return usedWeight < 0.9999 ? sum / usedWeight : sum;
  };

  let runningPeak = -Infinity;
  let runningPeakDate = windowDates[0];
  let maxDrawdownPct = 0;
  let peakDate = windowDates[0];
  let troughDate = windowDates[0];
  let peakAtTrough = 1;
  const curve: StressTestCurvePoint[] = [];

  for (const d of windowDates) {
    const val = evalPortfolio(d);
    if (val === null) continue;

    if (val > runningPeak) {
      runningPeak = val;
      runningPeakDate = d;
    }

    const ddPct = runningPeak > 0 ? ((runningPeak - val) / runningPeak) * 100 : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      peakDate = runningPeakDate;
      troughDate = d;
      peakAtTrough = runningPeak;
    }

    curve.push({
      date: d,
      normalizedValue: val * 100,
      drawdownPct: ddPct,
      projectedValueBRL: todayPortfolioValueBRL * (1 - ddPct / 100),
    });
  }

  // Busca recuperação após o fundo (troughDate) em toda a série disponível até recoveryEndDate
  let recovered = false;
  let recoveryDate: string | null = null;
  let recoveryDays: number | null = null;

  if (maxDrawdownPct > 0) {
    for (const d of allDates) {
      if (d <= troughDate) continue;
      const val = evalPortfolio(d);
      if (val !== null && val >= peakAtTrough) {
        recovered = true;
        recoveryDate = d;
        const troughDays = parseIsoDateDays(troughDate);
        const recDays = parseIsoDateDays(d);
        if (troughDays !== null && recDays !== null) {
          recoveryDays = Math.max(0, recDays - troughDays);
        }
        break;
      }
    }
  } else {
    recovered = true;
    recoveryDate = troughDate;
    recoveryDays = 0;
  }

  const troughValueBRL = todayPortfolioValueBRL * (1 - maxDrawdownPct / 100);

  return {
    status: 'ok',
    startDate,
    endDate,
    maxDrawdownPct,
    peakDate,
    troughDate,
    troughValueBRL,
    recovered,
    recoveryDate,
    recoveryDays,
    warnings,
    assets: assetResults,
    curve,
  };
}
