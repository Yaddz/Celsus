import { calculateTwoPhaseContribution, type ContributionAssetInput, type ContributionClassInput } from '../finance/contributionPlan';
import type { AssetClass } from '../finance/types';
import { priceAt, type PriceSeriesPoint } from './priceAt';
import type { MacroSeriesPoint } from './backtest';

export type PaperRebalanceMode = 'never' | 3 | 6 | 12 | 'on_contribution';

export interface PaperPortfolioItemInput {
  ticker: string;
  class: string;
  weight: number;
}

export interface PaperDividendEvent {
  date: string;
  amountPerUnit: number;
}

export interface PaperSimulateInput {
  items: PaperPortfolioItemInput[];
  start: string;
  end?: string;
  initialCents: number;
  monthlyCents: number;
  rebalance: PaperRebalanceMode;
  series: Record<string, PriceSeriesPoint[]>;
  dividends?: Record<string, PaperDividendEvent[]>;
  macro?: {
    cdi?: MacroSeriesPoint[];
  };
  taxEnabled?: boolean;
}

export interface PaperCurvePoint {
  date: string;
  valueBRL: number;
  investedBRL: number;
}

export interface PaperAssetResult {
  ticker: string;
  assetClass: string;
  weight: number;
  finalValueBRL: number;
  returnPct: number;
  dividendsBRL: number;
  effectiveStartDate: string | null;
}

export interface PaperLateStartNotice {
  ticker: string;
  requestedStart: string;
  effectiveStart: string;
}

