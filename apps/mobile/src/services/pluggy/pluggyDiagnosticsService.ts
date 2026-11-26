import Decimal from 'decimal.js';
import { getDatabase } from '../../db/client';
import {
  assets,
  finAccounts,
  finBills,
  finEntries,
  incomeEvents,
  marketPriceCache,
  transactions,
} from '../../db/schema';
import { isUnknownCost } from '../../domain/finance/averagePrice';
import { getTodayIsoLocal } from '../../domain/financeFlow';
import { toBrtDate, toBrtMonth } from '../../domain/openFinance/dates';
import {
  computeLedgerQuantity,
  redactDiagnosticDescription,
  resolveDisplayedAssetValue,
} from '../../domain/openFinance/diagnostics';
import {
  collectAppNumbers,
  computePluggyTruth,
  hasSignMismatch,
  reconcileAppVsPluggy,
  type Difference,
} from '../../domain/openFinance/pluggyTruth';
import { isStaleOpenFinancePending } from '../../domain/openFinance/stalePending';
import { toCentsDecimal } from '../../domain/openFinance';
import { centsToDecimal } from '../../domain/money';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { PluggyClient } from './pluggyClient';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from './types';

export interface AnonymizedAccountFieldPresence {
  providerId: number;
  billId: number;
  billForecastDate: number;
  billPostDate: number;
  operationType: number;
  operationTypeCounts: Record<string, number>;
  paymentType: number;
  transactionDateTime: number;
  installmentNumber: number;
  signMismatchCount: number;
}

export interface AnonymizedBillDiagnostic {
  dueDate: string;
  closingDate: string | null;
  totalAmount: number;
  minimumPaymentAmount: number | null;
  payments: Array<{
    paymentDate: string;
    amount: number;
    valueType: string | null;
    paymentMode: string | null;
  }>;
  financeCharges: Array<{
    type: string;
    amount: number;
    additionalInfo: string | null;
  }>;
  itemsSumByBillId: number;
}

export interface AnonymizedAccountSummary {
  type: string;
  subtype: string;
  currencyCode: string;
  balance: number;
  closingBalance: number | null;
  automaticallyInvestedBalance: number | null;
  creditLimit: number | null;
  availableCreditLimit: number | null;
  billsCount: number;
  txCount: number;
  txCountByYear: Record<string, number>;
  localEntriesSummary: {
    total: number;
    byReason: Record<string, number>;
    removedCount: number;
  };
  fieldPresence: AnonymizedAccountFieldPresence;
  bills?: AnonymizedBillDiagnostic[];
  forecastVsBill?: {
    totalWithBoth: number;
    matchesDueDateMonth: number;
    matchesClosingDateMonth: number;
  };
  entriesLast90d: {
    total: number;
    byKind: Record<string, number>;
    outrosCount: number;
    outrosPct: number;
    transfersByReason: Record<string, number>;
  };
  stalePendingCount: number;
  sampleTransactions: Array<{
    type: string;
    status: string;
    amount: number;
    date: string;
    category: string | null;
    categoryId: string | null;
    description: string;
  }>;
}

export interface AnonymizedInvestmentAppSummary {
  ledgerQuantity: string;
  hasAveragePrice: boolean;
  costBasisSource: string | null;
  valueSource: string | null;
  displayedValue: string | null;
  incomeCount12m: number;
}

export interface AnonymizedInvestmentSummary {
  type: string;
  subtype: string | null;
  name: string;
  code: string | null;
  isin: string | null;
  quantity: number | null;
  value: number | null;
  amount: number | null;
  balance: number;
  amountOriginal: number | null;
  rate: number | null;
  rateType: string | null;
  fixedAnnualRate: number | null;
  priceFactor: number | null;
  status: string | null;
  app: AnonymizedInvestmentAppSummary | null;
  transactionsSummary: {
    total: number;
    byType: Record<string, number>;
    valueQtyMismatchCount: number;
    withNetAmountCount: number;
    withPriceFactorCount: number;
    withExpensesCount: number;
  };
}

