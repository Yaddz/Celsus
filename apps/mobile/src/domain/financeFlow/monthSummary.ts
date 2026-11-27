import type { FinAccount, FinEntry } from '../../db/schema';
import { isStaleOpenFinancePending } from '../openFinance/stalePending';

export interface MonthSummaryR43 {
  yearMonth: string;
  incomeCents: number;
  dividendIncomeCents: number;
  expenseCents: number;
  contributionCents: number;
  netCents: number;
  savingsRatePercent: number | null;
  savingsRateLabel: string;
}

function entryRealCents(entry: FinEntry): number {
  return entry.status === 'paid'
    ? entry.paid_amount_cents ?? entry.amount_cents
    : entry.amount_cents;
}

/**
 * R43 — Mês em uma linha:
 * - Receitas: `income` + `investment_income` (destacando `dividendIncomeCents` como "dos quais proventos")
 * - Despesas: `expense` (exclui transferências e `investment_*`)
 * - Aportes: `transfer_out` para corretora + `investment_buy` sem transferência no mês - `investment_sell` resgatado para fora
 * - Sobra: receitas - despesas - aportes
 * - Taxa de poupança: (receitas - despesas) / receitas, ou "—" sem receita
 */
export function monthSummary(
  entries: FinEntry[],
  yearMonth: string,
  options?: { todayIso?: string; accounts?: Array<Pick<FinAccount, 'id' | 'type'>> }
): MonthSummaryR43 {
  const monthEntries = entries.filter((entry) => {
    if (entry.of_removed_at) return false;
    if (!entry.due_date.startsWith(yearMonth)) return false;
    if (options?.todayIso && isStaleOpenFinancePending(entry, options.todayIso)) return false;
    return true;
  });

  const brokerIds = new Set(
    (options?.accounts ?? []).filter((a) => a.type === 'broker').map((a) => a.id)
  );

  // Grupos de transferência cuja perna de entrada (transfer_in) caiu numa conta corretora
  const transferGroupsToBroker = new Set<string>();
  const buyTxIds = new Set<string>();
  const sellTxIds = new Set<string>();
  for (const e of monthEntries) {
    if (e.kind === 'transfer_in' && e.transfer_group_id && brokerIds.has(e.account_id)) {
      transferGroupsToBroker.add(e.transfer_group_id);
    }
    if (e.kind === 'investment_buy' && e.linked_transaction_id) {
      buyTxIds.add(e.linked_transaction_id);
    }
    if (e.kind === 'investment_sell' && e.linked_transaction_id) {
      sellTxIds.add(e.linked_transaction_id);
    }
  }

  const buyTxIdsCoveredByTransfer = new Set<string>();
  const sellTxIdsWithOutflowTransfer = new Set<string>();
  for (const e of monthEntries) {
    if (e.kind !== 'transfer_out') continue;
    const isToBroker =
      (e.transfer_group_id && transferGroupsToBroker.has(e.transfer_group_id)) ||
      e.of_class_reason === 'INVESTMENT_MOVE' ||
      (e.linked_transaction_id && buyTxIds.has(e.linked_transaction_id));
    if (isToBroker && e.linked_transaction_id) {
      buyTxIdsCoveredByTransfer.add(e.linked_transaction_id);
    }
    const isFromBroker =
      brokerIds.has(e.account_id) ||
      (e.linked_transaction_id && sellTxIds.has(e.linked_transaction_id));
    if (isFromBroker && e.linked_transaction_id) {
      sellTxIdsWithOutflowTransfer.add(e.linked_transaction_id);
    }
  }

  let incomeCents = 0;
  let dividendIncomeCents = 0;
  let expenseCents = 0;
  let contributionCents = 0;

  for (const entry of monthEntries) {
    if (entry.of_class_reason === 'CARD_DEBT_ROLLOVER') continue;
    const real = entryRealCents(entry);

    if (
      entry.kind === 'income' &&
      entry.of_class_reason === 'CARD_REFUND' &&
      entry.category_id !== 'cat-outros-receita'
    ) {
      expenseCents = Math.max(0, expenseCents - real);
      continue;
    }

    if (entry.kind === 'income') {
      incomeCents += real;
      if (entry.linked_income_id) {
        dividendIncomeCents += real;
      }
      continue;
    }

    if (entry.kind === 'investment_income') {
      incomeCents += real;
      dividendIncomeCents += real;
      continue;
    }

    if (entry.kind === 'expense') {
      expenseCents += real;
      continue;
    }

    if (entry.kind === 'transfer_out') {
      const isAporteTransfer =
        (entry.transfer_group_id && transferGroupsToBroker.has(entry.transfer_group_id)) ||
        entry.of_class_reason === 'INVESTMENT_MOVE' ||
        (entry.linked_transaction_id && buyTxIds.has(entry.linked_transaction_id));
      if (isAporteTransfer) {
        contributionCents += real;
      }
      continue;
    }

    if (entry.kind === 'investment_buy') {
      if (!entry.linked_transaction_id || !buyTxIdsCoveredByTransfer.has(entry.linked_transaction_id)) {
        contributionCents += real;
      }
      continue;
    }

    if (entry.kind === 'investment_sell') {
      if (entry.linked_transaction_id && sellTxIdsWithOutflowTransfer.has(entry.linked_transaction_id)) {
        contributionCents -= real;
      }
    }
  }

  const netCents = incomeCents - expenseCents - contributionCents;
  const savingsRatePercent =
    incomeCents > 0
      ? Math.round(((incomeCents - expenseCents) / incomeCents) * 1000) / 10
      : null;
  const savingsRateLabel =
    savingsRatePercent !== null ? `${savingsRatePercent.toFixed(1).replace('.', ',')}%` : '—';

  return {
    yearMonth,
    incomeCents,
    dividendIncomeCents,
    expenseCents,
    contributionCents,
    netCents,
    savingsRatePercent,
    savingsRateLabel,
  };
}
