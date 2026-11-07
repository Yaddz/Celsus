import { MarketApiService } from '../marketApi';
import { appMetaRepository } from '../../repositories/appMetaRepository';

describe('MarketApi: Asset Profile, History, Dividends & Rankings', () => {
  const sampleProfileJSON = JSON.stringify({
    ticker: 'PETR4',
    name: 'Petróleo Brasileiro S.A. PN',
    asset_class: 'STOCK',
    price: 38.42,
    change_24h: 1.8,
    change_12m: 14.3,
    indicators: { dy: 12.4, pl: 5.2, pvp: 1.3, roe: 24 },
    company_name: 'Petróleo Brasileiro S.A.',
    sector: 'Petróleo, gás e biocombustíveis',
    source: 'YAHOO',
  });

  const sampleHistoryJSON = JSON.stringify({
    history: [
      { date: '2026-01-01', close: 30 },
      { date: '2026-06-01', close: 35 },
      { date: '2026-11-01', close: 38.42 },
    ],
  });

  const sampleDividendsJSON = JSON.stringify({
    dividends: [
      { date: '2026-08-20', type: 'DIVIDEND', amount: 0.87 },
      { date: '2026-05-20', type: 'JCP', amount: 0.52 },
    ],
  });

  const sampleRankingJSON = JSON.stringify({
    rankings: [
      { ticker: 'KNCR11', name: 'Kinea Rendimentos', asset_class: 'FII', price: 104.98, dy12m: 14.3, pvp: 1.02, change_24h: 0.5 },
      { ticker: 'MXRF11', name: 'Maxi Renda', asset_class: 'FII', price: 8.79, dy12m: 12.1, pvp: 0.95, change_24h: -0.2 },
    ],
  });

  it('busca o perfil do ativo via bridge nativa quando disponível', async () => {
    const mockBridge = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      getHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
      getAssetProfile: jest.fn().mockResolvedValue(sampleProfileJSON),
      getPriceHistory: jest.fn().mockResolvedValue(sampleHistoryJSON),
      getDividends: jest.fn().mockResolvedValue(sampleDividendsJSON),
      getRanking: jest.fn().mockResolvedValue(sampleRankingJSON),
    };

    const service = new MarketApiService('http://test', undefined, mockBridge as any);
    const profile = await service.getAssetProfile('PETR4');

    expect(mockBridge.getAssetProfile).toHaveBeenCalledWith('PETR4');
    expect(profile.ticker).toBe('PETR4');
    expect(profile.price).toBe(38.42);
    expect(profile.indicators.dy).toBe(12.4);
  });

  it('busca o histórico de preços e converte em PricePoint[]', async () => {
    const mockBridge = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      getHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
      getAssetProfile: jest.fn(),
      getPriceHistory: jest.fn().mockResolvedValue(sampleHistoryJSON),
      getDividends: jest.fn(),
      getRanking: jest.fn(),
    };

    const service = new MarketApiService('http://test', undefined, mockBridge as any);
    const history = await service.getPriceHistory('PETR4', '1y');

    expect(mockBridge.getPriceHistory).toHaveBeenCalledWith('PETR4', '1y');
    expect(history.length).toBe(3);
    expect(history[2].close).toBe(38.42);
  });

  it('busca proventos e ranking via bridge nativa', async () => {
    const mockBridge = {
      checkHealth: jest.fn(),
      fetchQuotes: jest.fn(),
      getHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
      getCorporateEvents: jest.fn(),
      ingestCotahistZip: jest.fn(),
      getAssetProfile: jest.fn(),
      getPriceHistory: jest.fn(),
      getDividends: jest.fn().mockResolvedValue(sampleDividendsJSON),
      getRanking: jest.fn().mockResolvedValue(sampleRankingJSON),
    };

    const service = new MarketApiService('http://test', undefined, mockBridge as any);
    const divs = await service.getDividends('PETR4');
    const ranking = await service.getRanking('FII', 'dy', 10);

    expect(divs.length).toBe(2);
    expect(divs[0].amount).toBe(0.87);
    expect(ranking.length).toBe(2);
    expect(ranking[0].ticker).toBe('KNCR11');
  });

  it('recorre ao catálogo estático local quando o serviço está offline e sem cache', async () => {
    const service = new MarketApiService('http://offline-invalid-host', undefined, null);
    const profile = await service.getAssetProfile('PETR4');

    expect(profile.ticker).toBe('PETR4');
    expect(profile.name).toContain('Petróleo Brasileiro');
    expect(profile.price).toBeGreaterThan(0);
    expect(profile.isStale).toBe(true);
  });

  describe('AppMetaRepository: Recent Searches & Watchlist', () => {
    it('gerencia buscas recentes no app_meta com limite de 10 e sem duplicatas', async () => {
      await appMetaRepository.addRecentSearch('PETR4');
      await appMetaRepository.addRecentSearch('VALE3');
      await appMetaRepository.addRecentSearch('PETR4'); // Move para o topo

      const recents = await appMetaRepository.getRecentSearches();
      expect(recents).toEqual(['PETR4', 'VALE3']);
    });

    it('gerencia watchlist (favoritos) alternando estado com toggleWatchlist', async () => {
      expect(await appMetaRepository.isWatchlist('PETR4')).toBe(false);
      const isFav1 = await appMetaRepository.toggleWatchlist('PETR4');
      expect(isFav1).toBe(true);
      expect(await appMetaRepository.isWatchlist('PETR4')).toBe(true);

      const isFav2 = await appMetaRepository.toggleWatchlist('PETR4');
      expect(isFav2).toBe(false);
      expect(await appMetaRepository.isWatchlist('PETR4')).toBe(false);
    });
  });
});
