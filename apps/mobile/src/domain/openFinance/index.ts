import Decimal from 'decimal.js';
import type { PluggyAccount, PluggyBill, PluggyTransaction } from '../../services/pluggy/types';
import {
  normalizeCardEntry,
  parseIsoDate,
  resolveBillMonth,
  type FinEntryStatus,
  type FinKind,
} from '../financeFlow';
import {
  applyCategoryRules,
  reconcileImportedRows,
  type CategoryRuleLike,
  type ReconcilableExistingEntry,
} from '../statementImport';
import { buildAccountName, cleanTransactionDescription } from './naming';
import {
  classifyOpenFinanceBankEntry,
  classifyOpenFinanceCardEntry,
  isCardBillPayment,
  isTransferCompatibleCategoryId,
  mapPluggyCategory,
  type ClassifyResult,
} from './classification';
import { matchFetchedToExisting, type MatchMethod } from './identity';
import { assignBillMonth, assignPaymentBillMonth } from './cardBills';
import { toBrtDate } from './dates';

export { classifyOpenFinanceBankEntry, isCardBillPayment, mapPluggyCategory };

export interface MappedPluggyAccount {
  ofAccountId: string;
  name: string;
  type: 'checking' | 'card';
  source: 'OPEN_FINANCE';
  reportedBalanceCents: number;
  reportedBalanceAt: string;
  creditLimitCents: number | null;
  dueDay: number | null;
  closingDay: number | null;
  needsClosingDay: boolean;
  maskedNumber: string | null;
  owner: string | null;
  closingBalanceCents: number | null;
  autoInvestedCents: number | null;
  creditUsedCents: number | null;
  ofAvailableLimitCents: number | null;
  ofMinimumPaymentCents: number | null;
  ofBalanceDueDate: string | null;
  ofOverdraftUsedCents: number | null;
  ofReservedCents: number | null;
}

export interface MappedPluggyTransaction {
  externalId: string;
  source: 'OPEN_FINANCE';
  accountId: string;
  kind: FinKind | 'transfer_in' | 'transfer_out';
  status: FinEntryStatus;
  amountCents: number;
  dueDate: string;
  paidDate: string | null;
  paidAmountCents: number | null;
  description: string;
  descriptionRaw: string | null;
  categoryId: string;
  matchedRuleId?: string;
  /** categoryId hierárquico da Pluggy (Sprint 91) e motivo da classificação (R18). */
  ofCategoryId?: string | null;
  classReason?: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  billId: string | null;
  billMonth: string | null;
  ofProviderId: string | null;
  ofBillId: string | null;
  ofBillForecastMonth: string | null;
  ofBillPostDate: string | null;
  ofOperationType: string | null;
  ofRawStatus: string | null;
  ofRawType: string | null;
  ofRawAmountCents: number;
  ofCreatedAt: string | null;
  ofInstallmentNumber: number | null;
  ofInstallmentTotal: number | null;
  ofBillMonthSource: string | null;
  ofOrder?: number | null;
}

export interface MapPluggyTransactionOptions {
  accountId: string;
  accountType: 'checking' | 'card';
  closingDay?: number | null;
  dueDay?: number | null;
  bills?: PluggyBill[];
  forecastOffset?: number;
  rules?: CategoryRuleLike[];
  externalIdOverride?: string;
  /** Crédito já reconhecido como provento (R9/R15). */
  isIncomeLinked?: boolean;
  recentCardPurchases?: Array<{
    amountCents: number;
    dueDate: string;
    categoryId: string;
  }>;
}

export interface ReconcilableOpenFinanceEntry {
  id: string;
  account_id: string;
  external_id?: string | null;
  amount_cents: number;
  kind: string;
  status: string;
  due_date: string;
  category_id: string;
  description: string;
  user_edited_fields?: string | null;
  recurrence_id?: string | null;
  variable_amount?: number | null;
  transfer_group_id?: string | null;
  description_raw?: string | null;
  of_provider_id?: string | null;
  of_raw_amount_cents?: number | null;
  of_removed_at?: string | null;
}

