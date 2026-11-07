import { getDatabase } from '../db/client';
import { marketPriceCache, historicalPricesLocal, assetProfileCache, MarketPriceCache, HistoricalPriceLocal } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { CelsusMarketModule, INativeMarketBridge } from '../../modules/celsus-market';
import { AssetProfile, PricePoint, Dividend, RankingItem } from '../domain/finance/assetProfile';


export const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

export const STATIC_CATALOG_ASSETS = [
  // Ações
  { ticker: 'PETR4', name: 'Petróleo Brasileiro S.A. PN', asset_class: 'STOCK', price: '38.50' },
  { ticker: 'VALE3', name: 'Vale S.A. ON', asset_class: 'STOCK', price: '60.00' },
  { ticker: 'WEGE3', name: 'WEG S.A. ON', asset_class: 'STOCK', price: '42.50' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', asset_class: 'STOCK', price: '34.00' },
  { ticker: 'BBAS3', name: 'Banco do Brasil S.A. ON', asset_class: 'STOCK', price: '28.00' },
  { ticker: 'BBDC4', name: 'Banco Bradesco S.A. PN', asset_class: 'STOCK', price: '14.50' },
  { ticker: 'ALUP11', name: 'Alupar Investimento Units', asset_class: 'STOCK', price: '31.50' },
  { ticker: 'RENT3', name: 'Localiza Rent a Car ON', asset_class: 'STOCK', price: '45.00' },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', asset_class: 'STOCK', price: '9.20' },
  { ticker: 'ABEV3', name: 'Ambev S.A. ON', asset_class: 'STOCK', price: '12.80' },
  { ticker: 'PRIO3', name: 'PRIO S.A. ON', asset_class: 'STOCK', price: '46.00' },
  { ticker: 'ITSA4', name: 'Itaúsa PN', asset_class: 'STOCK', price: '10.50' },
  { ticker: 'ELET3', name: 'Eletrobras ON', asset_class: 'STOCK', price: '39.00' },

  // FIIs (Fundos Imobiliários)
  { ticker: 'HGLG11', name: 'CSHG Logística FII', asset_class: 'FII', price: '162.00' },
  { ticker: 'MXRF11', name: 'Maxi Renda FII', asset_class: 'FII', price: '10.20' },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística FII', asset_class: 'FII', price: '101.00' },
  { ticker: 'XPML11', name: 'XP Malls FII', asset_class: 'FII', price: '110.00' },
  { ticker: 'KNIP11', name: 'Kinea Rendimentos Imobiliários FII', asset_class: 'FII', price: '92.00' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers FII', asset_class: 'FII', price: '118.00' },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos FII', asset_class: 'FII', price: '102.50' },
  { ticker: 'XPLG11', name: 'XP Log FII', asset_class: 'FII', price: '105.00' },
  { ticker: 'HGRU11', name: 'CSHG Renda Urbana FII', asset_class: 'FII', price: '124.00' },
  { ticker: 'TGAR11', name: 'TG Ativo Real FII', asset_class: 'FII', price: '115.00' },
  { ticker: 'CPTS11', name: 'Capitânia Securities II FII', asset_class: 'FII', price: '8.40' },
  { ticker: 'IRDM11', name: 'Iridium Recebíveis Imobiliários', asset_class: 'FII', price: '75.00' },
  { ticker: 'RBRR11', name: 'RBR Rendimento High Grade FII', asset_class: 'FII', price: '89.00' },
  { ticker: 'ALZR11', name: 'Alianza Trust Renda Imobiliária', asset_class: 'FII', price: '112.00' },

  // Renda Fixa (Títulos Públicos, Bancários e Crédito Privado)
  { ticker: 'TESOURO SELIC 2029', name: 'Tesouro Selic 2029 (LFT)', asset_class: 'FIXED_INCOME', price: '15000.00' },
  { ticker: 'TESOURO IPCA+ 2035', name: 'Tesouro IPCA+ 2035 (NTN-B)', asset_class: 'FIXED_INCOME', price: '3200.00' },
  { ticker: 'TESOURO IPCA+ 2029', name: 'Tesouro IPCA+ 2029 (NTN-B)', asset_class: 'FIXED_INCOME', price: '3400.00' },
  { ticker: 'TESOURO PREFIXADO 2027', name: 'Tesouro Prefixado 2027 (LTN)', asset_class: 'FIXED_INCOME', price: '820.00' },
  { ticker: 'CDB 100% CDI', name: 'CDB Liquidez Diária 100% CDI', asset_class: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'CDB DI 110%', name: 'CDB Banco Master 110% CDI', asset_class: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'CDB BANCO MASTER 115%', name: 'CDB Banco Master 115% CDI', asset_class: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'LCI 95% CDI', name: 'LCI Isenta de IR 95% CDI', asset_class: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'LCA BANCO DO BRASIL', name: 'LCA BB 93% CDI Isenta de IR', asset_class: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'CRI/CRA IPCA+ 7%', name: 'CRI/CRA Crédito Privado IPCA+ 7% a.a.', asset_class: 'FIXED_INCOME', price: '1000.00' },
  { ticker: 'DEBÊNTURE INCENTIVADA', name: 'Debênture Incentivada de Infraestrutura', asset_class: 'FIXED_INCOME', price: '1000.00' },

  // Criptomoedas
  { ticker: 'BTC', name: 'Bitcoin (BTC)', asset_class: 'CRYPTO', price: '422000.00' },
  { ticker: 'ETH', name: 'Ethereum (ETH)', asset_class: 'CRYPTO', price: '12350.00' },
  { ticker: 'SOL', name: 'Solana (SOL)', asset_class: 'CRYPTO', price: '505.00' },
  { ticker: 'USDT', name: 'Tether USD (USDT)', asset_class: 'CRYPTO', price: '5.80' },
  { ticker: 'USDC', name: 'USD Coin (USDC)', asset_class: 'CRYPTO', price: '5.80' },
  { ticker: 'BNB', name: 'Binance Coin (BNB)', asset_class: 'CRYPTO', price: '3400.00' },
  { ticker: 'ADA', name: 'Cardano (ADA)', asset_class: 'CRYPTO', price: '2.10' },
  { ticker: 'AVAX', name: 'Avalanche (AVAX)', asset_class: 'CRYPTO', price: '150.00' },
  { ticker: 'DOT', name: 'Polkadot (DOT)', asset_class: 'CRYPTO', price: '25.00' },
  { ticker: 'LINK', name: 'Chainlink (LINK)', asset_class: 'CRYPTO', price: '68.00' },
];

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
  checkHealth?(): Promise<HealthStatus | null>;
  getHistoricalPrice(ticker: string, date: string): Promise<string | null>;
  fetchQuotes(tickers: string[], options?: FetchQuotesOptions): Promise<MarketQuote[]>;
  getCachedQuote(ticker: string): Promise<MarketQuote | null>;
  saveHistoricalPrice(ticker: string, date: string, closePrice: string): Promise<void>;
  searchCatalog(query: string, assetClass?: string): Promise<any[]>;
  fetchMacroRates(from: string): Promise<MacroRateData[]>;
  getCorporateEvents?(tickers: string[], fromDate: string): Promise<any[]>;
  ingestCotahistZip?(zipPath: string, allowedTickers?: string[]): Promise<any>;
  isNativeBridgeAvailable?(): boolean;
  getAssetProfile?(ticker: string): Promise<AssetProfile>;
  getPriceHistory?(ticker: string, range?: string): Promise<PricePoint[]>;
  getDividends?(ticker: string): Promise<Dividend[]>;
  getRanking?(assetClass?: string, by?: string, limit?: number): Promise<RankingItem[]>;
}

