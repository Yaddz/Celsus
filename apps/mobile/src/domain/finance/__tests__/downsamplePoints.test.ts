import { downsamplePoints } from '../assetProfile';

const series = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, close: 10 + i }));

describe('downsamplePoints', () => {
  it('séries curtas ficam intactas', () => {
    const s = series(21);
    expect(downsamplePoints(s, 64)).toBe(s);
  });
  it('1A/5A são reduzidas ao máximo de barras e mantêm o último ponto', () => {
    for (const n of [128, 247, 1247]) {
      const s = series(n);
      const out = downsamplePoints(s, 64);
      expect(out).toHaveLength(64);
      expect(out[63]).toEqual(s[n - 1]);
    }
  });
  it('preserva a tendência (média por faixa é crescente numa série crescente)', () => {
    const out = downsamplePoints(series(1247), 64);
    for (let i = 1; i < out.length; i++) expect(out[i].close).toBeGreaterThanOrEqual(out[i - 1].close);
  });
});
