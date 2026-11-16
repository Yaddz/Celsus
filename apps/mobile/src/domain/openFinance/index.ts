import Decimal from 'decimal.js';
import type { PluggyAccount, PluggyBill, PluggyTransaction } from '../../services/pluggy/types';
import {
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
}

export interface MappedPluggyTransaction {
  externalId: string;
  source: 'OPEN_FINANCE';
  accountId: string;
  kind: FinKind;
  status: FinEntryStatus;
  amountCents: number;
  dueDate: string;
  paidDate: string | null;
  paidAmountCents: number | null;
  description: string;
  descriptionRaw: string | null;
  categoryId: string;
  matchedRuleId?: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  billId: string | null;
  billMonth: string | null;
}

export interface MapPluggyTransactionOptions {
  accountId: string;
  accountType: 'checking' | 'card';
  closingDay?: number | null;
  bills?: PluggyBill[];
  rules?: CategoryRuleLike[];
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
}

export type OpenFinanceReconcileAction = 'create' | 'update' | 'settle_pending';

export interface ReconciledPluggyTransaction extends MappedPluggyTransaction {
  action: OpenFinanceReconcileAction;
  matchedEntryId?: string;
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
}

const PLUGGY_L1_EXPENSE_CATEGORY_MAP: Record<string, string> = {
  groceries: 'cat-mercado',
  supermarket: 'cat-mercado',
  supermercado: 'cat-mercado',
  'food and beverage': 'cat-mercado',
  alimentacao: 'cat-mercado',
  restaurants: 'cat-lazer',
  transportation: 'cat-transporte',
  transporte: 'cat-transporte',
  automotive: 'cat-transporte',
  health: 'cat-saude',
  healthcare: 'cat-saude',
  saude: 'cat-saude',
  pharmacy: 'cat-saude',
  entertainment: 'cat-lazer',
  leisure: 'cat-lazer',
  lazer: 'cat-lazer',
  travel: 'cat-lazer',
  shopping: 'cat-lazer',
  compras: 'cat-lazer',
  housing: 'cat-moradia',
  home: 'cat-moradia',
  moradia: 'cat-moradia',
  utilities: 'cat-moradia',
  bills: 'cat-moradia',
  contas: 'cat-moradia',
  subscriptions: 'cat-assinaturas',
  assinaturas: 'cat-assinaturas',
  telecom: 'cat-assinaturas',
  telecommunications: 'cat-assinaturas',
};

const PLUGGY_L1_INCOME_CATEGORY_MAP: Record<string, string> = {
  salary: 'cat-salario',
  salario: 'cat-salario',
  payroll: 'cat-salario',
  income: 'cat-outros-receita',
  receitas: 'cat-outros-receita',
};

function normalizeKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

export function mapPluggyAccount(account: PluggyAccount): MappedPluggyAccount {
  const isCredit = account.type === 'CREDIT';
  const creditData = account.creditData ?? null;
  const closingDay = isCredit ? parseIsoDay(creditData?.balanceCloseDate) : null;
  const dueDay = isCredit ? parseIsoDay(creditData?.balanceDueDate) : null;
  const creditLimitCents =
    isCredit && creditData?.creditLimit != null
      ? toCentsDecimal(creditData.creditLimit)
      : null;

  return {
    ofAccountId: account.id,
    name: account.marketingName?.trim() || account.name,
    type: isCredit ? 'card' : 'checking',
    source: 'OPEN_FINANCE',
    reportedBalanceCents: toCentsDecimal(account.balance),
    reportedBalanceAt: account.updatedAt,
    creditLimitCents,
    dueDay,
    closingDay,
    needsClosingDay: isCredit && closingDay === null,
  };
}

