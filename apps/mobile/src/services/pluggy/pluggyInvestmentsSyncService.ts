import { and, eq, isNull } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '../../db/client';
import { assets, transactions } from '../../db/schema';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import {
  calculateInvestmentCostBasis,
  computeClassCoverageReport,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
  matchInvestmentToAsset,
  normalizeInvestmentTicker,
  type ClassCoverageStatus,
  type InvestmentMatchCandidate,
  type InvestmentMatchStrategy,
} from '../../domain/openFinance/investments';
import { PluggyClient } from './pluggyClient';
import type { PluggyInvestment, PluggyInvestmentTransaction } from './types';

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
}

export interface SyncInvestmentsCounts {
  investmentsFetched: number;
  assetsCreated: number;
  assetsUpdated: number;
  assetsClosed: number;
  assetsMarkedMissing: number;
  transactionsArchived: number;
  transactionsCreated: number;
}

export interface SyncInvestmentsResult {
  runId: string;
  itemId: string;
  status: 'SUCCESS' | 'ERROR';
  counts: SyncInvestmentsCounts;
  coverageByClass: ClassCoverageStatus[];
  needsReconciliation: boolean;
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
}

function generateRunId(): string {
  return `of-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    }));

    return pluggyInvs.map((inv: PluggyInvestment) => {
      const match = matchInvestmentToAsset(inv, candidates);
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
    };

    const pluggyInvs = await fetchInvestmentsFromClient(client, itemId);
    counts.investmentsFetched = pluggyInvs.length;
    const coverageByClass = computeClassCoverageReport(pluggyInvs);

    const txsByInvId: Record<string, ReturnType<typeof mapPluggyInvestmentTransaction>[]> = {};
    for (const inv of pluggyInvs) {
      const rawTxs = await fetchInvestmentTxsFromClient(client, inv.id);
      txsByInvId[inv.id] = rawTxs.map((t: PluggyInvestmentTransaction) =>
        mapPluggyInvestmentTransaction(t, inv.id)
      );
    }

    const choicesByInvId = new Map<string, InvestmentReconciliationChoice>(
      (options?.reconciliationChoices ?? []).map((c) => [c.pluggyInvestmentId, c])
    );
    const defaultPortId =
      options?.portfolioByItemId?.[itemId] ?? options?.defaultPortfolioId ?? null;

    let needsReconciliation = false;

    await runInTransaction(async () => {
      const db = await getDatabase();
      const allAssets = await db.select().from(assets);
      const syncedExternalIds = new Set<string>();

      for (const inv of pluggyInvs) {
        syncedExternalIds.add(inv.id);
        const mapped = mapPluggyInvestment(inv);
        const mappedTxs = txsByInvId[inv.id] || [];
        const cost = calculateInvestmentCostBasis(inv, mappedTxs);

        const existingByExt = allAssets.find((a) => a.external_id === inv.id);
        const choice = choicesByInvId.get(inv.id);

        let targetAssetId: string | null = existingByExt?.id ?? null;
        let targetPortfolioId: string | null =
          choice?.targetPortfolioId ?? existingByExt?.portfolio_id ?? defaultPortId;

        if (!existingByExt && choice?.action === 'MATCH' && choice.targetAssetId) {
          targetAssetId = choice.targetAssetId;
        } else if (!existingByExt && !choice && !defaultPortId) {
          needsReconciliation = true;
          continue;
        }

        const isWithdrawn = mapped.status === 'TOTAL_WITHDRAWAL';

        if (targetAssetId) {
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
              name: mapped.name,
              quantity: isWithdrawn ? '0' : mapped.quantity,
              average_price: cost.averagePrice,
              manual_price_override: null,
              manual_position_value: isWithdrawn ? '0.00' : mapped.marketValue,
              gross_amount: mapped.grossAmount,
              cost_basis_source: cost.costBasisSource,
              isin: mapped.isin,
              rf_indexer: mapped.rfIndexer,
              rf_rate: mapped.rfRate,
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
              updated_at: nowIso,
            })
            .where(eq(assets.id, targetAssetId));

          if (isWithdrawn) {
            counts.assetsClosed++;
          } else {
            counts.assetsUpdated++;
          }
        } else if (targetPortfolioId) {
          const created = await assetRepository.createAsset({
            portfolio_id: targetPortfolioId,
            asset_class: mapped.assetClass,
            ticker: mapped.ticker,
            name: mapped.name,
            quantity: isWithdrawn ? '0' : mapped.quantity,
            average_price: cost.averagePrice,
            manual_price_override: null,
            manual_position_value: isWithdrawn ? '0.00' : mapped.marketValue,
            gross_amount: mapped.grossAmount,
            cost_basis_source: cost.costBasisSource,
            isin: mapped.isin,
            rf_indexer: mapped.rfIndexer,
            rf_rate: mapped.rfRate,
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
          });
          targetAssetId = created.id;
          if (isWithdrawn) {
            counts.assetsClosed++;
          } else {
            counts.assetsCreated++;
          }
        }

        // Inserir movimentações Pluggy com deduplicação por external_id
        if (targetAssetId && targetPortfolioId) {
          const currentAssetTxs = await db
            .select()
            .from(transactions)
            .where(eq(transactions.asset_id, targetAssetId));
          const existingExtTxIds = new Set(
            currentAssetTxs
              .filter((t) => t.source === 'OPEN_FINANCE' && t.external_id)
              .map((t) => t.external_id!)
          );

          for (const mtx of mappedTxs) {
            if (existingExtTxIds.has(mtx.externalId)) continue;
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
            existingExtTxIds.add(mtx.externalId);
            counts.transactionsCreated++;
          }
        }
      }

      // Investimento que deixa de vir da Pluggy NÃO zera posição: marca missing_since
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
    });

    await openFinanceRepository.recordSyncRun({
      id: runId,
      item_id: itemId,
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      status: 'SUCCESS',
      counts_json: JSON.stringify(counts),
      error: null,
    });

    return {
      runId,
      itemId,
      status: 'SUCCESS',
      counts,
      coverageByClass,
      needsReconciliation,
    };
  },

  async disconnectItemInvestments(
    itemId: string
  ): Promise<DisconnectInvestmentsResult> {
    let revertedAssets = 0;
    let restoredTransactions = 0;
    const nowIso = new Date().toISOString();

    await runInTransaction(async () => {
      const db = await getDatabase();
      const itemAssets = await db
        .select()
        .from(assets)
        .where(and(eq(assets.institution_id, itemId), eq(assets.source, 'OPEN_FINANCE')));

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
    });

    return { revertedAssets, restoredTransactions };
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
