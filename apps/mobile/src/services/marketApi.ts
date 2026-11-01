import { getDatabase } from '../db/client';
import { marketPriceCache, historicalPricesLocal, MarketPriceCache, HistoricalPriceLocal } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { CelsusMarketModule, INativeMarketBridge } from '../../modules/celsus-market';

export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

export function cleanTicker(ticker: string): string {
  if (!ticker) return '';
  return ticker.replace(/\.SA$/i, '').trim().toUpperCase();
}

export interface MarketQuote {
  ticker: string;
  assetClass: string;
  currentPrice: string;
  changePercent24h: number;
  updatedAt: string;
  isStale?: boolean;
  source?: string;
}

export interface HistoricalPriceData {
  ticker: string;
  tradeDate: string; // YYYY-MM-DD
  closePrice: string;
}

export interface MacroRateData {
  date: string;
  cdi?: number;
  selic?: number;
  ipca?: number;
}

export interface HealthStatus {
  status: string;
  cotahist_last_date?: string;
  brapi_status?: string;
  provider?: string;
}

export interface FetchQuotesOptions {
  forceRefresh?: boolean;
}

export interface IMarketApiService {
  checkHealth(): Promise<HealthStatus | null>;
  getHistoricalPrice(ticker: string, date: string): Promise<string | null>;
  fetchQuotes(tickers: string[], options?: FetchQuotesOptions): Promise<MarketQuote[]>;
  getCachedQuote(ticker: string): Promise<MarketQuote | null>;
  saveHistoricalPrice(ticker: string, date: string, closePrice: string): Promise<void>;
  searchCatalog(query: string, assetClass?: string): Promise<any[]>;
  fetchMacroRates(from: string): Promise<MacroRateData[]>;
  getCorporateEvents?(tickers: string[], fromDate: string): Promise<any[]>;
  ingestCotahistZip?(zipPath: string, allowedTickers?: string[]): Promise<any>;
}

export class MarketApiService implements IMarketApiService {
  private apiBaseUrl: string;
  private customDb?: any;
  protected nativeBridge?: INativeMarketBridge | null;

  constructor(
    apiBaseUrlOrBridge: string | INativeMarketBridge | null = 'http://localhost:8080',
    db?: any,
    nativeBridge?: INativeMarketBridge | null
  ) {
    if (typeof apiBaseUrlOrBridge === 'string') {
      this.apiBaseUrl = apiBaseUrlOrBridge;
      this.customDb = db;
      this.nativeBridge = nativeBridge !== undefined ? nativeBridge : CelsusMarketModule;
    } else {
      this.nativeBridge = apiBaseUrlOrBridge !== undefined ? apiBaseUrlOrBridge : CelsusMarketModule;
      this.customDb = db;
      this.apiBaseUrl = 'http://localhost:8080';
    }
  }

  protected get db() {
    return this.customDb || getDatabase();
  }

  /**
   * Verifica a conectividade/saúde com o motor embarcado Go ou backend HTTP (/v1/health).
   */
  async checkHealth(): Promise<HealthStatus | null> {
    if (this.nativeBridge) {
      try {
        const jsonStr = await this.nativeBridge.checkHealth();
        if (jsonStr) {
          const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          return {
            status: data.status || 'ok',
            cotahist_last_date: data.cotahist_last_date,
            brapi_status: data.brapi_status,
            provider: data.provider || 'YAHOO',
          };
        }
      } catch {
        return null;
      }
    }

    try {
      const res = await fetch(`${this.apiBaseUrl}/v1/health`);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Falha de rede ou servidor offline
    }
    return null;
  }

