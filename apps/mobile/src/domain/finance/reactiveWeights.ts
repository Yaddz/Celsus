import Decimal from 'decimal.js';

export interface LockableAllocationItem {
  id: string;
  percentage: number;
  weight?: number;
  isLocked?: boolean;
  [key: string]: any;
}

/**
 * Recalcula as porcentagens dos itens destravados de forma proporcional
 * quando um item específico é alterado, mantendo rigorosamente itens travados
 * e garantindo que a soma final de todos os itens totalize exatamente 100%.
 *
 * Regras da SPEC (Módulo 4):
 * - Seja L = soma das porcentagens dos itens travados (isLocked = true).
 * - O valor desejado vi é limitado ao teto disponível: vi = max(0, min(100 - L, vi)).
 * - O restante R = 100 - L - vi é redistribuído proporcionalmente entre os demais
 *   itens destravados (j != i, j not in locked).
 * - Se todos os demais destravados estiverem com 0%, R é dividido igualmente entre eles.
 * - Itens com cadeado (isLocked = true) permanecem estritamente inalterados.
 */
export function recalculateUnlockedTargets<T extends LockableAllocationItem>(
  items: T[],
  changedId: string,
  newPercentage: number
): T[] {
  // Stub inicial para Fase A (TDD Red Phase)
  return items.map((item) =>
    item.id === changedId ? { ...item, percentage: newPercentage } : item
  );
}

/**
 * Converte pesos numéricos relativos (ex.: 2, 1, 1) em porcentagens proporcionais
 * respeitando as porcentagens congeladas dos itens travados (isLocked: true),
 * garantindo soma final exata de 100%.
 *
 * Regras da SPEC (Módulo 4 e 5):
 * - Seja L = soma das porcentagens dos itens travados.
 * - Espaço disponível para destravados = 100 - L.
 * - Cada item destravado j recebe: (weight_j / soma_pesos_destravados) * (100 - L).
 * - Se a soma dos pesos destravados for 0, divide igualmente.
 */
export function convertWeightsToPercentagesWithLocks<T extends LockableAllocationItem>(
  items: T[]
): T[] {
  // Stub inicial para Fase A (TDD Red Phase)
  return items;
}
