import Decimal from 'decimal.js';
import { getDatabase } from '../db/client';
import {
  assets,
  finAccounts,
  finBills,
  finEntries,
  marketPriceCache,
  portfolios,
} from '../db/schema';
import { isUnknownCost } from '../domain/finance/averagePrice';
import { decimalToCents } from '../domain/money';
import { summarizeOpenFinanceBill } from '../domain/openFinance/cardBills';
import {
  getTodayIsoLocal,
  resolveAccountBalance,
  resolveBillMonth,
  summarizeBill,
} from '../domain/financeFlow';
import { marketApiService } from './marketApi';

type DomainFinEntry = Parameters<typeof summarizeBill>[0][number];

export interface PatrimonyPortfolioItem {
  portfolioId: string;
  name: string;
  marketValueCents: number;
  byClassCents: Record<string, number>;
  annualReturnPercent: number;
}

export interface PatrimonyAccountItem {
  accountId: string;
  name: string;
  type: string;
  balanceCents: number;
}

export interface PatrimonyResult {
  investedCents: number;
  accountsCents: number;
  cardsCents: number;
  totalCents: number;
  byPortfolio: PatrimonyPortfolioItem[];
  byAccount: PatrimonyAccountItem[];
}

/**
 * R42 — Fonte única de patrimônio no app inteiro:
 * - Ativos seguem a precedência: of_reported_value (INSTITUTION) -> manual_position_value -> qty * (manual_price_override -> cotação -> PM).
 * - Contas `type === 'broker'` entram em `investedCents` (caixa dentro da corretora), não em `accountsCents`.
 * - Cartões de crédito (`type === 'card'`) entram em `cardsCents` como passivo (fatura em aberto).
 * - `totalCents = investedCents + accountsCents - cardsCents`.
 */
