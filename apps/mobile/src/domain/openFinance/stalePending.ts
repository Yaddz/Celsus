/** Janela de 40 dias do Open Finance (R10). Fora dela, um PENDING de conta é considerado antigo (R17). */
export const OPEN_FINANCE_WINDOW_DAYS = 40;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map((n) => Number.parseInt(n, 10));
  const ms = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function openFinanceWindowStart(todayIso: string, days = OPEN_FINANCE_WINDOW_DAYS): string {
  return addDays(todayIso, -days);
}

/** Lançamento Open Finance PENDING com mais de 40 dias: não entra em previsão nem em "a pagar"/"a receber". */
export function isStaleOpenFinancePending(
  entry: { status: string; due_date: string; source?: string | null; of_removed_at?: string | null },
  todayIso: string
): boolean {
  if (entry.source !== 'OPEN_FINANCE') return false;
  if (entry.status !== 'pending') return false;
  return entry.due_date < openFinanceWindowStart(todayIso);
}
