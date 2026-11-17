import Decimal from 'decimal.js';
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

export interface AnonymizedInvestmentSummary {
  type: string;
  subtype: string | null;
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
          sampleTransactions: txs.slice(0, 20).map((t) => ({
            type: t.type,
            status: t.status,
            amount: t.amount,
            date: (t.date || '').slice(0, 10),
            category: t.category ?? null,
            categoryId: t.categoryId ?? null,
            description: truncate40(t.description),
          })),
        });
      }

      const anonymizedInvestments: AnonymizedInvestmentSummary[] = [];
      for (const inv of investments) {
        const invTxs: PluggyInvestmentTransaction[] =
          typeof anyClient.listInvestmentTransactions === 'function'
            ? await anyClient.listInvestmentTransactions(inv.id).catch(() => [])
            : [];

        anonymizedInvestments.push({
          type: inv.type,
          subtype: inv.subtype ?? null,
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
          transactionsSummary: summarizeInvestmentTransactions(invTxs),
        });
      }

      items.push({
        itemHash: hashShort(itemId),
        connectorName: item?.connector?.name ?? 'Instituição',
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
