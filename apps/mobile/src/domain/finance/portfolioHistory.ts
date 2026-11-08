import Decimal from 'decimal.js';
import { AssetClass } from './types';
import { calculateCDIAccrual, calculatePreFixedAccrual, calculateIPCAPlusAccrual } from './fixedIncome';

export type PeriodFilter = '5D' | '1M' | '1Y' | '5Y' | 'ALL';

export interface PeriodSummary {
  initialPatrimony: string;
  netContributions: string;
  yieldAmount: string;
  yieldPercentage: string;
  finalPatrimony: string;
}

export interface HistoricalPricePoint {
  date: string; // YYYY-MM-DD
  investedCapital: string;
  marketValue: string;
  profit: string;
  profitPercentage: string;
}

export interface MonthlyPillPoint {
  monthKey: string; // e.g. "2026-01"
  label: string; // "Jan", "Fev", "Mar"
  investedCapital: string;
  marketValue: string;
  netContributions: string;
}

export interface HistoricalAssetInput {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  rfIndexer?: 'CDI' | 'PRE' | 'IPCA' | null;
  rfRate?: number | null;
  rfMaturityDate?: string | null;
  manualPriceOverride?: string | number | null;
}

export interface HistoricalTransactionInput {
  id?: string;
  portfolioId?: string;
  assetId: string;
  ticker?: string;
  type: 'BUY' | 'SELL';
  tradeDate: string; // YYYY-MM-DD
  quantity: string | number;
  unitPrice: string | number;
  fees?: string | number;
  totalAmount?: string | number;
}

export interface DailyMacroRatesInput {
  dailyCDI?: Record<string, number>; // date "YYYY-MM-DD" -> daily CDI rate (e.g. 0.000435)
  ipcaRates?: Record<string, number>; // date "YYYY-MM-DD" -> accumulated IPCA factor
}

export interface CalculatePatrimonyCurveParams {
  assets: HistoricalAssetInput[];
  transactions: HistoricalTransactionInput[];
  dates?: string[]; // Specific dates to evaluate
  startDate?: string;
  endDate?: string;
  historicalQuotes?: Record<string, Record<string, string | number>>; // ticker -> date -> close price
  macroRates?: DailyMacroRatesInput;
}

