import type { FinAccount, FinEntry } from '../../db/schema';

/**
 * Sprint 116 (W1/W2) — dinheiro real da corretora via Open Finance.
 * STUBS da Fase A: assinaturas finais, comportamento ainda não implementado.
 */

/** W1a: conta vinculada gerida pelo app (o app lança o dinheiro). Conta Open Finance: o extrato manda. */
export function isAppManagedCashAccount(
  _account: Pick<FinAccount, 'source'> | null | undefined
): boolean {
  return true;
}

/** W2c: aplicação/resgate automático de conta remunerada (não é aporte nem despesa). */
export function isAutomaticSweep(_description: string | null | undefined): boolean {
  return false;
}

/** W1b: liquidação de pregão no extrato ("OPERAÇÕES EM BOLSA", "LIQ BOLSA - VISTA BRUTO"). */
export function isBrokerSettlementDescription(_description: string | null | undefined): boolean {
  return false;
}

export interface BrokerSettlementMatchParams {
  accountId: string;
  /** Data do pregão (YYYY-MM-DD). */
  tradeDate: string;
  /** Σ compras − Σ vendas manuais do pregão na carteira, em centavos (>0 saída, <0 crédito). */
  netCents: number;
}

/** W1b: procura a liquidação OF do pregão entre a data e +4 dias úteis. */
export function matchBrokerSettlement(
  _entries: FinEntry[],
  _params: BrokerSettlementMatchParams
): FinEntry | null {
  return null;
}
