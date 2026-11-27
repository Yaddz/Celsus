import type { FinAccount, FinEntry } from '../../db/schema';
import { isStaleOpenFinancePending } from '../openFinance/stalePending';
import { isAutomaticSweep } from './investmentCash';

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
 * R43 — Mês em uma linha (revisada na Sprint 116):
 * - Receitas: `income` + `investment_income` (destacando `dividendIncomeCents` como "dos quais proventos")
 * - Despesas: `expense` (exclui transferências, `investment_*` e movimentos de investimento Open Finance)
 * - Aportes: dinheiro que passou de conta NÃO de investimento para conta de investimento, líquido do caminho
 *   inverso (par `transfer_in`/`transfer_out`, ou movimento Open Finance `INVESTMENT_MOVE` sem par em conta
 *   comum). Nunca contam: lançamento Open Finance dentro de conta de investimento (liquidação, taxas B3,
 *   aplicação/resgate), aplicação/resgate automático de conta remunerada em qualquer conta e `investment_*`.
 * - Sobra: receitas - despesas - aportes
 * - Taxa de poupança: (receitas - despesas) / receitas, ou "—" sem receita
 */
export function monthSummary(
  entries: FinEntry[],
  yearMonth: string,
  options?: {
    todayIso?: string;
    accounts?: Array<Pick<FinAccount, 'id' | 'type'>>;
    linkedAccountIds?: string[];
  }
): MonthSummaryR43 {
  const monthEntries = entries.filter((entry) => {
    if (entry.of_removed_at) return false;
    if (!entry.due_date.startsWith(yearMonth)) return false;
    if (options?.todayIso && isStaleOpenFinancePending(entry, options.todayIso)) return false;
    return true;
  });

  const investmentAccountIds = new Set<string>([
    ...(options?.accounts ?? []).filter((a) => a.type === 'broker').map((a) => a.id),
    ...(options?.linkedAccountIds ?? []),
  ]);

  // Pares de transferência olham TODOS os lançamentos (o par pode cair em outro mês).
  const transferInByGroup = new Map<string, FinEntry[]>();
  const transferOutByGroup = new Map<string, FinEntry[]>();
  for (const e of entries) {
    if (e.of_removed_at || !e.transfer_group_id) continue;
    if (e.kind === 'transfer_in') {
      const list = transferInByGroup.get(e.transfer_group_id) ?? [];
      list.push(e);
      transferInByGroup.set(e.transfer_group_id, list);
    } else if (e.kind === 'transfer_out') {
      const list = transferOutByGroup.get(e.transfer_group_id) ?? [];
      list.push(e);
      transferOutByGroup.set(e.transfer_group_id, list);
    }
  }
  const hasPair = (e: FinEntry): boolean =>
    Boolean(e.transfer_group_id) &&
    (e.kind === 'transfer_out'
      ? (transferInByGroup.get(e.transfer_group_id!) ?? []).length > 0
      : (transferOutByGroup.get(e.transfer_group_id!) ?? []).length > 0);

  let incomeCents = 0;
  let dividendIncomeCents = 0;
  let expenseCents = 0;
  let contributionCents = 0;

  /**
   * Movimento Open Finance de investimento (`INVESTMENT_MOVE`) sem par: só conta quando está em conta que NÃO é
   * de investimento e não é aplicação/resgate automático. Saída soma; crédito subtrai.
   */
  const countUnpairedInvestmentMove = (entry: FinEntry, real: number, isOutflow: boolean) => {
    if (investmentAccountIds.has(entry.account_id)) return;
    if (isAutomaticSweep(entry.description) || isAutomaticSweep(entry.description_raw)) return;
    if (hasPair(entry)) return;
    contributionCents += isOutflow ? real : -real;
  };

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

    const isOfInvestmentMove =
      entry.source === 'OPEN_FINANCE' && entry.of_class_reason === 'INVESTMENT_MOVE';

    if (entry.kind === 'expense') {
      if (isOfInvestmentMove) {
        // legado: saída OF INVESTMENT_MOVE gravada como despesa nunca é despesa
        countUnpairedInvestmentMove(entry, real, true);
        continue;
      }
      expenseCents += real;
      continue;
    }

    // R43 (Sprint 116): aporte = conta NÃO de investimento → conta de investimento, líquido do caminho inverso.
    // investment_buy / investment_sell NUNCA entram em aportes.
    if (entry.kind === 'transfer_in') {
      if (entry.transfer_group_id && investmentAccountIds.has(entry.account_id)) {
        const outs = transferOutByGroup.get(entry.transfer_group_id) ?? [];
        if (outs.some((o) => !investmentAccountIds.has(o.account_id))) {
          contributionCents += real;
        }
      } else if (isOfInvestmentMove) {
        countUnpairedInvestmentMove(entry, real, false);
      }
      continue;
    }

    if (entry.kind === 'transfer_out') {
      if (entry.transfer_group_id && investmentAccountIds.has(entry.account_id)) {
        const ins = transferInByGroup.get(entry.transfer_group_id) ?? [];
        if (ins.some((i) => !investmentAccountIds.has(i.account_id))) {
          contributionCents -= real;
        }
      } else if (isOfInvestmentMove) {
        countUnpairedInvestmentMove(entry, real, true);
      }
      continue;
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
