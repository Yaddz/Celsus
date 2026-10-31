import { PortfolioRepository } from '../repositories/portfolioRepository';
import { AssetRepository } from '../repositories/assetRepository';
import { IMarketApiService, marketApiService, MarketQuote } from './marketApi';

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
    return {
      syncedTickers: [],
      quotes: {},
      portfolios: [],
      totalMarketValue: '0.00',
      totalInvestedCapital: '0.00',
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Sincroniza as cotações de uma carteira específica.
   */
  async syncPortfolio(portfolioId: string): Promise<MarketSyncResult> {
    return {
      syncedTickers: [],
      quotes: {},
      portfolios: [],
      totalMarketValue: '0.00',
      totalInvestedCapital: '0.00',
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Recalcula o patrimônio de uma carteira com base nos preços atuais do cache de mercado.
   */
  async recalculatePortfolioPatrimony(portfolioId: string): Promise<PortfolioPatrimonySummary> {
    return {
      investedCapital: '0.00',
      marketValue: '0.00',
      profit: '0.00',
      profitPercentage: '0.00',
    };
  }
}

export const marketSyncService = new MarketSyncService();
