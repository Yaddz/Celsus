import {
  MarketSyncService,
  MarketSyncResult,
  PortfolioSyncSummary,
} from '../marketSyncService';
import { IMarketApiService, MarketQuote } from '../marketApi';
import { PortfolioRepository } from '../../repositories/portfolioRepository';
import { AssetRepository } from '../../repositories/assetRepository';
import { Portfolio, Asset } from '../../db/schema';

describe('S7-T02: TestBatchSyncPortfolioTickersAndRecalculatePatrimony', () => {
  let mockPortfolioRepo: jest.Mocked<PortfolioRepository>;
  let mockAssetRepo: jest.Mocked<AssetRepository>;
  let mockMarketApi: jest.Mocked<IMarketApiService>;
  let service: MarketSyncService;

  const mockPortfolios: Portfolio[] = [
    {
      id: 'port-1',
      name: 'Carteira Principal',
      description: 'Ações e FIIs',
      docket_code: 'REV-CART-001',
      is_archived: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'port-2',
      name: 'Reserva & Cripto',
      description: 'Renda Fixa e Criptoativos',
      docket_code: 'REV-CART-002',
      is_archived: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const port1Assets: Asset[] = [
    {
      id: 'asset-1',
      portfolio_id: 'port-1',
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      target_percentage_in_class: 50.0,
      quantity: '100',
      average_price: '30.00', // Invested = 3,000.00
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'asset-2',
      portfolio_id: 'port-1',
      asset_class: 'FII',
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      target_percentage_in_class: 50.0,
      quantity: '20',
      average_price: '150.00', // Invested = 3,000.00
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  const port2Assets: Asset[] = [
    {
      id: 'asset-3',
      portfolio_id: 'port-2',
      asset_class: 'CRYPTO',
      ticker: 'BTC',
      name: 'Bitcoin',
      target_percentage_in_class: 50.0,
      quantity: '0.02',
      average_price: '300000.00', // Invested = 6,000.00
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'asset-4',
      portfolio_id: 'port-2',
      asset_class: 'FIXED_INCOME',
      ticker: 'CDB-DI',
      name: 'CDB 100% CDI',
      target_percentage_in_class: 50.0,
      quantity: '1',
      average_price: '5000.00',
      manual_price_override: '5250.00', // Invested = 5,000.00, MarketValue = 5,250.00
      rf_indexer: 'CDI',
      rf_rate: 100.0,
      rf_maturity_date: '2027-01-01',
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    mockPortfolioRepo = {
      listPortfolios: jest.fn().mockResolvedValue(mockPortfolios),
      getAllPortfolios: jest.fn().mockResolvedValue(mockPortfolios),
      getPortfolioById: jest.fn().mockImplementation((id: string) => {
        const found = mockPortfolios.find((p) => p.id === id);
        return Promise.resolve(found || null);
      }),
      createPortfolio: jest.fn(),
      updatePortfolio: jest.fn(),
      deletePortfolio: jest.fn(),
    } as any;

    mockAssetRepo = {
      getAssetsByPortfolio: jest.fn().mockImplementation((id: string) => {
        if (id === 'port-1') return Promise.resolve(port1Assets);
        if (id === 'port-2') return Promise.resolve(port2Assets);
        return Promise.resolve([]);
      }),
      createAsset: jest.fn(),
      getAssetsByClass: jest.fn(),
      getAssetById: jest.fn(),
      updateAsset: jest.fn(),
      updateAssetTargetInClass: jest.fn(),
      deleteAsset: jest.fn(),
    } as any;

    mockMarketApi = {
      checkHealth: jest.fn().mockResolvedValue({ status: 'ok' }),
      getHistoricalPrice: jest.fn(),
      fetchQuotes: jest.fn().mockImplementation((tickers: string[]) => {
        const quotes: MarketQuote[] = [];
        for (const t of tickers) {
          if (t === 'PETR4') {
            quotes.push({
              ticker: 'PETR4',
              assetClass: 'STOCK',
              currentPrice: '40.00', // 100 * 40 = 4,000.00
              changePercent24h: 2.5,
              updatedAt: '2026-10-31T18:00:00Z',
            });
          } else if (t === 'HGLG11') {
            quotes.push({
              ticker: 'HGLG11',
              assetClass: 'FII',
              currentPrice: '160.00', // 20 * 160 = 3,200.00
              changePercent24h: 0.5,
              updatedAt: '2026-10-31T18:00:00Z',
            });
          } else if (t === 'BTC') {
            quotes.push({
              ticker: 'BTC',
              assetClass: 'CRYPTO',
              currentPrice: '350000.00', // 0.02 * 350,000 = 7,000.00
              changePercent24h: 4.0,
              updatedAt: '2026-10-31T18:00:00Z',
            });
          }
        }
        return Promise.resolve(quotes);
      }),
      getCachedQuote: jest.fn(),
      saveHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
    };

    service = new MarketSyncService(mockPortfolioRepo, mockAssetRepo, mockMarketApi);
  });

  describe('1. Batch Sync of All Portfolio Tickers', () => {
    it('should collect unique tickers across all active portfolios excluding fixed income', async () => {
      const result = await service.syncAllPortfolioTickers();

      // Must have requested only market-traded tickers in a deduplicated batch
      expect(mockMarketApi.fetchQuotes).toHaveBeenCalledTimes(1);
      const requestedTickers = mockMarketApi.fetchQuotes.mock.calls[0][0];
      expect(requestedTickers.sort()).toEqual(['BTC', 'HGLG11', 'PETR4']);
      expect(requestedTickers).not.toContain('CDB-DI');
      expect(result.syncedTickers.sort()).toEqual(['BTC', 'HGLG11', 'PETR4']);
    });

    it('should recalculate individual portfolio values and overall consolidated patrimony', async () => {
      const result = await service.syncAllPortfolioTickers();

      // Portfolio 1:
      // PETR4: Q=100 * PM=30.00 = 3,000.00 invested | Q=100 * P=40.00 = 4,000.00 market
      // HGLG11: Q=20 * PM=150.00 = 3,000.00 invested | Q=20 * P=160.00 = 3,200.00 market
      // Total Port 1: Invested = 6,000.00, MarketValue = 7,200.00, Profit = +1,200.00 (+20.00%)
      const port1Summary = result.portfolios.find((p) => p.portfolioId === 'port-1');
      expect(port1Summary).toBeDefined();
      expect(port1Summary?.investedCapital).toBe('6000.00');
      expect(port1Summary?.marketValue).toBe('7200.00');
      expect(port1Summary?.profit).toBe('1200.00');
      expect(port1Summary?.profitPercentage).toBe('20.00');

      // Portfolio 2:
      // BTC: Q=0.02 * PM=300,000.00 = 6,000.00 invested | Q=0.02 * P=350,000.00 = 7,000.00 market
      // CDB-DI: Invested = 5,000.00 | Manual override = 5,250.00 market
      // Total Port 2: Invested = 11,000.00, MarketValue = 12,250.00, Profit = +1,250.00 (+11.36%)
      const port2Summary = result.portfolios.find((p) => p.portfolioId === 'port-2');
      expect(port2Summary).toBeDefined();
      expect(port2Summary?.investedCapital).toBe('11000.00');
      expect(port2Summary?.marketValue).toBe('12250.00');
      expect(port2Summary?.profit).toBe('1250.00');

      // Consolidated Total:
      // Total Invested = 6,000 + 11,000 = 17,000.00
      // Total Market Value = 7,200 + 12,250 = 19,450.00
      expect(result.totalInvestedCapital).toBe('17000.00');
      expect(result.totalMarketValue).toBe('19450.00');
      expect(result.syncedAt).toBeDefined();
    });

    it('should handle duplicate tickers across multiple portfolios without repeating quote requests', async () => {
      // Add PETR4 to Portfolio 2 as well
      mockAssetRepo.getAssetsByPortfolio.mockImplementation((id: string) => {
        if (id === 'port-1') return Promise.resolve(port1Assets);
        if (id === 'port-2') {
          return Promise.resolve([
            ...port2Assets,
            {
              id: 'asset-5',
              portfolio_id: 'port-2',
              asset_class: 'STOCK',
              ticker: 'petr4', // lowercase to test normalization
              name: 'Petrobras PN',
              target_percentage_in_class: 10.0,
              quantity: '50',
              average_price: '32.00',
              manual_price_override: null,
              rf_indexer: null,
              rf_rate: null,
              rf_maturity_date: null,
              rf_is_tax_exempt: 0,
              source: 'MANUAL',
              external_id: null,
              institution_id: null,
              last_synced_at: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.syncAllPortfolioTickers();

      const requestedTickers = mockMarketApi.fetchQuotes.mock.calls[0][0];
      const petr4Occurrences = requestedTickers.filter((t: string) => t === 'PETR4').length;
      expect(petr4Occurrences).toBe(1);
    });
  });

  describe('2. Single Portfolio Sync', () => {
    it('should sync only tickers belonging to the requested portfolio', async () => {
      const result = await service.syncPortfolio('port-1');

      expect(mockMarketApi.fetchQuotes).toHaveBeenCalledWith(['PETR4', 'HGLG11']);
      expect(result.portfolios).toHaveLength(1);
      expect(result.portfolios[0].portfolioId).toBe('port-1');
      expect(result.totalMarketValue).toBe('7200.00');
      expect(result.totalInvestedCapital).toBe('6000.00');
    });
  });

  describe('3. Recalculate Portfolio Patrimony from Local Cache', () => {
    it('should compute updated patrimony for a single portfolio using cached quotes', async () => {
      mockMarketApi.getCachedQuote.mockImplementation((ticker: string) => {
        if (ticker === 'PETR4') {
          return Promise.resolve({
            ticker: 'PETR4',
            assetClass: 'STOCK',
            currentPrice: '40.00',
            changePercent24h: 2.5,
            updatedAt: '2026-10-31T18:00:00Z',
          });
        }
        if (ticker === 'HGLG11') {
          return Promise.resolve({
            ticker: 'HGLG11',
            assetClass: 'FII',
            currentPrice: '160.00',
            changePercent24h: 0.5,
            updatedAt: '2026-10-31T18:00:00Z',
          });
        }
        return Promise.resolve(null);
      });

      const summary = await service.recalculatePortfolioPatrimony('port-1');

      expect(summary.investedCapital).toBe('6000.00');
      expect(summary.marketValue).toBe('7200.00');
      expect(summary.profit).toBe('1200.00');
      expect(summary.profitPercentage).toBe('20.00');
    });

    it('should fallback to average_price if market quote is unavailable in cache', async () => {
      mockMarketApi.getCachedQuote.mockResolvedValue(null);

      const summary = await service.recalculatePortfolioPatrimony('port-1');

      // If quotes unavailable, marketValue falls back to investedCapital (0.00 profit)
      expect(summary.investedCapital).toBe('6000.00');
      expect(summary.marketValue).toBe('6000.00');
      expect(summary.profit).toBe('0.00');
      expect(summary.profitPercentage).toBe('0.00');
    });
  });

  describe('4. Empty and Edge States', () => {
    it('should return empty sync result when no portfolios exist', async () => {
      mockPortfolioRepo.listPortfolios.mockResolvedValueOnce([]);

      const result = await service.syncAllPortfolioTickers();

      expect(result.syncedTickers).toEqual([]);
      expect(result.portfolios).toEqual([]);
      expect(result.totalInvestedCapital).toBe('0.00');
      expect(result.totalMarketValue).toBe('0.00');
      expect(mockMarketApi.fetchQuotes).not.toHaveBeenCalled();
    });
  });
});
