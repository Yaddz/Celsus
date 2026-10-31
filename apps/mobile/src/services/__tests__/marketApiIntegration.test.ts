import { MarketApiService, MarketQuote } from '../marketApi';
import { marketPriceCache, historicalPricesLocal } from '../../db/schema';

describe('S7-T01: TestLocalBackendQuotesCatalogAndHistoryIntegration', () => {
  let mockFetch: jest.Mock;
  let mockCacheStore: Map<string, any>;
  let mockHistoryStore: Map<string, any>;
  let mockDb: any;
  let apiService: MarketApiService;

  beforeEach(() => {
    mockCacheStore = new Map();
    mockHistoryStore = new Map();

    mockDb = {
      select: () => ({
        from: (table: any) => ({
          where: (condition: any) => {
            // Evaluates select queries based on the requested table
            if (table === marketPriceCache) {
              const ticker = condition?._ticker;
              if (ticker && mockCacheStore.has(ticker)) {
                return [mockCacheStore.get(ticker)];
              }
              return Array.from(mockCacheStore.values());
            }
            if (table === historicalPricesLocal) {
              const key = condition?._key;
              if (key && mockHistoryStore.has(key)) {
                return [mockHistoryStore.get(key)];
              }
              return Array.from(mockHistoryStore.values());
            }
            return [];
          },
        }),
      }),
      insert: (table: any) => ({
        values: (data: any) => ({
          onConflictDoUpdate: (conflict: any) => {
            if (table === marketPriceCache) {
              mockCacheStore.set(data.ticker, { ...data });
            } else if (table === historicalPricesLocal) {
              const key = `${data.ticker}#${data.price_date}`;
              mockHistoryStore.set(key, { ...data });
            }
            return Promise.resolve();
          },
        }),
      }),
    };

    mockFetch = jest.fn();
    global.fetch = mockFetch;

    apiService = new MarketApiService('http://localhost:8080', mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Health Check Endpoint (/v1/health)', () => {
    it('should return health status and metadata when backend is online', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          cotahist_last_date: '2024-01-02',
          brapi_status: 'ok',
        }),
      });

      const health = await apiService.checkHealth();

      expect(health).not.toBeNull();
      expect(health?.status).toBe('ok');
      expect(health?.cotahist_last_date).toBe('2024-01-02');
      expect(health?.brapi_status).toBe('ok');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/health');
    });

    it('should return null as fallback when backend is unreachable or returns HTTP error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed: ECONNREFUSED'));

      const health = await apiService.checkHealth();

      expect(health).toBeNull();
    });
  });

  describe('2. Catalog Search Autocomplete (/v1/catalog/search)', () => {
    it('should search tickers and return formatted catalog items for stocks and FIIs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { ticker: 'PETR4', name: 'PETROBRAS PN', class: 'STOCK' },
            { ticker: 'PETR3', name: 'PETROBRAS ON', class: 'STOCK' },
          ],
        }),
      });

      const results = await apiService.searchCatalog('PETR', 'STOCK');

      expect(results).toHaveLength(2);
      expect(results[0].ticker).toBe('PETR4');
      expect(results[0].class).toBe('STOCK');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/catalog/search?q=PETR&class=STOCK');
    });

    it('should search catalog without class filter when omitted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ ticker: 'BTC', name: 'Bitcoin', class: 'CRYPTO' }],
        }),
      });

      const results = await apiService.searchCatalog('BTC');

      expect(results).toHaveLength(1);
      expect(results[0].ticker).toBe('BTC');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/catalog/search?q=BTC');
    });

    it('should return empty array as fallback when search fails or offline', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const results = await apiService.searchCatalog('FAIL');

      expect(results).toEqual([]);
    });
  });

  describe('3. Quotes Integration & Local Cache Persistence (/v1/quotes)', () => {
    it('should fetch quotes from API, populate local market_price_cache and return quotes array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: {
            PETR4: {
              symbol: 'PETR4',
              regularMarketPrice: 38.5,
              regularMarketChangePercent: 1.25,
            },
            HGLG11: {
              symbol: 'HGLG11',
              regularMarketPrice: 162.5,
              regularMarketChangePercent: -0.4,
            },
            BTC: {
              coin: 'BTC',
              currency: 'BRL',
              regularMarketPrice: 350000.0,
              regularMarketChangePercent: 2.5,
            },
          },
        }),
      });

      const quotes = await apiService.fetchQuotes(['PETR4', 'HGLG11', 'BTC']);

      expect(quotes).toHaveLength(3);
      const petr4 = quotes.find((q) => q.ticker === 'PETR4');
      expect(petr4?.currentPrice).toBe('38.5');
      expect(petr4?.changePercent24h).toBe(1.25);

      // Verify that market_price_cache was updated
      expect(mockCacheStore.has('PETR4')).toBe(true);
      expect(mockCacheStore.get('PETR4').current_price).toBe('38.5');
      expect(mockCacheStore.has('BTC')).toBe(true);
    });

    it('should fallback to local market_price_cache when backend is offline', async () => {
      // Pre-seed cache
      mockCacheStore.set('VALE3', {
        ticker: 'VALE3',
        asset_class: 'STOCK',
        current_price: '65.20',
        change_percent_24h: 0.85,
        updated_at: '2026-10-31T12:00:00Z',
      });

      // Network failure
      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      // Configure select to return VALE3
      mockDb.select = () => ({
        from: () => ({
          where: () => [mockCacheStore.get('VALE3')],
        }),
      });

      const quotes = await apiService.fetchQuotes(['VALE3']);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALE3');
      expect(quotes[0].currentPrice).toBe('65.20');
      expect(quotes[0].changePercent24h).toBe(0.85);
    });
  });

  describe('4. Historical Quotes Integration & Cache Persistence (/v1/history)', () => {
    it('should fetch historical price remotely, store in historical_prices_local, and return it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          history: {
            PETR4: [{ date: '2024-01-02', close: 38.5 }],
          },
        }),
      });

      const price = await apiService.getHistoricalPrice('PETR4', '2024-01-02');

      expect(price).toBe('38.5');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/history?tickers=PETR4&from=2024-01-02&to=2024-01-02'
      );

      // Verify local persistence
      expect(mockHistoryStore.has('PETR4#2024-01-02')).toBe(true);
      expect(mockHistoryStore.get('PETR4#2024-01-02').close_price).toBe('38.5');
    });

    it('should serve historical price from local database without network call when already cached', async () => {
      // Pre-populate historical cache
      mockHistoryStore.set('WEGE3#2024-01-02', {
        ticker: 'WEGE3',
        price_date: '2024-01-02',
        close_price: '36.80',
      });

      mockDb.select = () => ({
        from: () => ({
          where: () => [mockHistoryStore.get('WEGE3#2024-01-02')],
        }),
      });

      const price = await apiService.getHistoricalPrice('WEGE3', '2024-01-02');

      expect(price).toBe('36.80');
      // Must not have called remote API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when price is not found locally and remote API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server unavailable'));

      const price = await apiService.getHistoricalPrice('UNKNOWN', '2024-01-02');

      expect(price).toBeNull();
    });
  });
});
