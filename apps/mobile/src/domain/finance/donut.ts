/**
 * Donut por ativo: cores estáveis por ticker, percentuais que fecham 100% e divisão exata do anel.
 */

/** Anel dividido em segmentos (cada fatia ocupa um número inteiro deles). */
export const DONUT_TOTAL_SEGMENTS = 144;

/**
 * Paleta com a mesma luminância relativa (~0,21): contraste ≈ 4:1 contra o card branco (tema claro)
 * e ≈ 4,1:1 contra o card escuro #1C1E20 (tema escuro), acima dos 3:1 exigidos para gráficos.
 */
export const DONUT_PALETTE = [
  '#DE4C36',
  '#3386B0',
  '#A0781A',
  '#2A904C',
  '#A958E4',
  '#CD528F',
  '#178D84',
  '#5F76E5',
  '#6F8727',
  '#C946C9',
];

const TARGET_LUMINANCE = 0.21;

export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`.toUpperCase();
}

/** Cor extra (além da paleta) com a mesma luminância, por ângulo áureo. */
function generatedColor(index: number): string {
  const hue = (index * 137.508) % 360;
  let lo = 0.05;
  let hi = 0.95;
  let hex = '#888888';
  for (let i = 0; i < 24; i++) {
    const l = (lo + hi) / 2;
    hex = hslToHex(hue, 0.62, l);
    if (relativeLuminance(hex) < TARGET_LUMINANCE) lo = l;
    else hi = l;
  }
  return hex;
}

function hashTicker(ticker: string): number {
  let h = 2166136261;
  for (let i = 0; i < ticker.length; i++) {
    h ^= ticker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Cor de cada ativo, determinística: não depende da ordem em que os ativos chegam nem de valores.
 * Os tickers são tratados em ordem alfabética; cada um parte do índice dado pelo hash do ticker e
 * avança até a primeira cor livre, então cores nunca se repetem enquanto couberem na paleta.
 */
export function assignDonutColors(tickers: string[]): Record<string, string> {
  const unique = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).sort();
  const taken = new Set<number>();
  const out: Record<string, string> = {};
  let extra = 0;
  for (const t of unique) {
    if (taken.size >= DONUT_PALETTE.length) {
      out[t] = generatedColor(extra++);
      continue;
    }
    let idx = hashTicker(t) % DONUT_PALETTE.length;
    while (taken.has(idx)) idx = (idx + 1) % DONUT_PALETTE.length;
    taken.add(idx);
    out[t] = DONUT_PALETTE[idx];
  }
  return out;
}

/** Distribui `total` unidades pelos pesos (maior resto); soma exata e 1 unidade mínima para peso > 0. */
function largestRemainder(weights: number[], total: number, minOne: boolean): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const base = exact.map((x, i) => (minOne && weights[i] > 0 ? Math.max(1, Math.floor(x)) : Math.floor(x)));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) base[order[k].i]++;
  // Excesso por causa do mínimo de 1: tira das maiores fatias.
  while (left < 0) {
    const j = base.indexOf(Math.max(...base));
    base[j]--;
    left++;
  }
  return base;
}

export interface DonutSliceInput {
  ticker: string;
  /** Peso da fatia (valor ou % de alocação); só a proporção importa. */
  weight: number;
}

export interface DonutSlice {
  ticker: string;
  /** Percentual da categoria com 1 casa; a soma de todas as fatias é exatamente 100,0. */
  percent: number;
  color: string;
  /** Quantos segmentos do anel esta fatia ocupa, e onde começa. */
  segments: number;
  startSegment: number;
}

export function buildDonutSlices(assets: DonutSliceInput[]): DonutSlice[] {
  if (assets.length === 0) return [];
  const positive = assets.some((a) => a.weight > 0);
  // Sem nenhum peso informado, divide por igual para o anel nunca ficar vazio com ativos presentes.
  const weights = assets.map((a) => (positive ? Math.max(0, a.weight || 0) : 1));
  const colors = assignDonutColors(assets.map((a) => a.ticker));
  const tenths = largestRemainder(weights, 1000, false);
  const segs = largestRemainder(weights, DONUT_TOTAL_SEGMENTS, true);
  let start = 0;
  return assets.map((a, i) => {
    const slice: DonutSlice = {
      ticker: a.ticker,
      percent: tenths[i] / 10,
      color: colors[a.ticker.toUpperCase()],
      segments: segs[i],
      startSegment: start,
    };
    start += segs[i];
    return slice;
  });
}
