import Decimal from 'decimal.js';

export interface IncomeEvent {
  /** YYYY-MM-DD */
  date: string;
  amount: string | number;
}

export interface IncomeSummary {
  year: number;
  totalYear: string;
  /** Média mensal entre o 1º mês com provento do ano e o mês de referência. */
  monthlyAverage: string;
  byYear: Record<string, string>;
}

/** Proventos recebidos (aba Resumo/Histórico da planilha). */
export function summarizeIncome(events: IncomeEvent[], referenceDate: string): IncomeSummary {
  const refYear = Number(referenceDate.slice(0, 4));
  const refMonth = Number(referenceDate.slice(5, 7));
  const byYear = new Map<string, Decimal>();
  let totalYear = new Decimal(0);
  let firstMonth: number | null = null;

  for (const e of events) {
    const y = e.date.slice(0, 4);
    const amount = new Decimal(e.amount || 0);
    byYear.set(y, (byYear.get(y) ?? new Decimal(0)).plus(amount));
    if (Number(y) === refYear && e.date.slice(0, 10) <= referenceDate) {
      totalYear = totalYear.plus(amount);
      const m = Number(e.date.slice(5, 7));
      if (firstMonth === null || m < firstMonth) firstMonth = m;
    }
  }

  const months = firstMonth === null ? 0 : refMonth - firstMonth + 1;
  const out: Record<string, string> = {};
  [...byYear.keys()].sort().forEach((k) => (out[k] = byYear.get(k)!.toFixed(2)));
  return {
    year: refYear,
    totalYear: totalYear.toFixed(2),
    monthlyAverage: months > 0 ? totalYear.div(months).toFixed(2) : '0.00',
    byYear: out,
  };
}
