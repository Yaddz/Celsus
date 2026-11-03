import Decimal from 'decimal.js';

export interface LockableAllocationItem {
  id: string;
  percentage: number;
  weight?: number;
  isLocked?: boolean;
  [key: string]: any;
}

/**
 * Arredonda para no máximo 2 casas decimais sem dízimas periódicas estranhas.
 */
function roundToTwo(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Recalcula as porcentagens dos itens destravados de forma proporcional
 * quando um item específico é alterado, mantendo rigorosamente itens travados
 * e garantindo que a soma final de todos os itens totalize exatamente 100%.
 *
 * Regras da SPEC (Módulo 4):
 * - Seja L = soma das porcentagens dos itens travados (isLocked = true, exceto o item alterado).
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
  if (!items || items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...items[0], percentage: 100 }];
  }

  // 1. Soma dos itens travados (exceto o próprio item alterado se ele estiver travado)
  const lockedItems = items.filter((i) => i.isLocked && i.id !== changedId);
  const lockedSum = lockedItems.reduce((acc, curr) => acc.plus(curr.percentage || 0), new Decimal(0));
  const lockedSumNum = lockedSum.toNumber();

  // 2. Limitar o novo valor ao teto disponível: 0 <= vi <= 100 - L
  const maxAvailable = Math.max(0, 100 - lockedSumNum);
  const clampedNewVal = Math.max(0, Math.min(maxAvailable, newPercentage));

  // 3. Resíduo a ser distribuído entre os demais itens destravados
  const remaining = new Decimal(100).minus(lockedSum).minus(clampedNewVal);

  const otherUnlocked = items.filter((i) => !i.isLocked && i.id !== changedId);

  if (otherUnlocked.length === 0) {
    // Se não há outros destravados, o item alterado assume o que resta
    return items.map((item) => {
      if (item.id === changedId) {
        return { ...item, percentage: clampedNewVal };
      }
      return item;
    });
  }

  // 4. Soma prévia das porcentagens dos demais itens destravados
  const otherUnlockedSum = otherUnlocked.reduce(
    (acc, curr) => acc.plus(curr.percentage || 0),
    new Decimal(0)
  );

  const lastUnlockedId = otherUnlocked[otherUnlocked.length - 1]?.id;
  let distributedSum = new Decimal(0);

  const intermediate = items.map((item) => {
    if (item.id === changedId) {
      return { ...item, percentage: clampedNewVal };
    }
    if (item.isLocked) {
      return item;
    }
    if (item.id === lastUnlockedId) {
      return item;
    }

    // Item destravado: redistribuição proporcional
    let newPercent: number;
    if (otherUnlockedSum.gt(0)) {
      newPercent = new Decimal(item.percentage || 0)
        .div(otherUnlockedSum)
        .mul(remaining)
        .toNumber();
    } else {
      // Se todos os outros estavam com 0%, divide igualmente o resíduo
      newPercent = remaining.div(otherUnlocked.length).toNumber();
    }

    const rounded = roundToTwo(newPercent);
    distributedSum = distributedSum.plus(rounded);
    return {
      ...item,
      percentage: rounded,
    };
  });

  return intermediate.map((item) => {
    if (item.id === lastUnlockedId) {
      const targetForLast = remaining.minus(distributedSum).toNumber();
      return {
        ...item,
        percentage: roundToTwo(targetForLast),
      };
    }
    return item;
  });
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
  if (!items || items.length === 0) return [];

  const lockedItems = items.filter((i) => i.isLocked);
  const lockedSum = lockedItems.reduce((acc, curr) => acc.plus(curr.percentage || 0), new Decimal(0));
  const availablePercentage = new Decimal(100).minus(lockedSum);

  const unlockedItems = items.filter((i) => !i.isLocked);
  if (unlockedItems.length === 0) {
    return items;
  }

  const unlockedWeightSum = unlockedItems.reduce(
    (acc, curr) => acc.plus(curr.weight !== undefined ? curr.weight : 1),
    new Decimal(0)
  );

  return items.map((item) => {
    if (item.isLocked) {
      return item;
    }

    const weight = item.weight !== undefined ? item.weight : 1;
    let newPercent: number;
    if (unlockedWeightSum.gt(0)) {
      newPercent = new Decimal(weight)
        .div(unlockedWeightSum)
        .mul(availablePercentage)
        .toNumber();
    } else {
      newPercent = availablePercentage.div(unlockedItems.length).toNumber();
    }

    return {
      ...item,
      percentage: roundToTwo(newPercent),
    };
  });
}
