import {
  periodReturn,
  dividendYield12m,
  summarizeDividends,
  rankAssets,
  indicatorsFor,
  formatIndicatorValue,
  PricePoint,
  Dividend,
  RankingItem,
} from '../assetProfile';

describe('Domain: assetProfile', () => {
  describe('periodReturn', () => {
    it('retorna 0 para histórico vazio ou com apenas 1 ponto', () => {
      expect(periodReturn([])).toBe(0);
      expect(periodReturn([{ date: '2026-01-01', close: 10 }])).toBe(0);
    });

    it('calcula a rentabilidade percentual entre o primeiro e o último ponto', () => {
      const points: PricePoint[] = [
        { date: '2026-01-01', close: 20 },
        { date: '2026-06-01', close: 25 },
        { date: '2026-11-01', close: 30 },
      ];
      // (30 - 20) / 20 * 100 = 50%
      expect(periodReturn(points)).toBeCloseTo(50, 2);
    });

    it('calcula variação negativa corretamente', () => {
      const points: PricePoint[] = [
        { date: '2026-01-01', close: 40 },
        { date: '2026-11-01', close: 30 },
      ];
      // (30 - 40) / 40 * 100 = -25%
      expect(periodReturn(points)).toBeCloseTo(-25, 2);
    });
  });

  describe('dividendYield12m', () => {
    const divs: Dividend[] = [
      { date: '2026-08-20', type: 'DIVIDEND', amount: 0.87 },
      { date: '2026-05-20', type: 'JCP', amount: 0.52 },
      { date: '2026-02-15', type: 'DIVIDEND', amount: 1.25 },
      { date: '2025-11-20', type: 'DIVIDEND', amount: 2.12 },
      { date: '2024-05-10', type: 'DIVIDEND', amount: 3.00 }, // fora dos 12 meses
    ];

    it('soma apenas os proventos dos últimos 12 meses em relação à data informada', () => {
      const now = '2026-11-01';
      // 0.87 + 0.52 + 1.25 + 2.12 = 4.76
      // Preço atual = 38.42 -> (4.76 / 38.42) * 100 = 12.389%
      const dy = dividendYield12m(divs, 38.42, now);
      expect(dy).toBeCloseTo(12.389, 2);
    });

    it('retorna 0 quando o preço atual é zero ou negativo', () => {
      expect(dividendYield12m(divs, 0)).toBe(0);
      expect(dividendYield12m(divs, -10)).toBe(0);
    });

    it('retorna 0 quando não há proventos nos últimos 12 meses', () => {
      expect(dividendYield12m([], 38.42)).toBe(0);
    });
  });

  describe('summarizeDividends', () => {
    it('resume proventos com total 12m, frequência, últimos 6 pagamentos e destaque do maior', () => {
      const divs: Dividend[] = [
        { date: '2026-08-20', type: 'DIVIDEND', amount: 0.87 },
        { date: '2026-05-20', type: 'JCP', amount: 0.52 },
        { date: '2026-02-15', type: 'DIVIDEND', amount: 1.25 },
        { date: '2025-11-20', type: 'DIVIDEND', amount: 2.12 },
      ];
      const summary = summarizeDividends(divs, 38.42, '2026-11-01');

      expect(summary.total12m).toBeCloseTo(4.76, 2);
      expect(summary.frequency).toBe('Trimestral'); // 4 pagamentos em 12 meses
      expect(summary.last6.length).toBe(4);
      // Maior provento é 2.12 (2025-11-20)
      const highest = summary.last6.find((d) => d.isHighest);
      expect(highest).toBeDefined();
      expect(highest?.amount).toBe(2.12);
      expect(summary.recent[0].date).toBe('2026-08-20');
    });

    it('identifica frequências Mensal, Semestral, Anual e Irregular', () => {
      const monthlyDivs: Dividend[] = Array.from({ length: 12 }, (_, i) => ({
        date: `2026-${String(i + 1).padStart(2, '0')}-15`,
        type: 'RENDIMENTO',
        amount: 1.0,
      }));
      expect(summarizeDividends(monthlyDivs, 100, '2026-12-31').frequency).toBe('Mensal');

      const semiannualDivs: Dividend[] = [
        { date: '2026-06-15', type: 'DIVIDEND', amount: 2 },
        { date: '2026-12-15', type: 'DIVIDEND', amount: 2 },
      ];
      expect(summarizeDividends(semiannualDivs, 100, '2026-12-31').frequency).toBe('Semestral');

      const annualDivs: Dividend[] = [{ date: '2026-04-15', type: 'DIVIDEND', amount: 5 }];
      expect(summarizeDividends(annualDivs, 100, '2026-12-31').frequency).toBe('Anual');

      expect(summarizeDividends([], 100).frequency).toBe('—');
    });
  });

  describe('rankAssets', () => {
    const items: RankingItem[] = [
      { ticker: 'KNCR11', name: 'Kinea Rendimentos', assetClass: 'FII', price: 104.98, dy12m: 14.3, pvp: 1.02, change24h: 0.5 },
      { ticker: 'MXRF11', name: 'Maxi Renda', assetClass: 'FII', price: 8.79, dy12m: 12.1, pvp: 0.95, change24h: -0.2 },
      { ticker: 'XPLG11', name: 'XP Log', assetClass: 'FII', price: 101.20, dy12m: 9.4, pvp: 0.87, change24h: 1.2 },
      { ticker: 'VISC11', name: 'Vinci Shopping', assetClass: 'FII', price: 112.40, dy12m: 8.7, pvp: 0.86, change24h: 0.0 },
      { ticker: 'SEMDADO', name: 'Sem Dado', assetClass: 'FII', price: 50.00, dy12m: null, pvp: null, change24h: 0.1 },
    ];

    it('ordena por DY decrescente colocando ativos sem dado no final', () => {
      const sorted = rankAssets(items, 'dy', 'desc');
      expect(sorted[0].ticker).toBe('KNCR11');
      expect(sorted[1].ticker).toBe('MXRF11');
      expect(sorted[2].ticker).toBe('XPLG11');
      expect(sorted[3].ticker).toBe('VISC11');
      expect(sorted[4].ticker).toBe('SEMDADO');
    });

    it('ordena por P/VP crescente colocando ativos sem dado no final', () => {
      const sorted = rankAssets(items, 'pvp', 'asc');
      expect(sorted[0].ticker).toBe('VISC11'); // 0.86
      expect(sorted[1].ticker).toBe('XPLG11'); // 0.87
      expect(sorted[2].ticker).toBe('MXRF11'); // 0.95
      expect(sorted[3].ticker).toBe('KNCR11'); // 1.02
      expect(sorted[4].ticker).toBe('SEMDADO');
    });

    it('ordena por maiores altas (change decrescente)', () => {
      const sorted = rankAssets(items, 'change', 'desc');
      expect(sorted[0].ticker).toBe('XPLG11'); // 1.2
      expect(sorted[1].ticker).toBe('KNCR11'); // 0.5
    });
  });

  describe('indicatorsFor', () => {
    it('retorna os 8 indicadores exigidos para STOCK (Ações)', () => {
      const ind = indicatorsFor('STOCK');
      const keys = ind.map((i) => i.key);
      expect(keys).toEqual([
        'dy',
        'pl',
        'pvp',
        'roe',
        'marketCap',
        'dailyLiquidity',
        'netMargin',
        'netDebtEbitda',
      ]);
    });

    it('retorna os 7 indicadores exigidos para FII', () => {
      const ind = indicatorsFor('FII');
      const keys = ind.map((i) => i.key);
      expect(keys).toEqual([
        'dy',
        'pvp',
        'dailyLiquidity',
        'shareholdersCount',
        'netWorth',
        'lastYield',
        'vacancy',
      ]);
    });

    it('retorna os 5 indicadores exigidos para CRYPTO', () => {
      const ind = indicatorsFor('CRYPTO');
      const keys = ind.map((i) => i.key);
      expect(keys).toEqual([
        'marketCap',
        'volume24h',
        'range52w',
        'change7d',
        'change30d',
      ]);
    });
  });

  describe('formatIndicatorValue', () => {
    it('formata valores nulos ou vazios como "—"', () => {
      expect(formatIndicatorValue('dy', null)).toBe('—');
      expect(formatIndicatorValue('pl', undefined)).toBe('—');
      expect(formatIndicatorValue('marketCap', '')).toBe('—');
    });

    it('formata valores de mercado e liquidez em B (bilhões) e M (milhões)', () => {
      expect(formatIndicatorValue('marketCap', 497000000000)).toBe('R$ 497 B');
      expect(formatIndicatorValue('dailyLiquidity', 1200000000)).toBe('R$ 1,2 B');
      expect(formatIndicatorValue('dailyLiquidity', 29000000)).toBe('R$ 29 M');
    });

    it('formata porcentagens com vírgula e símbolo %', () => {
      expect(formatIndicatorValue('dy', 12.4)).toBe('12,4%');
      expect(formatIndicatorValue('roe', 24)).toBe('24,0%');
    });

    it('formata múltiplos P/L e P/VP com precisão pt-BR', () => {
      expect(formatIndicatorValue('pl', 5.2)).toBe('5,2');
      expect(formatIndicatorValue('pvp', 1.3)).toBe('1,3');
    });
  });
});
