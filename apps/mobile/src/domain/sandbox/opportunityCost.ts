import type { MacroSeriesPoint } from './backtest';

export interface FutureValueResult {
  totalCents: number;
  contributedCents: number;
  interestCents: number;
}

export type MacroCdiInput =
  | MacroSeriesPoint[]
  | Array<{ date: string; cdi?: number; ratePct?: number }>
  | null
  | undefined;

/**
 * R53 — Valor futuro de uma série mensal de aportes a uma taxa anual composta.
 */
export function futureValueOfSeries(
  monthlyCents: number,
  annualRate: number,
  years: number
): FutureValueResult {
  const n = Math.round(years * 12);
  if (!Number.isFinite(monthlyCents) || !Number.isFinite(annualRate) || n <= 0 || monthlyCents <= 0) {
    return { totalCents: 0, contributedCents: 0, interestCents: 0 };
  }

  const contributedCents = Math.round(monthlyCents * n);
  if (annualRate === 0) {
    return {
      totalCents: contributedCents,
      contributedCents,
      interestCents: 0,
    };
  }

  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const fv = monthlyCents * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate);
  const totalCents = Math.round(fv);
  return {
    totalCents,
    contributedCents,
    interestCents: totalCents - contributedCents,
  };
}

/**
 * R53 — Valor futuro de uma compra única (à vista) investida pelo prazo em anos.
 */
export function futureValueOfLumpSum(
  principalCents: number,
  annualRate: number,
  years: number
): FutureValueResult {
  if (!Number.isFinite(principalCents) || !Number.isFinite(annualRate) || years <= 0 || principalCents <= 0) {
    return { totalCents: 0, contributedCents: 0, interestCents: 0 };
  }
  const contributedCents = Math.round(principalCents);
  if (annualRate === 0) {
    return {
      totalCents: contributedCents,
      contributedCents,
      interestCents: 0,
    };
  }
  const totalCents = Math.round(principalCents * Math.pow(1 + annualRate, years));
  return {
    totalCents,
    contributedCents,
    interestCents: totalCents - contributedCents,
  };
}

/**
 * R53 — Anualiza a série de CDI dos últimos 12 meses (retorna taxa decimal, ex: 0.1125 para 11,25% a.a.).
 */
export function annualizeCdi12m(macro: MacroCdiInput): number | null {
  if (!macro || macro.length === 0) return null;

  const valid = macro
    .map((p) => {
      const rate = 'ratePct' in p && typeof p.ratePct === 'number'
        ? p.ratePct
        : 'cdi' in p && typeof p.cdi === 'number'
        ? p.cdi
        : NaN;
      return { date: p.date, ratePct: rate };
    })
    .filter((p) => Boolean(p.date) && Number.isFinite(p.ratePct))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length === 0) return null;

  const latestDate = valid[valid.length - 1].date;
  const latestMs = Date.parse(`${latestDate}T00:00:00Z`);
  const oneYearAgoMs = latestMs - 365 * 86400 * 1000;
  const windowPoints = valid.filter((p) => Date.parse(`${p.date}T00:00:00Z`) >= oneYearAgoMs);
  const points = windowPoints.length > 0 ? windowPoints : valid;

  let factor = 1;
  for (const p of points) {
    factor *= 1 + p.ratePct / 100;
  }

  if (points.length === 1) {
    const r = points[0].ratePct / 100;
    // Ponto único mensal (~0.5% a 2%) -> anualiza para 12 meses; ponto diário (<0.2%) -> 252 dias
    return points[0].ratePct >= 0.2 ? Math.pow(1 + r, 12) - 1 : Math.pow(1 + r, 252) - 1;
  }

  const firstMs = Date.parse(`${points[0].date}T00:00:00Z`);
  const spanDays = Math.max(1, Math.round((latestMs - firstMs) / 86400000));
  if (spanDays >= 330) {
    return factor - 1;
  }

  // Série menor que 11 meses: extrapola proporcionalmente para 365 dias
  const avgStepDays = spanDays / (points.length - 1);
  const effectiveSpanDays = spanDays + avgStepDays;
  return Math.pow(factor, 365 / effectiveSpanDays) - 1;
}