export class MarketApiService implements IMarketApiService {
  private apiBaseUrl: string;
  private customDb?: any;
  protected nativeBridge?: INativeMarketBridge | null;

  constructor(
    apiBaseUrlOrBridge: string | INativeMarketBridge | null = process.env.EXPO_PUBLIC_MARKET_API_URL || 'http://localhost:8080',
    db?: any,
    nativeBridge?: INativeMarketBridge | null
  ) {
    const defaultUrl = process.env.EXPO_PUBLIC_MARKET_API_URL || 'http://localhost:8080';
    if (typeof apiBaseUrlOrBridge === 'string') {
      this.apiBaseUrl = apiBaseUrlOrBridge;
      this.customDb = db;
      this.nativeBridge = nativeBridge !== undefined ? nativeBridge : CelsusMarketModule;
    } else {
      this.nativeBridge = apiBaseUrlOrBridge !== undefined ? apiBaseUrlOrBridge : CelsusMarketModule;
      this.customDb = db;
      this.apiBaseUrl = defaultUrl;
    }
  }

  isNativeBridgeAvailable(): boolean {
    return Boolean(this.nativeBridge);
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

    // 4. Fallback Direto Yahoo / Crypto para datas passadas (quando backend offline)
    try {
      const isCrypto = ['BTC', 'ETH', 'SOL', 'USDT', 'BNB'].includes(normalizedTicker);
      const yahooSymbol = isCrypto ? `${normalizedTicker}-USD` : (normalizedTicker.includes('.') ? normalizedTicker : `${normalizedTicker}.SA`);
      const yRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=2y&interval=1d`);
      if (yRes.ok) {
        const yData = await yRes.json();
        const result = yData?.chart?.result?.[0];
        const timestamps = result?.timestamp || [];
        const closes = result?.indicators?.quote?.[0]?.close || [];
        let foundPrice: number | null = null;
        for (let i = 0; i < timestamps.length; i++) {
          const barDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
          if (barDate === date) {
            foundPrice = closes[i];
            break;
          }
        }
        if (foundPrice === null && timestamps.length > 0) {
          for (let i = timestamps.length - 1; i >= 0; i--) {
            const barDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
            if (barDate <= date && closes[i] !== null && closes[i] !== undefined) {
              foundPrice = closes[i];
              break;
            }
          }
        }
        if (foundPrice !== null && foundPrice > 0) {
          const finalPrice = foundPrice.toFixed(2);
          await this.saveHistoricalPrice(normalizedTicker, date, finalPrice);
          return finalPrice;
        }
      }
    } catch {}

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
            source: q.source || (q.provider ? q.provider : 'YAHOO'),
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
          source: q.source || (q.provider ? q.provider : 'YAHOO'),
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
    const filterStatic = () => {
      const q = (query || '').trim().toUpperCase();
      const cls = assetClass ? assetClass.toUpperCase() : '';
      return STATIC_CATALOG_ASSETS.filter((item) => {
        const matchesClass = !cls || item.asset_class === cls;
        const matchesQuery = !q || item.ticker.includes(q) || item.name.toUpperCase().includes(q);
        return matchesClass && matchesQuery;
      });
    };

    if (this.nativeBridge) {
      try {
        const jsonStr = await this.nativeBridge.searchCatalog(query, assetClass || '');
        if (jsonStr) {
          const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
          const res = data?.results || (Array.isArray(data) ? data : []);
          if (res.length > 0) return res;
        }
      } catch {}
      return filterStatic();
    }

    try {
      let url = `${this.apiBaseUrl}/v1/catalog/search?q=${encodeURIComponent(query)}`;
      if (assetClass) url += `&class=${assetClass}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const results = data?.results || (Array.isArray(data) ? data : []);
        if (results.length > 0) return results;
      }
    } catch {}

    return filterStatic();
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

  async getAssetProfile(ticker: string): Promise<AssetProfile> {
    const clean = cleanTicker(ticker);
    return {
      ticker: clean,
      name: clean,
      assetClass: 'STOCK',
      price: 0,
      change24h: 0,
      indicators: {},
    };
  }

  async getPriceHistory(_ticker: string, _range: string = '1y'): Promise<PricePoint[]> {
    return [];
  }

  async getDividends(_ticker: string): Promise<Dividend[]> {
    return [];
  }

  async getRanking(_assetClass?: string, _by?: string, _limit: number = 20): Promise<RankingItem[]> {
    return [];
  }
}

export const marketApiService = new MarketApiService();