function countBusinessDays(startDateStr: string, endDateStr: string): number {
  if (startDateStr >= endDateStr) {
    return 0;
  }
  let count = 0;
  const cur = new Date(startDateStr + 'T00:00:00Z');
  const end = new Date(endDateStr + 'T00:00:00Z');
  cur.setUTCDate(cur.getUTCDate() + 1);

  while (cur <= end) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/**
 * S5-T01: Reconstrução exata da curva histórica investedCapital vs marketValue
 * cruzando aportes/vendas com preços do COTAHIST e curva de Renda Fixa.
 */
export function calculateDailyPatrimonyCurve(
  params: CalculatePatrimonyCurveParams
): HistoricalPricePoint[] {
  const { assets, transactions, historicalQuotes, macroRates } = params;

  // Determine evaluation dates
  let evalDates: string[] = [];
  if (params.dates && params.dates.length > 0) {
    evalDates = [...params.dates].sort();
  } else if (transactions.length > 0) {
    const sortedTxs = [...transactions].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    const startStr = params.startDate || sortedTxs[0].tradeDate;
    const endStr = params.endDate || sortedTxs[sortedTxs.length - 1].tradeDate;

    const cur = new Date(startStr + 'T00:00:00Z');
    const end = new Date(endStr + 'T00:00:00Z');
    while (cur <= end) {
      evalDates.push(cur.toISOString().split('T')[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  if (evalDates.length === 0) {
    return [];
  }

  const resultCurve: HistoricalPricePoint[] = [];

  // Pré-processamento (antes, a cada dia e para cada ativo, TODAS as transações eram filtradas e
  // reordenadas, e as datas de cotação eram reordenadas a cada consulta: O(dias × ativos × transações),
  // o que travava a aba Análises com alguns anos de histórico). As datas avaliadas são crescentes, então
  // a posição de cada ativo avança de forma incremental, aplicando as transações na MESMA ordem (sort
  // estável por data) e com as MESMAS operações Decimal: o resultado é idêntico ao cálculo do zero.
  interface AssetState {
    asset: HistoricalAssetInput;
    txs: HistoricalTransactionInput[];
    next: number;
    qty: Decimal;
    cost: Decimal;
  }
  const states: AssetState[] = assets.map((asset) => ({
    asset,
    txs: transactions
      .filter((tx) => tx.assetId === asset.id || tx.ticker === asset.ticker)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)),
    next: 0,
    qty: new Decimal(0),
    cost: new Decimal(0),
  }));
  const sortedCdiDates = macroRates?.dailyCDI ? Object.keys(macroRates.dailyCDI).sort() : [];
  const quoteDatesCache = new Map<string, string[]>();
  const latestQuote = (ticker: string, targetDate: string): string | null => {
    const tickerQuotes = historicalQuotes?.[ticker];
    if (!tickerQuotes) return null;
    if (tickerQuotes[targetDate] !== undefined) return tickerQuotes[targetDate].toString();
    let dates = quoteDatesCache.get(ticker);
    if (!dates) {
      dates = Object.keys(tickerQuotes).sort();
      quoteDatesCache.set(ticker, dates);
    }
    // Maior data <= targetDate (busca binária na lista ordenada).
    let lo = 0;
    let hi = dates.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= targetDate) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found >= 0 ? tickerQuotes[dates[found]].toString() : null;
  };

  for (const date of evalDates) {
    let totalInvested = new Decimal(0);
    let totalMarketValue = new Decimal(0);

    for (const st of states) {
      const asset = st.asset;
      // Aplica as transações até a data (posição e custo exatos, sem truncar o PM no caminho)
      while (st.next < st.txs.length && st.txs[st.next].tradeDate <= date) {
        const tx = st.txs[st.next++];
        const qty = new Decimal(tx.quantity);
        const price = new Decimal(tx.unitPrice);
        const fees = new Decimal(tx.fees || 0);

        if (tx.type === 'BUY') {
          const buyCost = qty.mul(price).plus(fees);
          st.cost = st.cost.plus(buyCost);
          st.qty = st.qty.plus(qty);
        } else if (tx.type === 'SELL') {
          if (!st.qty.isZero()) {
            const currentPm = st.cost.div(st.qty);
            const soldCost = qty.mul(currentPm);
            st.cost = st.cost.minus(soldCost);
            st.qty = st.qty.minus(qty);
            if (st.qty.isZero()) {
              st.cost = new Decimal(0);
            }
          }
        }
      }

      if (st.next === 0) {
        continue;
      }
      const activeQty = st.qty;
      const activeCost = st.cost;

      if (activeQty.isZero()) {
        continue;
      }

      totalInvested = totalInvested.plus(activeCost);
      const earliestDate = st.txs[0].tradeDate;

      // Determine Market Value for this asset
      if (
        asset.manualPriceOverride !== null &&
        asset.manualPriceOverride !== undefined &&
        asset.manualPriceOverride !== ''
      ) {
        totalMarketValue = totalMarketValue.plus(new Decimal(asset.manualPriceOverride));
      } else if (asset.assetClass === 'FIXED_INCOME') {
        const principal = activeCost;
        const indexer = asset.rfIndexer;
        const rate = asset.rfRate || 0;

        if (indexer === 'CDI') {
          // Accumulate CDI rates from earliest buy date to current date
          const cdiRates: number[] = [];
          for (const d of sortedCdiDates) {
            if (d > date) break;
            if (d >= earliestDate) cdiRates.push(macroRates!.dailyCDI![d]);
          }
          const cdiResult = calculateCDIAccrual(principal.toString(), rate, cdiRates);
          totalMarketValue = totalMarketValue.plus(new Decimal(cdiResult.currentValue));
        } else if (indexer === 'PRE') {
          const bDays = countBusinessDays(earliestDate, date);
          const preResult = calculatePreFixedAccrual(principal.toString(), rate, bDays);
          totalMarketValue = totalMarketValue.plus(new Decimal(preResult.currentValue));
        } else if (indexer === 'IPCA') {
          const bDays = countBusinessDays(earliestDate, date);
          const ipcaVar = macroRates?.ipcaRates?.[date] || 0;
          const ipcaResult = calculateIPCAPlusAccrual(principal.toString(), rate, bDays, ipcaVar);
          totalMarketValue = totalMarketValue.plus(new Decimal(ipcaResult.currentValue));
        } else {
          totalMarketValue = totalMarketValue.plus(principal);
        }
      } else {
        // Variable income (STOCK, FII, CRYPTO)
        const quoteStr = latestQuote(asset.ticker, date);
        const quote = quoteStr ? new Decimal(quoteStr) : activeCost.div(activeQty);
        const assetMv = activeQty.mul(quote);
        totalMarketValue = totalMarketValue.plus(assetMv);
      }
    }

    const profit = totalMarketValue.minus(totalInvested);
    const profitPct = totalInvested.gt(0)
      ? profit.div(totalInvested).mul(100)
      : new Decimal(0);

    resultCurve.push({
      date,
      investedCapital: totalInvested.toFixed(2),
      marketValue: totalMarketValue.toFixed(2),
      profit: profit.toFixed(2),
      profitPercentage: profitPct.toFixed(2),
    });
  }

  return resultCurve;
}

const PT_MONTH_LABELS: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fev',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'Mai',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Out',
  '11': 'Nov',
  '12': 'Dez',
};

/**
 * Agrega a série diária em cápsulas mensais para o gráfico MonthlyPillChartCard.
 */
export function calculateMonthlyAggregatedPills(
  curve: HistoricalPricePoint[],
  transactions?: HistoricalTransactionInput[]
): MonthlyPillPoint[] {
  if (!curve || curve.length === 0) {
    return [];
  }

  const monthGroups: Record<string, HistoricalPricePoint[]> = {};
  for (const pt of curve) {
    const monthKey = pt.date.substring(0, 7);
    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = [];
    }
    monthGroups[monthKey].push(pt);
  }

  const sortedMonthKeys = Object.keys(monthGroups).sort();
  const pills: MonthlyPillPoint[] = [];

  for (const monthKey of sortedMonthKeys) {
    const pointsInMonth = monthGroups[monthKey];
    const lastPoint = pointsInMonth[pointsInMonth.length - 1];
    const monthPart = monthKey.split('-')[1];
    const label = PT_MONTH_LABELS[monthPart] || monthPart;

    let netContrib = new Decimal(0);
    if (transactions && transactions.length > 0) {
      const monthTxs = transactions.filter((t) => t.tradeDate.startsWith(monthKey));
      for (const tx of monthTxs) {
        const qty = new Decimal(tx.quantity);
        const price = new Decimal(tx.unitPrice);
        const fees = new Decimal(tx.fees || 0);
        if (tx.type === 'BUY') {
          netContrib = netContrib.plus(qty.mul(price).plus(fees));
        } else if (tx.type === 'SELL') {
          netContrib = netContrib.minus(qty.mul(price).minus(fees));
        }
      }
    } else {
      netContrib = new Decimal(lastPoint.investedCapital);
    }

    pills.push({
      monthKey,
      label,
      investedCapital: lastPoint.investedCapital,
      marketValue: lastPoint.marketValue,
      netContributions: netContrib.toFixed(2),
    });
  }

  return pills;
}