export type OpenFinanceReconcileAction = 'create' | 'update' | 'settle_pending';

export interface ReconciledPluggyTransaction extends MappedPluggyTransaction {
  action: OpenFinanceReconcileAction;
  matchedEntryId?: string;
  matchedBy?: MatchMethod | null;
  transferGroupId?: string;
  transferPairExternalId?: string;
  transferRole?: 'transfer_out' | 'transfer_in';
}

export interface TransferPairMatch {
  outExternalId: string;
  inExternalId: string;
  transferGroupId: string;
  isBillPayment: boolean;
}

export interface ReconcilePluggyResult {
  transactions: ReconciledPluggyTransaction[];
  transferPairs: TransferPairMatch[];
}

export interface ReconcilePluggyOptions {
  accountTypesById?: Record<string, 'checking' | 'card'>;
  incomeExternalIds?: Set<string>;
}

export interface RemovedOpenFinanceCandidate {
  entryId: string;
  action: 'soft_delete' | 'mark_removed' | 'conflict';
}

export function detectRemovedOpenFinanceEntries(
  existing: Array<{
    id: string;
    source: string;
    external_id?: string | null;
    due_date: string;
    status: string;
    user_edited_fields?: string | null;
    of_removed_at?: string | null;
  }>,
  fetchedExternalIds: Set<string>,
  windowStartIso: string
): RemovedOpenFinanceCandidate[] {
  const results: RemovedOpenFinanceCandidate[] = [];
  for (const entry of existing) {
    if (entry.source !== 'OPEN_FINANCE') continue;
    if (!entry.external_id) continue;
    if (entry.of_removed_at) continue;
    if (entry.due_date < windowStartIso) continue;
    if (fetchedExternalIds.has(entry.external_id)) continue;

    let hasUserEdits = false;
    if (entry.user_edited_fields && entry.user_edited_fields.trim()) {
      const trimmed = entry.user_edited_fields.trim();
      if (trimmed !== '[]' && trimmed !== 'null') {
        hasUserEdits = true;
      }
    }

    if (hasUserEdits) {
      results.push({ entryId: entry.id, action: 'conflict' });
    } else if (entry.status === 'pending') {
      results.push({ entryId: entry.id, action: 'soft_delete' });
    } else {
      results.push({ entryId: entry.id, action: 'mark_removed' });
    }
  }
  return results;
}

export function deduplicatePluggyAccountTransactions(
  txs: PluggyTransaction[]
): Array<{ tx: PluggyTransaction; externalId: string }> {
  const seenById = new Map<string, { date: string; amountCents: number }>();
  const usedExternalIds = new Set<string>();
  const result: Array<{ tx: PluggyTransaction; externalId: string }> = [];

  for (const tx of txs) {
    const dateIso = (tx.date || '').slice(0, 10);
    const amountCents = toCentsDecimal(tx.amountInAccountCurrency ?? tx.amount);
    const prev = seenById.get(tx.id);
    if (!prev) {
      seenById.set(tx.id, { date: dateIso, amountCents });
      usedExternalIds.add(tx.id);
      result.push({ tx, externalId: tx.id });
    } else if (prev.date === dateIso && prev.amountCents === amountCents) {
      // Mesma transação retornada em duas passadas (createdAtFrom + dateFrom) -> deduplica
      continue;
    } else {
      // Banrisul pode repetir transactionId com data/valor diferentes no mesmo fetch
      const composite = `${tx.id}:${dateIso}:${amountCents}`;
      if (!usedExternalIds.has(composite)) {
        usedExternalIds.add(composite);
        result.push({ tx, externalId: composite });
      }
    }
  }
  return result;
}

function parseIsoDay(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}

function daysBetweenIso(aIso: string, bIso: string): number {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.abs(Math.round((utcA - utcB) / 86400000));
}

export function toCentsDecimal(value: number | string): number {
  const res = new Decimal(value)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return Object.is(res, -0) ? 0 : res;
}