  /**
   * Busca o preço histórico de fechamento de um ticker em uma data específica.
   * Consulta primeiro a base local COTAHIST (historical_prices_local).
   * Se não encontrar localmente, consulta a bridge nativa Go ou o backend Go (/v1/history) e efetua o cache local.
   */
  async getHistoricalPrice(ticker: string, date: string): Promise<string | null> {
    const normalizedTicker = cleanTicker(ticker);

    try {
      // 1. Busca no cache / banco local COTAHIST
      if (this.db && typeof this.db.select === 'function') {
        const rows = await this.db
          .select()
          .from(historicalPricesLocal)
          .where(
            and(
              eq(historicalPricesLocal.ticker, normalizedTicker),
              eq(historicalPricesLocal.price_date, date)
            )
          );

        if (rows && rows.length > 0 && rows[0].close_price) {
          return rows[0].close_price;
        }
      }
    } catch (e) {
      // Ignora erro de banco local em fallback
    }

    // 2. Consulta via NativeBridge se disponível
    if (this.nativeBridge) {
      try {
        const jsonStr = await this.nativeBridge.getHistoricalPrice(normalizedTicker, date);
        if (jsonStr) {
          const item = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          if (item && (item.close_price !== undefined || item.close !== undefined)) {
            const closePrice = String(item.close_price !== undefined ? item.close_price : item.close);
            await this.saveHistoricalPrice(normalizedTicker, date, closePrice);
            return closePrice;
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    // 3. Fallback: Consulta o backend HTTP /v1/history
    try {
      const url = `${this.apiBaseUrl}/v1/history?tickers=${normalizedTicker}&from=${date}&to=${date}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let item: any = null;
        if (Array.isArray(data)) {
          item = data[0];
        } else if (data?.history) {
          if (Array.isArray(data.history)) {
            item = data.history[0];
          } else if (typeof data.history === 'object') {
            const arr = data.history[normalizedTicker] || Object.values(data.history)[0];
            item = Array.isArray(arr) ? arr[0] : arr;
          }
        }

        if (item && (item.close_price !== undefined || item.close !== undefined)) {
          const closePrice = String(item.close_price !== undefined ? item.close_price : item.close);
          await this.saveHistoricalPrice(normalizedTicker, date, closePrice);
          return closePrice;
        }
      }
    } catch (e) {
      // Falha de rede ou servidor offline
    }

    return null;
  }

  /**
   * Salva ou atualiza uma cotação histórica no banco local.
   */
  async saveHistoricalPrice(ticker: string, date: string, closePrice: string): Promise<void> {
    const normalizedTicker = cleanTicker(ticker);
    try {
      if (this.db && typeof this.db.insert === 'function') {
        await this.db
          .insert(historicalPricesLocal)
          .values({
            ticker: normalizedTicker,
            price_date: date,
            close_price: closePrice,
          })
          .onConflictDoUpdate({
            target: [historicalPricesLocal.ticker, historicalPricesLocal.price_date],
            set: { close_price: closePrice },
          });
      }
    } catch (e) {
      // Em ambiente de teste ou sem SQLite nativo
    }
  }

  /**
   * Busca cotações atuais de múltiplos tickers na NativeBridge Go ou API HTTP (/v1/quotes),
   * aplicando cache SQLite com TTL de 15 minutos, suporte a forceRefresh e fallback offline (isStale).
   */
  async fetchQuotes(tickers: string[], options?: FetchQuotesOptions): Promise<MarketQuote[]> {
    if (!tickers || tickers.length === 0) return [];

    const normalizedTickers = tickers.map(cleanTicker);
    const forceRefresh = Boolean(options?.forceRefresh);
    const now = Date.now();

    // 1. Consulta cotações pré-existentes em cache SQLite local
    const cachedMap = new Map<string, MarketQuote>();
    for (const t of normalizedTickers) {
      const cached = await this.getCachedQuote(t);
      if (cached) {
        cachedMap.set(t, cached);
      }
    }

    const allCachedPresent = normalizedTickers.every((t) => cachedMap.has(t));
    const allCachedFresh =
      allCachedPresent &&
      normalizedTickers.every((t) => {
        const q = cachedMap.get(t)!;
        const ageMs = now - (Date.parse(q.updatedAt) || 0);
        return ageMs >= 0 && ageMs < CACHE_TTL_MS;
      });

    // Se não for forçado e todos os dados estiverem frescos no cache local (< 15m), retorna direto do SQLite
    if (!forceRefresh && allCachedFresh) {
      return normalizedTickers.map((t) => ({
        ...cachedMap.get(t)!,
        isStale: false,
      }));
    }

    // 2. Se houver NativeBridge Go configurada, busca cotações nela
    if (this.nativeBridge) {
      try {
        const csv = normalizedTickers.join(',');
        const jsonStr = await this.nativeBridge.fetchQuotes(csv, forceRefresh);
        if (jsonStr) {
          const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          const rawQuotes = parsed?.quotes || (Array.isArray(parsed) ? parsed : []);
          const quotes: MarketQuote[] = rawQuotes.map((q: any) => ({
            ticker: cleanTicker(q.ticker || q.symbol || q.coin || ''),
            assetClass: q.asset_class || q.assetClass || (q.coin ? 'CRYPTO' : 'STOCK'),
            currentPrice: String(
              q.current_price !== undefined
                ? q.current_price
                : q.currentPrice !== undefined
                ? q.currentPrice
                : q.regularMarketPrice ?? '0.00'
            ),
            changePercent24h: Number(
              q.change_percent_24h ?? q.changePercent24h ?? q.regularMarketChangePercent ?? 0
            ),
            updatedAt: q.updated_at || q.updatedAt || new Date().toISOString(),
            isStale: Boolean(q.is_stale ?? q.isStale ?? false),
          }));

          // Atualiza o cache local no SQLite
          for (const q of quotes) {
            try {
              if (this.db && typeof this.db.insert === 'function') {
                await this.db
                  .insert(marketPriceCache)
                  .values({
                    ticker: q.ticker,
                    asset_class: q.assetClass,
                    current_price: q.currentPrice,
                    change_percent_24h: q.changePercent24h,
                    updated_at: q.updatedAt,
                  })
                  .onConflictDoUpdate({
                    target: marketPriceCache.ticker,
                    set: {
                      current_price: q.currentPrice,
                      change_percent_24h: q.changePercent24h,
                      updated_at: q.updatedAt,
                    },
                  });
              }
            } catch {}
          }

          return quotes;
        }
      } catch (e) {
        // Falha na bridge/rede: fallback gracioso para cache local
      }

      // Fallback offline: retorna as cotações salvas em cache marcadas com isStale: true
      const staleQuotes: MarketQuote[] = [];
      for (const t of normalizedTickers) {
        const cached = cachedMap.get(t) || (await this.getCachedQuote(t));
        if (cached) {
          staleQuotes.push({
            ...cached,
            isStale: true,
          });
        }
      }
      return staleQuotes;
    }

    // 3. Fallback Legado HTTP (/v1/quotes)
    try {
      const url = `${this.apiBaseUrl}/v1/quotes?tickers=${normalizedTickers.join(',')}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rawQuotes = data?.quotes;
        let quotesList: any[] = [];
        if (Array.isArray(rawQuotes)) {
          quotesList = rawQuotes;
        } else if (rawQuotes && typeof rawQuotes === 'object') {
          quotesList = Object.values(rawQuotes);
        }

        const quotes: MarketQuote[] = quotesList.map((q: any) => ({
          ticker: cleanTicker(q.ticker || q.symbol || q.coin || ''),
          assetClass: q.asset_class || q.assetClass || (q.coin ? 'CRYPTO' : 'STOCK'),
          currentPrice: String(
            q.current_price || q.currentPrice || q.regularMarketPrice || q.price || '0.00'
          ),
          changePercent24h: Number(
            q.change_percent_24h || q.changePercent24h || q.regularMarketChangePercent || 0
          ),
          updatedAt: q.updated_at || q.updatedAt || new Date().toISOString(),
          isStale: false,
        }));

        // Atualiza cache local
        for (const q of quotes) {
          try {
            if (this.db && typeof this.db.insert === 'function') {
              await this.db
                .insert(marketPriceCache)
                .values({
                  ticker: q.ticker,
                  asset_class: q.assetClass,
                  current_price: q.currentPrice,
                  change_percent_24h: q.changePercent24h,
                  updated_at: q.updatedAt,
                })
                .onConflictDoUpdate({
                  target: marketPriceCache.ticker,
                  set: {
                    current_price: q.currentPrice,
                    change_percent_24h: q.changePercent24h,
                    updated_at: q.updatedAt,
                  },
                });
            }
          } catch {}
        }

        return quotes;
      }
    } catch (e) {
      // Fallback para cache local se rede HTTP falhar
    }

    // Consulta cache local no fallback HTTP
    const fallbackQuotes: MarketQuote[] = [];
    for (const t of normalizedTickers) {
      const cached = cachedMap.get(t) || (await this.getCachedQuote(t));
      if (cached) {
        fallbackQuotes.push({
          ...cached,
          isStale: true,
        });
      }
    }

    return fallbackQuotes;
  }

  /**
   * Obtém cotação em cache local de um ticker.
   */
  async getCachedQuote(ticker: string): Promise<MarketQuote | null> {
    const normalized = cleanTicker(ticker);
    try {
      if (this.db && typeof this.db.select === 'function') {
        const rows = await this.db
          .select()
          .from(marketPriceCache)
          .where(eq(marketPriceCache.ticker, normalized));
        if (rows && rows.length > 0) {
          return {
            ticker: cleanTicker(rows[0].ticker),
            assetClass: rows[0].asset_class,
            currentPrice: rows[0].current_price,
            changePercent24h: rows[0].change_percent_24h ?? 0,
            updatedAt: rows[0].updated_at,
          };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Busca empresas, FIIs ou Cripto no catálogo de mercado (/v1/catalog/search ou NativeBridge).
   */
  async searchCatalog(query: string, assetClass?: string): Promise<any[]> {
    if (this.nativeBridge) {
      try {
        const jsonStr = await this.nativeBridge.searchCatalog(query, assetClass || '');
        if (jsonStr) {
          const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          return data?.results || (Array.isArray(data) ? data : []);
        }
      } catch {
        return [];
      }
      return [];
    }

    try {
      let url = `${this.apiBaseUrl}/v1/catalog/search?q=${encodeURIComponent(query)}`;
      if (assetClass) url += `&class=${assetClass}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data?.results || (Array.isArray(data) ? data : []);
      }
    } catch {}
    return [];
  }

  /**
   * Obtém série de taxas macro (CDI, Selic, IPCA) da NativeBridge Go ou API HTTP (/v1/rates/macro).
   */
  async fetchMacroRates(from: string): Promise<MacroRateData[]> {
    if (this.nativeBridge) {
      try {
        const jsonStr = await this.nativeBridge.fetchMacroRates(from);
        if (jsonStr) {
          const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          return Array.isArray(data) ? data : data?.rates || [];
        }
      } catch {
        return [];
      }
      return [];
    }

    try {
      const url = `${this.apiBaseUrl}/v1/rates/macro?from=${encodeURIComponent(from)}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  }

  /**
   * Obtém eventos corporativos (splits, grupamentos e dividendos) de tickers.
   */
  async getCorporateEvents(tickers: string[], fromDate: string): Promise<any[]> {
    if (this.nativeBridge) {
      try {
        const csv = (tickers || []).map(cleanTicker).join(',');
        const jsonStr = await this.nativeBridge.getCorporateEvents(csv, fromDate);
        if (jsonStr) {
          const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          return Array.isArray(data) ? data : data?.events || [];
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Ingestão de arquivo COTAHIST .ZIP via bridge nativa.
   */
  async ingestCotahistZip(zipPath: string, allowedTickers?: string[]): Promise<any> {
    if (this.nativeBridge) {
      try {
        const csv = (allowedTickers || []).map(cleanTicker).join(',');
        const jsonStr = await this.nativeBridge.ingestCotahistZip(zipPath, csv);
        return jsonStr ? (typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const marketApiService = new MarketApiService();
