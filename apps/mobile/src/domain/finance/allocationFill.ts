const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/**
 * Preenchimento (0–100) do bento "Alocação por categoria": a participação real da classe na carteira,
 * com teto visual de 100. Antes era atual ÷ meta com teto em 100%, o que fazia uma classe com 85% e
 * meta de 30% aparecer 100% cheia, escondendo o valor real. A meta não aparece no bloco.
 */
export function calculateAllocationFill(currentPercentage: number): number {
  return clamp(currentPercentage);
}
