import Decimal from 'decimal.js';
import { AssetClass } from './types';

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

/**
 * S5-T01: Reconstrução exata da curva histórica investedCapital vs marketValue
 * cruzando aportes/vendas com preços do COTAHIST e curva de Renda Fixa.
 *
 * (Assinatura / Stub para Fase A - TDD Red Phase)
 */
export function calculateDailyPatrimonyCurve(
  _params: CalculatePatrimonyCurveParams
): HistoricalPricePoint[] {
  return [];
}

/**
 * Agrega a série diária em cápsulas mensais para o gráfico MonthlyPillChartCard.
 *
 * (Assinatura / Stub para Fase A - TDD Red Phase)
 */
export function calculateMonthlyAggregatedPills(
  _curve: HistoricalPricePoint[],
  _transactions?: HistoricalTransactionInput[]
): MonthlyPillPoint[] {
  return [];
}
