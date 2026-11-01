import { MarketApiService, MarketQuote } from '../marketApi';
import { INativeMarketBridge } from '../../../modules/celsus-market';
import { marketPriceCache, historicalPricesLocal } from '../../db/schema';

describe('Sprint 23: Native Market Bridge and 15-Minute TTL Cache Specification', () => {
  let mockFetch: jest.Mock;
  let mockNativeBridge: jest.Mocked<INativeMarketBridge>;
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
            if (table === marketPriceCache) {
              let targetTicker: string | undefined = condition?._ticker;
              if (!targetTicker && condition?.queryChunks) {
                for (const chunk of condition.queryChunks) {
                  if (typeof chunk?.value === 'string') {
                    targetTicker = chunk.value;
                    break;
                  }
                }
              }
              if (targetTicker) {
                const found = mockCacheStore.get(targetTicker.toUpperCase());
                return found ? [found] : [];
              }
              return Array.from(mockCacheStore.values());
            }
            if (table === historicalPricesLocal) {
              let targetKey: string | undefined = condition?._key;
              if (!targetKey && condition?.queryChunks) {
                const strings = condition.queryChunks
                  .filter((c: any) => typeof c?.value === 'string')
                  .map((c: any) => c.value);
                if (strings.length >= 2) {
                  targetKey = `${strings[0].toUpperCase()}#${strings[1]}`;
                }
              }
              if (targetKey) {
                const found = mockHistoryStore.get(targetKey);
                return found ? [found] : [];
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
              mockCacheStore.set(data.ticker.toUpperCase(), { ...data });
            } else if (table === historicalPricesLocal) {
              const key = `${data.ticker.toUpperCase()}#${data.price_date}`;
              mockHistoryStore.set(key, { ...data });
            }
            return Promise.resolve();
          },
        }),
      }),
    };

    mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockNativeBridge = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      getHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
    };

    apiService = new MarketApiService('http://localhost:8080', mockDb, mockNativeBridge);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('S23-T01: Zero HTTP / Direct Native Bridge Invocation', () => {
    it('should delegate fetchQuotes to nativeBridge without calling global.fetch', async () => {
      const nowIso = new Date().toISOString();
      mockNativeBridge.fetchQuotes.mockResolvedValueOnce(
        JSON.stringify({
          quotes: [
            {
              ticker: 'PETR4',
              asset_class: 'STOCK',
              current_price: 38.5,
              change_percent_24h: 1.31,
              updated_at: nowIso,
              is_stale: false,
            },
            {
              ticker: 'VALE3',
              asset_class: 'STOCK',
              current_price: 65.2,
              change_percent_24h: -0.45,
              updated_at: nowIso,
              is_stale: false,
            },
          ],
        })
      );

      const quotes = await apiService.fetchQuotes(['PETR4', 'VALE3'], { forceRefresh: true });

      expect(mockNativeBridge.fetchQuotes).toHaveBeenCalledWith('PETR4,VALE3', true);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(quotes).toHaveLength(2);

      const petr4 = quotes.find((q) => q.ticker === 'PETR4');
      expect(petr4?.currentPrice).toBe('38.5');
      expect(petr4?.changePercent24h).toBe(1.31);
      expect(petr4?.isStale).toBe(false);

      const vale3 = quotes.find((q) => q.ticker === 'VALE3');
      expect(vale3?.currentPrice).toBe('65.2');
      expect(vale3?.changePercent24h).toBe(-0.45);
      expect(vale3?.isStale).toBe(false);

      // Verify that market_price_cache was updated
      expect(mockCacheStore.has('PETR4')).toBe(true);
      expect(mockCacheStore.has('VALE3')).toBe(true);
    });

    it('should delegate getHistoricalPrice to nativeBridge when not in local COTAHIST and not call global.fetch', async () => {
      mockNativeBridge.getHistoricalPrice.mockResolvedValueOnce(
        JSON.stringify({
          ticker: 'VALE3',
          date: '2026-05-15',
          close_price: 65.5,
          adj_close: 62.0,
          source: 'YAHOO',
        })
      );

      const price = await apiService.getHistoricalPrice('VALE3', '2026-05-15');

      expect(mockNativeBridge.getHistoricalPrice).toHaveBeenCalledWith('VALE3', '2026-05-15');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(price).toBe('65.5');
      expect(mockHistoryStore.has('VALE3#2026-05-15')).toBe(true);
    });

    it('should delegate searchCatalog to nativeBridge and return formatted results without global.fetch', async () => {
      mockNativeBridge.searchCatalog.mockResolvedValueOnce(
        JSON.stringify({
          results: [
            { ticker: 'PETR4', name: 'PETROBRAS PN', class: 'STOCK' },
            { ticker: 'PETR3', name: 'PETROBRAS ON', class: 'STOCK' },
          ],
        })
      );

      const results = await apiService.searchCatalog('PETR', 'STOCK');

      expect(mockNativeBridge.searchCatalog).toHaveBeenCalledWith('PETR', 'STOCK');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].ticker).toBe('PETR4');
    });

    it('should delegate fetchMacroRates to nativeBridge and return parsed rates without global.fetch', async () => {
      mockNativeBridge.fetchMacroRates.mockResolvedValueOnce(
        JSON.stringify([
          { date: '2026-01-02', cdi: 0.0435, selic: 0.0435, ipca: 0.003 },
        ])
      );

      const rates = await apiService.fetchMacroRates('2026-01-01');

      expect(mockNativeBridge.fetchMacroRates).toHaveBeenCalledWith('2026-01-01');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(rates).toHaveLength(1);
      expect(rates[0].cdi).toBe(0.0435);
    });

    it('should delegate checkHealth to nativeBridge and parse engine health without global.fetch', async () => {
      mockNativeBridge.checkHealth.mockResolvedValueOnce(
        JSON.stringify({
          status: 'ok',
          cotahist_last_date: '2026-01-02',
          provider: 'YAHOO',
        })
      );

      const health = await apiService.checkHealth();

      expect(mockNativeBridge.checkHealth).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(health).not.toBeNull();
      expect(health?.status).toBe('ok');
      expect(health?.provider).toBe('YAHOO');
    });
  });

  describe('S23-T02: 15-Minute TTL Cache and Force Refresh Specification', () => {
    it('should return quotes from SQLite cache with isStale: false if updated within 15 minutes without calling nativeBridge', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      mockCacheStore.set('PETR4', {
        ticker: 'PETR4',
        asset_class: 'STOCK',
        current_price: '38.50',
        change_percent_24h: 1.25,
        updated_at: fiveMinutesAgo,
      });

      const quotes = await apiService.fetchQuotes(['PETR4']);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('PETR4');
      expect(quotes[0].currentPrice).toBe('38.50');
      expect(quotes[0].isStale).toBe(false);
      expect(mockNativeBridge.fetchQuotes).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should refresh quote from nativeBridge if cached quote is older than 15 minutes (TTL expired)', async () => {
      const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      const freshTimestamp = new Date().toISOString();

      mockCacheStore.set('PETR4', {
        ticker: 'PETR4',
        asset_class: 'STOCK',
        current_price: '38.00',
        change_percent_24h: 0.0,
        updated_at: sixteenMinutesAgo,
      });

      mockNativeBridge.fetchQuotes.mockResolvedValueOnce(
        JSON.stringify({
          quotes: [
            {
              ticker: 'PETR4',
              asset_class: 'STOCK',
              current_price: 39.0,
              change_percent_24h: 2.63,
              updated_at: freshTimestamp,
              is_stale: false,
            },
          ],
        })
      );

      const quotes = await apiService.fetchQuotes(['PETR4']);

      expect(mockNativeBridge.fetchQuotes).toHaveBeenCalledWith('PETR4', false);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].currentPrice).toBe('39');
      expect(quotes[0].isStale).toBe(false);
      expect(quotes[0].updatedAt).toBe(freshTimestamp);
    });

    it('should bypass valid cache and query nativeBridge when forceRefresh: true is set', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const freshTimestamp = new Date().toISOString();

      mockCacheStore.set('PETR4', {
        ticker: 'PETR4',
        asset_class: 'STOCK',
        current_price: '38.50',
        change_percent_24h: 1.25,
        updated_at: twoMinutesAgo,
      });

      mockNativeBridge.fetchQuotes.mockResolvedValueOnce(
        JSON.stringify({
          quotes: [
            {
              ticker: 'PETR4',
              asset_class: 'STOCK',
              current_price: 39.5,
              change_percent_24h: 3.94,
              updated_at: freshTimestamp,
              is_stale: false,
            },
          ],
        })
      );

      const quotes = await apiService.fetchQuotes(['PETR4'], { forceRefresh: true });

      expect(mockNativeBridge.fetchQuotes).toHaveBeenCalledWith('PETR4', true);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].currentPrice).toBe('39.5');
      expect(quotes[0].isStale).toBe(false);
    });
  });

  describe('S23-T03: Stale Offline Fallback & Suffix Sanitization (.SA)', () => {
    it('should return stale cached quote marked with isStale: true and original updatedAt when native bridge fails', async () => {
      const cachedDate = '2026-10-31T12:00:00.000Z';
      mockCacheStore.set('VALE3', {
        ticker: 'VALE3',
        asset_class: 'STOCK',
        current_price: '65.20',
        change_percent_24h: 0.85,
        updated_at: cachedDate,
      });

      // Simulates bridge / network outage
      mockNativeBridge.fetchQuotes.mockRejectedValueOnce(new Error('Native engine network error: ECONNREFUSED'));

      const quotes = await apiService.fetchQuotes(['VALE3'], { forceRefresh: true });

      expect(quotes).toHaveLength(1);
      expect(quotes[0].ticker).toBe('VALE3');
      expect(quotes[0].currentPrice).toBe('65.20');
      expect(quotes[0].isStale).toBe(true);
      expect(quotes[0].updatedAt).toBe(cachedDate);
    });

    it('should sanitize ticker by stripping any .SA suffix returned by Yahoo/Bridge', async () => {
      const nowIso = new Date().toISOString();
      mockNativeBridge.fetchQuotes.mockResolvedValueOnce(
        JSON.stringify({
          quotes: [
            {
              ticker: 'PETR4.SA',
              asset_class: 'STOCK',
              current_price: 38.5,
              change_percent_24h: 1.31,
              updated_at: nowIso,
              is_stale: false,
            },
            {
              ticker: 'VALE3.SA',
              asset_class: 'STOCK',
              current_price: 65.2,
              change_percent_24h: -0.45,
              updated_at: nowIso,
              is_stale: false,
            },
          ],
        })
      );

      const quotes = await apiService.fetchQuotes(['PETR4', 'VALE3'], { forceRefresh: true });

      expect(quotes).toHaveLength(2);
      for (const quote of quotes) {
        expect(quote.ticker.includes('.SA')).toBe(false);
      }
      expect(quotes[0].ticker).toBe('PETR4');
      expect(quotes[1].ticker).toBe('VALE3');
    });
  });
});
