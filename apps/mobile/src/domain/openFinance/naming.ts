import type {
  PluggyAccount,
  PluggyInvestment,
  PluggyTransaction,
} from '../../services/pluggy/types';

export interface InvestmentDisplay {
  ticker: string;
  name: string;
}

export function buildInvestmentDisplay(
  _inv: PluggyInvestment,
  _existingTickers?: Set<string>
): InvestmentDisplay {
  throw new Error('Not implemented (Sprint 71 Phase A stub)');
}

export function buildAccountName(
  _account: PluggyAccount,
  _connectorName?: string | null
): string {
  throw new Error('Not implemented (Sprint 71 Phase A stub)');
}

export function cleanTransactionDescription(
  _tx: Pick<PluggyTransaction, 'description' | 'descriptionRaw'> | string
): string {
  throw new Error('Not implemented (Sprint 71 Phase A stub)');
}