export function mapPluggyAccount(
  account: PluggyAccount,
  connectorName?: string | null,
  itemInstitution?: string | null
): MappedPluggyAccount {
  const isCredit = account.type === 'CREDIT';
  const creditData = account.creditData ?? null;
  const closingDay = isCredit ? parseIsoDay(creditData?.balanceCloseDate) : null;
  const dueDay = isCredit ? parseIsoDay(creditData?.balanceDueDate) : null;
  const creditLimitCents =
    isCredit && creditData?.creditLimit != null
      ? toCentsDecimal(creditData.creditLimit)
      : null;
  const digits = (account.number || '').replace(/\D/g, '');
  const maskedNumber = digits.length >= 4 ? digits.slice(-4) : null;
  const owner = account.owner?.trim() || null;
  const closingBalanceCents =
    account.bankData?.closingBalance != null
      ? toCentsDecimal(account.bankData.closingBalance)
      : null;
  const autoInvestedCents =
    account.bankData?.automaticallyInvestedBalance != null
      ? toCentsDecimal(account.bankData.automaticallyInvestedBalance)
      : null;
  const creditUsedCents =
    isCredit &&
    creditData?.creditLimit != null &&
    creditData?.availableCreditLimit != null
      ? toCentsDecimal(creditData.creditLimit) - toCentsDecimal(creditData.availableCreditLimit)
      : null;

  const ofAvailableLimitCents =
    isCredit && creditData?.availableCreditLimit != null
      ? toCentsDecimal(creditData.availableCreditLimit)
      : null;
  const ofMinimumPaymentCents =
    isCredit && creditData?.minimumPayment != null
      ? toCentsDecimal(creditData.minimumPayment)
      : null;
  const ofBalanceDueDate =
    isCredit && creditData?.balanceDueDate
      ? creditData.balanceDueDate.slice(0, 10)
      : null;
  const ofOverdraftUsedCents =
    !isCredit && account.bankData?.overdraftUsedLimit != null
      ? toCentsDecimal(account.bankData.overdraftUsedLimit)
      : null;
  const ofReservedCents =
    !isCredit && Array.isArray(account.bankData?.reservedBalances)
      ? account.bankData.reservedBalances.reduce(
          (sum, rb) =>
            sum +
            (rb.availableAmounts ?? []).reduce((s, a) => s + toCentsDecimal(a.amount), 0),
          0
        )
      : null;

  return {
    ofAccountId: account.id,
    name: buildAccountName(account, connectorName, itemInstitution),
    type: isCredit ? 'card' : 'checking',
    source: 'OPEN_FINANCE',
    reportedBalanceCents: toCentsDecimal(account.balance),
    reportedBalanceAt: account.updatedAt,
    creditLimitCents,
    dueDay,
    closingDay,
    needsClosingDay: isCredit && closingDay === null,
    maskedNumber,
    owner,
    closingBalanceCents,
    autoInvestedCents,
    creditUsedCents,
    ofAvailableLimitCents,
    ofMinimumPaymentCents,
    ofBalanceDueDate,
    ofOverdraftUsedCents,
    ofReservedCents,
  };
}

