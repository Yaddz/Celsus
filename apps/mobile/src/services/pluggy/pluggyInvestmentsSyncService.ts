import Decimal from 'decimal.js';
import { and, eq, isNull } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '../../db/client';
import { assets, incomeEvents, transactions } from '../../db/schema';
import { assetRepository } from '../../repositories/assetRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import {
  findEquivalentIncome,
  normalizeTickerForIncomeDedup,
} from '../../domain/finance/incomeDedup';
import {
  calculateInvestmentCostBasis,
  computeClassCoverageReport,
  mapPluggyIncomeEvent,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
  matchInvestmentToAsset,
  normalizeInvestmentTicker,
  type ClassCoverageStatus,
  type InvestmentMatchCandidate,
  type InvestmentMatchStrategy,
  type MappedPluggyInvestmentTransaction,
} from '../../domain/openFinance/investments';
import { assertItemConsentActive, PluggyClient } from './pluggyClient';
import { ensurePortfolioForItem } from './pluggyPortfolioService';
import type { PluggyInvestment, PluggyInvestmentTransaction, PluggyItem } from './types';

export interface InvestmentReconciliationProposal {
  pluggyInvestment: PluggyInvestment;
  suggestedAssetId: string | null;
  matchStrategy: InvestmentMatchStrategy;
  suggestedPortfolioId: string | null;
}

export interface InvestmentReconciliationChoice {
  pluggyInvestmentId: string;
  action: 'MATCH' | 'CREATE_NEW';
  targetAssetId?: string | null;
  targetPortfolioId: string;
}

export interface SyncInvestmentsOptions {
  client?: PluggyClient;
  now?: () => Date;
  defaultPortfolioId?: string;
  portfolioByItemId?: Record<string, string>;
  reconciliationChoices?: InvestmentReconciliationChoice[];
  investmentIds?: string[];
}

export interface SyncInvestmentsCounts {
  investmentsFetched: number;
  assetsCreated: number;
  assetsUpdated: number;
  assetsClosed: number;
  assetsMarkedMissing: number;
  assetsRepaired?: number;
  transactionsArchived: number;
  transactionsCreated: number;
  investmentErrors?: number;
  failedInvestmentIds?: string[];
  incomesCreated?: number;
  incomesMatched?: number;
  incomesSkipped?: number;
}

export interface SyncInvestmentsResult {
  runId: string;
  itemId: string;
  status: 'SUCCESS' | 'PARTIAL' | 'ERROR';
  counts: SyncInvestmentsCounts;
  coverageByClass: ClassCoverageStatus[];
  needsReconciliation: boolean;
  interestTransactions?: ReturnType<typeof mapPluggyInvestmentTransaction>[];
  portfolioId?: string | null;
  portfolioName?: string | null;
  portfolioCreated?: boolean;
  error?: string;
}

export interface B3ConflictWarning {
  ticker: string;
  assetId: string;
  message: string;
}

export interface DisconnectInvestmentsResult {
  revertedAssets: number;
  restoredTransactions: number;
  removedIncomes?: number;
}