export interface AnonymizedItemDiagnostics {
  itemHash: string;
  connectorName: string;
  item: {
    connectorId: number | null;
    isOpenFinance: boolean | null;
    status: string | null;
    executionStatus: string | null;
    lastUpdatedAt: string | null;
    nextAutoSyncAt: string | null;
    consentExpiresAt: string | null;
    productsNotUpdated: string[];
    warningCodes: string[];
  };
  categoryMap: Record<string, string>;
  reconciliation: Difference[];
  accounts: AnonymizedAccountSummary[];
  investments: AnonymizedInvestmentSummary[];
}

export interface AnonymizedPluggyDiagnosticsReport {
  generatedAt: string;
  items: AnonymizedItemDiagnostics[];
}

function hashShort(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function truncate40(text: string | null | undefined): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 40) return cleaned;
  return `${cleaned.slice(0, 37)}...`;
}

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function summarizeInvestmentTransactions(
  txs: PluggyInvestmentTransaction[]
): AnonymizedInvestmentSummary['transactionsSummary'] {
  const byType: Record<string, number> = {};
  let valueQtyMismatchCount = 0;
  let withNetAmountCount = 0;
  let withPriceFactorCount = 0;
  let withExpensesCount = 0;

  for (const tx of txs) {
    byType[tx.type] = (byType[tx.type] ?? 0) + 1;
    if (tx.netAmount !== null && tx.netAmount !== undefined) {
      withNetAmountCount += 1;
    }
    if (tx.priceFactor !== null && tx.priceFactor !== undefined && tx.priceFactor > 1) {
      withPriceFactorCount += 1;
    }
    if (tx.expenses !== null && tx.expenses !== undefined) {
      withExpensesCount += 1;
    }

    if (
      tx.value !== null &&
      tx.value !== undefined &&
      tx.amount !== null &&
      tx.amount !== undefined
    ) {
      const qty = new Decimal(tx.quantity !== null && tx.quantity !== undefined && tx.quantity > 0 ? tx.quantity : 1);
      const amount = new Decimal(tx.amount).abs();
      const expected = new Decimal(tx.value).abs().mul(qty);
      if (amount.gt(0)) {
        const diffRatio = expected.minus(amount).abs().div(amount);
        if (diffRatio.gt(new Decimal('0.01'))) {
          valueQtyMismatchCount += 1;
        }
      } else if (expected.gt(0)) {
        valueQtyMismatchCount += 1;
      }
    }
  }

  return {
    total: txs.length,
    byType,
    valueQtyMismatchCount,
    withNetAmountCount,
    withPriceFactorCount,
    withExpensesCount,
  };
}