export interface PaperSimulateResult {
  dailyCurve: PaperCurvePoint[];
  cdiCurve: Array<{ date: string; valueBRL: number }>;
  finalValueBRL: number;
  investedBRL: number;
  returnPct: number;
  maxDrawdownPct: number;
  dividendsBRL: number;
  byAsset: PaperAssetResult[];
  lateStartAssets: PaperLateStartNotice[];
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthsBetween(startMonth: string, currentMonth: string): number {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [cy, cm] = currentMonth.split('-').map(Number);
  return (cy - sy) * 12 + (cm - sm);
}

function normalizeAssetClass(cls: string): AssetClass {
  const up = cls.toUpperCase();
  if (up === 'FII' || up === 'STOCK' || up === 'CRYPTO' || up === 'FIXED_INCOME' || up === 'FUNDS') {
    return up;
  }
  return 'STOCK';
}

export function simulate(input: PaperSimulateInput): PaperSimulateResult {
  if (!input.items || input.items.length === 0) {
    throw new Error('Adicione ao menos um ativo e garanta que a soma dos pesos seja 100%.');
  }

  const totalWeight = input.items.reduce((acc, it) => acc + (Number(it.weight) || 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error(`A soma dos pesos deve ser 100% (atual: ${totalWeight.toFixed(2)}%).`);
  }

  const start = input.start;
  const end = input.end ?? new Date().toISOString().slice(0, 10);
  const initialBRL = (input.initialCents || 0) / 100;
  const monthlyBRL = (input.monthlyCents || 0) / 100;

  // Coleta todas as datas únicas ordenadas no intervalo [start, end]
  const dateSet = new Set<string>();
  for (const item of input.items) {
    const s = input.series[item.ticker] ?? input.series[item.ticker.toUpperCase()] ?? [];
    for (const pt of s) {
      if (pt.date >= start && pt.date <= end) {
        dateSet.add(pt.date);
      }
    }
  }
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) {
    return {
      dailyCurve: [],
      cdiCurve: [],
      finalValueBRL: 0,
      investedBRL: 0,
      returnPct: 0,
      maxDrawdownPct: 0,
      dividendsBRL: 0,
      byAsset: input.items.map((it) => ({
        ticker: it.ticker,
        assetClass: it.class,
        weight: it.weight,
        finalValueBRL: 0,
        returnPct: 0,
        dividendsBRL: 0,
        effectiveStartDate: null,
      })),
      lateStartAssets: [],
    };
  }

  const state = input.items.map((item) => ({
    item,
    series: input.series[item.ticker] ?? input.series[item.ticker.toUpperCase()] ?? [],
    qty: 0,
    investedBRL: 0,
    dividendsBRL: 0,
    effectiveStartDate: null as string | null,
    started: false,
  }));

  const lateStartAssets: PaperLateStartNotice[] = [];
  const startMonth = monthKey(dates[0]);
  let lastContributionMonth = startMonth;
  let lastRebalanceMonth = startMonth;
  let totalInvestedBRL = 0;
  let cashBRL = 0;

  const dailyCurve: PaperCurvePoint[] = [];
  const cdiCurve: Array<{ date: string; valueBRL: number }> = [];
  const cdiRates = input.macro?.cdi ?? [];
  let cdiValue = initialBRL;
  let prevCdiDate: string | null = null;

  let peakValue = 0;
  let maxDrawdownPct = 0;

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const currMonth = monthKey(d);
    const isNewMonth = currMonth !== lastContributionMonth;

    // 1. Entrada inicial (ou entrada tardia quando ativo não tinha dado em `start`)
    for (const st of state) {
      if (!st.started) {
        const px = priceAt(st.series, d);
        if (px && px.price > 0) {
          st.started = true;
          st.effectiveStartDate = d;
          if (d > start) {
            lateStartAssets.push({
              ticker: st.item.ticker,
              requestedStart: start,
              effectiveStart: d,
            });
          }
          const alloc = initialBRL * (st.item.weight / 100);
          st.qty += alloc / px.price;
          st.investedBRL += alloc;
          totalInvestedBRL += alloc;
        }
      }
    }

    // 2. Aporte mensal no 1º dia útil disponível de cada mês após o inicial
    if (isNewMonth && monthlyBRL > 0) {
      lastContributionMonth = currMonth;
      const activeStates = state.filter((s) => s.started);
      if (activeStates.length > 0) {
        if (input.rebalance === 'on_contribution') {
          // Agrupa classes e usa calculateTwoPhaseContribution
          const classWeightMap = new Map<AssetClass, number>();
          const priceMap = new Map<string, number>();

          for (const st of activeStates) {
            const cls = normalizeAssetClass(st.item.class);
            classWeightMap.set(cls, (classWeightMap.get(cls) ?? 0) + st.item.weight);
            const px = priceAt(st.series, d);
            priceMap.set(st.item.ticker, px ? px.price : 0);
          }

          const classes: ContributionClassInput[] = Array.from(classWeightMap.entries()).map(
            ([assetClass, targetPercentage]) => ({
              assetClass,
              targetPercentage,
              receivesContribution: true,
            })
          );

          const assetsInput: ContributionAssetInput[] = activeStates.map((st) => {
            const cls = normalizeAssetClass(st.item.class);
            const clsTotal = classWeightMap.get(cls) ?? 100;
            const px = priceMap.get(st.item.ticker) ?? 0;
            return {
              ticker: st.item.ticker,
              assetClass: cls,
              price: px,
              currentValue: st.qty * px,
              targetInClassPercent: clsTotal > 0 ? (st.item.weight / clsTotal) * 100 : 0,
            };
          });

          const availableBRL = monthlyBRL + cashBRL;
          const plan = calculateTwoPhaseContribution(availableBRL, classes, assetsInput);
          for (const pItem of plan.items) {
            const st = activeStates.find((s) => s.item.ticker === pItem.ticker);
            if (st) {
              const addedQty = parseFloat(pItem.quantity);
              const cost = parseFloat(pItem.cost);
              if (Number.isFinite(addedQty) && addedQty > 0) {
                st.qty += addedQty;
                st.investedBRL += cost;
              }
            }
          }
          const parsedChange = parseFloat(plan.change);
          cashBRL = Number.isFinite(parsedChange) && parsedChange > 0 ? parsedChange : 0;
          totalInvestedBRL += monthlyBRL;
        } else {
          const activeWeightSum = activeStates.reduce((a, s) => a + s.item.weight, 0);
          for (const st of activeStates) {
            const px = priceAt(st.series, d);
            if (px && px.price > 0) {
              const alloc = monthlyBRL * (activeWeightSum > 0 ? st.item.weight / activeWeightSum : 0);
              st.qty += alloc / px.price;
              st.investedBRL += alloc;
            }
          }
          totalInvestedBRL += monthlyBRL;
        }
      }
      if (cdiValue > 0 || monthlyBRL > 0) {
        cdiValue += monthlyBRL;
      }
    } else if (isNewMonth) {
      lastContributionMonth = currMonth;
    }

    // 3. Rebalanceamento periódico (3, 6 ou 12 meses)
    if (
      typeof input.rebalance === 'number' &&
      currMonth !== lastRebalanceMonth &&
      monthsBetween(startMonth, currMonth) > 0 &&
      monthsBetween(startMonth, currMonth) % input.rebalance === 0
    ) {
      lastRebalanceMonth = currMonth;
      const activeStates = state.filter((s) => s.started);
      let activeTotal = 0;
      const prices = new Map<string, number>();
      for (const st of activeStates) {
        const px = priceAt(st.series, d);
        if (px && px.price > 0) {
          prices.set(st.item.ticker, px.price);
          activeTotal += st.qty * px.price;
        }
      }
      const activeWeightSum = activeStates.reduce((a, s) => a + s.item.weight, 0);
      if (activeTotal > 0 && activeWeightSum > 0) {
        for (const st of activeStates) {
          const px = prices.get(st.item.ticker);
          if (px && px > 0) {
            const targetVal = activeTotal * (st.item.weight / activeWeightSum);
            st.qty = targetVal / px;
          }
        }
      }
    }

    // 4. Proventos na data
    for (const st of state) {
      if (!st.started) continue;
      const divs = input.dividends?.[st.item.ticker] ?? [];
      for (const dv of divs) {
        if (dv.date === d && dv.amountPerUnit > 0) {
          const paid = st.qty * dv.amountPerUnit;
          st.dividendsBRL += paid;
          const px = priceAt(st.series, d);
          if (px && px.price > 0) {
            st.qty += paid / px.price;
          }
        }
      }
    }

    // 5. Valor diário da carteira e drawdown
    let dayTotal = cashBRL;
    for (const st of state) {
      if (!st.started) continue;
      const px = priceAt(st.series, d);
      if (px) {
        dayTotal += st.qty * px.price;
      }
    }

    if (dayTotal > peakValue) {
      peakValue = dayTotal;
    }
    if (peakValue > 0) {
      const dd = ((peakValue - dayTotal) / peakValue) * 100;
      if (dd > maxDrawdownPct) {
        maxDrawdownPct = dd;
      }
    }

    dailyCurve.push({
      date: d,
      valueBRL: dayTotal,
      investedBRL: totalInvestedBRL,
    });

    // CDI diário simples (taxa anualizada aproximada ou diária)
    if (prevCdiDate) {
      const daysDiff = Math.max(
        1,
        Math.round(
          (new Date(d + 'T00:00:00Z').getTime() - new Date(prevCdiDate + 'T00:00:00Z').getTime()) /
            (24 * 60 * 60 * 1000)
        )
      );
      const rateEntry = [...cdiRates].reverse().find((r) => r.date <= d) ?? cdiRates[0];
      const annualPct = rateEntry?.ratePct ?? 0;
      if (annualPct > 0) {
        const dailyFactor = Math.pow(1 + annualPct / 100, daysDiff / 365);
        cdiValue *= dailyFactor;
      }
    }
    prevCdiDate = d;
    cdiCurve.push({ date: d, valueBRL: cdiValue });
  }

  const lastDate = dates[dates.length - 1];
  const byAsset: PaperAssetResult[] = state.map((st) => {
    const px = priceAt(st.series, lastDate);
    const val = st.started && px ? st.qty * px.price : 0;
    const ret = st.investedBRL > 0 ? ((val - st.investedBRL) / st.investedBRL) * 100 : 0;
    return {
      ticker: st.item.ticker,
      assetClass: st.item.class,
      weight: st.item.weight,
      finalValueBRL: val,
      returnPct: ret,
      dividendsBRL: st.dividendsBRL,
      effectiveStartDate: st.effectiveStartDate,
    };
  });

  const finalValueBRL = dailyCurve[dailyCurve.length - 1]?.valueBRL ?? 0;
  const returnPct =
    totalInvestedBRL > 0 ? ((finalValueBRL - totalInvestedBRL) / totalInvestedBRL) * 100 : 0;
  const dividendsBRL = byAsset.reduce((acc, a) => acc + a.dividendsBRL, 0);

  return {
    dailyCurve,
    cdiCurve,
    finalValueBRL,
    investedBRL: totalInvestedBRL,
    returnPct,
    maxDrawdownPct,
    dividendsBRL,
    byAsset,
    lateStartAssets,
  };
}