export async function getPatrimony(
  referenceDateIso?: string,
  options?: { fetchMissingQuotes?: boolean; quoteOverrides?: Record<string, string> }
): Promise<PatrimonyResult> {
  const db = getDatabase();
  const refIso = referenceDateIso ?? getTodayIsoLocal();

  const [allAccounts, allEntries, allBills, allPortfolios, allAssets, allPrices] =
    await Promise.all([
      db.select().from(finAccounts),
      db.select().from(finEntries),
      db.select().from(finBills),
      db.select().from(portfolios),
      db.select().from(assets),
      db.select().from(marketPriceCache),
    ]);

  const priceMap = new Map<string, string>(
    allPrices.map((p) => [p.ticker.toUpperCase(), p.current_price])
  );
  if (options?.quoteOverrides) {
    for (const [t, price] of Object.entries(options.quoteOverrides)) {
      if (price) priceMap.set(t.toUpperCase(), price);
    }
  }

  if (options?.fetchMissingQuotes) {
    const missing = Array.from(
      new Set(
        allAssets
          .map((a) => a.ticker?.toUpperCase())
          .filter((t): t is string => Boolean(t) && !priceMap.has(t!))
      )
    );
    if (missing.length > 0) {
      try {
        const fetched = await marketApiService.fetchQuotes(missing);
        for (const q of fetched || []) {
          if (q.currentPrice) {
            priceMap.set(q.ticker.toUpperCase(), q.currentPrice);
          }
        }
      } catch {
        // Fallback para cache/PM quando offline
      }
    }
  }

  const normalizedEntries = allEntries.map((e) => ({
    ...e,
    kind: e.kind as DomainFinEntry['kind'],
    status: e.status as DomainFinEntry['status'],
  })) as DomainFinEntry[];

  const byAccount: PatrimonyAccountItem[] = [];
  let accountsCents = 0;
  let brokerAccountsCents = 0;

  for (const acc of allAccounts) {
    if (acc.archived || acc.type === 'card') continue;
    const balanceCents = resolveAccountBalance(acc, normalizedEntries);
    byAccount.push({
      accountId: acc.id,
      name: acc.name,
      type: acc.type,
      balanceCents,
    });
    if (acc.type === 'broker') {
      brokerAccountsCents += balanceCents;
    } else {
      accountsCents += balanceCents;
    }
  }

  let cardsCents = 0;
  const cardAccounts = allAccounts.filter((a) => !a.archived && a.type === 'card');
  for (const card of cardAccounts) {
    const cardEntries = normalizedEntries
      .filter((e) => e.account_id === card.id)
      .map((e) =>
        e.bill_month
          ? e
          : {
              ...e,
              bill_month: resolveBillMonth(e.due_date, card.closing_day ?? 1, card.due_day),
            }
      );
    const cardBills = allBills
      .filter((b) => b.account_id === card.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const billByMonth = new Map(cardBills.map((b, idx) => [b.bill_month, { bill: b, idx }]));
    const months = new Set([
      ...cardEntries.map((e) => e.bill_month).filter((m): m is string => Boolean(m)),
      ...cardBills.map((b) => b.bill_month),
    ]);
    for (const bm of months) {
      const ofBillInfo = billByMonth.get(bm);
      if (card.source === 'OPEN_FINANCE' && ofBillInfo) {
        const nextBill =
          ofBillInfo.idx + 1 < cardBills.length ? cardBills[ofBillInfo.idx + 1] : null;
        const ofSummary = summarizeOpenFinanceBill(
          ofBillInfo.bill,
          nextBill,
          cardEntries,
          refIso,
          { firstSyncIso: card.of_linked_at }
        );
        if (
          ofSummary.status !== 'paga' &&
          ofSummary.status !== 'sem saldo' &&
          ofSummary.status !== 'sem dados de pagamento'
        ) {
          cardsCents += Math.max(0, ofSummary.totalCents - ofSummary.paidCents);
        }
        continue;
      }
      const summary = summarizeBill(cardEntries, bm, {
        closingDay: card.closing_day ?? 1,
        todayIso: refIso,
      });
      if (summary.status !== 'paga' && summary.openCents > 0) {
        cardsCents += summary.openCents;
      }
    }
  }

  const byPortfolio: PatrimonyPortfolioItem[] = [];
  let assetsTotalCents = 0;

  for (const p of allPortfolios) {
    if (p.is_archived) continue;
    const pAssets = allAssets.filter((a) => a.portfolio_id === p.id);
    let totalReais = new Decimal(0);
    let profitMarketReais = new Decimal(0);
    let totalCostReais = new Decimal(0);
    const byClassCents: Record<string, number> = {};

    for (const a of pAssets) {
      const qty = new Decimal(a.quantity || 0);
      const unknownCost = isUnknownCost(a);
      const fallbackAvg = unknownCost ? 0 : a.average_price || 0;
      const quotePrice = a.ticker ? priceMap.get(a.ticker.toUpperCase()) : undefined;
      const unitPrice = new Decimal(
        a.manual_price_override ?? quotePrice ?? fallbackAvg
      );
      const hasPositionValue =
        a.value_source === 'INSTITUTION' &&
        a.of_reported_value !== null &&
        a.of_reported_value !== undefined &&
        a.of_reported_value !== ''
          ? true
          : a.manual_position_value !== null &&
            a.manual_position_value !== undefined &&
            a.manual_position_value !== '';
      const rawPosVal =
        a.value_source === 'INSTITUTION' && a.of_reported_value
          ? a.of_reported_value
          : a.manual_position_value;
      const valReais = hasPositionValue
        ? new Decimal(rawPosVal as string)
        : qty.mul(unitPrice);

      totalReais = totalReais.plus(valReais);
      if (!unknownCost) {
        const costReais = qty.mul(new Decimal(a.average_price || 0));
        totalCostReais = totalCostReais.plus(costReais);
        profitMarketReais = profitMarketReais.plus(valReais);
      }
      const clsCents = decimalToCents(valReais);
      byClassCents[a.asset_class] = (byClassCents[a.asset_class] ?? 0) + clsCents;
    }

    const marketValueCents = decimalToCents(totalReais);
    const annualReturnPercent = totalCostReais.gt(0)
      ? profitMarketReais.minus(totalCostReais).div(totalCostReais).mul(100).toNumber()
      : 0;

    assetsTotalCents += marketValueCents;
    byPortfolio.push({
      portfolioId: p.id,
      name: p.name,
      marketValueCents,
      byClassCents,
      annualReturnPercent,
    });
  }

  const investedCents = assetsTotalCents + brokerAccountsCents;
  const totalCents = investedCents + accountsCents - cardsCents;

  return {
    investedCents,
    accountsCents,
    cardsCents,
    totalCents,
    byPortfolio,
    byAccount,
  };
}

export const patrimonyService = {
  getPatrimony,
};
