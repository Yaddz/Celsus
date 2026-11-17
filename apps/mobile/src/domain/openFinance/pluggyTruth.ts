import type { FinAccount, FinBill, FinEntry } from '../../db/schema';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyBillFinanceCharge,
  PluggyInvestment,
  PluggyItem,
  PluggyTransaction,
} from '../../services/pluggy/types';
import {
  computeAppPendingOutflowCents,
  monthlyAccountFlows,
  resolveAccountBalance,
  resolveBillMonth,
  summarizeCardAccountForScreen,
} from '../financeFlow';
import {
  assignBillMonth,
  deriveCardCalendar,
  inferForecastOffset,
  summarizeOpenFinanceBill,
} from './cardBills';
import { toBrtDate, toBrtMonth } from './dates';
import { toCentsDecimal } from './index';

export const NON_CHARGEABLE_OTHER_CHARGE_RE =
  /saldo em atraso|saldo anterior|juros de divida encerrada|total|^na$/;

function normalizeChargeInfo(info: string | null | undefined): string {
  return (info ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function computeChargeableChargesCents(
  charges: PluggyBillFinanceCharge[] | null | undefined
): number {
  if (!charges || charges.length === 0) return 0;
  let total = 0;
  for (const chg of charges) {
    if (chg.type !== 'OTHER') {
      total += toCentsDecimal(chg.amount);
      continue;
    }
    const norm = normalizeChargeInfo(chg.additionalInfo);
    if (!NON_CHARGEABLE_OTHER_CHARGE_RE.test(norm)) {
      total += toCentsDecimal(chg.amount);
    }
  }
  return total;
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
    warnings: Array<{
      product: string;
      code: string;
      message?: string;
      providerMessage?: string | null;
    }>;
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
  bankMonthlyFlowsByOfAccountId?: Record<
    string,
    Record<string, { inflowCents: number; outflowCents: number; count: number }>
  >;
  pendingOutflowCents?: number;
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

function defaultAssignBillMonth(
  tx: PluggyTransaction,
  bills: PluggyBill[],
  account: PluggyAccount,
  forecastOffset = 0
): string {
  const derived = deriveCardCalendar(bills);
  const closingDay =
    derived?.closingDay ??
    (account.creditData?.balanceCloseDate
      ? Number.parseInt(toBrtDate(account.creditData.balanceCloseDate).slice(8, 10), 10)
      : 1);
  const dueDay =
    derived?.dueDay ??
    (account.creditData?.balanceDueDate
      ? Number.parseInt(toBrtDate(account.creditData.balanceDueDate).slice(8, 10), 10)
      : 10);
  return assignBillMonth(tx, { bills, closingDay, dueDay, forecastOffset }).billMonth;
}

function nextMonthYm(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function hasSignMismatch(
  accountType: 'BANK' | 'CREDIT',
  tx: PluggyTransaction
): boolean {
  const raw = tx.amountInAccountCurrency ?? tx.amount;
  if (raw === 0) return false;
  if (accountType === 'BANK') {
    return (tx.type === 'CREDIT' && raw < 0) || (tx.type === 'DEBIT' && raw > 0);
  }
  return (tx.type === 'DEBIT' && raw < 0) || (tx.type === 'CREDIT' && raw > 0);
}

export function computePluggyTruth(
  snapshot: PluggyTruthSnapshot,
  todayIso: string,
  options?: { assignBillMonth?: AssignBillMonthFn }
): PluggyTruthResult {
  const productsNotUpdated: string[] = [];
  const warnings: PluggyTruthResult['connection']['warnings'] = [];
  const detail = snapshot.item.statusDetail;
  if (detail) {
    for (const [product, info] of Object.entries(detail)) {
      if (!info) continue;
      if (info.isUpdated === false) {
        productsNotUpdated.push(product);
      }
      if (Array.isArray(info.warnings)) {
        for (const w of info.warnings) {
          if (w?.code) {
            warnings.push({
              product,
              code: w.code,
              message: w.message,
              providerMessage: w.providerMessage ?? null,
            });
          }
        }
      }
    }
  }

  const bankAccounts: Record<string, PluggyTruthBankAccount> = {};
  const cardAccounts: Record<string, PluggyTruthCardAccount> = {};
  const signMismatches: PluggyTruthSignMismatch[] = [];
  const pendingOutflowByCategory: Record<string, number> = {};
  const txCountByAccount: Record<string, number> = {};

  let bankTotalCents = 0;
  let cardsDebtCents = 0;
  let cardsLimitCents = 0;
  let pendingOutflowCents = 0;

  for (const account of snapshot.accounts) {
    const txs = snapshot.transactionsByAccount[account.id] ?? [];
    txCountByAccount[account.id] = txs.length;

    for (const tx of txs) {
      if (hasSignMismatch(account.type, tx)) {
        signMismatches.push({
          accountId: account.id,
          txId: tx.id,
          type: tx.type,
          amount: tx.amountInAccountCurrency ?? tx.amount,
        });
      }
      if (tx.status === 'PENDING' && tx.type === 'DEBIT') {
        const absCents = Math.abs(toCentsDecimal(tx.amountInAccountCurrency ?? tx.amount));
        pendingOutflowCents += absCents;
        const catKey = tx.category ?? 'Uncategorized';
        pendingOutflowByCategory[catKey] = (pendingOutflowByCategory[catKey] ?? 0) + absCents;
      }
    }

    if (account.type === 'BANK') {
      const availableCents = toCentsDecimal(account.balance);
      bankTotalCents += availableCents;

      let reservedCents: number | null = null;
      if (Array.isArray(account.bankData?.reservedBalances)) {
        let sum = 0;
        for (const rb of account.bankData.reservedBalances) {
          for (const amt of rb.availableAmounts ?? []) {
            sum += toCentsDecimal(amt.amount);
          }
        }
        reservedCents = sum;
      }

      const scheduled = { toPayCents: 0, toReceiveCents: 0 };
      let processingCents = 0;
      const monthlyFlows: Record<string, PluggyTruthMonthlyFlow> = {};

      for (const tx of txs) {
        const absCents = Math.abs(toCentsDecimal(tx.amountInAccountCurrency ?? tx.amount));
        const brtDate = toBrtDate(tx.date);
        if (tx.status === 'PENDING') {
          if (brtDate > todayIso) {
            if (tx.type === 'DEBIT') scheduled.toPayCents += absCents;
            else scheduled.toReceiveCents += absCents;
          } else {
            processingCents += absCents;
          }
        } else if (tx.status === 'POSTED') {
          const month = brtDate.slice(0, 7);
          const flow = monthlyFlows[month] ?? {
            month,
            inflowCents: 0,
            outflowCents: 0,
            count: 0,
          };
          if (tx.type === 'CREDIT') flow.inflowCents += absCents;
          else flow.outflowCents += absCents;
          flow.count += 1;
          monthlyFlows[month] = flow;
        }
      }

      bankAccounts[account.id] = {
        accountId: account.id,
        availableCents,
        ledgerCents:
          account.bankData?.closingBalance != null
            ? toCentsDecimal(account.bankData.closingBalance)
            : null,
        autoInvestedCents:
          account.bankData?.automaticallyInvestedBalance != null
            ? toCentsDecimal(account.bankData.automaticallyInvestedBalance)
            : null,
        overdraftUsedCents:
          account.bankData?.overdraftUsedLimit != null
            ? toCentsDecimal(account.bankData.overdraftUsedLimit)
            : null,
        reservedCents,
        scheduled,
        processingCents,
        monthlyFlows,
      };
    } else if (account.type === 'CREDIT') {
      const limitCents =
        account.creditData?.creditLimit != null
          ? toCentsDecimal(account.creditData.creditLimit)
          : null;
      const availableCents =
        account.creditData?.availableCreditLimit != null
          ? toCentsDecimal(account.creditData.availableCreditLimit)
          : null;
      const usedCents = toCentsDecimal(account.balance);

      cardsDebtCents += usedCents;
      if (limitCents != null) cardsLimitCents += limitCents;

      const bills = [...(snapshot.billsByAccount[account.id] ?? [])].sort((a, b) =>
        toBrtDate(a.dueDate).localeCompare(toBrtDate(b.dueDate))
      );

      const closedBills: PluggyTruthClosedBill[] = bills.map((bill, idx) => {
        const nextBill = idx + 1 < bills.length ? bills[idx + 1] : null;
        const dueDate = toBrtDate(bill.dueDate);
        const closingDate = bill.billClosingDate ? toBrtDate(bill.billClosingDate) : null;
        const totalCents = toCentsDecimal(bill.totalAmount);
        const minimumCents =
          bill.minimumPaymentAmount != null
            ? toCentsDecimal(bill.minimumPaymentAmount)
            : null;
        const chargeableChargesCents = computeChargeableChargesCents(bill.financeCharges);
        const chargeableNextCents = nextBill
          ? computeChargeableChargesCents(nextBill.financeCharges)
          : 0;

        let itemsCents = 0;
        for (const tx of txs) {
          if (tx.creditCardMetadata?.billId !== bill.id) continue;
          if (tx.operationType === 'PAGAMENTO_FATURA') continue;
          const absCents = Math.abs(toCentsDecimal(tx.amountInAccountCurrency ?? tx.amount));
          itemsCents += tx.type === 'DEBIT' ? absCents : -absCents;
        }

        let paidCents = 0;
        if (nextBill?.payments && nextBill.payments.length > 0) {
          paidCents = nextBill.payments.reduce((s, p) => s + toCentsDecimal(p.amount), 0);
        } else if (!nextBill && bill.payments && bill.payments.length > 0) {
          paidCents = bill.payments
            .filter((p) => !closingDate || toBrtDate(p.paymentDate) >= closingDate)
            .reduce((s, p) => s + toCentsDecimal(p.amount), 0);
        }

        let status = 'aberta';
        if (totalCents <= 0) {
          status = 'sem saldo';
        } else if (paidCents >= totalCents + chargeableNextCents) {
          status = 'paga';
        } else if (paidCents > 0 && paidCents < totalCents) {
          status = todayIso > dueDate ? 'atrasada' : 'parcial';
        } else if (todayIso > dueDate) {
          status = 'atrasada';
        } else if (closingDate && todayIso >= closingDate && todayIso <= dueDate) {
          status = 'fechada';
        }

        return {
          billId: bill.id,
          dueDate,
          closingDate,
          totalCents,
          minimumCents,
          chargeableChargesCents,
          paidCents,
          status,
          itemsCents,
          itemsVsTotalDiffCents: itemsCents - totalCents,
        };
      });

      const closedBillMonths = new Set(bills.map((b) => toBrtMonth(b.dueDate)));
      const latestClosedMonth =
        bills.length > 0 ? toBrtMonth(bills[bills.length - 1].dueDate) : null;
      const derivedCal = deriveCardCalendar(bills);
      const closingDay =
        derivedCal?.closingDay ??
        (account.creditData?.balanceCloseDate
          ? Number.parseInt(toBrtDate(account.creditData.balanceCloseDate).slice(8, 10), 10)
          : 1);
      const dueDay =
        derivedCal?.dueDay ??
        (account.creditData?.balanceDueDate
          ? Number.parseInt(toBrtDate(account.creditData.balanceDueDate).slice(8, 10), 10)
          : 10);
      let openBillMonth = resolveBillMonth(todayIso, closingDay, dueDay);
      if (latestClosedMonth && openBillMonth <= latestClosedMonth) {
        openBillMonth = nextMonthYm(latestClosedMonth);
      }

      const byOpenMonth = new Map<string, number>();
      const forecastOffset = inferForecastOffset(txs, bills);
      const assignFn = options?.assignBillMonth;
      for (const tx of txs) {
        if (tx.creditCardMetadata?.billId) continue;
        if (tx.operationType === 'PAGAMENTO_FATURA') continue;
        const bm = assignFn
          ? assignFn(tx, bills, account)
          : defaultAssignBillMonth(tx, bills, account, forecastOffset);
        if (closedBillMonths.has(bm)) continue;
        const absCents = Math.abs(toCentsDecimal(tx.amountInAccountCurrency ?? tx.amount));
        const signed = tx.type === 'DEBIT' ? absCents : -absCents;
        byOpenMonth.set(bm, (byOpenMonth.get(bm) ?? 0) + signed);
      }

      const openBill = byOpenMonth.get(openBillMonth) ?? 0;
      const futureBills = Array.from(byOpenMonth.entries())
        .filter(([bm]) => bm > openBillMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([billMonth, totalCents]) => ({ billMonth, totalCents }));

      cardAccounts[account.id] = {
        accountId: account.id,
        limitCents,
        availableCents,
        usedCents,
        minimumPaymentCents:
          account.creditData?.minimumPayment != null
            ? toCentsDecimal(account.creditData.minimumPayment)
            : null,
        dueDate: account.creditData?.balanceDueDate
          ? toBrtDate(account.creditData.balanceDueDate)
          : null,
        closedBills,
        openBill,
        futureBills,
      };
    }
  }

  let investmentsCents = 0;
  for (const inv of snapshot.investments ?? []) {
    if (inv.status === 'TOTAL_WITHDRAWAL') continue;
    investmentsCents += toCentsDecimal(inv.balance);
  }

  const cardsUsagePct =
    cardsLimitCents > 0 ? Math.round((cardsDebtCents / cardsLimitCents) * 100) : 0;

  return {
    connection: {
      lastUpdatedAt: snapshot.item.lastUpdatedAt ?? null,
      status: snapshot.item.status,
      executionStatus: snapshot.item.executionStatus,
      consentExpiresAt: snapshot.item.consentExpiresAt ?? null,
      productsNotUpdated,
      warnings,
    },
    bankAccounts,
    cardAccounts,
    signMismatches,
    totals: {
      bankTotalCents,
      cardsDebtCents,
      cardsLimitCents,
      cardsUsagePct,
      investmentsCents,
      pendingOutflowCents,
      pendingOutflowByCategory,
      txCountByAccount,
    },
  };
}

export function collectAppNumbers(inputs: {
  accounts: FinAccount[];
  entries: FinEntry[];
  bills?: FinBill[];
  todayIso: string;
}): AppNumbersResult {
  const bankBalancesByOfAccountId: Record<string, number> = {};
  const bankMonthlyFlowsByOfAccountId: NonNullable<AppNumbersResult['bankMonthlyFlowsByOfAccountId']> = {};
  const cardsByOfAccountId: AppNumbersResult['cardsByOfAccountId'] = {};

  for (const acc of inputs.accounts) {
    if (acc.source !== 'OPEN_FINANCE' || !acc.of_account_id) continue;
    if (acc.type === 'checking') {
      bankBalancesByOfAccountId[acc.of_account_id] = resolveAccountBalance(acc, inputs.entries);
      const months = new Set<string>();
      for (const e of inputs.entries) {
        if (e.account_id === acc.id && !e.of_removed_at && e.status === 'paid' && e.due_date.length >= 7) {
          months.add(e.due_date.slice(0, 7));
        }
      }
      const accFlows: Record<string, { inflowCents: number; outflowCents: number; count: number }> = {};
      for (const m of months) {
        const flow = monthlyAccountFlows(inputs.entries, acc.id, m);
        accFlows[m] = {
          inflowCents: flow.inflowCents,
          outflowCents: flow.outflowCents,
          count: flow.count,
        };
      }
      bankMonthlyFlowsByOfAccountId[acc.of_account_id] = accFlows;
    } else if (acc.type === 'card') {
      const cardSummary = summarizeCardAccountForScreen(acc, inputs.entries, inputs.todayIso);
      const closedBillsByMonth: Record<string, AppNumbersCardBill> = {};
      const accBills = [...(inputs.bills ?? []).filter((b) => b.account_id === acc.id)].sort(
        (a, b) => a.due_date.localeCompare(b.due_date)
      );
      if (accBills.length > 0) {
        for (let i = 0; i < accBills.length; i += 1) {
          const bill = accBills[i];
          const nextBill = i + 1 < accBills.length ? accBills[i + 1] : null;
          const ofSummary = summarizeOpenFinanceBill(
            bill,
            nextBill,
            inputs.entries,
            inputs.todayIso,
            { firstSyncIso: acc.of_linked_at }
          );
          closedBillsByMonth[bill.bill_month] = {
            billMonth: bill.bill_month,
            totalCents: ofSummary.totalCents,
            paidCents: ofSummary.paidCents,
            status: ofSummary.status,
          };
        }
      } else {
        for (const [bm, summary] of Object.entries(cardSummary.closedBillsByMonth)) {
          closedBillsByMonth[bm] = {
            billMonth: bm,
            totalCents: summary.totalCents,
            paidCents: summary.paidCents,
            status: summary.status,
          };
        }
      }
      cardsByOfAccountId[acc.of_account_id] = {
        usedCents: acc.credit_used_cents ?? null,
        availableCents: acc.of_available_limit_cents ?? cardSummary.availLimitCents,
        openBillCents: cardSummary.currentBillSummary.totalCents,
        closedBillsByMonth,
      };
    }
  }

  return {
    bankBalancesByOfAccountId,
    bankMonthlyFlowsByOfAccountId,
    pendingOutflowCents: computeAppPendingOutflowCents(inputs.entries),
    cardsByOfAccountId,
  };
}

export function reconcileAppVsPluggy(
  truth: PluggyTruthResult,
  appNumbers: AppNumbersResult
): Difference[] {
  const diffs: Difference[] = [];

  for (const [accId, bankTruth] of Object.entries(truth.bankAccounts)) {
    const appBal = appNumbers.bankBalancesByOfAccountId[accId];
    if (appBal !== undefined && appBal !== bankTruth.availableCents) {
      diffs.push({
        scope: 'BANK',
        key: accId,
        pluggyCents: bankTruth.availableCents,
        appCents: appBal,
        diffCents: appBal - bankTruth.availableCents,
        reason: 'APP_RECOMPUTED',
      });
    }
    const appAccFlows = appNumbers.bankMonthlyFlowsByOfAccountId?.[accId];
    if (appAccFlows) {
      for (const [month, truthFlow] of Object.entries(bankTruth.monthlyFlows)) {
        const appFlow = appAccFlows[month] ?? { inflowCents: 0, outflowCents: 0, count: 0 };
        if (appFlow.inflowCents !== truthFlow.inflowCents) {
          diffs.push({
            scope: 'BANK',
            key: `${accId}:${month}:inflow`,
            pluggyCents: truthFlow.inflowCents,
            appCents: appFlow.inflowCents,
            diffCents: appFlow.inflowCents - truthFlow.inflowCents,
            reason: 'APP_RECOMPUTED',
          });
        }
        if (appFlow.outflowCents !== truthFlow.outflowCents) {
          diffs.push({
            scope: 'BANK',
            key: `${accId}:${month}:outflow`,
            pluggyCents: truthFlow.outflowCents,
            appCents: appFlow.outflowCents,
            diffCents: appFlow.outflowCents - truthFlow.outflowCents,
            reason: 'APP_RECOMPUTED',
          });
        }
      }
    }
  }

  if (
    appNumbers.pendingOutflowCents !== undefined &&
    appNumbers.pendingOutflowCents !== truth.totals.pendingOutflowCents
  ) {
    diffs.push({
      scope: 'BANK',
      key: 'pending_outflow',
      pluggyCents: truth.totals.pendingOutflowCents,
      appCents: appNumbers.pendingOutflowCents,
      diffCents: appNumbers.pendingOutflowCents - truth.totals.pendingOutflowCents,
      reason: 'APP_RECOMPUTED',
    });
  }

  for (const [accId, cardTruth] of Object.entries(truth.cardAccounts)) {
    const appCard = appNumbers.cardsByOfAccountId[accId];
    if (!appCard) continue;

    if (appCard.usedCents !== null && appCard.usedCents !== cardTruth.usedCents) {
      diffs.push({
        scope: 'CARD',
        key: `${accId}:used`,
        pluggyCents: cardTruth.usedCents,
        appCents: appCard.usedCents,
        diffCents: appCard.usedCents - cardTruth.usedCents,
        reason: 'APP_RECOMPUTED',
      });
    }

    if (
      cardTruth.availableCents !== null &&
      appCard.availableCents !== null &&
      appCard.availableCents !== cardTruth.availableCents
    ) {
      diffs.push({
        scope: 'CARD',
        key: `${accId}:available`,
        pluggyCents: cardTruth.availableCents,
        appCents: appCard.availableCents,
        diffCents: appCard.availableCents - cardTruth.availableCents,
        reason: 'APP_RECOMPUTED',
      });
    }

    for (const bill of cardTruth.closedBills) {
      const billMonth = bill.dueDate.slice(0, 7);
      if (bill.itemsVsTotalDiffCents !== 0) {
        diffs.push({
          scope: 'BILL',
          key: `${accId}:${billMonth}:items`,
          pluggyCents: bill.totalCents,
          appCents: bill.itemsCents,
          diffCents: bill.itemsVsTotalDiffCents,
          reason: 'ITEMS_VS_TOTAL',
        });
      }
      const appBill = appCard.closedBillsByMonth[billMonth];
      if (!appBill) {
        diffs.push({
          scope: 'BILL',
          key: `${accId}:${billMonth}`,
          pluggyCents: bill.totalCents,
          appCents: 0,
          diffCents: -bill.totalCents,
          reason: 'MISSING_BILL',
        });
      } else if (appBill.totalCents !== bill.totalCents) {
        diffs.push({
          scope: 'BILL',
          key: `${accId}:${billMonth}`,
          pluggyCents: bill.totalCents,
          appCents: appBill.totalCents,
          diffCents: appBill.totalCents - bill.totalCents,
          reason: 'APP_RECOMPUTED',
        });
      }
    }
  }

  for (const mismatch of truth.signMismatches) {
    const cents = toCentsDecimal(mismatch.amount);
    diffs.push({
      scope: 'SIGN',
      key: `${mismatch.accountId}:${mismatch.txId}`,
      pluggyCents: cents,
      appCents: cents,
      diffCents: 0,
      reason: 'SIGN_MISMATCH',
    });
  }

  return diffs;
}
