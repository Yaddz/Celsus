import { MarketApiService, MarketQuote } from '../marketApi';
import { marketPriceCache, historicalPricesLocal } from '../../db/schema';
import { validateTickerForAssetClass } from '../../domain/finance/assetCatalogValidation';
import type { SandboxAssetClass } from '../../domain/finance/types';

function createMockDb() {
  const cacheStore = new Map<string, any>();
  const historyStore = new Map<string, any>();

  const db = {
    select: () => ({
      from: (table: any) => ({
        where: () => {
          if (table === marketPriceCache) {
            return Array.from(cacheStore.values());
          }
          if (table === historicalPricesLocal) {
            return Array.from(historyStore.values());
          }
          return [];
        },
      }),
    }),
    insert: (table: any) => ({
      values: (data: any) => ({
        onConflictDoUpdate: () => {
          if (table === marketPriceCache) {
            cacheStore.set(data.ticker, { ...data });
          } else if (table === historicalPricesLocal) {
            const key = `${data.ticker}#${data.price_date}`;
            historyStore.set(key, { ...data });
          }
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db, cacheStore, historyStore };
}

describe('Sprint 107 — MarketApi US_STOCK, FX & Currency (S107-T01..T05)', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('S107-T01: getHistoricalPrice com currency USD grava e lê do cache com a moeda', async () => {
    const { db, historyStore } = createMockDb();
    const api = new MarketApiService('http://localhost:8080', db, null);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        history: {
          NVDA: [{ date: '2024-01-02', close: 49.5, currency: 'USD' }],
        },
      }),
    });

    const price = await api.getHistoricalPrice('NVDA', '2024-01-02', { assetClass: 'US_STOCK' });
    expect(price).toBe('49.5');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/history?tickers=NVDA&from=2024-01-02&to=2024-01-02&class=US_STOCK'
    );

    const saved = historyStore.get('NVDA#2024-01-02');
    expect(saved).toBeDefined();
    expect(saved.close_price).toBe('49.5');
    expect(saved.currency).toBe('USD');

    // Leitura subsequente deve vir do cache local com currency USD sem chamar fetch
    const cachedDetail = await api.getHistoricalPriceWithCurrency('NVDA', '2024-01-02', {
      assetClass: 'US_STOCK',
    });
    expect(cachedDetail).toEqual({ closePrice: '49.5', currency: 'USD' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('S107-T02: fetchQuotes para USDBRL retorna cotação com currency BRL', async () => {
    const { db } = createMockDb();
    const api = new MarketApiService('http://localhost:8080', db, null);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quotes: {
          USDBRL: {
            ticker: 'USDBRL',
            price: 5.75,
            change_24h: 0.88,
            currency: 'BRL',
            updated_at: '2026-11-27T00:00:00Z',
            source: 'YAHOO',
          },
        },
      }),
    });

    const quotes: MarketQuote[] = await api.fetchQuotes(['USDBRL']);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].ticker).toBe('USDBRL');
    expect(quotes[0].currentPrice).toBe('5.75');
    expect(quotes[0].currency).toBe('BRL');
  });

  test('S107-T03: getHistoricalPrice sem dado retorna null (nunca 0)', async () => {
    const { db } = createMockDb();
    const api = new MarketApiService('http://localhost:8080', db, null);

    // 1. HTTP retorna vazio
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: { INVALIDUS: [] } }),
    });
    // Fallback direto Yahoo também falha
    mockFetch.mockResolvedValueOnce({ ok: false });

    const resEmpty = await api.getHistoricalPrice('INVALIDUS', '2024-01-02', {
      assetClass: 'US_STOCK',
    });
    expect(resEmpty).toBeNull();

    // 2. Bridge retorna close_price: 0 => deve retornar null, nunca '0'
    const mockBridge: any = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      getHistoricalPrice: jest.fn(),
      getHistoricalPriceWithClass: jest.fn().mockResolvedValueOnce(
        JSON.stringify({ ticker: 'NVDA', date: '2024-01-02', close_price: 0, currency: 'USD' })
      ),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
    };
    const bridgeApi = new MarketApiService('http://localhost:8080', db, mockBridge);
    const resZero = await bridgeApi.getHistoricalPrice('NVDA', '2024-01-02', {
      assetClass: 'US_STOCK',
    });
    expect(resZero).toBeNull();
  });

  test('S107-T04: transporte HTTP e ponte (mock) devolvem o mesmo formato com currency', async () => {
    const { db: dbHttp } = createMockDb();
    const { db: dbBridge } = createMockDb();

    const mockBridge: any = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      fetchQuotesWithClass: jest.fn().mockResolvedValue(
        JSON.stringify({
          quotes: [
            {
              ticker: 'NVDA',
              asset_class: 'US_STOCK',
              current_price: 135.4,
              change_percent_24h: 2.58,
              currency: 'USD',
              updated_at: '2026-11-27T00:00:00Z',
              is_stale: false,
            },
          ],
        })
      ),
      getHistoricalPrice: jest.fn(),
      getHistoricalPriceWithClass: jest.fn().mockResolvedValue(
        JSON.stringify({
          ticker: 'NVDA',
          date: '2024-01-02',
          close_price: 49.5,
          currency: 'USD',
        })
      ),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
      getPriceHistory: jest.fn(),
      getPriceHistoryWithClass: jest.fn().mockResolvedValue(
        JSON.stringify({
          ticker: 'NVDA',
          range: '1y',
          currency: 'USD',
          history: [{ date: '2024-01-02', close: 49.5, currency: 'USD' }],
        })
      ),
      getDividends: jest.fn(),
      getDividendsWithClass: jest.fn().mockResolvedValue(
        JSON.stringify({
          ticker: 'NVDA',
          currency: 'USD',
          dividends: [{ date: '2024-01-04', type: 'DIVIDEND', amount: 0.04, currency: 'USD' }],
        })
      ),
    };

    const bridgeApi = new MarketApiService('http://localhost:8080', dbBridge, mockBridge);
    const httpApi = new MarketApiService('http://localhost:8080', dbHttp, null);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: {
            NVDA: {
              ticker: 'NVDA',
              asset_class: 'US_STOCK',
              price: 135.4,
              change_24h: 2.58,
              currency: 'USD',
              updated_at: '2026-11-27T00:00:00Z',
              source: 'YAHOO',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ticker: 'NVDA',
          range: '1y',
          currency: 'USD',
          history: [{ date: '2024-01-02', close: 49.5, currency: 'USD' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ticker: 'NVDA',
          currency: 'USD',
          dividends: [{ date: '2024-01-04', type: 'DIVIDEND', amount: 0.04, currency: 'USD' }],
        }),
      });

    const bridgeQuotes = await bridgeApi.fetchQuotes(['NVDA'], { assetClass: 'US_STOCK' });
    const httpQuotes = await httpApi.fetchQuotes(['NVDA'], { assetClass: 'US_STOCK' });
    expect(bridgeQuotes).toEqual(httpQuotes);

    const bridgeHist = await bridgeApi.getPriceHistory('NVDA', '1y', { assetClass: 'US_STOCK' });
    const httpHist = await httpApi.getPriceHistory('NVDA', '1y', { assetClass: 'US_STOCK' });
    expect(bridgeHist).toEqual(httpHist);

    const bridgeDivs = await bridgeApi.getDividends('NVDA', { assetClass: 'US_STOCK' });
    const httpDivs = await httpApi.getDividends('NVDA', { assetClass: 'US_STOCK' });
    expect(bridgeDivs).toEqual(httpDivs);
  });

  test('S107-T05: US_STOCK existe apenas no tipo SandboxAssetClass e não é permitido em carteira real', () => {
    const sandboxClass: SandboxAssetClass = 'US_STOCK';
    expect(sandboxClass).toBe('US_STOCK');

    const validation = validateTickerForAssetClass('NVDA', sandboxClass as any);
    expect(validation.valid).toBe(false);
  });
});
