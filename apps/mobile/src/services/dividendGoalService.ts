import type { Dividend } from '../domain/finance/assetProfile';
import {
  currentMonthlyIncome,
  trailingYield,
  type DividendGoalCandidate,
} from '../domain/sandbox/dividendGoal';
import { assetRepository } from '../repositories/assetRepository';
import { finRepository } from '../repositories/finRepository';
import { incomeRepository } from '../repositories/incomeRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { marketApiService, type IMarketApiService } from './marketApi';

export interface DividendGoalScenarioSpec {
  monthlyGoalBRL: number;
  useFixedExpenses: boolean;
  adjustByIpca: boolean;
  mode: 'follow_targets' | 'free';
  maxPerAssetPct: number;
  assetClassFilter: string;
  snowballMonthlyBRL: number;
}

export interface LoadCandidatesOptions {
  mode: 'follow_targets' | 'free';
  assetClass?: string;
  portfolioId?: string;
  refDate?: string;
}

export interface LoadedCandidatesResult {
  candidates: DividendGoalCandidate[];
  shortHistoryTickers: string[];
  dividendsByTicker: Record<string, Dividend[]>;
  pricesByTicker: Record<string, number>;
}

export class DividendGoalService {
  private marketApi: IMarketApiService;
  private dividendsCache = new Map<string, Dividend[]>();
  private ipcaCache: number | null | undefined = undefined;

  constructor(marketApi: IMarketApiService = marketApiService) {
    this.marketApi = marketApi;
  }

  clearCache(): void {
    this.dividendsCache.clear();
    this.ipcaCache = undefined;
  }

  /**
   * Soma das recorrências de despesa ativas (em centavos/mês).
   * Retorna `null` quando não há recorrências ativas de despesa.
   */
  async getFixedExpensesMonthlyCents(): Promise<number | null> {
    const list = await finRepository.listRecurrences({ onlyActive: true });
    const expenses = list.filter((r) => r.kind === 'expense' && r.active === 1);
    if (expenses.length === 0) return null;

    let total = 0;
    for (const r of expenses) {
      if (r.frequency === 'weekly') {
        total += Math.round((r.amount_cents * 52) / 12);
      } else if (r.frequency === 'yearly') {
        total += Math.round(r.amount_cents / 12);
      } else {
        total += r.amount_cents;
      }
    }
    return total > 0 ? total : null;
  }

  async getCurrentMonthlyIncomeBRL(
    refDate: string = new Date().toISOString().slice(0, 10)
  ): Promise<number> {
    const events = await incomeRepository.listAllIncomes();
    return currentMonthlyIncome(events, refDate);
  }

  async getIpca12mRate(): Promise<number | null> {
    if (this.ipcaCache !== undefined) return this.ipcaCache;
    try {
      const fromDate = new Date(Date.now() - 400 * 86400 * 1000)
        .toISOString()
        .slice(0, 10);
      const rates = await this.marketApi.fetchMacroRates(fromDate);
      const ipcaRates = (rates ?? [])
        .map((r) => r.ipca)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (ipcaRates.length === 0) {
        this.ipcaCache = null;
        return null;
      }
      const latest = ipcaRates[ipcaRates.length - 1];
      this.ipcaCache = latest > 1 ? latest / 100 : latest;
      return this.ipcaCache;
    } catch {
      return null;
    }
  }

  async getDividendsCached(
    ticker: string,
    assetClass?: string
  ): Promise<Dividend[]> {
    const clean = ticker.trim().toUpperCase();
    const cls = assetClass ? assetClass.trim().toUpperCase() : '';
    const key = `${clean}:${cls}`;
    const cached = this.dividendsCache.get(key);
    if (cached) return cached;

    if (!this.marketApi.getDividends) return [];
    const list = await this.marketApi.getDividends(clean, cls ? { assetClass: cls } : undefined);
    const normalized = Array.isArray(list) ? list : [];
    this.dividendsCache.set(key, normalized);
    return normalized;
  }

  async loadCandidates(
    options: LoadCandidatesOptions
  ): Promise<LoadedCandidatesResult> {
    const refDate = options.refDate ?? new Date().toISOString().slice(0, 10);
    const filterClass =
      options.assetClass && options.assetClass !== 'ALL'
        ? options.assetClass.toUpperCase()
        : undefined;

    const dividendsByTicker: Record<string, Dividend[]> = {};
    const pricesByTicker: Record<string, number> = {};
    const shortHistoryTickers: string[] = [];
    const candidates: DividendGoalCandidate[] = [];

    if (options.mode === 'follow_targets') {
      const portfolios = await portfolioRepository.getAllPortfolios();
      const targetPortfolio = options.portfolioId
        ? portfolios.find((p) => p.id === options.portfolioId)
        : portfolios[0];

      if (targetPortfolio) {
        const [assets, classTargets] = await Promise.all([
          assetRepository.getAssetsByPortfolio(targetPortfolio.id),
          portfolioRepository.getClassTargets(targetPortfolio.id),
        ]);
        const classTargetMap = new Map<string, number>(
          classTargets.map((ct) => [ct.asset_class.toUpperCase(), ct.target_percentage])
        );

        const filteredAssets = assets.filter(
          (a) => !filterClass || a.asset_class.toUpperCase() === filterClass
        );

        await Promise.all(
          filteredAssets.map(async (asset) => {
            const cls = asset.asset_class.toUpperCase();
            const price = parseFloat(asset.average_price || '0') || 0;
            pricesByTicker[asset.ticker] = price;
            const divs = await this.getDividendsCached(asset.ticker, cls);
            dividendsByTicker[asset.ticker] = divs;

            const ty = trailingYield(divs, price, refDate);
            if (ty.shortHistory) {
              shortHistoryTickers.push(asset.ticker);
            }
            const classWeight = classTargetMap.get(cls) ?? 0;
            const inClassWeight = asset.target_percentage_in_class ?? 0;
            const combinedWeight =
              classWeight > 0 && inClassWeight > 0
                ? (classWeight * inClassWeight) / 100
                : inClassWeight || classWeight || 1;

            candidates.push({
              ticker: asset.ticker,
              assetClass: cls,
              yield: ty.yield ?? 0,
              price,
              targetWeight: combinedWeight,
              shortHistory: ty.shortHistory,
            });
          })
        );
      }

      return {
        candidates,
        shortHistoryTickers,
        dividendsByTicker,
        pricesByTicker,
      };
    }

    // Modo "Livre": getRanking(by='dy') da classe filtrada
    const ranking = this.marketApi.getRanking
      ? await this.marketApi.getRanking(filterClass, 'dy', 15)
      : [];

    await Promise.all(
      (ranking ?? []).map(async (item) => {
        const cls = String(item.assetClass).toUpperCase();
        const price = item.price > 0 ? item.price : 0;
        pricesByTicker[item.ticker] = price;
        const divs = await this.getDividendsCached(item.ticker, cls);
        dividendsByTicker[item.ticker] = divs;

        const ty = trailingYield(divs, price, refDate);
        if (ty.shortHistory) {
          shortHistoryTickers.push(item.ticker);
        }
        candidates.push({
          ticker: item.ticker,
          assetClass: cls,
          yield: ty.yield ?? (item.dy12m ? item.dy12m / 100 : 0),
          price,
          shortHistory: ty.shortHistory,
        });
      })
    );

    return {
      candidates,
      shortHistoryTickers,
      dividendsByTicker,
      pricesByTicker,
    };
  }
}

export const dividendGoalService = new DividendGoalService();
