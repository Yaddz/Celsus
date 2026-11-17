import { THEME_COLORS } from '../palettes';
import { getFinUiColors } from '../../screens/finance/finTheme';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6);
  const num = Number.parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Sprint 79 — Papéis semânticos do tema e contraste WCAG', () => {
  it('S79-T01: THEME_COLORS expõe papéis semânticos completos nos modos dark e light', () => {
    const requiredKeys = [
      'background',
      'surface',
      'surfaceContainer',
      'surfaceInset',
      'onSurface',
      'muted',
      'border',
      'accent',
      'onAccent',
      'primaryButtonBg',
      'onPrimaryButton',
      'success',
      'warning',
      'error',
    ] as const;

    for (const mode of ['dark', 'light'] as const) {
      const palette = THEME_COLORS[mode] as unknown as Record<string, string>;
      for (const key of requiredKeys) {
        expect(typeof palette[key]).toBe('string');
        expect(palette[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('S79-T02: pares texto/fundo de THEME_COLORS e getFinUiColors atingem razão mínima de 4,5:1', () => {
    for (const mode of ['dark', 'light'] as const) {
      const t = THEME_COLORS[mode] as unknown as Record<string, string>;
      expect(contrastRatio(t.onSurface, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.onSurface, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.onPrimaryButton, t.primaryButtonBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.success, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.warning, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.error, t.surface)).toBeGreaterThanOrEqual(4.5);

      const f = getFinUiColors(mode) as unknown as Record<string, string>;
      expect(contrastRatio(f.text, f.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.text, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.muted, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.primaryFg, f.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.income, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.expense, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.success, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.warning, f.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(f.error, f.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
