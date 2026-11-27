import { parseIsoDateDays, priceAt, type PriceSeriesPoint } from './priceAt';
import {
  estimateTax,
  getTaxRulesVersion,
  regressiveFixedIncomeRate,
  type SandboxTaxAssetClass,
  type TaxEstimateResult,
} from './taxRules';

export interface SandboxDividendPoint {
  date: string;
  amountPerUnit: number;
  currency?: string;
  type?: string;
}

export interface SandboxLegInput {
  id?: string;
  ticker: string;
  assetClass: SandboxTaxAssetClass;
  investedBRL?: number;
  quantity?: number;
  buyDate: string;
  sellDate: string;
  feesBRL?: number;
  priceSeries: PriceSeriesPoint[];
  fxSeries?: PriceSeriesPoint[];
  dividends?: SandboxDividendPoint[];
  fxAccountType?: 'cash' | 'non_remunerated_account';
}

export interface MacroSeriesPoint {
  date: string;
  ratePct: number;
}

export interface SandboxScenarioInput {
  legs: SandboxLegInput[];
  macro?: {
    cdi?: MacroSeriesPoint[];
    ipca?: MacroSeriesPoint[];
    poupanca?: MacroSeriesPoint[];
  };
  options: {
    reinvestDividends: boolean;
    taxEnabled: boolean;
  };
}

export interface MonthlySeriesPoint {
  month: string;
  valueBRL: number;
}

export interface SandboxLegResult {
  id?: string;
  ticker: string;
  assetClass: SandboxTaxAssetClass;
  status: 'ok' | 'missing_data';
  missingReason?: string;
  investedBRL: number;
  quantity: number | null;
  buyPriceBRL: number | null;
  sellPriceBRL: number | null;
  buyEffectiveDate: string | null;
  sellEffectiveDate: string | null;
  finalValueBRL: number | null;
  gainBRL: number | null;
  gainPct: number | null;
  gainUSD: number | null;
  gainPctUSD: number | null;
  dividendsGrossBRL: number;
  dividendsWithheldBRL: number;
  dividendsNetBRL: number;
  taxEstimate: TaxEstimateResult | null;
  estimatedTaxBRL: number | null;
  netFinalValueBRL: number | null;
  netGainBRL: number | null;
  netGainPct: number | null;
  monthlySeries: MonthlySeriesPoint[];
}

export interface BenchmarkResult {
  id: 'cdi' | 'ipca' | 'poupanca';
  label: string;
  status: 'ok' | 'missing_data';
  investedBRL: number;
  finalValueBRL: number | null;
  gainBRL: number | null;
  gainPct: number | null;
  estimatedTaxBRL: number | null;
  netFinalValueBRL: number | null;
  netGainBRL: number | null;
  netGainPct: number | null;
  taxLabel: string;
}

export interface SandboxScenarioResult {
  status: 'ok' | 'missing_data';
  legs: SandboxLegResult[];
  total: {
    investedBRL: number;
    finalValueBRL: number | null;
    gainBRL: number | null;
    gainPct: number | null;
    dividendsGrossBRL: number;
    dividendsWithheldBRL: number;
    dividendsNetBRL: number;
    estimatedTaxBRL: number | null;
    netFinalValueBRL: number | null;
    netGainBRL: number | null;
    netGainPct: number | null;
    taxLabel: string;
    monthlySeries: MonthlySeriesPoint[];
  };
  benchmarks: {
    cdi: BenchmarkResult;
    ipca: BenchmarkResult;
    poupanca: BenchmarkResult;
  };
}

interface ComputedLegDraft {
  leg: SandboxLegInput;
  result: SandboxLegResult;
  capitalGainBRL: number;
  saleAmountBRL: number;
  saleAmountUSD?: number;
  holdingDays: number;
}

function buildMissingLegResult(leg: SandboxLegInput, reason: string): SandboxLegResult {
  return {
    id: leg.id,
    ticker: leg.ticker,
    assetClass: leg.assetClass,
    status: 'missing_data',
    missingReason: reason,
    investedBRL: leg.investedBRL ?? 0,
    quantity: null,
    buyPriceBRL: null,
    sellPriceBRL: null,
    buyEffectiveDate: null,
    sellEffectiveDate: null,
    finalValueBRL: null,
    gainBRL: null,
    gainPct: null,
    gainUSD: null,
    gainPctUSD: null,
    dividendsGrossBRL: 0,
    dividendsWithheldBRL: 0,
    dividendsNetBRL: 0,
    taxEstimate: null,
    estimatedTaxBRL: null,
    netFinalValueBRL: null,
    netGainBRL: null,
    netGainPct: null,
    monthlySeries: [],
  };
}

