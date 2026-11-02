import Decimal from 'decimal.js';
import { PortfolioRepository } from '../repositories/portfolioRepository';
import { AssetRepository } from '../repositories/assetRepository';
import { TransactionRepository, transactionRepository } from '../repositories/transactionRepository';
import { IMarketApiService, marketApiService, MarketQuote } from './marketApi';
import { Asset } from '../db/schema';
import { reconcileCorporateEvents, ReconciledEvent } from '../domain/finance/corporateEvents';

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
    protected marketApi: IMarketApiService = marketApiService,
    protected transactionRepo: TransactionRepository = transactionRepository
  ) {}

  /**
   * S24: Sincroniza e reconcilia eventos corporativos de Split e Inplit para os ativos das carteiras.
   * Consome marketApi.getCorporateEvents e registra transações idempotentes via external_id.
   */
  async syncCorporateEvents(
    portfolioId?: string,
    fromDate = '2000-01-01'
  ): Promise<ReconciledEvent[]> {
    let portfoliosToSync: { id: string }[] = [];
    if (portfolioId) {
      const p = await this.portfolioRepo.getPortfolioById(portfolioId);
      if (p) portfoliosToSync.push(p);
    } else {
      const all = await this.portfolioRepo.listPortfolios(false);
      portfoliosToSync = all || [];
    }

    if (portfoliosToSync.length === 0) {
      return [];
    }

    const allAppliedEvents: ReconciledEvent[] = [];

    for (const portfolio of portfoliosToSync) {
      const assets = await this.assetRepo.getAssetsByPortfolio(portfolio.id);
      const stockAssets = assets.filter(
        (a) => a.ticker && a.asset_class !== 'FIXED_INCOME'
      );

      if (stockAssets.length === 0) continue;

      const tickers = Array.from(
        new Set(stockAssets.map((a) => a.ticker.trim().toUpperCase()))
      );

      if (!this.marketApi.getCorporateEvents) continue;

      let events: any[] = [];
      try {
        events = await this.marketApi.getCorporateEvents(tickers, fromDate);
      } catch (err) {
        events = [];
      }

      if (!events || events.length === 0) continue;

      for (const asset of stockAssets) {
        const normTicker = asset.ticker.trim().toUpperCase();
        const assetEvents = events.filter(
          (e) => (e.ticker || '').trim().toUpperCase() === normTicker
        );

        if (assetEvents.length === 0) continue;

        let assetTxs: any[] = [];
        try {
          assetTxs = await this.transactionRepo.getTransactionsByAsset(asset.id);
        } catch (err) {
          assetTxs = [];
        }

        const existingExternalIds = assetTxs
          .map((tx) => tx.external_id)
          .filter(Boolean) as string[];

        const reconResult = reconcileCorporateEvents({
          ticker: normTicker,
          assetId: asset.id,
          portfolioId: portfolio.id,
          currentQuantity: asset.quantity,
          currentAveragePrice: asset.average_price,
          events: assetEvents,
          existingTransactionExternalIds: existingExternalIds,
        });

        if (reconResult.appliedEvents.length > 0) {
          for (const applied of reconResult.appliedEvents) {
            try {
              await this.transactionRepo.createTransaction({
                portfolio_id: portfolio.id,
                asset_id: asset.id,
                type: applied.type,
                trade_date: applied.eventDate,
                quantity: applied.newQuantity,
                unit_price: applied.newAveragePrice,
                total_amount: new Decimal(applied.newQuantity)
                  .mul(new Decimal(applied.newAveragePrice))
                  .toFixed(2),
                notes: `Evento corporativo: ${applied.type} ${applied.splitRatio.numerator}:${applied.splitRatio.denominator}`,
                source: 'YAHOO',
                external_id: applied.externalId,
              });
            } catch (err) {
              // Ignore insert error if unique constraint
            }
          }

          await this.assetRepo.updateAsset(asset.id, {
            quantity: reconResult.finalQuantity,
            average_price: reconResult.finalAveragePrice,
          });

          allAppliedEvents.push(...reconResult.appliedEvents);
        }
      }
    }

    return allAppliedEvents;
  }

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
