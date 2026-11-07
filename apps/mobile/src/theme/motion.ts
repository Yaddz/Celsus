/**
 * Tokens de animação compartilhados ("jelly"). Todo o app deve importar daqui em
 * vez de espalhar números mágicos, para manter a sensação elástica consistente e
 * permitir ajuste fino em um único lugar.
 *
 * As molas usam `stiffness / damping / mass` (Animated.spring) com
 * `useNativeDriver: true`, então rodam na thread de UI (apenas transform/opacity).
 *
 * Razão de amortecimento ζ = damping / (2·√(stiffness·mass)); ζ=1 não tem overshoot.
 * Versão anterior → atual (mais calma):
 *   jelly  320/11/0.9 (ζ≈0.32, overshoot ≈35%) → 170/16/1.0 (ζ≈0.61, ≈9%)
 *   soft   220/17/1.0 (ζ≈0.57)                 → 150/18/1.0 (ζ≈0.74)
 *   snappy 480/26/0.8 (ζ≈0.66)                 → 300/24/0.9 (ζ≈0.73)
 */
export const springs = {
  /** Elástica com leve overshoot: pílula da navbar, botões, itens do menu. */
  jelly: { stiffness: 170, damping: 16, mass: 1 },
  /** Elástica discreta: ícones deslizando, cards e linhas. */
  soft: { stiffness: 150, damping: 18, mass: 1 },
  /** Resposta rápida sem sobra: retorno após o toque. */
  snappy: { stiffness: 300, damping: 24, mass: 0.9 },
} as const;

/** Anterior: fast 110 / base 200 / slow 320 / rotate 220. */
export const durations = {
  fast: 160,
  base: 280,
  slow: 420,
  /** Giro do ícone + (vira ×). */
  rotate: 300,
  /** Atraso entre itens do menu em cascata. */
  stagger: 80,
  /** Duração das transições simples usadas quando "reduzir movimento" está ativo. */
  reduced: 140,
} as const;

/** Squash & stretch ao tocar: X e Y levemente opostos. Anterior: 1.05/.92, 1.025/.955, 1.01/.985. */
export const press = {
  strong: { scaleX: 1.025, scaleY: 0.96 },
  medium: { scaleX: 1.012, scaleY: 0.975 },
  subtle: { scaleX: 1.005, scaleY: 0.992 },
} as const;

/** Deformação da pílula da navbar proporcional à distância. Anterior: gain .9, max 1.38, minY .8. */
export const pillStretch = {
  /** scaleX extra por unidade de distância normalizada (0..1 da largura da barra). */
  gain: 0.45,
  maxScaleX: 1.18,
  minScaleY: 0.92,
} as const;

export type SpringToken = keyof typeof springs;
export type PressToken = keyof typeof press;
