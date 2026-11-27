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

const MS_PER_DAY = 86_400_000;

/**
 * Converte uma data YYYY-MM-DD em dias inteiros UTC para evitar desvios de fuso horário.
 */
export function parseIsoDateDays(dateStr: string): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const utc = Date.UTC(y, m - 1, d);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(utc / MS_PER_DAY);
}

/**
 * R47: Preço de um ativo na data D = fechamento do último pregão ≤ D.
 * Sem pregão em até `maxLookbackDays` (padrão 7 dias corridos) antes de D ⇒ null (nunca interpola).
 */
export function priceAt(
  series: PriceSeriesPoint[],
  date: string,
  maxLookbackDays = 7
): PriceAtResult | null {
  const targetDays = parseIsoDateDays(date);
  if (targetDays === null || !Array.isArray(series) || series.length === 0) {
    return null;
  }

  let best: PriceSeriesPoint | null = null;
  let bestDays = -Infinity;

  for (const point of series) {
    if (!point || !Number.isFinite(point.close) || point.close <= 0) continue;
    const pDays = parseIsoDateDays(point.date);
    if (pDays === null || pDays > targetDays) continue;
    if (pDays > bestDays) {
      bestDays = pDays;
      best = point;
    }
  }

  if (!best) return null;
  if (targetDays - bestDays > maxLookbackDays) return null;

  return {
    price: best.close,
    effectiveDate: best.date,
    ...(best.currency !== undefined ? { currency: best.currency } : {}),
  };
}

/**
 * R47: Valor em BRL de um ativo na data D = preço(D) × USDBRL(D), cada um no seu calendário.
 * Se `fxSeries` for null, assume ativo já cotado em BRL (fator 1).
 */
export function valueInBRL(
  assetSeries: PriceSeriesPoint[],
  fxSeries: PriceSeriesPoint[] | null,
  date: string
): ValueInBRLResult | null {
  const asset = priceAt(assetSeries, date);
  if (!asset) return null;

  if (fxSeries === null) {
    return {
      valueBRL: asset.price,
      assetPrice: asset.price,
      assetEffectiveDate: asset.effectiveDate,
      fxRate: 1,
      fxEffectiveDate: asset.effectiveDate,
    };
  }

  const fx = priceAt(fxSeries, date);
  if (!fx) return null;

  return {
    valueBRL: asset.price * fx.price,
    assetPrice: asset.price,
    assetEffectiveDate: asset.effectiveDate,
    fxRate: fx.price,
    fxEffectiveDate: fx.effectiveDate,
  };
}