export function mapPluggyTransaction(
  tx: PluggyTransaction,
  options: MapPluggyTransactionOptions
): MappedPluggyTransaction {
  const rawAmount = tx.amountInAccountCurrency ?? tx.amount;
  const amountCents = Math.abs(toCentsDecimal(rawAmount));
  const rawStatus: FinEntryStatus = tx.status === 'POSTED' ? 'paid' : 'pending';

  let kind: FinKind | 'transfer_in' | 'transfer_out';
  let entryClass: ClassifyResult;
  if (options.accountType === 'card') {
    entryClass = classifyOpenFinanceCardEntry(tx, {
      rules: options.rules ?? [],
      recentCardPurchases: options.recentCardPurchases,
    });
    kind = entryClass.kind;
  } else {
    entryClass = classifyOpenFinanceBankEntry(tx, {
      rules: options.rules ?? [],
      isIncomeLinked: options.isIncomeLinked,
    });
    kind = entryClass.kind;
  }

  const dueDate = tx.date.slice(0, 10);
  const rawPaidDate = rawStatus === 'paid' ? dueDate : null;
  const rawPaidAmountCents = rawStatus === 'paid' ? amountCents : null;

  const billId = tx.creditCardMetadata?.billId ?? null;
  let explicitBillMonth: string | undefined;
  let ofBillMonthSource: string | null = null;
  if (options.accountType === 'card') {
    if (kind === 'transfer_in' && options.bills && options.bills.length > 0) {
      const payBillMonth = assignPaymentBillMonth(
        toBrtDate(tx.date),
        options.bills.map((b) => ({
          bill_month: b.dueDate.slice(0, 7),
          closing_date: b.billClosingDate ? b.billClosingDate.slice(0, 10) : null,
          due_date: b.dueDate.slice(0, 10),
        }))
      );
      if (payBillMonth) {
        explicitBillMonth = payBillMonth;
        ofBillMonthSource = 'PAYMENT_CYCLE';
      }
    } else {
      const assigned = assignBillMonth(tx, {
        bills: options.bills ?? [],
        closingDay: options.closingDay ?? 1,
        dueDay: options.dueDay ?? null,
        forecastOffset: options.forecastOffset,
      });
      explicitBillMonth = assigned.billMonth;
      ofBillMonthSource = assigned.source;
    }
  }

  const normalized = normalizeCardEntry(
    {
      kind,
      dueDate,
      amountCents,
      status: rawStatus,
      paidDate: rawPaidDate,
      paidAmountCents: rawPaidAmountCents,
      billMonth: explicitBillMonth,
    },
    {
      type: options.accountType,
      closing_day: options.closingDay ?? null,
      due_day: options.dueDay ?? null,
    }
  );
  const status = normalized.status;
  const paidDate = normalized.paid_date;
  const paidAmountCents = normalized.paid_amount_cents;
  const billMonth = normalized.bill_month;

  const rawOriginal = tx.descriptionRaw ?? tx.description ?? null;
  const { categoryId, matchedRuleId } = {
    categoryId: entryClass.categoryId,
    matchedRuleId: entryClass.matchedRuleId,
  };

  return {
    externalId: options.externalIdOverride ?? tx.id,
    source: 'OPEN_FINANCE',
    accountId: options.accountId,
    kind,
    status,
    amountCents,
    dueDate,
    paidDate,
    paidAmountCents,
    description: cleanTransactionDescription(tx),
    descriptionRaw: rawOriginal,
    categoryId,
    ...(matchedRuleId ? { matchedRuleId } : {}),
    ofCategoryId: tx.categoryId ?? null,
    classReason: entryClass.reason ?? null,
    installmentNumber: tx.creditCardMetadata?.installmentNumber ?? null,
    installmentTotal: tx.creditCardMetadata?.totalInstallments ?? null,
    billId,
    billMonth,
    ofProviderId: tx.providerId ?? null,
    ofBillId: billId,
    ofBillForecastMonth: tx.creditCardMetadata?.billForecastDate
      ? tx.creditCardMetadata.billForecastDate.slice(0, 7)
      : null,
    ofBillPostDate: tx.creditCardMetadata?.billPostDate
      ? tx.creditCardMetadata.billPostDate.slice(0, 10)
      : null,
    ofOperationType: tx.operationType ?? null,
    ofRawStatus: tx.status ?? null,
    ofRawType: tx.type ?? null,
    ofRawAmountCents: toCentsDecimal(rawAmount),
    ofCreatedAt: tx.createdAt ?? null,
    ofInstallmentNumber: tx.creditCardMetadata?.installmentNumber ?? null,
    ofInstallmentTotal: tx.creditCardMetadata?.totalInstallments ?? null,
    ofBillMonthSource,
    ofOrder: tx.order ?? null,
  };
}

