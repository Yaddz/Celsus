import type { FinAccount, FinBudget, FinEntry, FinRecurrence, FinRecurrenceSkip } from '../../db/schema';
import { billDueDate, resolveBillMonth, summarizeBill } from './cards';

export type BudgetStatus = 'ok' | 'atencao' | 'estourado';

export interface BudgetUsageItem {
  categoryId: string;
  budgetId: string | null;
  yearMonth: string;
  isMonthlySpecific: boolean;
  spentCents: number;
  limitCents: number | null;
  percentage: number | null;
  status: BudgetStatus | null;
  projectedEndOfMonthCents: number;
  paceText: string | null;
  remainingCents: number | null;
  remainingPerDayCents: number | null;
}

export interface DailyCashflowPoint {
  date: string;
  balanceCents: number;
  deltaCents: number;
}

export interface CashflowProjection {
  startingBalanceCents: number;
  days: DailyCashflowPoint[];
  minBalanceCents: number;
  minBalanceDate: string;
  endBalanceCents: number;
  isNegativeAlert: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonthYm(yearMonth: string): number {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addMonthsYm(yearMonth: string, delta: number): string {
  const [yStr, mStr] = yearMonth.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

function addDaysIsoLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function todayIsoLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function formatBRL(cents: number): string {
  const safe = Math.round(Number.isFinite(cents) ? cents : 0);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const intPart = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = String(abs % 100).padStart(2, '0');
  return `${sign}R$ ${intPart},${decPart}`;
}

export function calculateBudgetUsage(
  entries: FinEntry[],
  budgets: FinBudget[],
  yearMonth: string,
  options?: { todayIso?: string }
): BudgetUsageItem[] {
  const spentByCategory = new Map<string, number>();
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (entry.kind !== 'expense') continue;
    if (!entry.due_date.startsWith(yearMonth)) continue;
    const amt = entry.status === 'paid' ? entry.paid_amount_cents ?? entry.amount_cents : entry.amount_cents;
    spentByCategory.set(entry.category_id, (spentByCategory.get(entry.category_id) ?? 0) + amt);
  }

  // O específico do mês (year_month === yearMonth) vence sobre o recorrente (year_month == null)
  const activeBudgetByCategory = new Map<string, FinBudget>();
  for (const b of budgets) {
    if (b.year_month !== null && b.year_month !== yearMonth) continue;
    const existing = activeBudgetByCategory.get(b.category_id);
    if (!existing) {
      activeBudgetByCategory.set(b.category_id, b);
    } else if (existing.year_month === null && b.year_month === yearMonth) {
      activeBudgetByCategory.set(b.category_id, b);
    }
  }

  const categoryIds = new Set<string>([
    ...spentByCategory.keys(),
    ...activeBudgetByCategory.keys(),
  ]);

  const totalDays = daysInMonthYm(yearMonth);
  const todayIso = options?.todayIso ?? todayIsoLocal();
  const todayYm = todayIso.slice(0, 7);
  let elapsedDays: number;
  if (todayYm === yearMonth) {
    const dayNum = Number.parseInt(todayIso.slice(8, 10), 10);
    elapsedDays = Math.max(1, Math.min(totalDays, Number.isFinite(dayNum) ? dayNum : 1));
  } else if (todayYm > yearMonth) {
    elapsedDays = totalDays;
  } else {
    elapsedDays = 0;
  }

  const remainingDays = Math.max(1, totalDays - elapsedDays + 1);
  const items: BudgetUsageItem[] = [];

  for (const categoryId of categoryIds) {
    const spentCents = spentByCategory.get(categoryId) ?? 0;
    const budget = activeBudgetByCategory.get(categoryId) ?? null;
    const limitCents = budget ? budget.limit_cents : null;

    let percentage: number | null = null;
    let status: BudgetStatus | null = null;
    if (limitCents !== null) {
      if (limitCents > 0) {
        percentage = Math.round((spentCents / limitCents) * 1000) / 10;
      } else {
        percentage = spentCents > 0 ? 100 : 0;
      }
      if (percentage >= 100) {
        status = 'estourado';
      } else if (percentage >= 80) {
        status = 'atencao';
      } else {
        status = 'ok';
      }
    }

    const projectedEndOfMonthCents =
      elapsedDays > 0 && spentCents > 0
        ? Math.round((spentCents / elapsedDays) * totalDays)
        : spentCents;

    const paceText =
      elapsedDays > 0
        ? `no ritmo atual termina o mês em ${formatBRL(projectedEndOfMonthCents)}`
        : null;

    const remainingCents = limitCents !== null ? limitCents - spentCents : null;
    const remainingPerDayCents =
      remainingCents !== null
        ? Math.max(0, Math.round(remainingCents / remainingDays))
        : null;

    items.push({
      categoryId,
      budgetId: budget?.id ?? null,
      yearMonth,
      isMonthlySpecific: budget ? budget.year_month === yearMonth : false,
      spentCents,
      limitCents,
      percentage,
      status,
      projectedEndOfMonthCents,
      paceText,
      remainingCents,
      remainingPerDayCents,
    });
  }

  items.sort((a, b) => {
    const aHas = a.limitCents !== null ? 0 : 1;
    const bHas = b.limitCents !== null ? 0 : 1;
    if (aHas !== bHas) return aHas - bHas;
    return b.spentCents - a.spentCents;
  });

  return items;
}

export function suggestBudgetLimit(
  entries: FinEntry[],
  categoryId: string,
  yearMonth: string
): number {
  const targetMonths = [
    addMonthsYm(yearMonth, -1),
    addMonthsYm(yearMonth, -2),
    addMonthsYm(yearMonth, -3),
  ];
  let total = 0;
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (entry.kind !== 'expense') continue;
    if (entry.category_id !== categoryId) continue;
    const ym = entry.due_date.slice(0, 7);
    if (!targetMonths.includes(ym)) continue;
    const amt = entry.status === 'paid' ? entry.paid_amount_cents ?? entry.amount_cents : entry.amount_cents;
    total += amt;
  }
  return Math.round(total / 3);
}

function getRecurrencePeriod(frequency: string, dueDate: string): string {
  if (frequency === 'yearly') return dueDate.slice(0, 4);
  if (frequency === 'monthly') return dueDate.slice(0, 7);
  return dueDate;
}

function clampDay(year: number, month: number, day: number): number {
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(1, Math.min(day, max));
}

function generateDatesForRecurrence(
  rec: FinRecurrence,
  fromIso: string,
  untilIso: string
): string[] {
  const dates: string[] = [];
  if (rec.active !== 1) return dates;
  const effectiveEnd = rec.end_date && rec.end_date < untilIso ? rec.end_date : untilIso;
  if (effectiveEnd < fromIso || rec.start_date > effectiveEnd) return dates;

  const [sy, sm, sd] = rec.start_date.split('-').map((n) => Number.parseInt(n, 10));
  const anchorDay = rec.day_of_month || sd;

  if (rec.frequency === 'weekly') {
    let cur = rec.start_date;
    while (cur <= effectiveEnd) {
      if (cur >= fromIso) dates.push(cur);
      cur = addDaysIsoLocal(cur, 7);
    }
    return dates;
  }

  if (rec.frequency === 'yearly') {
    let y = sy;
    while (true) {
      const d = clampDay(y, sm, anchorDay);
      const iso = `${y}-${pad2(sm)}-${pad2(d)}`;
      if (iso > effectiveEnd) break;
      if (iso >= rec.start_date && iso >= fromIso) dates.push(iso);
      y += 1;
    }
    return dates;
  }

  // monthly
  let mIdx = 0;
  while (true) {
    const total = sy * 12 + (sm - 1) + mIdx;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const d = clampDay(y, m, anchorDay);
    const iso = `${y}-${pad2(m)}-${pad2(d)}`;
    if (iso > effectiveEnd) break;
    if (iso >= rec.start_date && iso >= fromIso) dates.push(iso);
    mIdx += 1;
  }
  return dates;
}

export function projectCashflow(
  accounts: FinAccount[],
  entries: FinEntry[],
  todayIso: string,
  untilIso: string,
  options?: {
    recurrences?: FinRecurrence[];
    skips?: FinRecurrenceSkip[];
  }
): CashflowProjection {
  const activeAccounts = accounts.filter((a) => a.archived === 0);
  const cashAndChecking = activeAccounts.filter((a) => a.type !== 'card');
  const cardAccounts = activeAccounts.filter((a) => a.type === 'card');
  const cardAccountIds = new Set(cardAccounts.map((a) => a.id));

  let startingBalanceCents = 0;
  for (const acc of cashAndChecking) {
    // Conta do Open Finance: o saldo informado pelo banco já contém o histórico importado
    if (acc.source === 'OPEN_FINANCE' && acc.reported_balance_cents != null) {
      startingBalanceCents += acc.reported_balance_cents;
      continue;
    }
    let bal = acc.initial_balance_cents;
    for (const entry of entries) {
      if (entry.of_removed_at) continue;
      if (entry.account_id !== acc.id || entry.status !== 'paid') continue;
      const real = entry.paid_amount_cents ?? entry.amount_cents;
      if (entry.kind === 'income' || entry.kind === 'transfer_in') bal += real;
      else bal -= real;
    }
    startingBalanceCents += bal;
  }

  const deltaByDate = new Map<string, number>();
  const addDelta = (date: string, delta: number) => {
    if (date < todayIso || date > untilIso) return;
    deltaByDate.set(date, (deltaByDate.get(date) ?? 0) + delta);
  };

  // 1. Pendentes (não-cartão) e parcelas
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (entry.status !== 'pending') continue;
    if (cardAccountIds.has(entry.account_id)) continue;
    if (entry.kind === 'transfer_out' || entry.kind === 'transfer_in') continue;
    if (entry.due_date > untilIso) continue;
    const signed = entry.kind === 'income' ? entry.amount_cents : -entry.amount_cents;
    // Atrasado continua devido: entra na previsão como se fosse quitado hoje
    addDelta(entry.due_date < todayIso ? todayIso : entry.due_date, signed);
  }

