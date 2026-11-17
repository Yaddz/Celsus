import type {
  PluggyAccount,
  PluggyBill,
  PluggyBillFinanceCharge,
  PluggyInvestment,
  PluggyItem,
  PluggyTransaction,
} from '../../services/pluggy/types';
import type { FinAccount, FinBill, FinEntry } from '../../db/schema';

export const NON_CHARGEABLE_OTHER_CHARGE_RE =
  /saldo em atraso|saldo anterior|juros de divida encerrada|total|^na$/;

export function computeChargeableChargesCents(
  _charges: PluggyBillFinanceCharge[] | null | undefined
): number {
  return 0;
}

export interface PluggyTruthSnapshot {
  item: PluggyItem;
  accounts: PluggyAccount[];
  transactionsByAccount: Record<string, PluggyTransaction[]>;
  billsByAccount: Record<string, PluggyBill[]>;
  investments?: PluggyInvestment[];
}

export interface PluggyTruthClosedBill {
  billId: string;
  dueDate: string;
  closingDate: string | null;
  totalCents: number;
  minimumCents: number | null;
  chargeableChargesCents: number;
  paidCents: number;
  status: string;
  itemsCents: number;
  itemsVsTotalDiffCents: number;
}

export interface PluggyTruthMonthlyFlow {
  month: string;
  inflowCents: number;
  outflowCents: number;
  count: number;
}

export interface PluggyTruthBankAccount {
  accountId: string;
  availableCents: number;
  ledgerCents: number | null;
  autoInvestedCents: number | null;
  overdraftUsedCents: number | null;
  reservedCents: number | null;
  scheduled: {
    toPayCents: number;
    toReceiveCents: number;
  };
  processingCents: number;
  monthlyFlows: Record<string, PluggyTruthMonthlyFlow>;
}

export interface PluggyTruthCardAccount {
  accountId: string;
  limitCents: number | null;
  availableCents: number | null;
  usedCents: number;
  minimumPaymentCents: number | null;
  dueDate: string | null;
  closedBills: PluggyTruthClosedBill[];
  openBill: number;
  futureBills: Array<{ billMonth: string; totalCents: number }>;
}

export interface PluggyTruthSignMismatch {
  accountId: string;
  txId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
}

export interface PluggyTruthResult {
  connection: {
    lastUpdatedAt: string | null;
    status: string;
    executionStatus: string;
    consentExpiresAt: string | null;
    productsNotUpdated: string[];
    warnings: Array<{ product: string; code: string; message?: string; providerMessage?: string | null }>;
  };
  bankAccounts: Record<string, PluggyTruthBankAccount>;
  cardAccounts: Record<string, PluggyTruthCardAccount>;
  signMismatches: PluggyTruthSignMismatch[];
  totals: {
    bankTotalCents: number;
    cardsDebtCents: number;
    cardsLimitCents: number;
    cardsUsagePct: number;
    investmentsCents: number;
    pendingOutflowCents: number;
    pendingOutflowByCategory: Record<string, number>;
    txCountByAccount: Record<string, number>;
  };
}

export interface AppNumbersCardBill {
  billMonth: string;
  totalCents: number;
  paidCents: number;
  status: string;
}

export interface AppNumbersResult {
  bankBalancesByOfAccountId: Record<string, number>;
  cardsByOfAccountId: Record<
    string,
    {
      usedCents: number | null;
      availableCents: number | null;
      openBillCents: number;
      closedBillsByMonth: Record<string, AppNumbersCardBill>;
    }
  >;
}

export type DifferenceReason =
  | 'ITEMS_VS_TOTAL'
  | 'APP_RECOMPUTED'
  | 'MISSING_BILL'
  | 'SIGN_MISMATCH'
  | 'COUNT_MISMATCH';

export interface Difference {
  scope: 'BANK' | 'CARD' | 'BILL' | 'TX_COUNT' | 'SIGN';
  key: string;
  pluggyCents: number;
  appCents: number;
  diffCents: number;
  reason: DifferenceReason;
}

export type AssignBillMonthFn = (
  tx: PluggyTransaction,
  bills: PluggyBill[],
  account: PluggyAccount
) => string;

export function computePluggyTruth(
  _snapshot: PluggyTruthSnapshot,
  _todayIso: string,
  _options?: { assignBillMonth?: AssignBillMonthFn }
): PluggyTruthResult {
  throw new Error('NOT_IMPLEMENTED');
}

export function collectAppNumbers(_inputs: {
  accounts: FinAccount[];
  entries: FinEntry[];
  bills?: FinBill[];
  todayIso: string;
}): AppNumbersResult {
  throw new Error('NOT_IMPLEMENTED');
}

export function reconcileAppVsPluggy(
  _truth: PluggyTruthResult,
  _appNumbers: AppNumbersResult
): Difference[] {
  throw new Error('NOT_IMPLEMENTED');
}
