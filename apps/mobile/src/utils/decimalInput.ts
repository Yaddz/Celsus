/**
 * Entrada numérica decimal tolerante (pt-BR): aceita vírgula ou ponto e estados intermediários
 * de digitação ("12,", "0,5"). Nunca arredonda: preserva o valor exatamente como digitado.
 * Retorna null quando o texto é vazio ou inválido.
 */
export function parseDecimalInput(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (text == null) return null;
  const t = String(text).trim().replace(',', '.');
  if (t === '' || t === '.') return null;
  if (!/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Texto exibido no campo: vírgula decimal, até 2 casas, sem zeros à direita ("12,5", "13"). */
export function formatDecimalInput(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return '';
  const f = 10 ** maxDecimals;
  return String(Math.round((value + Number.EPSILON) * f) / f).replace('.', ',');
}
