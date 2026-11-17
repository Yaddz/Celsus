import type { Portfolio } from '../../db/schema';
import type { PluggyInvestment } from './types';

export function resolveBrokerDisplayName(
  _itemId: string,
  _connectorName?: string | null,
  _firstInvestment?: Pick<PluggyInvestment, 'institution'> | null
): string {
  throw new Error('Not implemented (Sprint 73 Phase A stub)');
}

export async function ensurePortfolioForItem(
  _itemId: string,
  _connectorName?: string | null,
  _firstInvestment?: Pick<PluggyInvestment, 'institution'> | null
): Promise<{ portfolio: Portfolio; created: boolean }> {
  throw new Error('Not implemented (Sprint 73 Phase A stub)');
}
