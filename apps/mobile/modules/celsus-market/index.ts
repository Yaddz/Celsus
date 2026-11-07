import { requireNativeModule } from 'expo-modules-core';

export interface INativeMarketBridge {
  checkHealth(): Promise<string>;
  fetchQuotes(tickersCsv: string, forceRefresh: boolean): Promise<string>;
  getHistoricalPrice(ticker: string, date: string): Promise<string>;
  searchCatalog(query: string, assetClass: string): Promise<string>;
  fetchMacroRates(fromDate: string): Promise<string>;
  getCorporateEvents(tickersCsv: string, fromDate: string): Promise<string>;
  ingestCotahistZip(zipPath: string, allowedTickersCsv: string): Promise<string>;
  getAssetProfile?(ticker: string): Promise<string>;
  getPriceHistory?(ticker: string, rangeParam: string): Promise<string>;
  getDividends?(ticker: string): Promise<string>;
  getRanking?(assetClass: string, by: string, limit: number): Promise<string>;
}

let nativeModule: INativeMarketBridge | null = null;
try {
  nativeModule = requireNativeModule<INativeMarketBridge>('CelsusMarket');
} catch {
  // Fallback em ambientes de teste Jest / Node.js
  nativeModule = null;
}

export const CelsusMarketModule = nativeModule;
export default CelsusMarketModule;