export const pluggyDiagnosticsService = {
  async generateAnonymizedPluggyDiagnostics(options?: {
    client?: PluggyClient;
    itemIds?: string[];
  }): Promise<AnonymizedPluggyDiagnosticsReport> {
    const client = options?.client ?? new PluggyClient();
    const itemIds =
      options?.itemIds ??
      (await openFinanceRepository.listItems()).map((it) => it.id);

    const db = getDatabase();
    const [localAssets, localTxs, localIncomes, localFinAccounts, localFinEntries, localFinBills, priceCache] =
      await Promise.all([
        db.select().from(assets),
        db.select().from(transactions),
        db.select().from(incomeEvents),
        db.select().from(finAccounts),
        db.select().from(finEntries),
        db.select().from(finBills),
        db.select().from(marketPriceCache),
      ]);

    const assetByExternalId = new Map(
      localAssets.filter((a) => a.external_id).map((a) => [a.external_id!, a])
    );
    const localAccByOfId = new Map(
      localFinAccounts.filter((a) => a.of_account_id).map((a) => [a.of_account_id!, a])
    );
    const priceByTicker = new Map(priceCache.map((p) => [p.ticker, p.current_price]));

    const cutoff90d = daysAgoIso(90);
    const todayIsoDiag = daysAgoIso(0);
    const cutoff12m = daysAgoIso(365);

    const items: AnonymizedItemDiagnostics[] = [];

    for (const itemId of itemIds) {
      const anyClient = client as unknown as Record<string, (...args: any[]) => Promise<any>>;
      const item: PluggyItem | null =
        typeof anyClient.getItem === 'function' ? await anyClient.getItem(itemId) : null;
      const accounts: PluggyAccount[] =
        typeof anyClient.listAccounts === 'function' ? await anyClient.listAccounts(itemId) : [];
      const investments: PluggyInvestment[] =
        typeof anyClient.listInvestments === 'function'
          ? await anyClient.listInvestments(itemId)
          : [];

      const ownerNames = [
        ...accounts.map((a) => a.owner),
        ...investments.map((i) => i.owner),
      ].filter((o): o is string => Boolean(o && o.trim()));

      const categoryMap: Record<string, string> = {};
      const transactionsByAccount: Record<string, PluggyTransaction[]> = {};
      const billsByAccount: Record<string, PluggyBill[]> = {};

      const anonymizedAccounts: AnonymizedAccountSummary[] = [];
      for (const acc of accounts) {
        const txs: PluggyTransaction[] =
          typeof anyClient.listTransactions === 'function'
            ? await anyClient.listTransactions(acc.id).catch(() => [])
            : [];
        const bills: PluggyBill[] =
          acc.type === 'CREDIT' && typeof anyClient.listBills === 'function'
            ? await anyClient.listBills(acc.id).catch(() => [])
            : [];
        transactionsByAccount[acc.id] = txs;
        if (acc.type === 'CREDIT') {
          billsByAccount[acc.id] = bills;
        }

        const fieldPresence: AnonymizedAccountFieldPresence = {
          providerId: 0,
          billId: 0,
          billForecastDate: 0,
          billPostDate: 0,
          operationType: 0,
          operationTypeCounts: {},
          paymentType: 0,
          transactionDateTime: 0,
          installmentNumber: 0,
          signMismatchCount: 0,
        };
        const txCountByYear: Record<string, number> = {};
        const itemsSumByBillIdMap = new Map<string, number>();

        for (const t of txs) {
          if (t.categoryId && t.category) {
            categoryMap[t.categoryId] = t.category;
          }
          const year = (t.date || '').slice(0, 4);
          if (/^\d{4}$/.test(year)) {
            txCountByYear[year] = (txCountByYear[year] ?? 0) + 1;
          }
          if (t.providerId) fieldPresence.providerId += 1;
          if (t.operationType) {
            fieldPresence.operationType += 1;
            fieldPresence.operationTypeCounts[t.operationType] =
              (fieldPresence.operationTypeCounts[t.operationType] ?? 0) + 1;
          }
          if (hasSignMismatch(acc.type, t)) {
            fieldPresence.signMismatchCount += 1;
          }
          const meta = t.creditCardMetadata;
          if (meta) {
            if (meta.billId) {
              fieldPresence.billId += 1;
              if (t.operationType !== 'PAGAMENTO_FATURA') {
                const absCents = Math.abs(
                  toCentsDecimal(t.amountInAccountCurrency ?? t.amount)
                );
                const signedCents = t.type === 'DEBIT' ? absCents : -absCents;
                itemsSumByBillIdMap.set(
                  meta.billId,
                  (itemsSumByBillIdMap.get(meta.billId) ?? 0) + signedCents
                );
              }
            }
            if (meta.billForecastDate) fieldPresence.billForecastDate += 1;
            if (meta.billPostDate) fieldPresence.billPostDate += 1;
            if (meta.paymentType) fieldPresence.paymentType += 1;
            if (meta.transactionDateTime) fieldPresence.transactionDateTime += 1;
            if (meta.installmentNumber != null) fieldPresence.installmentNumber += 1;
          }
        }

        let billsDiag: AnonymizedBillDiagnostic[] | undefined;
        let forecastVsBill: AnonymizedAccountSummary['forecastVsBill'];
        if (acc.type === 'CREDIT') {
          const billById = new Map(bills.map((b) => [b.id, b]));
          billsDiag = bills.map((b) => ({
            dueDate: toBrtDate(b.dueDate) ?? '',
            closingDate: b.billClosingDate ? toBrtDate(b.billClosingDate) : null,
            totalAmount: b.totalAmount,
            minimumPaymentAmount: b.minimumPaymentAmount ?? null,
            payments: (b.payments ?? []).map((p) => ({
              paymentDate: toBrtDate(p.paymentDate) ?? '',
              amount: p.amount,
              valueType: p.valueType ?? null,
              paymentMode: p.paymentMode ?? null,
            })),
            financeCharges: (b.financeCharges ?? []).map((c) => ({
              type: c.type,
              amount: c.amount,
              additionalInfo: c.additionalInfo
                ? redactDiagnosticDescription(c.additionalInfo, { ownerNames })
                : null,
            })),
            itemsSumByBillId: centsToDecimal(itemsSumByBillIdMap.get(b.id) ?? 0).toNumber(),
          }));

          let totalWithBoth = 0;
          let matchesDueDateMonth = 0;
          let matchesClosingDateMonth = 0;
          for (const t of txs) {
            const billId = t.creditCardMetadata?.billId;
            const forecast = t.creditCardMetadata?.billForecastDate;
            if (!billId || !forecast) continue;
            const bill = billById.get(billId);
            if (!bill) continue;
            totalWithBoth += 1;
            const forecastYm = forecast.slice(0, 7);
            if (toBrtMonth(bill.dueDate) === forecastYm) {
              matchesDueDateMonth += 1;
            }
            if (bill.billClosingDate && toBrtMonth(bill.billClosingDate) === forecastYm) {
              matchesClosingDateMonth += 1;
            }
          }
          forecastVsBill = { totalWithBoth, matchesDueDateMonth, matchesClosingDateMonth };
        }

        const localAcc = localAccByOfId.get(acc.id);
        const byKind: Record<string, number> = {};
        let total90d = 0;
        let outrosCount = 0;
        let stalePendingCount = 0;
        const transfersByReason: Record<string, number> = {};
        const localByReason: Record<string, number> = {};
        let localTotal = 0;
        let localRemovedCount = 0;
        if (localAcc) {
          for (const e of localFinEntries) {
            if (e.account_id !== localAcc.id) continue;
            if (e.source === 'OPEN_FINANCE') {
              localTotal += 1;
              const reasonKey = e.of_class_reason ?? 'NONE';
              localByReason[reasonKey] = (localByReason[reasonKey] ?? 0) + 1;
              if (e.of_removed_at) localRemovedCount += 1;
            }
            if (e.of_removed_at) continue;
            if (isStaleOpenFinancePending(e, todayIsoDiag)) stalePendingCount += 1;
            if (e.due_date < cutoff90d) continue;
            total90d += 1;
            byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
            if (e.kind === 'transfer_out' || e.kind === 'transfer_in') {
              const reason =
                e.of_class_reason ??
                (e.transfer_group_id?.startsWith('of-topup-')
                  ? 'CARD_TOPUP'
                  : e.transfer_group_id
                    ? 'PAIRED'
                    : 'UNKNOWN');
              transfersByReason[reason] = (transfersByReason[reason] ?? 0) + 1;
            }
            if (e.category_id.startsWith('cat-outros-')) {
              outrosCount += 1;
            }
          }
        }
        const outrosPct =
          total90d > 0 ? Math.round((outrosCount / total90d) * 1000) / 10 : 0;

        anonymizedAccounts.push({
          type: acc.type,
          subtype: acc.subtype,
          currencyCode: acc.currencyCode,
          balance: acc.balance,
          closingBalance: acc.bankData?.closingBalance ?? null,
          automaticallyInvestedBalance: acc.bankData?.automaticallyInvestedBalance ?? null,
          creditLimit: acc.creditData?.creditLimit ?? null,
          availableCreditLimit: acc.creditData?.availableCreditLimit ?? null,
          billsCount: bills.length,
          txCount: txs.length,
          txCountByYear,
          localEntriesSummary: {
            total: localTotal,
            byReason: localByReason,
            removedCount: localRemovedCount,
          },
          fieldPresence,
          ...(billsDiag !== undefined ? { bills: billsDiag } : {}),
          ...(forecastVsBill !== undefined ? { forecastVsBill } : {}),
          entriesLast90d: {
            total: total90d,
            byKind,
            outrosCount,
            outrosPct,
            transfersByReason,
          },
          stalePendingCount,
          sampleTransactions: txs.slice(0, 20).map((t) => ({
            type: t.type,
            status: t.status,
            amount: t.amount,
            date: toBrtDate(t.date) ?? '',
            category: t.category ?? null,
            categoryId: t.categoryId ?? null,
            description: truncate40(
              redactDiagnosticDescription(t.description, {
                ownerNames,
                categoryId: t.categoryId,
              })
            ),
          })),
        });
      }

      const anonymizedInvestments: AnonymizedInvestmentSummary[] = [];
      for (const inv of investments) {
        const invTxs: PluggyInvestmentTransaction[] =
          typeof anyClient.listInvestmentTransactions === 'function'
            ? await anyClient.listInvestmentTransactions(inv.id).catch(() => [])
            : [];

        const localAsset = assetByExternalId.get(inv.id);
        let appSummary: AnonymizedInvestmentAppSummary | null = null;
        if (localAsset) {
          const ledgerQty = computeLedgerQuantity(localAsset.id, localTxs);
          const displayedValue = resolveDisplayedAssetValue(localAsset, priceByTicker);

          const incomeCount12m = localIncomes.filter(
            (inc) =>
              inc.pay_date >= cutoff12m &&
              (inc.asset_id === localAsset.id || inc.ticker === localAsset.ticker)
          ).length;

          appSummary = {
            ledgerQuantity: ledgerQty.toString(),
            hasAveragePrice: !isUnknownCost(localAsset),
            costBasisSource: localAsset.cost_basis_source ?? null,
            valueSource: localAsset.value_source ?? null,
            displayedValue,
            incomeCount12m,
          };
        }

        anonymizedInvestments.push({
          type: inv.type,
          subtype: inv.subtype ?? null,
          name: inv.name ?? '',
          code: inv.code ?? null,
          isin: inv.isin ?? null,
          quantity: inv.quantity ?? null,
          value: inv.value ?? null,
          amount: inv.amount ?? null,
          balance: inv.balance,
          amountOriginal: inv.amountOriginal ?? null,
          rate: inv.rate ?? null,
          rateType: inv.rateType ?? null,
          fixedAnnualRate: inv.fixedAnnualRate ?? null,
          priceFactor: inv.priceFactor ?? null,
          status: inv.status ?? null,
          app: appSummary,
          transactionsSummary: summarizeInvestmentTransactions(invTxs),
        });
      }

      const productsNotUpdated: string[] = [];
      const warningCodes: string[] = [];
      if (item?.statusDetail) {
        for (const [product, info] of Object.entries(item.statusDetail)) {
          if (!info) continue;
          if (info.isUpdated === false) productsNotUpdated.push(product);
          for (const w of info.warnings ?? []) {
            if (w?.code) warningCodes.push(w.code);
          }
        }
      }

      const reconciliation: Difference[] = item
        ? reconcileAppVsPluggy(
            computePluggyTruth(
              { item, accounts, transactionsByAccount, billsByAccount, investments },
              getTodayIsoLocal()
            ),
            collectAppNumbers({
              accounts: localFinAccounts,
              entries: localFinEntries,
              bills: localFinBills,
              todayIso: getTodayIsoLocal(),
            })
          )
        : [];

      items.push({
        itemHash: hashShort(itemId),
        connectorName: item?.connector?.name ?? 'Instituição',
        item: {
          connectorId: item?.connector?.id ?? null,
          isOpenFinance: item?.connector?.isOpenFinance ?? null,
          status: item?.status ?? null,
          executionStatus: item?.executionStatus ?? null,
          lastUpdatedAt: item?.lastUpdatedAt ?? null,
          nextAutoSyncAt: item?.nextAutoSyncAt ?? null,
          consentExpiresAt: item?.consentExpiresAt ?? null,
          productsNotUpdated,
          warningCodes,
        },
        categoryMap,
        reconciliation,
        accounts: anonymizedAccounts,
        investments: anonymizedInvestments,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      items,
    };
  },
};