export function reconcilePluggyTransactions(
  mapped: MappedPluggyTransaction[],
  existingEntries: ReconcilableOpenFinanceEntry[],
  options?: ReconcilePluggyOptions
): ReconcilePluggyResult {
  const usedPendingIds = new Set<string>();
  const transactions: ReconciledPluggyTransaction[] = [];

  const identityMatches = matchFetchedToExisting(
    mapped.map((row) => ({
      externalId: row.externalId,
      accountId: row.accountId,
      date: row.dueDate,
      absAmountCents: Math.abs(row.ofRawAmountCents ?? row.amountCents),
      description: row.descriptionRaw ?? row.description,
      ofProviderId: row.ofProviderId ?? null,
      order: row.ofOrder ?? null,
    })),
    existingEntries
  );

  for (const m of identityMatches) {
    if (m.action === 'update' && m.existingId) {
      usedPendingIds.add(m.existingId);
    }
  }

  for (let i = 0; i < mapped.length; i += 1) {
    const row = mapped[i];
    const idMatch = identityMatches[i];
    if (idMatch.action === 'update' && idMatch.existingId) {
      transactions.push({
        ...row,
        action: 'update',
        matchedEntryId: idMatch.existingId,
        matchedBy: idMatch.matchedBy,
      });
      continue;
    }

    const accountEntries = existingEntries.filter(
      (e) => e.account_id === row.accountId
    );

    // Reaproveita reconcileImportedRows da Sprint 62 para match exato de pendente
    const availableExactCandidates: ReconcilableExistingEntry[] = accountEntries
      .filter((e) => !usedPendingIds.has(e.id))
      .map((e) => ({
        id: e.id,
        account_id: e.account_id,
        external_id: e.external_id,
        amount_cents: e.amount_cents,
        kind: e.kind,
        status: e.status,
        due_date: e.due_date,
      }));

    const [reconciledExact] = reconcileImportedRows(
      [
        {
          date: row.dueDate,
          description: row.description,
          amountCents: row.amountCents,
          direction: row.kind === 'expense' || row.kind === 'transfer_out' ? 'out' : 'in',
          externalId: row.externalId,
          categoryId: row.categoryId,
        },
      ],
      availableExactCandidates,
      row.accountId
    );

    if (
      reconciledExact?.reconcileStatus === 'settle_pending' &&
      reconciledExact.matchedEntryId
    ) {
      usedPendingIds.add(reconciledExact.matchedEntryId);
      transactions.push({
        ...row,
        action: 'settle_pending',
        matchedEntryId: reconciledExact.matchedEntryId,
      });
      continue;
    }

    // Tolerância ±15% quando variable_amount === 1 e data a até 5 dias
    const variableCandidate = accountEntries.find((e) => {
      if (usedPendingIds.has(e.id)) return false;
      if (e.status !== 'pending' || e.kind !== row.kind) return false;
      if (e.variable_amount !== 1) return false;
      if (daysBetweenIso(e.due_date, row.dueDate) > 5) return false;
      const tolerance = Math.round(e.amount_cents * 0.15);
      return Math.abs(row.amountCents - e.amount_cents) <= tolerance;
    });

    if (variableCandidate) {
      usedPendingIds.add(variableCandidate.id);
      transactions.push({
        ...row,
        action: 'settle_pending',
        matchedEntryId: variableCandidate.id,
      });
      continue;
    }

    transactions.push({
      ...row,
      action: 'create',
    });
  }

  // Detecção de pares de transferência entre contas próprias e pagamento de fatura (≤ 2 dias)
  const transferPairs: TransferPairMatch[] = [];
  const pairedExternalIds = new Set<string>();
  const accountTypesById = options?.accountTypesById ?? {};
  const incomeExternalIds = options?.incomeExternalIds;

  for (let i = 0; i < transactions.length; i += 1) {
    const outTx = transactions[i];
    if (pairedExternalIds.has(outTx.externalId)) continue;
    if (incomeExternalIds?.has(outTx.externalId)) continue;
    if (outTx.kind !== 'expense') continue;
    const outAccType = accountTypesById[outTx.accountId] ?? 'checking';
    if (outAccType !== 'checking') continue;

    for (let j = 0; j < transactions.length; j += 1) {
      if (i === j) continue;
      const inTx = transactions[j];
      if (pairedExternalIds.has(inTx.externalId)) continue;
      if (incomeExternalIds?.has(inTx.externalId)) continue;
      if (!isTransferCompatibleCategoryId(outTx.ofCategoryId) || !isTransferCompatibleCategoryId(inTx.ofCategoryId)) {
        continue;
      }
      if (inTx.accountId === outTx.accountId) continue;
      if (inTx.kind !== 'income' && inTx.kind !== 'transfer_in') continue;
      if (inTx.amountCents !== outTx.amountCents) continue;
      if (daysBetweenIso(outTx.dueDate, inTx.dueDate) > 2) continue;

      const inAccType = accountTypesById[inTx.accountId] ?? 'checking';
      const isBillPayment = inAccType === 'card';
      const transferGroupId = `of-tr-${outTx.externalId}-${inTx.externalId}`;

      pairedExternalIds.add(outTx.externalId);
      pairedExternalIds.add(inTx.externalId);

      outTx.transferGroupId = transferGroupId;
      outTx.transferPairExternalId = inTx.externalId;
      outTx.transferRole = 'transfer_out';

      inTx.transferGroupId = transferGroupId;
      inTx.transferPairExternalId = outTx.externalId;
      inTx.transferRole = 'transfer_in';

      transferPairs.push({
        outExternalId: outTx.externalId,
        inExternalId: inTx.externalId,
        transferGroupId,
        isBillPayment,
      });
      break;
    }
  }

  return { transactions, transferPairs };
}