function generateRunId(): string {
  return `of-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchItemFromClient(
  client: PluggyClient,
  itemId: string
): Promise<PluggyItem | null> {
  const anyClient = client as unknown as Record<string, (id: string) => Promise<PluggyItem | undefined>>;
  if (typeof anyClient.getItem === 'function') {
    return (await anyClient.getItem(itemId)) ?? null;
  }
  if (typeof anyClient.fetchItem === 'function') {
    return (await anyClient.fetchItem(itemId)) ?? null;
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  async function runWorker() {
    while (nextIdx < items.length) {
      const idx = nextIdx;
      nextIdx += 1;
      results[idx] = await worker(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function fetchInvestmentTxsFromClient(
  client: PluggyClient,
  investmentId: string
): Promise<PluggyInvestmentTransaction[]> {
  const anyClient = client as unknown as Record<
    string,
    (id: string) => Promise<PluggyInvestmentTransaction[]>
  >;
  if (typeof anyClient.listInvestmentTransactions === 'function') {
    return anyClient.listInvestmentTransactions(investmentId);
  }
  return anyClient.fetchInvestmentTransactions(investmentId);
}

async function fetchInvestmentsFromClient(
  client: PluggyClient,
  itemId: string
): Promise<PluggyInvestment[]> {
  const anyClient = client as unknown as Record<string, (id: string) => Promise<PluggyInvestment[]>>;
  if (typeof anyClient.listInvestments === 'function') {
    return anyClient.listInvestments(itemId);
  }
  return anyClient.fetchInvestments(itemId);
}

export const pluggyInvestmentsSyncService = {
  async previewReconciliation(
    itemId: string,
    options?: { client?: PluggyClient; targetPortfolioId?: string }
  ): Promise<InvestmentReconciliationProposal[]> {
    const client = options?.client ?? new PluggyClient();
    const pluggyInvs = await fetchInvestmentsFromClient(client, itemId);
    const db = await getDatabase();
    const allAssets = await db.select().from(assets);

    const candidates: InvestmentMatchCandidate[] = allAssets.map((a) => ({
      id: a.id,
      portfolioId: a.portfolio_id,
      ticker: a.ticker,
      name: a.name,
      assetClass: a.asset_class as any,
      isin: a.isin,
      rfIssuer: a.rf_issuer,
      rfMaturityDate: a.rf_maturity_date,
      rfRate: a.rf_rate,
      externalId: a.external_id,
      source: a.source,
      institutionId: a.institution_id,
    }));

    return pluggyInvs.map((inv: PluggyInvestment) => {
      const match = matchInvestmentToAsset(inv, candidates, itemId);
      const matched = match.matchedAssetId
        ? candidates.find((c) => c.id === match.matchedAssetId)
        : null;
      return {
        pluggyInvestment: inv,
        suggestedAssetId: match.matchedAssetId,
        matchStrategy: match.strategy,
        suggestedPortfolioId:
          matched?.portfolioId ?? options?.targetPortfolioId ?? null,
      };
    });
  },

  async syncInvestments(
    itemId: string,
    options?: SyncInvestmentsOptions
  ): Promise<SyncInvestmentsResult> {
    const client = options?.client ?? new PluggyClient();
    const nowFn = options?.now ?? (() => new Date());
    const nowIso = nowFn().toISOString();
    const runId = generateRunId();

    const counts: SyncInvestmentsCounts = {
      investmentsFetched: 0,
      assetsCreated: 0,
      assetsUpdated: 0,
      assetsClosed: 0,
      assetsMarkedMissing: 0,
      transactionsArchived: 0,
      transactionsCreated: 0,
      investmentErrors: 0,
      incomesCreated: 0,
      incomesMatched: 0,
      incomesSkipped: 0,
    };
    const interestTransactions: MappedPluggyInvestmentTransaction[] = [];

    try {
      const item = await fetchItemFromClient(client, itemId);
      if (item) {
        assertItemConsentActive(item, nowFn().getTime());
      }

      const allPluggyInvs = await fetchInvestmentsFromClient(client, itemId);
      const requestedIds = options?.investmentIds ? new Set(options.investmentIds) : null;
      const pluggyInvs = requestedIds
        ? allPluggyInvs.filter((inv) => requestedIds.has(inv.id))
        : allPluggyInvs;
      counts.investmentsFetched = pluggyInvs.length;
      const coverageByClass = computeClassCoverageReport(pluggyInvs);

      const txsByInvId: Record<string, MappedPluggyInvestmentTransaction[]> = {};
      const rawInterestByInvId: Record<string, PluggyInvestmentTransaction[]> = {};
      const failedSet = new Set<string>();
      await mapWithConcurrency(pluggyInvs, 2, async (inv) => {
        try {
          const rawTxs = await fetchInvestmentTxsFromClient(client, inv.id);
          const mapped = rawTxs.map((t: PluggyInvestmentTransaction) =>
            mapPluggyInvestmentTransaction(t, inv.id)
          );
          txsByInvId[inv.id] = mapped;
          rawInterestByInvId[inv.id] = rawTxs.filter((t) => t.type === 'INTEREST');
          for (const mtx of mapped) {
            if (mtx.type === 'INCOME') {
              interestTransactions.push(mtx);
            }
          }
        } catch {
          counts.investmentErrors = (counts.investmentErrors ?? 0) + 1;
          failedSet.add(inv.id);
          txsByInvId[inv.id] = [];
          rawInterestByInvId[inv.id] = [];
        }
      });
      if (failedSet.size > 0) {
        counts.failedInvestmentIds = Array.from(failedSet);
      }

      const choicesByInvId = new Map<string, InvestmentReconciliationChoice>(
        (options?.reconciliationChoices ?? []).map((c) => [c.pluggyInvestmentId, c])
      );
      let defaultPortId =
        options?.portfolioByItemId?.[itemId] ?? options?.defaultPortfolioId ?? null;
      let brokerPortfolioName: string | null = null;
      let brokerPortfolioCreated = false;

      if (!defaultPortId && pluggyInvs.length > 0) {
        const storedItems = await openFinanceRepository.listItems();
        const storedItem = storedItems.find((it) => it.id === itemId);
        const ensured = await ensurePortfolioForItem(
          itemId,
          item?.connector?.name ?? storedItem?.connector_name ?? null,
          pluggyInvs[0]
        );
        defaultPortId = ensured.portfolio.id;
        brokerPortfolioName = ensured.portfolio.name;
        brokerPortfolioCreated = ensured.created;
      }

      let needsReconciliation = false;

      await runInTransaction(async () => {
        const db = await getDatabase();
        const allAssets = await db.select().from(assets);
        const allTransactions = await db.select().from(transactions);
        const workingIncomes = [...(await db.select().from(incomeEvents))];
        const syncedExternalIds = new Set<string>();
        const usedTickers = new Set<string>();
        const usedNames = new Set<string>();
        const matchCandidates: InvestmentMatchCandidate[] = allAssets.map((a) => ({
          id: a.id,
          portfolioId: a.portfolio_id,
          ticker: a.ticker,
          name: a.name,
          assetClass: a.asset_class as any,
          isin: a.isin,
          rfIssuer: a.rf_issuer,
          rfMaturityDate: a.rf_maturity_date,
          rfRate: a.rf_rate,
          externalId: a.external_id,
          source: a.source,
          institutionId: a.institution_id,
        }));

        for (const inv of pluggyInvs) {
          syncedExternalIds.add(inv.id);
          const mapped = mapPluggyInvestment(inv, usedTickers, usedNames);
          usedTickers.add(mapped.ticker);
          usedNames.add(mapped.name);
          const mappedTxs = txsByInvId[inv.id] || [];
          const cost = calculateInvestmentCostBasis(inv, mappedTxs);

          const existingByExt = allAssets.find((a) => a.external_id === inv.id);
          const choice = choicesByInvId.get(inv.id);

          // Reparo de ativo sequestrado (D8): transações desta posição presas em outro ativo OPEN_FINANCE
          const invTxExtSet = new Set(mappedTxs.map((t) => t.externalId));
          const hijackedTxs = !existingByExt && invTxExtSet.size > 0
            ? allTransactions.filter(
                (t) =>
                  t.source === 'OPEN_FINANCE' &&
                  t.external_id &&
                  invTxExtSet.has(t.external_id)
              )
            : [];
          const isHijackedRepair = hijackedTxs.length > 0;

          let targetAssetId: string | null = existingByExt?.id ?? null;
          let targetPortfolioId: string | null =
            existingByExt?.portfolio_id ?? choice?.targetPortfolioId ?? defaultPortId;
          let skipAssetForReconciliation = false;

          if (!existingByExt && !isHijackedRepair && choice?.action === 'MATCH' && choice.targetAssetId) {
            targetAssetId = choice.targetAssetId;
            const matchedAsset = allAssets.find((a) => a.id === choice.targetAssetId);
            if (matchedAsset) targetPortfolioId = matchedAsset.portfolio_id;
          } else if (!existingByExt && !isHijackedRepair && !choice) {
            const match = matchInvestmentToAsset(inv, matchCandidates, itemId);
            if (match.matchedAssetId && match.confidence === 'HIGH') {
              targetAssetId = match.matchedAssetId;
              const matchedAsset = allAssets.find((a) => a.id === match.matchedAssetId);
              if (matchedAsset) targetPortfolioId = matchedAsset.portfolio_id;
            } else if (match.matchedAssetId && match.confidence === 'MEDIUM') {
              needsReconciliation = true;
              skipAssetForReconciliation = true;
            } else if (!defaultPortId) {
              needsReconciliation = true;
              skipAssetForReconciliation = true;
            }
          }

          const hasTxFetchFailure = failedSet.has(inv.id);
          const isWithdrawn = mapped.status === 'TOTAL_WITHDRAWAL';
          const nextManualPositionValue =
            mapped.marketValue === null
              ? null
              : isWithdrawn
              ? '0.00'
              : mapped.marketValue;

          if (!skipAssetForReconciliation && targetAssetId) {
            const existingAsset = allAssets.find((a) => a.id === targetAssetId);
            const shouldPreserveName =
              existingAsset &&
              existingAsset.auto_name !== null &&
              existingAsset.auto_name !== undefined &&
              existingAsset.name !== existingAsset.auto_name;

            // Arquivar movimentações manuais / B3 anteriores quando ativo passa para OPEN_FINANCE
            const existingTxs = await db
              .select()
              .from(transactions)
              .where(eq(transactions.asset_id, targetAssetId));

            for (const tx of existingTxs) {
              if (tx.source !== 'OPEN_FINANCE' && !tx.archived_at) {
                await db
                  .update(transactions)
                  .set({ archived_at: nowIso })
                  .where(eq(transactions.id, tx.id));
                counts.transactionsArchived++;
              }
            }

            await db
              .update(assets)
              .set({
                asset_class: mapped.assetClass,
                ticker: mapped.ticker,
                name: shouldPreserveName ? existingAsset!.name : mapped.name,
                auto_name: mapped.name,
                quantity: isWithdrawn ? '0' : mapped.quantity,
                average_price:
                  hasTxFetchFailure && existingAsset
                    ? existingAsset.average_price
                    : cost.averagePrice ?? '',
                manual_price_override: null,
                manual_position_value: nextManualPositionValue,
                gross_amount: mapped.grossAmount,
                cost_basis_source:
                  hasTxFetchFailure && existingAsset
                    ? existingAsset.cost_basis_source
                    : cost.costBasisSource,
                isin: mapped.isin,
                rf_indexer: mapped.rfIndexer,
                rf_rate: mapped.rfRate,
                rf_indexer_pct: mapped.rfIndexerPct,
                rf_maturity_date: mapped.rfMaturityDate,
                rf_issuer: mapped.rfIssuer,
                rf_is_tax_exempt: mapped.rfIsTaxExempt ? 1 : 0,
                is_etf: mapped.isEtf ? 1 : 0,
                source: 'OPEN_FINANCE',
                external_id: mapped.externalId,
                institution_id: itemId,
                last_synced_at: nowIso,
                missing_since: null,
                of_status: mapped.status,
                issuer_cnpj: mapped.issuerCnpj ?? null,
                issue_date: mapped.issueDate ?? null,
                purchase_date: mapped.purchaseDate ?? null,
                taxes: mapped.taxes ?? null,
                taxes2: mapped.taxes2 ?? null,
                of_reported_value: mapped.ofReportedValue,
                of_reported_at: mapped.ofReportedAt,
                value_source: mapped.valueSource,
                updated_at: nowIso,
              })
              .where(eq(assets.id, targetAssetId));

            if (isWithdrawn) {
              counts.assetsClosed++;
            } else {
              counts.assetsUpdated++;
            }
          } else if (!skipAssetForReconciliation && targetPortfolioId) {
            const created = await assetRepository.createAsset({
              portfolio_id: targetPortfolioId,
              asset_class: mapped.assetClass,
              ticker: mapped.ticker,
              name: mapped.name,
              auto_name: mapped.name,
              quantity: isWithdrawn ? '0' : mapped.quantity,
              average_price: cost.averagePrice ?? '',
              manual_price_override: null,
              manual_position_value: nextManualPositionValue,
              gross_amount: mapped.grossAmount,
              cost_basis_source: cost.costBasisSource,
              isin: mapped.isin,
              rf_indexer: mapped.rfIndexer,
              rf_rate: mapped.rfRate,
              rf_indexer_pct: mapped.rfIndexerPct,
              rf_maturity_date: mapped.rfMaturityDate,
              rf_issuer: mapped.rfIssuer,
              rf_is_tax_exempt: mapped.rfIsTaxExempt ? 1 : 0,
              is_etf: mapped.isEtf ? 1 : 0,
              source: 'OPEN_FINANCE',
              external_id: mapped.externalId,
              institution_id: itemId,
              last_synced_at: nowIso,
              missing_since: null,
              of_status: mapped.status,
              issuer_cnpj: mapped.issuerCnpj ?? null,
              issue_date: mapped.issueDate ?? null,
              purchase_date: mapped.purchaseDate ?? null,
              taxes: mapped.taxes ?? null,
              taxes2: mapped.taxes2 ?? null,
              of_reported_value: mapped.ofReportedValue,
              of_reported_at: mapped.ofReportedAt,
              value_source: mapped.valueSource,
            });
            targetAssetId = created.id;
            if (isHijackedRepair) {
              for (const htx of hijackedTxs) {
                await db
                  .update(transactions)
                  .set({
                    asset_id: targetAssetId,
                    portfolio_id: targetPortfolioId,
                  })
                  .where(eq(transactions.id, htx.id));
              }
              counts.assetsRepaired = (counts.assetsRepaired ?? 0) + 1;
            }
            if (isWithdrawn) {
              counts.assetsClosed++;
            } else {
              counts.assetsCreated++;
            }
          }

          // Inserir APENAS movimentações BUY e SELL na tabela transactions com deduplicação por external_id
          if (!skipAssetForReconciliation && targetAssetId && targetPortfolioId && !hasTxFetchFailure) {
            const currentAssetTxs = await db
              .select()
              .from(transactions)
              .where(eq(transactions.asset_id, targetAssetId));
            const existingExtTxByExtId = new Map(
              currentAssetTxs
                .filter((t) => t.source === 'OPEN_FINANCE' && t.external_id)
                .map((t) => [t.external_id!, t])
            );

            for (const mtx of mappedTxs) {
              if (mtx.type !== 'BUY' && mtx.type !== 'SELL') continue;
              const existingTx = existingExtTxByExtId.get(mtx.externalId);
              if (existingTx) {
                const needsUpdate =
                  existingTx.unit_price !== mtx.unitPrice ||
                  existingTx.fees !== mtx.fees ||
                  existingTx.total_amount !== mtx.totalAmount ||
                  existingTx.quantity !== mtx.quantity ||
                  existingTx.trade_date !== mtx.tradeDate ||
                  (existingTx.notes ?? null) !== (mtx.notes ?? null);
                if (needsUpdate) {
                  await db
                    .update(transactions)
                    .set({
                      trade_date: mtx.tradeDate,
                      quantity: mtx.quantity,
                      unit_price: mtx.unitPrice,
                      fees: mtx.fees,
                      total_amount: mtx.totalAmount,
                      notes: mtx.notes,
                    })
                    .where(eq(transactions.id, existingTx.id));
                }
                continue;
              }
              await transactionRepository.createTransaction({
                portfolio_id: targetPortfolioId,
                asset_id: targetAssetId,
                type: mtx.type,
                trade_date: mtx.tradeDate,
                quantity: mtx.quantity,
                unit_price: mtx.unitPrice,
                fees: mtx.fees,
                total_amount: mtx.totalAmount,
                notes: mtx.notes,
                source: 'OPEN_FINANCE',
                external_id: mtx.externalId,
              });
              existingExtTxByExtId.set(mtx.externalId, {
                id: '',
                portfolio_id: targetPortfolioId,
                asset_id: targetAssetId,
                type: mtx.type,
                trade_date: mtx.tradeDate,
                quantity: mtx.quantity,
                unit_price: mtx.unitPrice,
                fees: mtx.fees,
                total_amount: mtx.totalAmount,
                notes: mtx.notes,
                source: 'OPEN_FINANCE',
                external_id: mtx.externalId,
                archived_at: null,
                created_at: nowIso,
              });
              counts.transactionsCreated++;
            }

            // R4: Transação sintética OPENING_BALANCE (pluggy-opening:<investmentId>)
            const openingExtId = `pluggy-opening:${inv.id}`;
            const existingOpening = existingExtTxByExtId.get(openingExtId);
            if (cost.openingAdjustment) {
              const adj = cost.openingAdjustment;
              const adjQtyDec = new Decimal(adj.quantity);
              const adjTotalDec = new Decimal(adj.totalCost);
              const adjUnitPrice = adjQtyDec.gt(0)
                ? adjTotalDec.div(adjQtyDec).toFixed(8)
                : adjTotalDec.toFixed(8);
              if (existingOpening) {
                await db
                  .update(transactions)
                  .set({
                    trade_date: adj.tradeDate,
                    quantity: adj.quantity,
                    unit_price: adjUnitPrice,
                    fees: '0.00',
                    total_amount: adj.totalCost,
                    is_synthetic: 1,
                  })
                  .where(eq(transactions.id, existingOpening.id));
              } else {
                await transactionRepository.createTransaction({
                  portfolio_id: targetPortfolioId,
                  asset_id: targetAssetId,
                  type: 'BUY',
                  trade_date: adj.tradeDate,
                  quantity: adj.quantity,
                  unit_price: adjUnitPrice,
                  fees: '0.00',
                  total_amount: adj.totalCost,
                  notes: 'Saldo inicial Open Finance',
                  source: 'OPEN_FINANCE',
                  external_id: openingExtId,
                  is_synthetic: 1,
                });
              }
            } else if (existingOpening) {
              await db.delete(transactions).where(eq(transactions.id, existingOpening.id));
            }
          }

          // Migrar proventos pendentes de reconciliação quando o ativo for confirmado
          if (!skipAssetForReconciliation && targetAssetId && targetPortfolioId) {
            const normTicker = normalizeTickerForIncomeDedup(mapped.ticker);
            for (const inc of workingIncomes) {
              if (
                inc.item_id === itemId &&
                (inc.asset_id === null || inc.asset_id === undefined) &&
                normalizeTickerForIncomeDedup(inc.ticker) === normTicker
              ) {
                await db
                  .update(incomeEvents)
                  .set({ portfolio_id: targetPortfolioId, asset_id: targetAssetId })
                  .where(eq(incomeEvents.id, inc.id));
                inc.portfolio_id = targetPortfolioId;
                inc.asset_id = targetAssetId;
              }
            }
          }

          // Persistir proventos INTEREST em income_events independente do status do ativo (D11 / R8)
          const incomePortfolioId = !skipAssetForReconciliation
            ? targetPortfolioId ?? defaultPortId
            : defaultPortId;
          const incomeAssetId = !skipAssetForReconciliation ? targetAssetId : null;
          if (incomePortfolioId) {
            const rawInterests = rawInterestByInvId[inv.id] ?? [];
            for (const rawInt of rawInterests) {
              const mappedInc = mapPluggyIncomeEvent(rawInt, inv);
              if (workingIncomes.some((e) => e.external_id === mappedInc.externalId)) {
                counts.incomesSkipped = (counts.incomesSkipped ?? 0) + 1;
                continue;
              }

              const equiv = findEquivalentIncome(
                {
                  ticker: mappedInc.ticker,
                  payDate: mappedInc.payDate,
                  amount: mappedInc.amount,
                  kind: mappedInc.kind,
                },
                workingIncomes.map((e) => ({
                  id: e.id,
                  portfolioId: e.portfolio_id,
                  ticker: e.ticker,
                  payDate: e.pay_date,
                  amount: e.amount,
                  kind: e.kind,
                  source: e.source,
                  externalId: e.external_id,
                  notes: e.notes,
                  quantity: e.quantity,
                  unitAmount: e.unit_amount,
                  createdAt: e.created_at,
                }))
              );

              if (equiv && equiv.id) {
                const existingRow = workingIncomes.find((e) => e.id === equiv.id)!;
                const nextKind = existingRow.kind || mappedInc.kind;
                const nextQty = existingRow.quantity || mappedInc.quantity;
                const nextUnit = existingRow.unit_amount || mappedInc.unitAmount;
                const confirmTag = 'Confirmado pelo Open Finance';
                const nextNotes = existingRow.notes
                  ? existingRow.notes.includes(confirmTag)
                    ? existingRow.notes
                    : `${existingRow.notes} · ${confirmTag}`
                  : confirmTag;

                await db
                  .update(incomeEvents)
                  .set({
                    kind: nextKind,
                    quantity: nextQty,
                    unit_amount: nextUnit,
                    notes: nextNotes,
                    item_id: existingRow.item_id ?? itemId,
                    asset_id: existingRow.asset_id ?? incomeAssetId,
                  })
                  .where(eq(incomeEvents.id, existingRow.id));

                existingRow.kind = nextKind;
                existingRow.quantity = nextQty;
                existingRow.unit_amount = nextUnit;
                existingRow.notes = nextNotes;
                existingRow.item_id = existingRow.item_id ?? itemId;
                existingRow.asset_id = existingRow.asset_id ?? incomeAssetId;
                counts.incomesMatched = (counts.incomesMatched ?? 0) + 1;
              } else {
                const createdInc = await incomeRepository.addIncome({
                  portfolioId: incomePortfolioId,
                  ticker: mappedInc.ticker,
                  payDate: mappedInc.payDate,
                  amount: mappedInc.amount,
                  notes: mappedInc.notes ?? undefined,
                  source: 'OPEN_FINANCE',
                  externalId: mappedInc.externalId,
                  kind: mappedInc.kind,
                  quantity: mappedInc.quantity ?? undefined,
                  unitAmount: mappedInc.unitAmount ?? undefined,
                  itemId,
                  assetId: incomeAssetId,
                });
                workingIncomes.push(createdInc);
                counts.incomesCreated = (counts.incomesCreated ?? 0) + 1;
              }
            }
          }
        }

        // Investimento que deixa de vir da Pluggy NÃO zera posição: marca missing_since (exceto re-sync parcial)
        if (!requestedIds) {
          for (const a of allAssets) {
            if (
              a.source === 'OPEN_FINANCE' &&
              a.institution_id === itemId &&
              a.external_id &&
              !syncedExternalIds.has(a.external_id) &&
              a.of_status !== 'TOTAL_WITHDRAWAL'
            ) {
              if (!a.missing_since) {
                await db
                  .update(assets)
                  .set({ missing_since: nowIso, updated_at: nowIso })
                  .where(eq(assets.id, a.id));
              }
              counts.assetsMarkedMissing++;
            }
          }
        }
      });

      const finalStatus: 'SUCCESS' | 'PARTIAL' = failedSet.size > 0 ? 'PARTIAL' : 'SUCCESS';

      await openFinanceRepository.recordSyncRun({
        id: runId,
        item_id: itemId,
        started_at: nowIso,
        finished_at: new Date().toISOString(),
        status: finalStatus,
        counts_json: JSON.stringify(counts),
        error: null,
      });

      return {
        runId,
        itemId,
        status: finalStatus,
        counts,
        coverageByClass,
        needsReconciliation,
        interestTransactions,
        portfolioId: defaultPortId,
        portfolioName: brokerPortfolioName,
        portfolioCreated: brokerPortfolioCreated,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar investimentos.';
      await openFinanceRepository.recordSyncRun({
        id: runId,
        item_id: itemId,
        started_at: nowIso,
        finished_at: new Date().toISOString(),
        status: 'ERROR',
        counts_json: JSON.stringify(counts),
        error: message,
      });
      throw err;
    }
  },

  async disconnectItemInvestments(
    itemId: string
  ): Promise<DisconnectInvestmentsResult> {
    let revertedAssets = 0;
    let restoredTransactions = 0;
    let removedIncomes = 0;
    const nowIso = new Date().toISOString();

    await runInTransaction(async () => {
      const db = await getDatabase();
      const itemAssets = await db
        .select()
        .from(assets)
        .where(and(eq(assets.institution_id, itemId), eq(assets.source, 'OPEN_FINANCE')));

      const itemPortfolioIds = new Set(itemAssets.map((a) => a.portfolio_id));
      const itemTickers = new Set(itemAssets.map((a) => normalizeTickerForIncomeDedup(a.ticker)));

      for (const a of itemAssets) {
        await db
          .update(assets)
          .set({
            source: 'MANUAL',
            missing_since: null,
            of_status: null,
            updated_at: nowIso,
          })
          .where(eq(assets.id, a.id));
        revertedAssets++;

        const assetTxs = await db
          .select()
          .from(transactions)
          .where(eq(transactions.asset_id, a.id));
        for (const tx of assetTxs) {
          if (tx.source !== 'OPEN_FINANCE' && tx.archived_at) {
            await db
              .update(transactions)
              .set({ archived_at: null })
              .where(eq(transactions.id, tx.id));
            restoredTransactions++;
          }
        }
      }

      // D13 / R8: remove apenas proventos pertencentes a este itemId
      const allOfIncomes = await db.select().from(incomeEvents);
      for (const inc of allOfIncomes) {
        if (inc.source !== 'OPEN_FINANCE' && inc.source !== 'OPEN_FINANCE_BANK') continue;
        if (inc.item_id) {
          if (inc.item_id === itemId) {
            await db.delete(incomeEvents).where(eq(incomeEvents.id, inc.id));
            removedIncomes++;
          }
        } else if (
          itemAssets.length > 0 &&
          itemPortfolioIds.has(inc.portfolio_id) &&
          itemTickers.has(normalizeTickerForIncomeDedup(inc.ticker))
        ) {
          await db.delete(incomeEvents).where(eq(incomeEvents.id, inc.id));
          removedIncomes++;
        }
      }
    });

    return { revertedAssets, restoredTransactions, removedIncomes };
  },

  async checkB3ImportConflicts(
    portfolioId: string,
    tickers: string[]
  ): Promise<B3ConflictWarning[]> {
    const db = await getDatabase();
    const portfolioAssets = await db
      .select()
      .from(assets)
      .where(and(eq(assets.portfolio_id, portfolioId), eq(assets.source, 'OPEN_FINANCE')));

    const normalizedRequested = new Set(tickers.map((t) => normalizeInvestmentTicker(t)));
    const warnings: B3ConflictWarning[] = [];

    for (const a of portfolioAssets) {
      const norm = normalizeInvestmentTicker(a.ticker);
      if (normalizedRequested.has(norm)) {
        warnings.push({
          ticker: a.ticker,
          assetId: a.id,
          message: `O ativo ${a.ticker} já é sincronizado pelo Open Finance (Pluggy). Confirme para importar sem duplicar.`,
        });
      }
    }

    return warnings;
  },
};
