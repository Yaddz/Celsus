import Decimal from 'decimal.js';
import { PortfolioRepository } from '../repositories/portfolioRepository';
import { AssetRepository } from '../repositories/assetRepository';
import { IMarketApiService, marketApiService, MarketQuote } from './marketApi';
import { Asset } from '../db/schema';

export interface PortfolioSyncSummary {
  portfolioId: string;
  name: string;
  investedCapital: string;
  marketValue: string;
  profit: string;
  profitPercentage: string;
}

export interface MarketSyncResult {
  syncedTickers: string[];
  quotes: Record<string, MarketQuote>;
  portfolios: PortfolioSyncSummary[];
  totalMarketValue: string;
  totalInvestedCapital: string;
  syncedAt: string;
}

export interface PortfolioPatrimonySummary {
  investedCapital: string;
  marketValue: string;
  profit: string;
  profitPercentage: string;
}

export class MarketSyncService {
  constructor(
    protected portfolioRepo: PortfolioRepository = new PortfolioRepository(),
    protected assetRepo: AssetRepository = new AssetRepository(),
    protected marketApi: IMarketApiService = marketApiService
  ) {}

  /**
   * S7-T02: Sincroniza em lote todos os tickers das carteiras locais com o backend Go
   * e recalcula imediatamente o patrimônio com os preços de mercado atualizados.
   */
  async syncAllPortfolioTickers(): Promise<MarketSyncResult> {
    const portfolios = await this.portfolioRepo.listPortfolios(false);
    if (!portfolios || portfolios.length === 0) {
      return {
        syncedTickers: [],
        quotes: {},
        portfolios: [],
        totalMarketValue: '0.00',
        totalInvestedCapital: '0.00',
        syncedAt: new Date().toISOString(),
      };
    }

    const portfolioAssetsMap = new Map<string, Asset[]>();
    const tickerSet = new Set<string>();

    for (const p of portfolios) {
      const assets = await this.assetRepo.getAssetsByPortfolio(p.id);
      portfolioAssetsMap.set(p.id, assets);

      for (const a of assets) {
        if (a.asset_class !== 'FIXED_INCOME' && a.ticker) {
          const normTicker = a.ticker.trim().toUpperCase();
          if (normTicker) {
            tickerSet.add(normTicker);
          }
        }
      }
    }

    const uniqueTickers = Array.from(tickerSet);
    const quotesMap: Record<string, MarketQuote> = {};

    if (uniqueTickers.length > 0) {
      const fetched = await this.marketApi.fetchQuotes(uniqueTickers);
      for (const q of fetched) {
        quotesMap[q.ticker.toUpperCase()] = q;
      }
    }

    let grandInvested = new Decimal(0);
    let grandMarketValue = new Decimal(0);
    const summaries: PortfolioSyncSummary[] = [];

    for (const p of portfolios) {
      const assets = portfolioAssetsMap.get(p.id) || [];
      const { investedCapitalDec, marketValueDec } = this.calculateAssetsValuation(
        assets,
        quotesMap
      );

      const profitDec = marketValueDec.minus(investedCapitalDec);
      const profitPctDec = investedCapitalDec.gt(0)
        ? profitDec.div(investedCapitalDec).mul(100)
        : new Decimal(0);

      grandInvested = grandInvested.plus(investedCapitalDec);
      grandMarketValue = grandMarketValue.plus(marketValueDec);

      summaries.push({
        portfolioId: p.id,
        name: p.name,
        investedCapital: investedCapitalDec.toFixed(2),
        marketValue: marketValueDec.toFixed(2),
        profit: profitDec.toFixed(2),
        profitPercentage: profitPctDec.toFixed(2),
      });
    }

    return {
      syncedTickers: uniqueTickers,
      quotes: quotesMap,
      portfolios: summaries,
      totalMarketValue: grandMarketValue.toFixed(2),
      totalInvestedCapital: grandInvested.toFixed(2),
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Sincroniza as cotações de uma carteira específica.
   */
  async syncPortfolio(portfolioId: string): Promise<MarketSyncResult> {
    const portfolio = await this.portfolioRepo.getPortfolioById(portfolioId);
    if (!portfolio) {
      return {
        syncedTickers: [],
        quotes: {},
        portfolios: [],
        totalMarketValue: '0.00',
        totalInvestedCapital: '0.00',
        syncedAt: new Date().toISOString(),
      };
    }

    const assets = await this.assetRepo.getAssetsByPortfolio(portfolioId);
    const tickerSet = new Set<string>();

    for (const a of assets) {
      if (a.asset_class !== 'FIXED_INCOME' && a.ticker) {
        const norm = a.ticker.trim().toUpperCase();
        if (norm) tickerSet.add(norm);
      }
    }

    const uniqueTickers = Array.from(tickerSet);
    const quotesMap: Record<string, MarketQuote> = {};

    if (uniqueTickers.length > 0) {
      const fetched = await this.marketApi.fetchQuotes(uniqueTickers);
      for (const q of fetched) {
        quotesMap[q.ticker.toUpperCase()] = q;
      }
    }

    const { investedCapitalDec, marketValueDec } = this.calculateAssetsValuation(
      assets,
      quotesMap
    );
    const profitDec = marketValueDec.minus(investedCapitalDec);
    const profitPctDec = investedCapitalDec.gt(0)
      ? profitDec.div(investedCapitalDec).mul(100)
      : new Decimal(0);

    const summary: PortfolioSyncSummary = {
      portfolioId: portfolio.id,
      name: portfolio.name,
      investedCapital: investedCapitalDec.toFixed(2),
      marketValue: marketValueDec.toFixed(2),
      profit: profitDec.toFixed(2),
      profitPercentage: profitPctDec.toFixed(2),
    };

    return {
      syncedTickers: uniqueTickers,
      quotes: quotesMap,
      portfolios: [summary],
      totalMarketValue: summary.marketValue,
      totalInvestedCapital: summary.investedCapital,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Recalcula o patrimônio de uma carteira com base nos preços atuais do cache de mercado.
   */
  async recalculatePortfolioPatrimony(portfolioId: string): Promise<PortfolioPatrimonySummary> {
    const assets = await this.assetRepo.getAssetsByPortfolio(portfolioId);

    let totalInvested = new Decimal(0);
    let totalMarket = new Decimal(0);

    for (const a of assets) {
      const qty = new Decimal(a.quantity || 0);
      const pm = new Decimal(a.average_price || 0);
      const invested = qty.mul(pm);
      totalInvested = totalInvested.plus(invested);

      if (a.manual_price_override !== null && a.manual_price_override !== undefined && a.manual_price_override !== '') {
        totalMarket = totalMarket.plus(new Decimal(a.manual_price_override));
      } else {
        const cached = await this.marketApi.getCachedQuote(a.ticker);
        if (cached && cached.currentPrice) {
          totalMarket = totalMarket.plus(qty.mul(new Decimal(cached.currentPrice)));
        } else {
          totalMarket = totalMarket.plus(invested);
        }
      }
    }

    const profit = totalMarket.minus(totalInvested);
    const profitPct = totalInvested.gt(0)
      ? profit.div(totalInvested).mul(100)
      : new Decimal(0);

    return {
      investedCapital: totalInvested.toFixed(2),
      marketValue: totalMarket.toFixed(2),
      profit: profit.toFixed(2),
      profitPercentage: profitPct.toFixed(2),
    };
  }

  private calculateAssetsValuation(
    assets: Asset[],
    quotesMap: Record<string, MarketQuote>
  ): { investedCapitalDec: Decimal; marketValueDec: Decimal } {
    let investedCapitalDec = new Decimal(0);
    let marketValueDec = new Decimal(0);

    for (const a of assets) {
      const qty = new Decimal(a.quantity || 0);
      const pm = new Decimal(a.average_price || 0);
      const invested = qty.mul(pm);
      investedCapitalDec = investedCapitalDec.plus(invested);

      if (a.manual_price_override !== null && a.manual_price_override !== undefined && a.manual_price_override !== '') {
        marketValueDec = marketValueDec.plus(new Decimal(a.manual_price_override));
      } else {
        const norm = a.ticker.trim().toUpperCase();
        const quote = quotesMap[norm];
        if (quote && quote.currentPrice) {
          marketValueDec = marketValueDec.plus(qty.mul(new Decimal(quote.currentPrice)));
        } else {
          marketValueDec = marketValueDec.plus(invested);
        }
      }
    }

    return { investedCapitalDec, marketValueDec };
  }
}

export const marketSyncService = new MarketSyncService();
