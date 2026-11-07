import { MarketApiService } from '../marketApi';

/** Ponte nativa (Android) devolvendo o que o Go devolve quando as fontes de fundamentos falham. */
const offlineProfile = JSON.stringify({
  ticker: 'PETR4', name: 'PETR4', asset_class: 'STOCK', price: 0, change_24h: 0,
  indicators: {}, is_stale: true, source: 'OFFLINE',
});

function service(bridge: any) {
  return new MarketApiService('http://sem-rede.invalid', undefined, bridge);
}

describe('Android: fallback quando a ponte nativa não traz dados', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  it('perfil OFFLINE (preço 0) da ponte cai na cotação real em vez de virar erro', async () => {
    const bridge = {
      getAssetProfile: jest.fn().mockResolvedValue(offlineProfile),
      fetchQuotes: jest.fn().mockResolvedValue(
        JSON.stringify({ quotes: [{ ticker: 'PETR4', asset_class: 'STOCK', current_price: 45.36, change_percent_24h: -1.28, updated_at: new Date().toISOString() }] })
      ),
    };
    const profile = await service(bridge).getAssetProfile('PETR4');
    expect(profile.price).toBe(45.36);
    expect(profile.source).not.toBe('OFFLINE');
  });

  it('perfil completo da ponte é usado como está', async () => {
    const bridge = {
      getAssetProfile: jest.fn().mockResolvedValue(
        JSON.stringify({ ticker: 'MXRF11', name: 'MAXI RENDA', asset_class: 'FII', price: 8.8, change_24h: 1.85,
          indicators: { dy: 13.4, pvp: 0.94 }, source: 'FUNDAMENTUS' })
      ),
    };
    const profile = await service(bridge).getAssetProfile('MXRF11');
    expect(profile.indicators.dy).toBe(13.4);
    expect(profile.source).toBe('FUNDAMENTUS');
  });

  it('ranking vazio da ponte (cache frio) cai no catálogo da classe, nunca em lista vazia', async () => {
    const bridge = { getRanking: jest.fn().mockResolvedValue(JSON.stringify({ rankings: [] })) };
    const list = await service(bridge).getRanking('FII', 'dy', 20);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((i) => i.assetClass === 'FII')).toBe(true);
    expect(list.every((i) => i.dy12m === null)).toBe(true);
  });

  it('ranking da ponte preserva null em DY/P-VP ausentes', async () => {
    const bridge = {
      getRanking: jest.fn().mockResolvedValue(JSON.stringify({ rankings: [
        { ticker: 'AAAA11', name: 'A', asset_class: 'FII', price: 10, dy12m: 9.5, pvp: null, change_24h: null },
        { ticker: 'BBBB11', name: 'B', asset_class: 'FII', price: 0, dy12m: null, pvp: null, change_24h: null },
      ] })),
    };
    const list = await service(bridge).getRanking('FII', 'dy', 20);
    expect(list[0].dy12m).toBe(9.5);
    expect(list[0].pvp).toBeNull();
    expect(list[1].dy12m).toBeNull();
  });

  it('ponte antiga que devolve um único ativo em cache é completada com o catálogo da classe', async () => {
    const bridge = {
      getRanking: jest.fn().mockResolvedValue(JSON.stringify({ rankings: [
        { ticker: 'HGLG11', name: 'CSHG Logística', asset_class: 'FII', price: 146.5, dy12m: 9.1, pvp: 0.89, change_24h: 0.4 },
      ] })),
    };
    const list = await service(bridge).getRanking('FII', 'dy', 20);
    expect(list[0].ticker).toBe('HGLG11');
    expect(list[0].dy12m).toBe(9.1);
    expect(list.length).toBeGreaterThan(5);
    expect(list.filter((i) => i.ticker === 'HGLG11')).toHaveLength(1);
    expect(list.slice(1).every((i) => i.dy12m === null && i.price === 0)).toBe(true);
  });
});
