import Decimal from 'decimal.js';

export interface IncomeDedupCandidate {
  id?: string;
  portfolioId?: string;
  ticker: string;
  payDate: string; // YYYY-MM-DD
  amount: string;
  kind?: string | null;
  source?: string | null;
  externalId?: string | null;
  notes?: string | null;
  quantity?: string | null;
  unitAmount?: string | null;
  createdAt?: string | null;
}

export function normalizeTickerForIncomeDedup(ticker: string | null | undefined): string {
  const cleaned = (ticker || '').trim().toUpperCase();
  if (!cleaned) return '';
  if (/^[A-Z]{4}\d{1,2}F$/.test(cleaned)) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
}

export function normalizeIncomeKindForDedup(kind: string | null | undefined): string {
  const upper = (kind || '').trim().toUpperCase();
  if (!upper || upper === 'PROVENTO' || upper === 'OUTRO') return '';
  return upper;
}

function diffDaysIso(aIso: string, bIso: string): number {
  const aParts = aIso.slice(0, 10).split('-').map(Number);
  const bParts = bIso.slice(0, 10).split('-').map(Number);
  if (aParts.length !== 3 || bParts.length !== 3) return Infinity;
  const utcA = Date.UTC(aParts[0], aParts[1] - 1, aParts[2]);
  const utcB = Date.UTC(bParts[0], bParts[1] - 1, bParts[2]);
  if (!Number.isFinite(utcA) || !Number.isFinite(utcB)) return Infinity;
  return Math.abs(Math.round((utcA - utcB) / 86_400_000));
}

function areKindsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizeIncomeKindForDedup(a);
  const kb = normalizeIncomeKindForDedup(b);
  if (!ka || !kb) return true;
  return ka === kb;
}

function areAmountsEquivalent(
  candAmount: Decimal,
  exAmount: Decimal,
  candKind: string,
  exKind: string
): boolean {
  if (candAmount.minus(exAmount).abs().lte('0.01')) {
    return true;
  }
  const isJcp =
    (candKind === 'JCP' || exKind === 'JCP') &&
    areKindsCompatible(candKind, exKind);
  if (isJcp && candAmount.gt(0) && exAmount.gt(0)) {
    // JCP bruto × líquido (15% IR, tolerância de 1% do valor bruto)
    const diffCandIsNet = candAmount.minus(exAmount.mul('0.85')).abs();
    const diffExIsNet = exAmount.minus(candAmount.mul('0.85')).abs();
    if (diffCandIsNet.lte(exAmount.mul('0.01')) || diffExIsNet.lte(candAmount.mul('0.01'))) {
      return true;
    }
  }
  return false;
}

export function findEquivalentIncome<T extends IncomeDedupCandidate>(
  candidate: IncomeDedupCandidate,
  existing: T[]
): T | null {
  const candTicker = normalizeTickerForIncomeDedup(candidate.ticker);
  if (!candTicker) return null;

  const candAmount = new Decimal(candidate.amount || 0).abs();
  const candKind = normalizeIncomeKindForDedup(candidate.kind);

  for (const item of existing) {
    if (normalizeTickerForIncomeDedup(item.ticker) !== candTicker) continue;
    if (!areKindsCompatible(candidate.kind, item.kind)) continue;
    if (diffDaysIso(candidate.payDate, item.payDate) > 3) continue;

    const exAmount = new Decimal(item.amount || 0).abs();
    const exKind = normalizeIncomeKindForDedup(item.kind);
    if (areAmountsEquivalent(candAmount, exAmount, candKind, exKind)) {
      return item;
    }
  }

  return null;
}

export interface OpenFinanceIncomeEntryCandidate {
  id: string;
  account_id: string;
  source: string;
  kind: string;
  amount_cents: number;
  paid_amount_cents: number | null;
  due_date: string;
  description: string;
  description_raw: string | null;
  linked_income_id: string | null;
  transfer_group_id: string | null;
  of_removed_at: string | null;
}

/**
 * R41: Regra explícita de casamento entre provento da carteira e lançamento Open Finance:
 * - Conta igual à conta vinculada da carteira (`account_id === linkedAccountId`)
 * - Data dentro de ±3 dias (`|due_date - payDate| <= 3`)
 * - Valor equivalente: diferença <= R$ 0,01 (1 centavo) ou JCP bruto × líquido (85%, tolerância 1%)
 */
export function findMatchingOpenFinanceIncomeEntry<T extends OpenFinanceIncomeEntryCandidate>(
  income: { ticker: string; payDate: string; amount: string; kind?: string | null },
  linkedAccountId: string,
  entries: T[],
  options?: { candidateAccountIds?: string[] }
): T | null {
  const candAmount = new Decimal(income.amount || 0).abs();
  const candKind = normalizeIncomeKindForDedup(income.kind);
  const normTicker = normalizeTickerForIncomeDedup(income.ticker);
  const allowedAccountIds = new Set(
    options?.candidateAccountIds && options.candidateAccountIds.length > 0
      ? options.candidateAccountIds
      : [linkedAccountId]
  );

  const matches: T[] = [];
  for (const e of entries) {
    if (e.source !== 'OPEN_FINANCE') continue;
    if (e.of_removed_at || e.linked_income_id || e.transfer_group_id) continue;
    if (e.kind !== 'income' && e.kind !== 'transfer_in') continue;
    if (!allowedAccountIds.has(e.account_id)) continue;
    if (!(e.amount_cents > 0)) continue;
    if (diffDaysIso(e.due_date, income.payDate) > 3) continue;

    const entryCents = e.paid_amount_cents ?? e.amount_cents;
    const entryAmount = new Decimal(entryCents).div(100);
    if (areAmountsEquivalent(candAmount, entryAmount, candKind, '')) {
      matches.push(e);
    }
  }

  if (matches.length === 0) return null;
  if (normTicker) {
    const withTicker = matches.find((m) =>
      `${m.description_raw || ''} ${m.description || ''}`.toUpperCase().includes(normTicker)
    );
    if (withTicker) return withTicker;
  }
  return matches[0];
}
