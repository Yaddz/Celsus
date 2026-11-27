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

  const transferInByGroup = new Map<string, FinEntry[]>();
  const transferOutByGroup = new Map<string, FinEntry[]>();
  for (const e of monthEntries) {
    if (!e.transfer_group_id) continue;
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
      // Saída OF classificada INVESTMENT_MOVE sem par transfer_in em conta de investimento conta como aporte
      if (entry.source === 'OPEN_FINANCE' && entry.of_class_reason === 'INVESTMENT_MOVE') {
        const hasBrokerPair =
          Boolean(entry.transfer_group_id) &&
          (transferInByGroup.get(entry.transfer_group_id!) ?? []).some((ti) =>
            investmentAccountIds.has(ti.account_id)
          );
        if (!hasBrokerPair) {
          contributionCents += real;
        }
        continue;
      }
      expenseCents += real;
      continue;
    }

    // R43 (Sprint 114 P4):
    // Aportes = Σ transfer_in em conta de investimento vinda de fora
    //         + Σ saídas OF INVESTMENT_MOVE sem par no app
    //         - Σ transfer_out de conta de investimento para fora
    // investment_buy / investment_sell NUNCA entram em aportes.
    if (entry.kind === 'transfer_in') {
      if (entry.transfer_group_id && investmentAccountIds.has(entry.account_id)) {
        const outs = transferOutByGroup.get(entry.transfer_group_id) ?? [];
        const fromOutside = outs.some((o) => !investmentAccountIds.has(o.account_id));
        if (fromOutside) {
          contributionCents += real;
        }
      }
      continue;
    }

    if (entry.kind === 'transfer_out') {
      if (entry.transfer_group_id && investmentAccountIds.has(entry.account_id)) {
        const ins = transferInByGroup.get(entry.transfer_group_id) ?? [];
        const toOutside = ins.some((i) => !investmentAccountIds.has(i.account_id));
        if (toOutside) {
          contributionCents -= real;
        }
      } else if (entry.source === 'OPEN_FINANCE' && entry.of_class_reason === 'INVESTMENT_MOVE') {
        const hasBrokerPair =
          Boolean(entry.transfer_group_id) &&
          (transferInByGroup.get(entry.transfer_group_id!) ?? []).some((ti) =>
            investmentAccountIds.has(ti.account_id)
          );
        if (!hasBrokerPair) {
          contributionCents += real;
        }
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