/**
 * S11-T01: Filtra a curva histórica de patrimônio de acordo com o período selecionado.
 * Suporta '5D', '1M', '1Y', '5Y' e 'ALL'.
 */
export function filterCurveByPeriod(
  curve: HistoricalPricePoint[],
  period: PeriodFilter,
  referenceDate?: string
): HistoricalPricePoint[] {
  if (!curve || curve.length === 0) {
    return [];
  }

  if (period === 'ALL') {
    return [...curve];
  }

  const sortedCurve = [...curve].sort((a, b) => a.date.localeCompare(b.date));
  const refDateStr = referenceDate || sortedCurve[sortedCurve.length - 1].date;
  const refDate = new Date(refDateStr + 'T00:00:00Z');

  const cutoffDate = new Date(refDate);

  switch (period) {
    case '5D':
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 5);
      break;
    case '1M':
      cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 1);
      break;
    case '1Y':
      cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 1);
      break;
    case '5Y':
      cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 5);
      break;
  }

  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  return sortedCurve.filter((p) => p.date >= cutoffStr && p.date <= refDateStr);
}

/**
 * S11-T01: Calcula o resumo do período (patrimônio inicial, aportes líquidos,
 * rendimento monetário, rentabilidade percentual e patrimônio final).
 */
export function calculatePeriodSummary(
  curve: HistoricalPricePoint[],
  transactions?: HistoricalTransactionInput[]
): PeriodSummary {
  if (!curve || curve.length === 0) {
    return {
      initialPatrimony: '0.00',
      netContributions: '0.00',
      yieldAmount: '0.00',
      yieldPercentage: '0.00',
      finalPatrimony: '0.00',
    };
  }

  const sortedCurve = [...curve].sort((a, b) => a.date.localeCompare(b.date));
  const firstPoint = sortedCurve[0];
  const lastPoint = sortedCurve[sortedCurve.length - 1];

  const initialPatrimony = new Decimal(firstPoint.marketValue);
  const finalPatrimony = new Decimal(lastPoint.marketValue);

  let netContributions = new Decimal(0);

  if (transactions && transactions.length > 0) {
    const startDate = firstPoint.date;
    const endDate = lastPoint.date;

    const periodTxs = transactions.filter(
      (tx) => tx.tradeDate >= startDate && tx.tradeDate <= endDate
    );

    for (const tx of periodTxs) {
      const qty = new Decimal(tx.quantity);
      const price = new Decimal(tx.unitPrice);
      const fees = new Decimal(tx.fees || 0);

      if (tx.type === 'BUY') {
        netContributions = netContributions.plus(qty.mul(price).plus(fees));
      } else if (tx.type === 'SELL') {
        netContributions = netContributions.minus(qty.mul(price).minus(fees));
      }
    }
  } else {
    const initialInvested = new Decimal(firstPoint.investedCapital);
    const finalInvested = new Decimal(lastPoint.investedCapital);
    netContributions = finalInvested.minus(initialInvested);
  }

  const effectiveInitialPatrimony =
    sortedCurve.length === 1
      ? Decimal.max(new Decimal(0), finalPatrimony.minus(netContributions))
      : initialPatrimony;

  const yieldAmount = finalPatrimony.minus(effectiveInitialPatrimony).minus(netContributions);

  const baseCapital = effectiveInitialPatrimony.plus(netContributions.gt(0) ? netContributions : new Decimal(0));
  const yieldPercentage = baseCapital.gt(0)
    ? yieldAmount.div(baseCapital).mul(100)
    : new Decimal(0);

  return {
    initialPatrimony: effectiveInitialPatrimony.toFixed(2),
    netContributions: netContributions.toFixed(2),
    yieldAmount: yieldAmount.toFixed(2),
    yieldPercentage: yieldPercentage.toFixed(2),
    finalPatrimony: finalPatrimony.toFixed(2),
  };
}


