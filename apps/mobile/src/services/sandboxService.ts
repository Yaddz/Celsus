import type { PriceSeriesPoint } from '../domain/sandbox/priceAt';
import { runScenario, type MacroSeriesPoint, type SandboxLegInput, type SandboxScenarioResult } from '../domain/sandbox/backtest';
import type { SandboxTaxAssetClass } from '../domain/sandbox/taxRules';
import type { TimeMachineScenarioSpec } from '../repositories/sandboxRepository';
import { marketApiService, type IMarketApiService, type MacroRateData } from './marketApi';

export class SandboxService {
  private marketApi: IMarketApiService;
  private seriesCache = new Map<string, PriceSeriesPoint[]>();
  private macroCache = new Map<string, MacroRateData[]>();

  constructor(marketApi: IMarketApiService = marketApiService) {
    this.marketApi = marketApi;
  }

  clearCache(): void {
    this.seriesCache.clear();
    this.macroCache.clear();
  }

  private async fetchSeriesCached(
    ticker: string,
    assetClass: string,
    range: string,
    datesToEnsure: string[]
  ): Promise<PriceSeriesPoint[]> {
    const clean = ticker.trim().toUpperCase();
    const cls = assetClass.trim().toUpperCase();
    const key = `${clean}:${cls}:${range}`;

    let series = this.seriesCache.get(key);
    if (!series) {
      if (this.marketApi.getPriceHistory) {
        const points = await this.marketApi.getPriceHistory(clean, range, { assetClass: cls });
        series = (points ?? []).map((p) => ({
          date: p.date,
          close: p.close,
          currency: p.currency,
        }));
      } else {
        series = [];
      }

      // Fallback pontual via getHistoricalPrice se a série estiver vazia
      if (series.length === 0) {
        const fetched: PriceSeriesPoint[] = [];
        for (const d of Array.from(new Set(datesToEnsure))) {
          const priceStr = await this.marketApi.getHistoricalPrice(clean, d, { assetClass: cls });
          const val = priceStr ? parseFloat(priceStr) : NaN;
          if (Number.isFinite(val) && val > 0) {
            fetched.push({ date: d, close: val, currency: cls === 'US_STOCK' ? 'USD' : 'BRL' });
          }
        }
        series = fetched;
      }

      this.seriesCache.set(key, series);
    }

    return series;
  }

  private async fetchMacroCached(fromDate: string): Promise<MacroRateData[]> {
    const cached = this.macroCache.get(fromDate);
    if (cached) return cached;
    const rates = await this.marketApi.fetchMacroRates(fromDate);
    const list = Array.isArray(rates) ? rates : [];
    this.macroCache.set(fromDate, list);
    return list;
  }

  /**
   * Busca séries em lote (com `class` e `USDBRL` quando há `US_STOCK`) e taxas macro,
   * reutilizando cache local, e executa o motor de domínio `runScenario`.
   */
  async runTimeMachine(spec: TimeMachineScenarioSpec): Promise<SandboxScenarioResult> {
    if (!spec.legs || spec.legs.length === 0) {
      return runScenario({ legs: [], options: spec.options });
    }

    const allBuyDates = spec.legs.map((l) => l.buyDate).filter(Boolean).sort();
    const minBuyDate = allBuyDates[0] ?? new Date().toISOString().slice(0, 10);

    const needsUsdBrl = spec.legs.some((l) => l.assetClass.toUpperCase() === 'US_STOCK');
    const uniquePairs = new Map<string, { ticker: string; assetClass: string; dates: string[] }>();

    for (const leg of spec.legs) {
      const ticker = leg.ticker.trim().toUpperCase();
      const cls = leg.assetClass.trim().toUpperCase();
      const key = `${ticker}:${cls}`;
      const existing = uniquePairs.get(key) ?? { ticker, assetClass: cls, dates: [] };
      existing.dates.push(leg.buyDate, leg.sellDate);
      uniquePairs.set(key, existing);
    }

    const seriesByPair = new Map<string, PriceSeriesPoint[]>();
    await Promise.all(
      Array.from(uniquePairs.entries()).map(async ([key, item]) => {
        const s = await this.fetchSeriesCached(item.ticker, item.assetClass, 'max', item.dates);
        seriesByPair.set(key, s);
      })
    );

    const fxDates = spec.legs
      .filter((l) => l.assetClass.toUpperCase() === 'US_STOCK')
      .flatMap((l) => [l.buyDate, l.sellDate]);

    const [fxSeries, macroRates] = await Promise.all([
      needsUsdBrl ? this.fetchSeriesCached('USDBRL', 'FX', 'max', fxDates) : Promise.resolve(undefined),
      this.fetchMacroCached(minBuyDate),
    ]);

    const cdiSeries: MacroSeriesPoint[] = [];
    const ipcaSeries: MacroSeriesPoint[] = [];
    for (const r of macroRates) {
      if (typeof r.cdi === 'number' && Number.isFinite(r.cdi)) {
        cdiSeries.push({ date: r.date, ratePct: r.cdi });
      }
      if (typeof r.ipca === 'number' && Number.isFinite(r.ipca)) {
        ipcaSeries.push({ date: r.date, ratePct: r.ipca });
      }
    }

    const domainLegs: SandboxLegInput[] = spec.legs.map((leg) => {
      const ticker = leg.ticker.trim().toUpperCase();
      const cls = leg.assetClass.trim().toUpperCase() as SandboxTaxAssetClass;
      return {
        id: leg.id,
        ticker,
        assetClass: cls,
        investedBRL: leg.investedBRL,
        quantity: leg.quantity,
        buyDate: leg.buyDate,
        sellDate: leg.sellDate,
        feesBRL: leg.feesBRL,
        priceSeries: seriesByPair.get(`${ticker}:${cls}`) ?? [],
        fxSeries: cls === 'US_STOCK' ? fxSeries : undefined,
      };
    });

    return runScenario({
      legs: domainLegs,
      macro: {
        cdi: cdiSeries.length > 0 ? cdiSeries : undefined,
        ipca: ipcaSeries.length > 0 ? ipcaSeries : undefined,
      },
      options: spec.options,
    });
  }
}

export const sandboxService = new SandboxService();
