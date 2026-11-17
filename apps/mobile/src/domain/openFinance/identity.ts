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

export function normalizeIdentityDescription(_description: string): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function transactionBaseFingerprint(
  _accountId: string,
  _brtDate: string,
  _absAmountCents: number,
  _description: string
): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function transactionFingerprint(
  _input: FingerprintInput,
  _ordinal: number
): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function computeFetchedFingerprints(
  _items: FetchedMatchCandidate[]
): string[] {
  throw new Error('NOT_IMPLEMENTED');
}

export function matchFetchedToExisting(
  _fetched: FetchedMatchCandidate[],
  _existing: ExistingMatchCandidate[]
): MatchFetchedResult[] {
  throw new Error('NOT_IMPLEMENTED');
}
