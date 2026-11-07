import {
  assignDonutColors,
  buildDonutSlices,
  contrastRatio,
  DONUT_PALETTE,
  DONUT_TOTAL_SEGMENTS,
} from '..';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('donut por ativo', () => {
  it('as fatias fecham 100% da categoria e ocupam exatamente os 144 segmentos', () => {
    const slices = buildDonutSlices([
      { ticker: 'ITUB4', weight: 13 },
      { ticker: 'WEGE3', weight: 13 },
      { ticker: 'BPAC11', weight: 12 },
      { ticker: 'ALUP11', weight: 11 },
      { ticker: 'BBSE3', weight: 11 },
      { ticker: 'PETR4', weight: 0.4 },
    ]);
    expect(Math.round(sum(slices.map((s) => s.percent)) * 10) / 10).toBe(100);
    expect(sum(slices.map((s) => s.segments))).toBe(DONUT_TOTAL_SEGMENTS);
    expect(slices.every((s) => s.segments >= 1)).toBe(true);
    // fatias contíguas, sem buracos nem sobreposição
    slices.reduce((start, s) => {
      expect(s.startSegment).toBe(start);
      return start + s.segments;
    }, 0);
  });

  it('1 ativo ocupa o anel inteiro; sem ativos não há fatias', () => {
    const [only] = buildDonutSlices([{ ticker: 'MXRF11', weight: 7 }]);
    expect(only.percent).toBe(100);
    expect(only.segments).toBe(DONUT_TOTAL_SEGMENTS);
    expect(buildDonutSlices([])).toEqual([]);
  });

  it('sem pesos informados divide por igual (anel nunca vazio com ativos)', () => {
    const slices = buildDonutSlices([
      { ticker: 'A', weight: 0 },
      { ticker: 'B', weight: 0 },
    ]);
    expect(slices.map((s) => s.percent)).toEqual([50, 50]);
  });

  it('a cor de cada ativo é estável: não muda com a ordem nem entre renderizações', () => {
    const a = assignDonutColors(['VALE3', 'ITUB4', 'WEGE3', 'BBDC4']);
    const b = assignDonutColors(['BBDC4', 'WEGE3', 'ITUB4', 'VALE3']);
    expect(a).toEqual(b);
    expect(assignDonutColors(['VALE3', 'ITUB4', 'WEGE3', 'BBDC4'])).toEqual(a);
    const s1 = buildDonutSlices([{ ticker: 'VALE3', weight: 10 }, { ticker: 'ITUB4', weight: 90 }]);
    const s2 = buildDonutSlices([{ ticker: 'ITUB4', weight: 30 }, { ticker: 'VALE3', weight: 70 }]);
    expect(s1.find((s) => s.ticker === 'VALE3')!.color).toBe(s2.find((s) => s.ticker === 'VALE3')!.color);
  });

  it('cada ativo tem cor distinta (inclusive além da paleta)', () => {
    const tickers = Array.from({ length: 16 }, (_, i) => `TK${i}11`);
    const colors = Object.values(assignDonutColors(tickers));
    expect(new Set(colors).size).toBe(16);
  });

  it('todas as cores têm contraste ≥ 3:1 contra o card claro e o escuro', () => {
    const tickers = Array.from({ length: 16 }, (_, i) => `TK${i}11`);
    const all = [...DONUT_PALETTE, ...Object.values(assignDonutColors(tickers))];
    for (const c of all) {
      expect(contrastRatio(c, '#FFFFFF')).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c, '#1C1E20')).toBeGreaterThanOrEqual(3);
    }
  });
});
