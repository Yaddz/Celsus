import { getDatabase } from '../db/client';
import { marketPriceCache, historicalPricesLocal, MarketPriceCache, HistoricalPriceLocal } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface MarketQuote {
  ticker: string;
  assetClass: string;
  currentPrice: string;
  changePercent24h: number;
  updatedAt: string;
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

export interface IMarketApiService {
  getHistoricalPrice(ticker: string, date: string): Promise<string | null>;
  fetchQuotes(tickers: string[]): Promise<MarketQuote[]>;
  getCachedQuote(ticker: string): Promise<MarketQuote | null>;
  saveHistoricalPrice(ticker: string, date: string, closePrice: string): Promise<void>;
  searchCatalog(query: string, assetClass?: string): Promise<any[]>;
  fetchMacroRates(from: string): Promise<MacroRateData[]>;
}

export class MarketApiService implements IMarketApiService {
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = 'http://localhost:8080') {
    this.apiBaseUrl = apiBaseUrl;
  }

  protected get db() {
    return getDatabase();
  }

  /**
   * S4-T01: Busca o preço histórico de fechamento de um ticker em uma data específica.
   * Consulta primeiro a base local COTAHIST (historical_prices_local).
   * Se não encontrar localmente, tenta consultar o backend Go (/v1/history) e efetua o cache local.
   */
  async getHistoricalPrice(ticker: string, date: string): Promise<string | null> {
    const normalizedTicker = ticker.trim().toUpperCase();

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

    // 2. Fallback: Consulta o backend Go /v1/history
    try {
      const url = `${this.apiBaseUrl}/v1/history?tickers=${normalizedTicker}&from=${date}&to=${date}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data?.history?.[0];
        if (item && item.close_price) {
          const closePrice = String(item.close_price);
          // Salva no banco local para consultas subsequentes offline
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
    const normalizedTicker = ticker.trim().toUpperCase();
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
   * Busca cotações atuais de múltiplos tickers na API de mercado (/v1/quotes).
   */
  async fetchQuotes(tickers: string[]): Promise<MarketQuote[]> {
    if (!tickers || tickers.length === 0) return [];

    const normalizedTickers = tickers.map((t) => t.trim().toUpperCase());
    try {
      const url = `${this.apiBaseUrl}/v1/quotes?tickers=${normalizedTickers.join(',')}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const quotes: MarketQuote[] = (data?.quotes || []).map((q: any) => ({
          ticker: q.ticker,
          assetClass: q.asset_class || q.assetClass || 'STOCK',
          currentPrice: String(q.current_price || q.currentPrice || '0.00'),
          changePercent24h: Number(q.change_percent_24h || q.changePercent24h || 0),
          updatedAt: q.updated_at || new Date().toISOString(),
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
      // Fallback para cache local se rede falhar
    }

    // Consulta cache local
    const cachedQuotes: MarketQuote[] = [];
    try {
      if (this.db && typeof this.db.select === 'function') {
        for (const ticker of normalizedTickers) {
          const rows = await this.db
            .select()
            .from(marketPriceCache)
            .where(eq(marketPriceCache.ticker, ticker));
          if (rows && rows.length > 0) {
            cachedQuotes.push({
              ticker: rows[0].ticker,
              assetClass: rows[0].asset_class,
              currentPrice: rows[0].current_price,
              changePercent24h: rows[0].change_percent_24h ?? 0,
              updatedAt: rows[0].updated_at,
            });
          }
        }
      }
    } catch {}

    return cachedQuotes;
  }

  /**
   * Obtém cotação em cache local de um ticker.
   */
  async getCachedQuote(ticker: string): Promise<MarketQuote | null> {
    const normalized = ticker.trim().toUpperCase();
    try {
      if (this.db && typeof this.db.select === 'function') {
        const rows = await this.db
          .select()
          .from(marketPriceCache)
          .where(eq(marketPriceCache.ticker, normalized));
        if (rows && rows.length > 0) {
          return {
            ticker: rows[0].ticker,
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
   * Busca empresas, FIIs ou Cripto no catálogo de mercado (/v1/catalog/search).
   */
  async searchCatalog(query: string, assetClass?: string): Promise<any[]> {
    try {
      let url = `${this.apiBaseUrl}/v1/catalog/search?q=${encodeURIComponent(query)}`;
      if (assetClass) url += `&class=${assetClass}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  }

  /**
   * Obtém série de taxas macro (CDI, Selic, IPCA) da API Go (/v1/rates/macro).
   */
  async fetchMacroRates(from: string): Promise<MacroRateData[]> {
    try {
      const url = `${this.apiBaseUrl}/v1/rates/macro?from=${encodeURIComponent(from)}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  }
}

export const marketApiService = new MarketApiService();
