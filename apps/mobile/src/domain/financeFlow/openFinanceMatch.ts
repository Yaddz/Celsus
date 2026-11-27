import type { FinEntry } from '../../db/schema';

export interface OpenFinanceInvestmentOutflowParams {
  accountId: string;
  amountCents: number;
  tradeDate: string;
  brokerAccountId?: string | null;
}

function diffDaysUtc(entryDate: string, tradeDate: string): number {
  const [ey, em, ed] = entryDate.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = tradeDate.slice(0, 10).split('-').map(Number);
  if (!ey || !em || !ed || !ty || !tm || !td) return Infinity;
  const eUtc = Date.UTC(ey, em - 1, ed);
  const tUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((eUtc - tUtc) / 86_400_000);
}

/**
 * R40 (Sprint 114 P3b): casa compra em conta corrente com saída de Open Finance
 * (transfer_out ou expense com of_class_reason = 'INVESTMENT_MOVE') ainda não vinculada.
 * Janela: [tradeDate - 5d, tradeDate + 2d]; tolerância: max(R$ 0,01, 0,5%).
 * Em caso de múltiplos candidatos, escolhe o de data mais próxima.
 */
export function matchOpenFinanceInvestmentOutflow(
  entries: FinEntry[],
  params: OpenFinanceInvestmentOutflowParams
): FinEntry | null {
  const linkedBrokerGroupIds = new Set<string>();
  for (const e of entries) {
    if (
      e.kind === 'transfer_in' &&
      e.transfer_group_id &&
      (!params.brokerAccountId || e.account_id === params.brokerAccountId)
    ) {
      linkedBrokerGroupIds.add(e.transfer_group_id);
    }
  }

  const tolerance = Math.max(1, Math.round(Math.abs(params.amountCents) * 0.005));
  const candidates: Array<{ entry: FinEntry; absDays: number; absAmountDiff: number }> = [];

  for (const e of entries) {
    if (e.of_removed_at) continue;
    if (e.source !== 'OPEN_FINANCE') continue;
    if (e.account_id !== params.accountId) continue;
    if (e.linked_transaction_id) continue;
    if (e.transfer_group_id && linkedBrokerGroupIds.has(e.transfer_group_id)) continue;

    const isOutflow =
      e.kind === 'transfer_out' ||
      (e.kind === 'expense' && e.of_class_reason === 'INVESTMENT_MOVE');
    if (!isOutflow) continue;

    const dDays = diffDaysUtc(e.due_date, params.tradeDate);
    if (dDays < -5 || dDays > 2) continue;

    const entryCents =
      e.status === 'paid' ? (e.paid_amount_cents ?? e.amount_cents) : e.amount_cents;
    const amountDiff = Math.abs(entryCents - params.amountCents);
    if (amountDiff > tolerance) continue;

    candidates.push({
      entry: e,
      absDays: Math.abs(dDays),
      absAmountDiff: amountDiff,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.absDays - b.absDays || a.absAmountDiff - b.absAmountDiff);
  return candidates[0].entry;
}

export interface AppInvestmentTransferOutParams {
  accountId: string;
  amountCents: number;
  entryDate: string;
}

/**
 * V6 (Sprint 115): Casamento no sentido inverso, na sincronização.
 * Procura na mesma conta um `transfer_out` criado pelo app (`MANUAL`, com `linked_transaction_id`
 * e `transfer_group_id`) dentro da tolerância `max(1c, 0,5%)` e data do banco entre -2 e +10 dias
 * da data do lançamento do app (`entryDate - appDate` ∈ [-2, +10]).
 * Em caso de múltiplos candidatos, escolhe o de data mais próxima.
 */
export function matchAppInvestmentTransferOut(
  entries: FinEntry[],
  params: AppInvestmentTransferOutParams
): FinEntry | null {
  const transferInGroupIds = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'transfer_in' && e.transfer_group_id) {
      transferInGroupIds.add(e.transfer_group_id);
    }
  }

  const tolerance = Math.max(1, Math.round(Math.abs(params.amountCents) * 0.005));
  const candidates: Array<{ entry: FinEntry; absDays: number; absAmountDiff: number }> = [];

  for (const e of entries) {
    if (e.of_removed_at) continue;
    if (e.source === 'OPEN_FINANCE') continue;
    if (e.account_id !== params.accountId) continue;
    if (e.kind !== 'transfer_out') continue;
    if (!e.linked_transaction_id || !e.transfer_group_id) continue;
    if (!transferInGroupIds.has(e.transfer_group_id)) continue;

    const dDays = diffDaysUtc(params.entryDate, e.due_date);
    if (dDays < -2 || dDays > 10) continue;

    const entryCents =
      e.status === 'paid' ? (e.paid_amount_cents ?? e.amount_cents) : e.amount_cents;
    const amountDiff = Math.abs(entryCents - params.amountCents);
    if (amountDiff > tolerance) continue;

    candidates.push({
      entry: e,
      absDays: Math.abs(dDays),
      absAmountDiff: amountDiff,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.absDays - b.absDays || a.absAmountDiff - b.absAmountDiff);
  return candidates[0].entry;
}
