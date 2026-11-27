import type { FinAccount } from '../../db/schema';

export interface DefaultCashSourceAccount extends Pick<FinAccount, 'id' | 'name' | 'type'> {
  balanceCents: number;
}

export interface ResolveDefaultCashSourceInput {
  brokerAccountId: string | null;
  brokerBalanceCents: number;
  totalCents: number;
  accounts: DefaultCashSourceAccount[];
}

export interface ResolveDefaultCashSourceResult {
  accountId: string | null;
  projectedBalanceCents: number;
  willBeNegative: boolean;
}

/**
 * V3a: Extrai a regra de origem padrão da compra (TransactionScreen e SimulatorScreen).
 */
export function resolveDefaultCashSource(
  _input: ResolveDefaultCashSourceInput
): ResolveDefaultCashSourceResult {
  return {
    accountId: null,
    projectedBalanceCents: 0,
    willBeNegative: false,
  };
}
