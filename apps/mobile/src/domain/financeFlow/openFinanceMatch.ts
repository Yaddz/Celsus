import type { FinEntry } from '../../db/schema';

export interface OpenFinanceInvestmentOutflowParams {
  accountId: string;
  amountCents: number;
  tradeDate: string;
  brokerAccountId?: string | null;
}

/**
 * R40 (Sprint 114 P3b): casa compra em conta corrente com saída de Open Finance
 * (transfer_out ou expense com of_class_reason = 'INVESTMENT_MOVE') ainda não vinculada.
 */
export function matchOpenFinanceInvestmentOutflow(
  _entries: FinEntry[],
  _params: OpenFinanceInvestmentOutflowParams
): FinEntry | null {
  return null;
}
