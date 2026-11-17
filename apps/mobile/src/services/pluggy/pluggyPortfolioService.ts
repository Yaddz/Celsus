import type { Portfolio } from '../../db/schema';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import type { PluggyInvestment } from './types';

function normalizeBrokerKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericConnectorName(name: string | null | undefined, itemId: string): boolean {
  const trimmed = (name || '').trim();
  if (!trimmed) return true;
  if (trimmed === itemId) return true;
  if (trimmed.toLowerCase() === 'meupluggy') return true;
  return false;
}

export function resolveBrokerDisplayName(
  itemId: string,
  connectorName?: string | null,
  firstInvestment?: Pick<PluggyInvestment, 'institution'> | null
): string {
  const instName = firstInvestment?.institution?.name?.trim();
  if (instName && !isGenericConnectorName(instName, itemId)) {
    return instName;
  }
  if (!isGenericConnectorName(connectorName, itemId)) {
    return connectorName!.trim();
  }
  return `Corretora ${itemId.slice(-4)}`;
}

export async function ensurePortfolioForItem(
  itemId: string,
  connectorName?: string | null,
  firstInvestment?: Pick<PluggyInvestment, 'institution'> | null
): Promise<{ portfolio: Portfolio; created: boolean }> {
  const allPortfolios = await portfolioRepository.listPortfolios(true);

  // (a) Carteira já vinculada por of_item_id
  const byItem = allPortfolios.find((p) => p.of_item_id === itemId);
  if (byItem) {
    if (byItem.is_archived === 1) {
      await portfolioRepository.updatePortfolio(byItem.id, { is_archived: 0 });
      const refreshed = await portfolioRepository.getPortfolioById(byItem.id);
      return { portfolio: refreshed ?? { ...byItem, is_archived: 0 }, created: false };
    }
    return { portfolio: byItem, created: false };
  }

  const brokerName = resolveBrokerDisplayName(itemId, connectorName, firstInvestment);
  const normBroker = normalizeBrokerKey(brokerName);

  // (b) Carteira manual não vinculada com mesmo nome normalizado
  const byName = allPortfolios.find(
    (p) => !p.of_item_id && normalizeBrokerKey(p.name) === normBroker
  );
  if (byName) {
    await portfolioRepository.updatePortfolio(byName.id, {
      of_item_id: itemId,
      ...(byName.is_archived === 1 ? { is_archived: 0 } : {}),
    });
    const refreshed = await portfolioRepository.getPortfolioById(byName.id);
    return {
      portfolio: refreshed ?? { ...byName, of_item_id: itemId, is_archived: 0 },
      created: false,
    };
  }

  // (c) Cria carteira nova para a corretora
  const docketCode = `REV-CART-${String(allPortfolios.length + 1).padStart(3, '0')}`;
  const created = await portfolioRepository.createPortfolio({
    name: brokerName,
    description: 'Sincronizada pelo Open Finance',
    docket_code: docketCode,
    of_item_id: itemId,
  });
  return { portfolio: created, created: true };
}
