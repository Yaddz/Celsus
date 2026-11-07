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
 * Arredonda a 2 casas pelo método do maior resto: a soma fecha exatamente em `total` (2 casas),
 * ninguém fica negativo e nenhum item (como o último) absorve sozinho o erro de arredondamento.
 */
export function roundSharesLargestRemainder(raw: Decimal[], total: Decimal): number[] {
  const totalCents = Math.max(0, total.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
  const floors = raw.map((r) => Decimal.max(0, r).mul(100).floor());
  const rema = raw.map((r, i) => Decimal.max(0, r).mul(100).minus(floors[i]));
  let left = totalCents - floors.reduce((a, f) => a + f.toNumber(), 0);
  const cents = floors.map((f) => f.toNumber());
  const order = rema.map((r, i) => ({ r, i })).sort((x, y) => y.r.comparedTo(x.r) || x.i - y.i);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) cents[order[k].i] += 1;
  for (let k = order.length - 1; left < 0 && order.length > 0; k = (k - 1 + order.length) % order.length) {
    if (cents[order[k].i] > 0) {
      cents[order[k].i] -= 1;
      left++;
    }
  }
  return cents.map((c) => c / 100);
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

  const raws = otherUnlocked.map((item) =>
    otherUnlockedSum.gt(0)
      ? new Decimal(item.percentage || 0).div(otherUnlockedSum).mul(remaining)
      : remaining.div(otherUnlocked.length)
  );
  const shares = roundSharesLargestRemainder(raws, remaining);
  const shareById = new Map(otherUnlocked.map((item, idx) => [item.id, shares[idx]]));

  return items.map((item) => {
    if (item.id === changedId) return { ...item, percentage: clampedNewVal };
    if (item.isLocked) return item;
    return { ...item, percentage: shareById.get(item.id) ?? 0 };
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

  const raws = unlockedItems.map((item) => {
    const weight = item.weight !== undefined ? item.weight : 1;
    return unlockedWeightSum.gt(0)
      ? new Decimal(weight).div(unlockedWeightSum).mul(availablePercentage)
      : availablePercentage.div(unlockedItems.length);
  });
  const shares = roundSharesLargestRemainder(raws, availablePercentage);
  const shareById = new Map(unlockedItems.map((item, idx) => [item.id, shares[idx]]));
  return items.map((item) => (item.isLocked ? item : { ...item, percentage: shareById.get(item.id) ?? 0 }));
}

/**
 * Reescala as metas (%) para fechar exatamente 100%, mantendo a proporção entre elas e preservando
 * valores quebrados (2 casas). O último item absorve a diferença de arredondamento.
 */
export function normalizeTargetsToHundred<T extends { id: string; percentage: number }>(items: T[]): T[] {
  if (!items || items.length === 0) return [];
  const total = items.reduce((acc, i) => acc.plus(i.percentage || 0), new Decimal(0));
  const raws = items.map((i) => (total.gt(0) ? new Decimal(i.percentage || 0).div(total).mul(100) : new Decimal(100).div(items.length)));
  const shares = roundSharesLargestRemainder(raws, new Decimal(100));
  return items.map((item, idx) => ({ ...item, percentage: shares[idx] }));
}
