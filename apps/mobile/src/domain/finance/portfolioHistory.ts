import Decimal from 'decimal.js';
import { AssetClass } from './types';
import { calculateCDIAccrual, calculatePreFixedAccrual, calculateIPCAPlusAccrual } from './fixedIncome';

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

function getLatestAvailableQuote(
  ticker: string,
  targetDate: string,
  quotesMap?: Record<string, Record<string, string | number>>
): string | null {
  if (!quotesMap || !quotesMap[ticker]) {
    return null;
  }
  const tickerQuotes = quotesMap[ticker];
  if (tickerQuotes[targetDate] !== undefined) {
    return tickerQuotes[targetDate].toString();
  }

  // Look back for the latest quote on or before targetDate
  const availableDates = Object.keys(tickerQuotes)
    .filter((d) => d <= targetDate)
    .sort();

  if (availableDates.length > 0) {
    const latestDate = availableDates[availableDates.length - 1];
    return tickerQuotes[latestDate].toString();
  }

  return null;
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

  for (const date of evalDates) {
    let totalInvested = new Decimal(0);
    let totalMarketValue = new Decimal(0);

    for (const asset of assets) {
      // Find all transactions for this asset up to date
      const assetTxs = transactions
        .filter((tx) => (tx.assetId === asset.id || tx.ticker === asset.ticker) && tx.tradeDate <= date)
        .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

      if (assetTxs.length === 0) {
        continue;
      }

      // Compute exact position and cost basis without intermediate PM truncation
      let activeQty = new Decimal(0);
      let activeCost = new Decimal(0);

      for (const tx of assetTxs) {
        const qty = new Decimal(tx.quantity);
        const price = new Decimal(tx.unitPrice);
        const fees = new Decimal(tx.fees || 0);

        if (tx.type === 'BUY') {
          const buyCost = qty.mul(price).plus(fees);
          activeCost = activeCost.plus(buyCost);
          activeQty = activeQty.plus(qty);
        } else if (tx.type === 'SELL') {
          if (!activeQty.isZero()) {
            const currentPm = activeCost.div(activeQty);
            const soldCost = qty.mul(currentPm);
            activeCost = activeCost.minus(soldCost);
            activeQty = activeQty.minus(qty);
            if (activeQty.isZero()) {
              activeCost = new Decimal(0);
            }
          }
        }
      }

      if (activeQty.isZero()) {
        continue;
      }

      totalInvested = totalInvested.plus(activeCost);

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
          const earliestDate = assetTxs[0].tradeDate;
          const cdiRates: number[] = [];
          if (macroRates?.dailyCDI) {
            const allCdiDates = Object.keys(macroRates.dailyCDI).sort();
            for (const d of allCdiDates) {
              if (d >= earliestDate && d <= date) {
                cdiRates.push(macroRates.dailyCDI[d]);
              }
            }
          }
          const cdiResult = calculateCDIAccrual(principal.toString(), rate, cdiRates);
          totalMarketValue = totalMarketValue.plus(new Decimal(cdiResult.currentValue));
        } else if (indexer === 'PRE') {
          const earliestDate = assetTxs[0].tradeDate;
          const bDays = countBusinessDays(earliestDate, date);
          const preResult = calculatePreFixedAccrual(principal.toString(), rate, bDays);
          totalMarketValue = totalMarketValue.plus(new Decimal(preResult.currentValue));
        } else if (indexer === 'IPCA') {
          const earliestDate = assetTxs[0].tradeDate;
          const bDays = countBusinessDays(earliestDate, date);
          const ipcaVar = macroRates?.ipcaRates?.[date] || 0;
          const ipcaResult = calculateIPCAPlusAccrual(principal.toString(), rate, bDays, ipcaVar);
          totalMarketValue = totalMarketValue.plus(new Decimal(ipcaResult.currentValue));
        } else {
          totalMarketValue = totalMarketValue.plus(principal);
        }
      } else {
        // Variable income (STOCK, FII, CRYPTO)
        const quoteStr = getLatestAvailableQuote(asset.ticker, date, historicalQuotes);
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
