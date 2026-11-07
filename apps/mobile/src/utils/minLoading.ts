/** Tempo mínimo em que o skeleton fica visível ao trocar de carteira (evita um "piscar" de poucos ms). */
export const MIN_SKELETON_MS = 220;

/** Aguarda o que falta para completar `minMs` desde `startedAt` (não espera se já passou). */
export async function waitRemaining(startedAt: number, minMs: number = MIN_SKELETON_MS): Promise<void> {
  const rest = minMs - (Date.now() - startedAt);
  if (rest > 0) await new Promise<void>((resolve) => setTimeout(resolve, rest));
}
