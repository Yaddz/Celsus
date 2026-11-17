import { toBrtDate } from './dates';

export interface FingerprintInput {
  accountId: string;
  date: string;
  amountCents: number;
  description: string;
  order?: number | null;
  id: string;
}

export interface FetchedMatchCandidate {
  externalId: string;
  accountId: string;
  date: string;
  absAmountCents: number;
  description: string;
  ofProviderId?: string | null;
  order?: number | null;
}

export interface ExistingMatchCandidate {
  id: string;
  account_id: string;
  external_id?: string | null;
  of_provider_id?: string | null;
  of_raw_amount_cents?: number | null;
  amount_cents: number;
  due_date: string;
  description: string;
  description_raw?: string | null;
  of_removed_at?: string | null;
  order?: number | null;
}

export type MatchMethod = 'EXTERNAL_ID' | 'PROVIDER_ID' | 'FINGERPRINT';

export interface MatchFetchedResult {
  action: 'update' | 'create';
  existingId?: string;
  matchedBy: MatchMethod | null;
}

export function normalizeIdentityDescription(description: string): string {
  return (description ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function transactionBaseFingerprint(
  accountId: string,
  brtDate: string,
  absAmountCents: number,
  description: string
): string {
  return `${accountId}|${brtDate}|${Math.abs(absAmountCents)}|${normalizeIdentityDescription(description)}`;
}

export function transactionFingerprint(
  input: FingerprintInput,
  ordinal: number
): string {
  const base = transactionBaseFingerprint(
    input.accountId,
    toBrtDate(input.date),
    input.amountCents,
    input.description
  );
  return `${base}|${ordinal}`;
}

export function computeFetchedFingerprints(
  items: FetchedMatchCandidate[]
): string[] {
  const groups = new Map<string, Array<{ idx: number; order: number; id: string }>>();
  const baseByIdx: string[] = new Array(items.length);

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const base = transactionBaseFingerprint(
      item.accountId,
      toBrtDate(item.date),
      item.absAmountCents,
      item.description
    );
    baseByIdx[i] = base;
    const list = groups.get(base) ?? [];
    list.push({ idx: i, order: item.order ?? 0, id: item.externalId });
    groups.set(base, list);
  }

  const result: string[] = new Array(items.length);
  for (const [base, list] of groups.entries()) {
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    for (let ordinal = 0; ordinal < list.length; ordinal += 1) {
      result[list[ordinal].idx] = `${base}|${ordinal}`;
    }
  }
  return result;
}

export function matchFetchedToExisting(
  fetched: FetchedMatchCandidate[],
  existing: ExistingMatchCandidate[]
): MatchFetchedResult[] {
  const results: MatchFetchedResult[] = fetched.map(() => ({
    action: 'create',
    matchedBy: null,
  }));

  const usedExistingIds = new Set<string>();
  const fetchedExternalIds = new Set(fetched.map((f) => f.externalId));

  // Passo 1: external_id = tx.id
  for (let i = 0; i < fetched.length; i += 1) {
    const f = fetched[i];
    const match = existing.find(
      (e) =>
        !usedExistingIds.has(e.id) &&
        e.account_id === f.accountId &&
        Boolean(e.external_id) &&
        e.external_id === f.externalId
    );
    if (match) {
      usedExistingIds.add(match.id);
      results[i] = { action: 'update', existingId: match.id, matchedBy: 'EXTERNAL_ID' };
    }
  }

  // Passo 2: mesma conta e of_provider_id = tx.providerId
  for (let i = 0; i < fetched.length; i += 1) {
    if (results[i].action === 'update') continue;
    const f = fetched[i];
    if (!f.ofProviderId) continue;
    const match = existing.find(
      (e) =>
        !usedExistingIds.has(e.id) &&
        e.account_id === f.accountId &&
        Boolean(e.of_provider_id) &&
        e.of_provider_id === f.ofProviderId
    );
    if (match) {
      usedExistingIds.add(match.id);
      results[i] = { action: 'update', existingId: match.id, matchedBy: 'PROVIDER_ID' };
    }
  }

  // Passo 3: impressão digital entre existentes cujo external_id não veio nesta busca
  const fetchedFps = computeFetchedFingerprints(fetched);
  const existingGroups = new Map<string, ExistingMatchCandidate[]>();
  for (const e of existing) {
    if (usedExistingIds.has(e.id)) continue;
    if (e.external_id && fetchedExternalIds.has(e.external_id)) continue;
    const amountCents =
      e.of_raw_amount_cents != null
        ? Math.abs(e.of_raw_amount_cents)
        : Math.abs(e.amount_cents);
    const base = transactionBaseFingerprint(
      e.account_id,
      toBrtDate(e.due_date),
      amountCents,
      e.description_raw ?? e.description
    );
    const list = existingGroups.get(base) ?? [];
    list.push(e);
    existingGroups.set(base, list);
  }

  const existingByFp = new Map<string, ExistingMatchCandidate[]>();
  for (const [base, list] of existingGroups.entries()) {
    list.sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        (a.external_id ?? a.id).localeCompare(b.external_id ?? b.id)
    );
    for (let ordinal = 0; ordinal < list.length; ordinal += 1) {
      const fp = `${base}|${ordinal}`;
      const bucket = existingByFp.get(fp) ?? [];
      bucket.push(list[ordinal]);
      existingByFp.set(fp, bucket);
    }
  }

  for (let i = 0; i < fetched.length; i += 1) {
    if (results[i].action === 'update') continue;
    const fp = fetchedFps[i];
    const candidates = existingByFp.get(fp);
    if (!candidates) continue;
    const match = candidates.find((e) => !usedExistingIds.has(e.id));
    if (match) {
      usedExistingIds.add(match.id);
      results[i] = { action: 'update', existingId: match.id, matchedBy: 'FINGERPRINT' };
    }
  }

  return results;
}