function listMonthsBetween(buyDate: string, sellDate: string): string[] {
  const startYm = buyDate.slice(0, 7);
  const endYm = sellDate.slice(0, 7);
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function computeLegDraft(
  leg: SandboxLegInput,
  reinvestDividends: boolean
): { ok: true; draft: ComputedLegDraft } | { ok: false; result: SandboxLegResult } {
  const buyAsset = priceAt(leg.priceSeries, leg.buyDate);
  const sellAsset = priceAt(leg.priceSeries, leg.sellDate);

  if (!buyAsset || !sellAsset) {
    return {
      ok: false,
      result: buildMissingLegResult(leg, `Sem cotação suficiente para ${leg.ticker}`),
    };
  }

  const isUsdAsset = leg.assetClass === 'US_STOCK';
  let buyFxRate = 1;
  let sellFxRate = 1;

  if (isUsdAsset) {
    if (!leg.fxSeries) {
      return {
        ok: false,
        result: buildMissingLegResult(leg, `Sem série cambial USDBRL para ${leg.ticker}`),
      };
    }
    const buyFx = priceAt(leg.fxSeries, leg.buyDate);
    const sellFx = priceAt(leg.fxSeries, leg.sellDate);
    if (!buyFx || !sellFx) {
      return {
        ok: false,
        result: buildMissingLegResult(leg, `Sem câmbio USDBRL na data de compra/venda para ${leg.ticker}`),
      };
    }
    buyFxRate = buyFx.price;
    sellFxRate = sellFx.price;
  }

  const buyPriceBRL = buyAsset.price * buyFxRate;
  const sellPriceBRL = sellAsset.price * sellFxRate;
  const feesBRL = leg.feesBRL ?? 0;

  let investedBRL: number;
  let initialQty: number;
  if (leg.investedBRL !== undefined) {
    investedBRL = leg.investedBRL;
    initialQty = investedBRL / buyPriceBRL;
  } else if (leg.quantity !== undefined) {
    initialQty = leg.quantity;
    investedBRL = initialQty * buyPriceBRL;
  } else {
    return {
      ok: false,
      result: buildMissingLegResult(leg, 'Informe valor investido ou quantidade'),
    };
  }

  const rulesVersion = getTaxRulesVersion(leg.sellDate);
  const withholdingRate = rulesVersion.rules[leg.assetClass].dividendWithholdingRate;

  let quantity = initialQty;
  let dividendsGrossBRL = 0;
  let dividendsWithheldBRL = 0;
  let dividendsNetBRL = 0;
  let dividendsCashBRL = 0;
  let dividendsNetUSD = 0;

  const sortedDividends = (leg.dividends ?? [])
    .filter((d) => d.date > leg.buyDate && d.date <= leg.sellDate && d.amountPerUnit > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const div of sortedDividends) {
    let divFxRate = 1;
    if (isUsdAsset && leg.fxSeries) {
      const fxDiv = priceAt(leg.fxSeries, div.date);
      if (!fxDiv) {
        return {
          ok: false,
          result: buildMissingLegResult(leg, `Sem câmbio USDBRL para provento em ${div.date}`),
        };
      }
      divFxRate = fxDiv.price;
    }

    const grossAsset = div.amountPerUnit * quantity;
    const withheldAsset = grossAsset * withholdingRate;
    const netAsset = grossAsset - withheldAsset;

    dividendsGrossBRL += grossAsset * divFxRate;
    dividendsWithheldBRL += withheldAsset * divFxRate;
    dividendsNetBRL += netAsset * divFxRate;
    if (isUsdAsset) {
      dividendsNetUSD += netAsset;
    }

    if (reinvestDividends) {
      const reinvestPoint = priceAt(leg.priceSeries, div.date);
      if (!reinvestPoint) {
        return {
          ok: false,
          result: buildMissingLegResult(leg, `Sem cotação para reinvestir provento em ${div.date}`),
        };
      }
      quantity += netAsset / reinvestPoint.price;
    } else {
      dividendsCashBRL += netAsset * divFxRate;
    }
  }

  const finalSharesValueBRL = quantity * sellPriceBRL;
  const finalValueBRL = finalSharesValueBRL + dividendsCashBRL;
  const gainBRL = finalValueBRL - investedBRL - feesBRL;
  const gainPct = investedBRL > 0 ? (gainBRL / investedBRL) * 100 : 0;

  // Base tributável de ganho de capital: exclui proventos líquidos (isentos na B3 ou já retidos 30% nos EUA)
  const capitalGainBRL = finalValueBRL - investedBRL - dividendsNetBRL - feesBRL;

  let gainUSD: number | null = null;
  let gainPctUSD: number | null = null;
  let saleAmountUSD: number | undefined;
  if (isUsdAsset) {
    const investedUSD = initialQty * buyAsset.price;
    const finalUSD = quantity * sellAsset.price + (reinvestDividends ? 0 : dividendsNetUSD);
    gainUSD = finalUSD - investedUSD - feesBRL / sellFxRate;
    gainPctUSD = investedUSD > 0 ? (gainUSD / investedUSD) * 100 : 0;
    saleAmountUSD = quantity * sellAsset.price;
  } else if (leg.assetClass === 'FX') {
    saleAmountUSD = quantity;
  }

  const buyDays = parseIsoDateDays(leg.buyDate) ?? 0;
  const sellDays = parseIsoDateDays(leg.sellDate) ?? 0;
  const holdingDays = Math.max(0, sellDays - buyDays);

  const months = listMonthsBetween(leg.buyDate, leg.sellDate);
  const monthlySeries: MonthlySeriesPoint[] = [];
  for (const ym of months) {
    const refDate = ym === leg.sellDate.slice(0, 7) ? leg.sellDate : lastDayOfMonth(ym);
    const pAsset = priceAt(leg.priceSeries, refDate);
    if (!pAsset) continue;
    let fx = 1;
    if (isUsdAsset && leg.fxSeries) {
      const pFx = priceAt(leg.fxSeries, refDate);
      if (!pFx) continue;
      fx = pFx.price;
    }
    monthlySeries.push({
      month: ym,
      valueBRL: initialQty * pAsset.price * fx,
    });
  }

  return {
    ok: true,
    draft: {
      leg,
      capitalGainBRL,
      saleAmountBRL: finalSharesValueBRL,
      saleAmountUSD,
      holdingDays,
      result: {
        id: leg.id,
        ticker: leg.ticker,
        assetClass: leg.assetClass,
        status: 'ok',
        investedBRL,
        quantity,
        buyPriceBRL,
        sellPriceBRL,
        buyEffectiveDate: buyAsset.effectiveDate,
        sellEffectiveDate: sellAsset.effectiveDate,
        finalValueBRL,
        gainBRL,
        gainPct,
        gainUSD,
        gainPctUSD,
        dividendsGrossBRL,
        dividendsWithheldBRL,
        dividendsNetBRL,
        taxEstimate: null,
        estimatedTaxBRL: 0,
        netFinalValueBRL: finalValueBRL,
        netGainBRL: gainBRL,
        netGainPct: gainPct,
        monthlySeries,
      },
    },
  };
}

function computeBenchmark(
  id: 'cdi' | 'ipca' | 'poupanca',
  label: string,
  series: MacroSeriesPoint[] | undefined,
  investedBRL: number,
  buyDate: string,
  sellDate: string,
  taxEnabled: boolean
): BenchmarkResult {
  if (!series || series.length === 0 || investedBRL <= 0) {
    return {
      id,
      label,
      status: 'missing_data',
      investedBRL,
      finalValueBRL: null,
      gainBRL: null,
      gainPct: null,
      estimatedTaxBRL: null,
      netFinalValueBRL: null,
      netGainBRL: null,
      netGainPct: null,
      taxLabel: 'Sem série disponível',
    };
  }

  const relevant = series
    .filter((r) => r.date > buyDate && r.date <= sellDate && Number.isFinite(r.ratePct))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (relevant.length === 0) {
    return {
      id,
      label,
      status: 'missing_data',
      investedBRL,
      finalValueBRL: null,
      gainBRL: null,
      gainPct: null,
      estimatedTaxBRL: null,
      netFinalValueBRL: null,
      netGainBRL: null,
      netGainPct: null,
      taxLabel: 'Sem série disponível no período',
    };
  }

  let factor = 1;
  for (const r of relevant) {
    factor *= 1 + r.ratePct / 100;
  }

  const finalValueBRL = investedBRL * factor;
  const gainBRL = finalValueBRL - investedBRL;
  const gainPct = (factor - 1) * 100;

  let estimatedTaxBRL = 0;
  let taxLabel = 'Estimativa de IR: R$ 0,00';

  if (id === 'cdi') {
    if (taxEnabled && gainBRL > 0) {
      const days = Math.max(0, (parseIsoDateDays(sellDate) ?? 0) - (parseIsoDateDays(buyDate) ?? 0));
      const rate = regressiveFixedIncomeRate(days);
      estimatedTaxBRL = gainBRL * rate;
      taxLabel = `Estimativa de IR regressivo (${(rate * 100).toFixed(1).replace('.', ',')}%): R$ ${estimatedTaxBRL.toFixed(2).replace('.', ',')}`;
    } else {
      taxLabel = taxEnabled ? 'Estimativa de IR: R$ 0,00' : 'Estimativa de IR desligada (R$ 0,00)';
    }
  } else if (id === 'poupanca') {
    taxLabel = 'Estimativa de IR: R$ 0,00 (poupança isenta)';
  } else {
    taxLabel = 'Referência de inflação (IPCA)';
  }

  const netFinalValueBRL = finalValueBRL - estimatedTaxBRL;
  const netGainBRL = netFinalValueBRL - investedBRL;
  const netGainPct = investedBRL > 0 ? (netGainBRL / investedBRL) * 100 : 0;

  return {
    id,
    label,
    status: 'ok',
    investedBRL,
    finalValueBRL,
    gainBRL,
    gainPct,
    estimatedTaxBRL,
    netFinalValueBRL,
    netGainBRL,
    netGainPct,
    taxLabel,
  };
}

/**
 * R48: Executa backtest completo de um cenário da Máquina do Tempo.
 * Se qualquer perna estiver com `missing_data`, o total não fecha (retorna null).
 */
export function runScenario(input: SandboxScenarioInput): SandboxScenarioResult {
  const drafts: Array<{ ok: true; draft: ComputedLegDraft } | { ok: false; result: SandboxLegResult }> =
    input.legs.map((leg) => computeLegDraft(leg, input.options.reinvestDividends));

  // Agrega vendas mensais por classe para aplicação das isenções de R49
  const stockSalesByMonth = new Map<string, number>();
  const cryptoSalesByMonth = new Map<string, number>();
  const fxSalesByYear = new Map<string, number>();

  for (const item of drafts) {
    if (!item.ok) continue;
    const { leg, saleAmountBRL, saleAmountUSD } = item.draft;
    const ym = leg.sellDate.slice(0, 7);
    const yr = leg.sellDate.slice(0, 4);
    if (leg.assetClass === 'STOCK') {
      stockSalesByMonth.set(ym, (stockSalesByMonth.get(ym) ?? 0) + saleAmountBRL);
    } else if (leg.assetClass === 'CRYPTO') {
      cryptoSalesByMonth.set(ym, (cryptoSalesByMonth.get(ym) ?? 0) + saleAmountBRL);
    } else if (leg.assetClass === 'FX') {
      fxSalesByYear.set(yr, (fxSalesByYear.get(yr) ?? 0) + (saleAmountUSD ?? 0));
    }
  }

  const legResults: SandboxLegResult[] = [];
  let hasMissingData = false;

  for (const item of drafts) {
    if (!item.ok) {
      hasMissingData = true;
      legResults.push(item.result);
      continue;
    }

    const { draft } = item;
    const ym = draft.leg.sellDate.slice(0, 7);
    const yr = draft.leg.sellDate.slice(0, 4);

    const tax = estimateTax(
      {
        assetClass: draft.leg.assetClass,
        gainBRL: draft.capitalGainBRL,
        saleAmountBRL: draft.saleAmountBRL,
        saleDate: draft.leg.sellDate,
        holdingDays: draft.holdingDays,
        fxAccountType: draft.leg.fxAccountType,
        saleAmountUSD: draft.saleAmountUSD,
      },
      {
        totalStockSalesInMonthBRL: stockSalesByMonth.get(ym),
        totalCryptoSalesInMonthBRL: cryptoSalesByMonth.get(ym),
        totalFxSalesInYearUSD: fxSalesByYear.get(yr),
        taxEnabled: input.options.taxEnabled,
      }
    );

    const netFinalValueBRL = (draft.result.finalValueBRL ?? 0) - tax.taxBRL;
    const netGainBRL = netFinalValueBRL - draft.result.investedBRL - (draft.leg.feesBRL ?? 0);
    const netGainPct =
      draft.result.investedBRL > 0 ? (netGainBRL / draft.result.investedBRL) * 100 : 0;

    legResults.push({
      ...draft.result,
      taxEstimate: tax,
      estimatedTaxBRL: tax.taxBRL,
      netFinalValueBRL,
      netGainBRL,
      netGainPct,
    });
  }

  const totalInvestedBRL = legResults.reduce((acc, l) => acc + l.investedBRL, 0);
  const allBuyDates = input.legs.map((l) => l.buyDate).filter(Boolean).sort();
  const allSellDates = input.legs.map((l) => l.sellDate).filter(Boolean).sort();
  const minBuyDate = allBuyDates[0] ?? '';
  const maxSellDate = allSellDates[allSellDates.length - 1] ?? '';

  const benchmarks = {
    cdi: computeBenchmark(
      'cdi',
      'CDI',
      input.macro?.cdi,
      totalInvestedBRL,
      minBuyDate,
      maxSellDate,
      input.options.taxEnabled
    ),
    ipca: computeBenchmark(
      'ipca',
      'IPCA',
      input.macro?.ipca,
      totalInvestedBRL,
      minBuyDate,
      maxSellDate,
      false
    ),
    poupanca: computeBenchmark(
      'poupanca',
      'Poupança',
      input.macro?.poupanca,
      totalInvestedBRL,
      minBuyDate,
      maxSellDate,
      false
    ),
  };

  if (hasMissingData || legResults.length === 0) {
    return {
      status: 'missing_data',
      legs: legResults,
      total: {
        investedBRL: totalInvestedBRL,
        finalValueBRL: null,
        gainBRL: null,
        gainPct: null,
        dividendsGrossBRL: legResults.reduce((a, l) => a + l.dividendsGrossBRL, 0),
        dividendsWithheldBRL: legResults.reduce((a, l) => a + l.dividendsWithheldBRL, 0),
        dividendsNetBRL: legResults.reduce((a, l) => a + l.dividendsNetBRL, 0),
        estimatedTaxBRL: null,
        netFinalValueBRL: null,
        netGainBRL: null,
        netGainPct: null,
        taxLabel: input.options.taxEnabled
          ? 'Estimativa de IR indisponível (sem dado)'
          : 'Estimativa de IR desligada (R$ 0,00)',
        monthlySeries: [],
      },
      benchmarks,
    };
  }

  const totalFinalValueBRL = legResults.reduce((a, l) => a + (l.finalValueBRL ?? 0), 0);
  const totalGainBRL = legResults.reduce((a, l) => a + (l.gainBRL ?? 0), 0);
  const totalGainPct = totalInvestedBRL > 0 ? (totalGainBRL / totalInvestedBRL) * 100 : 0;
  const totalDivGross = legResults.reduce((a, l) => a + l.dividendsGrossBRL, 0);
  const totalDivWithheld = legResults.reduce((a, l) => a + l.dividendsWithheldBRL, 0);
  const totalDivNet = legResults.reduce((a, l) => a + l.dividendsNetBRL, 0);
  const totalTaxBRL = legResults.reduce((a, l) => a + (l.estimatedTaxBRL ?? 0), 0);
  const totalNetFinalValueBRL = totalFinalValueBRL - totalTaxBRL;
  const totalNetGainBRL = totalGainBRL - totalTaxBRL;
  const totalNetGainPct = totalInvestedBRL > 0 ? (totalNetGainBRL / totalInvestedBRL) * 100 : 0;

  const monthMap = new Map<string, number>();
  for (const leg of legResults) {
    for (const pt of leg.monthlySeries) {
      monthMap.set(pt.month, (monthMap.get(pt.month) ?? 0) + pt.valueBRL);
    }
  }
  const monthlySeries = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, valueBRL]) => ({ month, valueBRL }));

  const taxLabel = input.options.taxEnabled
    ? `Estimativa de IR total: R$ ${totalTaxBRL.toFixed(2).replace('.', ',')}`
    : 'Estimativa de IR desligada (R$ 0,00)';

  return {
    status: 'ok',
    legs: legResults,
    total: {
      investedBRL: totalInvestedBRL,
      finalValueBRL: totalFinalValueBRL,
      gainBRL: totalGainBRL,
      gainPct: totalGainPct,
      dividendsGrossBRL: totalDivGross,
      dividendsWithheldBRL: totalDivWithheld,
      dividendsNetBRL: totalDivNet,
      estimatedTaxBRL: totalTaxBRL,
      netFinalValueBRL: totalNetFinalValueBRL,
      netGainBRL: totalNetGainBRL,
      netGainPct: totalNetGainPct,
      taxLabel,
      monthlySeries,
    },
    benchmarks,
  };
}