  // 2. Faturas de cartão pelo vencimento
  for (const card of cardAccounts) {
    const cardEntries = entries.filter((e) => e.account_id === card.id && !e.of_removed_at);
    const normalized = cardEntries.map((e) =>
      e.bill_month ? e : { ...e, bill_month: resolveBillMonth(e.due_date, card.closing_day ?? 1, card.due_day) }
    );
    const months = new Set<string>(normalized.map((e) => e.bill_month!));
    for (const billMonth of months) {
      const dueDate = billDueDate(billMonth, card.due_day ?? 10);
      if (dueDate < todayIso || dueDate > untilIso) continue;
      const summary = summarizeBill(normalized, billMonth, {
        dueDate,
        todayIso,
        closingDay: card.closing_day ?? undefined,
      });
      if (summary.openCents > 0) {
        addDelta(dueDate, -summary.openCents);
      }
    }
  }

  // 3. Recorrências ainda não materializadas
  if (options?.recurrences && options.recurrences.length > 0) {
    const existingKeys = new Set<string>();
    for (const e of entries) {
      if (e.recurrence_id) {
        const period = e.recurrence_period ?? '';
        existingKeys.add(`${e.recurrence_id}:${period}`);
        existingKeys.add(`${e.recurrence_id}:${e.due_date}`);
      }
    }
    const skipKeys = new Set<string>(
      (options.skips ?? []).map((s) => `${s.recurrence_id}:${s.period}`)
    );

    for (const rec of options.recurrences) {
      if (rec.active !== 1 || cardAccountIds.has(rec.account_id)) continue;
      const dates = generateDatesForRecurrence(rec, todayIso, untilIso);
      for (const date of dates) {
        const period = getRecurrencePeriod(rec.frequency, date);
        if (
          existingKeys.has(`${rec.id}:${period}`) ||
          existingKeys.has(`${rec.id}:${date}`) ||
          skipKeys.has(`${rec.id}:${period}`)
        ) {
          continue;
        }
        const signed = rec.kind === 'income' ? rec.amount_cents : -rec.amount_cents;
        addDelta(date, signed);
      }
    }
  }

  const days: DailyCashflowPoint[] = [];
  let running = startingBalanceCents;
  let minBalanceCents = startingBalanceCents;
  let minBalanceDate = todayIso;

  let cur = todayIso;
  while (cur <= untilIso) {
    const deltaCents = deltaByDate.get(cur) ?? 0;
    running += deltaCents;
    days.push({ date: cur, balanceCents: running, deltaCents });
    if (days.length === 1 || running < minBalanceCents) {
      minBalanceCents = running;
      minBalanceDate = cur;
    }
    cur = addDaysIsoLocal(cur, 1);
  }

  const endBalanceCents = days.length > 0 ? days[days.length - 1].balanceCents : startingBalanceCents;
  return {
    startingBalanceCents,
    days,
    minBalanceCents,
    minBalanceDate,
    endBalanceCents,
    isNegativeAlert: minBalanceCents < 0,
  };
}