export function mapPluggyCategory(
  pluggyCategory: string | null | undefined,
  kind: 'income' | 'expense',
  rules: CategoryRuleLike[],
  description: string
): { categoryId: string; matchedRuleId?: string } {
  const [ruleResult] = applyCategoryRules(
    [
      {
        date: '2026-01-01',
        description,
        amountCents: 100,
        direction: kind === 'income' ? 'in' : 'out',
        externalId: 'rule-probe',
      },
    ],
    rules
  );

  if (ruleResult?.matchedRuleId) {
    return {
      categoryId: ruleResult.categoryId,
      matchedRuleId: ruleResult.matchedRuleId,
    };
  }

  if (pluggyCategory && pluggyCategory.trim()) {
    const key = normalizeKey(pluggyCategory);
    const map =
      kind === 'income'
        ? PLUGGY_L1_INCOME_CATEGORY_MAP
        : PLUGGY_L1_EXPENSE_CATEGORY_MAP;
    if (map[key]) {
      return { categoryId: map[key] };
    }
  }

  return {
    categoryId: kind === 'income' ? 'cat-outros-receita' : 'cat-outros-despesa',
  };
}

export function mapPluggyTransaction(
  tx: PluggyTransaction,
  options: MapPluggyTransactionOptions
): MappedPluggyTransaction {
  const rawAmount = tx.amountInAccountCurrency ?? tx.amount;
  const amountCents = Math.abs(toCentsDecimal(rawAmount));
  const status: FinEntryStatus = tx.status === 'POSTED' ? 'paid' : 'pending';

  let kind: FinKind;
  if (options.accountType === 'card') {
    kind = rawAmount >= 0 ? 'expense' : 'income';
  } else {
    kind = tx.type === 'DEBIT' || rawAmount < 0 ? 'expense' : 'income';
  }

  const dueDate = tx.date.slice(0, 10);
  const paidDate = status === 'paid' ? dueDate : null;
  const paidAmountCents = status === 'paid' ? amountCents : null;

  const billId = tx.creditCardMetadata?.billId ?? null;
  let billMonth: string | null = null;
  if (options.accountType === 'card') {
    const matchingBill = billId
      ? options.bills?.find((b) => b.id === billId)
      : undefined;
    if (matchingBill?.dueDate) {
      billMonth = matchingBill.dueDate.slice(0, 7);
    } else if (options.closingDay != null) {
      billMonth = resolveBillMonth(dueDate, options.closingDay);
    } else {
      billMonth = dueDate.slice(0, 7);
    }
  }

  const { categoryId, matchedRuleId } = mapPluggyCategory(
    tx.category,
    kind === 'income' ? 'income' : 'expense',
    options.rules ?? [],
    tx.description
  );

  return {
    externalId: tx.id,
    source: 'OPEN_FINANCE',
    accountId: options.accountId,
    kind,
    status,
    amountCents,
    dueDate,
    paidDate,
    paidAmountCents,
    description: tx.description,
    descriptionRaw: tx.descriptionRaw ?? null,
    categoryId,
    ...(matchedRuleId ? { matchedRuleId } : {}),
    installmentNumber: tx.creditCardMetadata?.installmentNumber ?? null,
    installmentTotal: tx.creditCardMetadata?.totalInstallments ?? null,
    billId,
    billMonth,
  };
}

export function reconcilePluggyTransactions(
  mapped: MappedPluggyTransaction[],
  existingEntries: ReconcilableOpenFinanceEntry[],
  options?: ReconcilePluggyOptions
): ReconcilePluggyResult {
  const usedPendingIds = new Set<string>();
  const transactions: ReconciledPluggyTransaction[] = [];

  for (const row of mapped) {
    const accountEntries = existingEntries.filter(
      (e) => e.account_id === row.accountId
    );
    const byExternal = accountEntries.find(
      (e) => e.external_id && e.external_id === row.externalId
    );

    if (byExternal) {
      transactions.push({
        ...row,
        action: 'update',
        matchedEntryId: byExternal.id,
      });
      continue;
    }

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
          direction: row.kind === 'income' ? 'in' : 'out',
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

  for (let i = 0; i < transactions.length; i += 1) {
    const outTx = transactions[i];
    if (pairedExternalIds.has(outTx.externalId)) continue;
    if (outTx.kind !== 'expense') continue;
    const outAccType = accountTypesById[outTx.accountId] ?? 'checking';
    if (outAccType !== 'checking') continue;

    for (let j = 0; j < transactions.length; j += 1) {
      if (i === j) continue;
      const inTx = transactions[j];
      if (pairedExternalIds.has(inTx.externalId)) continue;
      if (inTx.accountId === outTx.accountId) continue;
      if (inTx.kind !== 'income') continue;
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