export function parseUserEditedFields(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((f): f is string => typeof f === 'string');
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

export function mergeUserEditedFields(
  existingRaw: string | null | undefined,
  editedFields: string[]
): string {
  const set = new Set(parseUserEditedFields(existingRaw));
  for (const field of editedFields) {
    if (field.trim()) set.add(field.trim());
  }
  return JSON.stringify(Array.from(set));
}

export function applyUserEditedPreservation(
  existing: { category_id: string; description: string; user_edited_fields?: string | null },
  incoming: { category_id: string; description: string }
): { category_id: string; description: string } {
  const edited = new Set(parseUserEditedFields(existing.user_edited_fields));
  return {
    category_id: edited.has('category_id') ? existing.category_id : incoming.category_id,
    description: edited.has('description') ? existing.description : incoming.description,
  };
}

export function computeSyncWindowStart(
  lastSuccessIso: string | null,
  nowIso: string
): string {
  if (lastSuccessIso) {
    const baseMs = Date.parse(lastSuccessIso);
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return new Date(baseMs - sevenDaysMs).toISOString().slice(0, 10);
  }
  const nowDate = new Date(nowIso);
  nowDate.setUTCFullYear(nowDate.getUTCFullYear() - 1);
  return nowDate.toISOString().slice(0, 10);
}

export function shouldAutoSync(
  lastSyncIso: string | null,
  nowMs: number,
  thresholdHours = 12
): boolean {
  if (!lastSyncIso) return true;
  const lastMs = Date.parse(lastSyncIso);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs > thresholdHours * 60 * 60 * 1000;
}

export function computeBalanceDivergence(
  reportedCents: number | null | undefined,
  calculatedCents: number
): { hasDivergence: boolean; diffCents: number } {
  if (reportedCents == null) {
    return { hasDivergence: false, diffCents: 0 };
  }
  const diffCents = reportedCents - calculatedCents;
  return {
    hasDivergence: diffCents !== 0,
    diffCents,
  };
}

export function formatReportedBalanceDate(isoDate: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return 'saldo recente';
  return `saldo de ${m[2]}/${m[1]}`;
}

export function formatUpdatedAgo(lastSyncIso: string | null, nowMs: number): string {
  if (!lastSyncIso) return 'Nunca atualizado';
  const lastMs = Date.parse(lastSyncIso);
  if (!Number.isFinite(lastMs)) return 'Nunca atualizado';
  const diffHours = Math.max(0, Math.floor((nowMs - lastMs) / (60 * 60 * 1000)));
  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.floor((nowMs - lastMs) / (60 * 1000)));
    return `Atualizado há ${diffMins} min`;
  }
  return `Atualizado há ${diffHours} h`;
}
