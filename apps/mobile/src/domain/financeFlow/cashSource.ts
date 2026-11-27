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
 * V3a: Regra única de origem padrão de compra (TransactionScreen e SimulatorScreen).
 * Se a corretora vinculada cobre o total da compra (ou total <= 0), usa a corretora;
 * senão, escolhe a conta checking/cash com maior saldo e sinaliza se ficará negativa.
 */
export function resolveDefaultCashSource(
  input: ResolveDefaultCashSourceInput
): ResolveDefaultCashSourceResult {
  const { brokerAccountId, brokerBalanceCents, totalCents, accounts } = input;
  if (!brokerAccountId || accounts.length === 0) {
    return { accountId: brokerAccountId, projectedBalanceCents: 0, willBeNegative: false };
  }

  if (totalCents <= 0 || brokerBalanceCents >= totalCents) {
    const projected = brokerBalanceCents - Math.max(0, totalCents);
    return {
      accountId: brokerAccountId,
      projectedBalanceCents: projected,
      willBeNegative: projected < 0,
    };
  }

  const nonBroker = accounts.filter(
    (a) => a.id !== brokerAccountId && (a.type === 'checking' || a.type === 'cash')
  );
  if (nonBroker.length === 0) {
    const projected = brokerBalanceCents - totalCents;
    return {
      accountId: brokerAccountId,
      projectedBalanceCents: projected,
      willBeNegative: projected < 0,
    };
  }

  let best = nonBroker[0];
  for (let i = 1; i < nonBroker.length; i++) {
    if (nonBroker[i].balanceCents > best.balanceCents) {
      best = nonBroker[i];
    }
  }
  const projected = best.balanceCents - totalCents;
  return {
    accountId: best.id,
    projectedBalanceCents: projected,
    willBeNegative: projected < 0,
  };
}
