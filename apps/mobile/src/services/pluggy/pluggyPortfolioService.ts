import type { Portfolio } from '../../db/schema';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import type { PluggyAccount, PluggyInvestment } from './types';
import { isGenericInstitutionName, resolveInstitutionName } from '../../domain/openFinance/institutions';

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
  firstInvestment?: Pick<PluggyInvestment, 'institution'> | null,
  accounts?: Array<Pick<PluggyAccount, 'bankData'>> | null
): string {
  const resolved = resolveInstitutionName({
    connectorName: isGenericConnectorName(connectorName, itemId) ? null : connectorName,
    investments: firstInvestment ? [firstInvestment] : [],
    accounts: accounts ?? [],
  });
  if (resolved && !isGenericConnectorName(resolved, itemId)) {
    return resolved;
  }
  return `Corretora ${itemId.slice(-4)}`;
}

/** Nome automático que o app dá quando não conhece a corretora (não foi escolhido pelo usuário). */
function isAutoGenericPortfolioName(name: string, itemId: string): boolean {
  const trimmed = name.trim();
  return trimmed === `Corretora ${itemId.slice(-4)}` || isGenericInstitutionName(trimmed);
}

export async function ensurePortfolioForItem(
  itemId: string,
  connectorName?: string | null,
  firstInvestment?: Pick<PluggyInvestment, 'institution'> | null,
  accounts?: Array<Pick<PluggyAccount, 'bankData'>> | null
): Promise<{ portfolio: Portfolio; created: boolean }> {
  const allPortfolios = await portfolioRepository.listPortfolios(true);
  const brokerName = resolveBrokerDisplayName(itemId, connectorName, firstInvestment, accounts);

  // (a) Carteira já vinculada por of_item_id
  let byItem = allPortfolios.find((p) => p.of_item_id === itemId);
  // Sprint 96: nome automático genérico ("Corretora d2f7") passa a ser o da corretora quando ela é conhecida
  if (
    byItem &&
    isAutoGenericPortfolioName(byItem.name, itemId) &&
    !isAutoGenericPortfolioName(brokerName, itemId)
  ) {
    await portfolioRepository.updatePortfolio(byItem.id, { name: brokerName });
    byItem = { ...byItem, name: brokerName };
  }
  if (byItem) {
    if (byItem.is_archived === 1) {
      await portfolioRepository.updatePortfolio(byItem.id, { is_archived: 0 });
      const refreshed = await portfolioRepository.getPortfolioById(byItem.id);
      return { portfolio: refreshed ?? { ...byItem, is_archived: 0 }, created: false };
    }
    return { portfolio: byItem, created: false };
  }

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

  // (c) Cria carteira nova para a corretora + conta corretora par (R39)
  const docketCode = `REV-CART-${String(allPortfolios.length + 1).padStart(3, '0')}`;
  const created = await portfolioRepository.createPortfolio({
    name: brokerName,
    description: 'Sincronizada pelo Open Finance',
    docket_code: docketCode,
    of_item_id: itemId,
  });
  const brokerAccount = await finRepository.createAccount({
    name: brokerName,
    type: 'broker',
    initialBalanceCents: 0,
  });
  const linked = await portfolioRepository.linkFinAccount(created.id, brokerAccount.id);
  return { portfolio: linked ?? { ...created, fin_account_id: brokerAccount.id }, created: true };
}
