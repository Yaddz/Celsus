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

export function normalizeIncomeKindForDedup(kind: string | null | undefined): string {
  const upper = (kind || '').trim().toUpperCase();
  if (!upper || upper === 'PROVENTO' || upper === 'OUTRO') return '';
  return upper;
}

export function findEquivalentIncome<T extends IncomeDedupCandidate>(
  _candidate: IncomeDedupCandidate,
  _existing: T[]
): T | null {
  throw new Error('Not implemented (Sprint 72 Phase A stub)');
}
