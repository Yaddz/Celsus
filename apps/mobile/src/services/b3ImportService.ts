import Decimal from 'decimal.js';
import { ImportPlan, ImportPlanItem } from '../domain/b3';
import { readStatementFile } from './b3/readStatementFile';
import { buildImportPlan } from '../domain/b3';
import { getDatabase } from '../db/client';
import { transactions, incomeEvents, Asset } from '../db/schema';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { incomeRepository } from '../repositories/incomeRepository';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { transactionService } from './transactionService';
import { marketApiService } from './marketApi';
import { walletsStore } from '../stores/walletsStore';
import { calculatePositionFromTransactions } from '../domain/finance/averagePrice';

export interface B3ImportChoices {
  portfolioId?: string;
  newPortfolioName?: string;
  classOverrides?: Record<string, 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO'>;
  openingBalance?: Record<
    string,
    {
      mode: 'historical' | 'manual' | 'skip';
      price?: string;
    }
  >;
}

export interface B3ImportProgress {
  step: 'assets' | 'opening_balances' | 'transactions' | 'incomes' | 'verification';
  current: number;
  total: number;
  message: string;
}

export interface B3ImportReport {
  batchId: string;
  portfolioId: string;
  summary: {
    totalRowsRead: number;
    buysCount: number;
    sellsCount: number;
    incomesCount: number;
    ignoredCount: number;
    reviewCount: number;
  };
  imported: {
    buys: number;
    sells: number;
    incomes: number;
    openingBalances: number;
    assetsCreated: number;
  };
  duplicates: {
    buys: number;
    sells: number;
    incomes: number;
  };
  failures: Array<{
    item: any;
    reason: string;
  }>;
  verification: {
    matches: boolean;
    expectedBuys: string;
    actualBuys: string;
    expectedSells: string;
    actualSells: string;
    expectedIncomes: string;
    actualIncomes: string;
  };
}

export class B3ImportService {
  async preview(
    fileBytes: Uint8Array,
    fileName: string,
    options?: { portfolioId?: string; newPortfolioName?: string }
  ): Promise<ImportPlan> {
    const rawRows = await readStatementFile(fileBytes, fileName);

    const db = getDatabase();
    const existingIds = new Set<string>();

    if (db) {
      try {
        const txs = await db.select().from(transactions);
        for (const t of txs) {
          if (t.external_id) existingIds.add(t.external_id);
        }
        const incs = await db.select().from(incomeEvents);
        for (const i of incs) {
          if (i.external_id) existingIds.add(i.external_id);
        }
      } catch {}
    }

    let existingAssets: Asset[] = [];
    if (options?.portfolioId) {
      try {
        existingAssets = await assetRepository.listByPortfolio(options.portfolioId);
      } catch {}
    }

    return buildImportPlan({
      rows: rawRows,
      existingExternalIds: existingIds,
      existingAssets,
    });
  }

  async apply(
    plan: ImportPlan,
    choices: B3ImportChoices,
    onProgress?: (progress: B3ImportProgress) => void
  ): Promise<B3ImportReport> {
    let portfolioId = choices.portfolioId;
    if (!portfolioId && choices.newPortfolioName) {
      const created = await portfolioRepository.createPortfolio({
        name: choices.newPortfolioName,
        docket_code: choices.newPortfolioName.slice(0, 4).toUpperCase(),
      });
      portfolioId = created.id;
    }

    if (!portfolioId) {
      const ports = await portfolioRepository.listPortfolios(false);
      if (ports.length > 0) {
        portfolioId = ports[0].id;
      } else {
        const created = await portfolioRepository.createPortfolio({
          name: 'Carteira B3',
          docket_code: 'B3',
        });
        portfolioId = created.id;
      }
    }

    const batchId = `b3_${Date.now()}`;
    await appMetaRepository.set(
      'b3:last_batch',
      JSON.stringify({
        batchId,
        portfolioId,
        date: new Date().toISOString(),
      })
    );

    // 1. Assets
    const currentAssets = await assetRepository.listByPortfolio(portfolioId);
    const assetMap = new Map<string, Asset>();
    for (const a of currentAssets) {
      assetMap.set(a.ticker, a);
    }

    let assetsCreatedCount = 0;
    const createdAssetIds = new Set<string>();

    for (let i = 0; i < plan.assetsToCreate.length; i++) {
      const item = plan.assetsToCreate[i];
      if (!assetMap.has(item.ticker)) {
        const targetClass = choices.classOverrides?.[item.ticker] || item.assetClass;
        const newAsset = await assetRepository.addAsset({
          portfolio_id: portfolioId,
          asset_class: targetClass,
          ticker: item.ticker,
          name: item.name,
          target_percentage_in_class: 0,
        });
        assetMap.set(item.ticker, newAsset);
        createdAssetIds.add(newAsset.id);
        assetsCreatedCount++;
      }

      onProgress?.({
        step: 'assets',
        current: i + 1,
        total: plan.assetsToCreate.length,
        message: `Criando ativos: ${item.ticker}`,
      });
    }

    // 2. Opening balances
    let openingBalancesCount = 0;
    for (let i = 0; i < plan.openingBalances.length; i++) {
      const ob = plan.openingBalances[i];
      const obChoice = choices.openingBalance?.[ob.ticker];
      if (obChoice?.mode !== 'skip') {
        let price = obChoice?.price;
        if (!price && obChoice?.mode === 'historical') {
          const hist = await marketApiService.getHistoricalPrice(ob.ticker, ob.asOfDate);
          if (hist) price = hist;
        }
        if (!price) {
          price = '10.00';
        }

        const asset = assetMap.get(ob.ticker);
        if (asset) {
          await transactionService.executeTransaction({
            portfolioId,
            assetId: asset.id,
            type: 'BUY',
            tradeDate: ob.asOfDate,
            quantity: ob.missingQuantity,
            unitPrice: price,
            source: 'B3_IMPORT',
            externalId: `b3:opening:${ob.ticker}:${batchId}`,
            notes: `Saldo inicial inferido do extrato · lote:${batchId}`,
          });
          openingBalancesCount++;
        }
      }

      onProgress?.({
        step: 'opening_balances',
        current: i + 1,
        total: plan.openingBalances.length,
        message: `Saldo inicial: ${ob.ticker}`,
      });
    }

    // 3. Chronological items
    let importedBuys = 0;
    let importedSells = 0;
    let importedIncomes = 0;
    let dupBuys = 0;
    let dupSells = 0;
    let dupIncomes = 0;
    const failures: Array<{ item: any; reason: string }> = [];

    const existingIds = new Set<string>();
    const allTxs = await transactionRepository.listByPortfolio(portfolioId);
    for (const tx of allTxs) {
      if (tx.external_id) existingIds.add(tx.external_id);
    }
    const allIncomes = await incomeRepository.listByPortfolio(portfolioId);
    for (const inc of allIncomes) {
      if (inc.external_id) existingIds.add(inc.external_id);
    }

    let actualBuysSum = new Decimal(0);
    let actualSellsSum = new Decimal(0);
    let actualIncomesSum = new Decimal(0);

    for (let i = 0; i < plan.chronologicalItems.length; i++) {
      const item = plan.chronologicalItems[i];

      if (existingIds.has(item.externalId)) {
        if (item.kind === 'BUY') dupBuys++;
        else if (item.kind === 'SELL') dupSells++;
        else if (item.kind === 'INCOME') dupIncomes++;
        continue;
      }

      if (item.kind === 'BUY' || item.kind === 'SELL') {
        const asset = assetMap.get(item.ticker);
        if (!asset) {
          failures.push({ item, reason: `Ativo ${item.ticker} não encontrado` });
          continue;
        }

        try {
          const res = await transactionService.executeTransaction({
            portfolioId,
            assetId: asset.id,
            type: item.kind,
            tradeDate: item.tradeDate,
            quantity: item.quantity,
            unitPrice: item.unitPrice || '0.00',
            source: 'B3_IMPORT',
            externalId: item.externalId,
            notes: `${item.notes ? item.notes + ' · ' : ''}lote:${batchId} · ${item.institution}`,
          });

          if (item.kind === 'BUY') {
            importedBuys++;
            actualBuysSum = actualBuysSum.plus(new Decimal(res.transaction.total_amount));
          } else {
            importedSells++;
            actualSellsSum = actualSellsSum.plus(new Decimal(res.transaction.total_amount));
          }
          existingIds.add(item.externalId);
        } catch (err) {
          failures.push({
            item,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (item.kind === 'INCOME') {
        try {
          let kind = 'OUTRO';
          const lower = item.rawMovement.toLowerCase();
          if (lower.includes('rendimento')) kind = 'RENDIMENTO';
          else if (lower.includes('dividendo')) kind = 'DIVIDENDO';
          else if (lower.includes('juros') || lower.includes('jcp')) kind = 'JCP';

          const created = await incomeRepository.addIncome({
            portfolioId,
            ticker: item.ticker,
            payDate: item.tradeDate,
            amount: item.operationValue || '0',
            notes: `lote:${batchId} · ${item.rawMovement}`,
            source: 'B3_IMPORT',
            externalId: item.externalId,
            kind,
            quantity: item.quantity,
            unitAmount: item.unitPrice || undefined,
          });

          importedIncomes++;
          actualIncomesSum = actualIncomesSum.plus(new Decimal(created.amount));
          existingIds.add(item.externalId);
        } catch (err) {
          failures.push({
            item,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      onProgress?.({
        step: 'transactions',
        current: i + 1,
        total: plan.chronologicalItems.length,
        message: `Lançando: ${item.ticker} ${item.kind}`,
      });
    }

    // 4. Verification
    const expectedBuysStr = plan.totals.buys.toFixed(2);
    const expectedSellsStr = plan.totals.sells.toFixed(2);
    const expectedIncomesStr = plan.totals.incomes.toFixed(2);

    const actualBuysStr = actualBuysSum.toFixed(2);
    const actualSellsStr = actualSellsSum.toFixed(2);
    const actualIncomesStr = actualIncomesSum.toFixed(2);

    const matches =
      failures.length === 0 &&
      actualBuysStr === expectedBuysStr &&
      actualSellsStr === expectedSellsStr &&
      actualIncomesStr === expectedIncomesStr;

    onProgress?.({
      step: 'verification',
      current: plan.chronologicalItems.length,
      total: plan.chronologicalItems.length,
      message: 'Verificação concluída',
    });

    walletsStore.requestRefresh();

    return {
      batchId,
      portfolioId,
      summary: plan.summary,
      imported: {
        buys: importedBuys,
        sells: importedSells,
        incomes: importedIncomes,
        openingBalances: openingBalancesCount,
        assetsCreated: assetsCreatedCount,
      },
      duplicates: {
        buys: dupBuys,
        sells: dupSells,
        incomes: dupIncomes,
      },
      failures,
      verification: {
        matches,
        expectedBuys: expectedBuysStr,
        actualBuys: actualBuysStr,
        expectedSells: expectedSellsStr,
        actualSells: actualSellsStr,
        expectedIncomes: expectedIncomesStr,
        actualIncomes: actualIncomesStr,
      },
    };
  }

  async undoLastImport(): Promise<{ undone: boolean; batchId?: string; message: string }> {
    const raw = await appMetaRepository.get('b3:last_batch');
    if (!raw) {
      return { undone: false, message: 'Nenhuma importação encontrada para desfazer.' };
    }

    let parsedBatch: { batchId: string; portfolioId: string };
    try {
      parsedBatch = JSON.parse(raw);
    } catch {
      return { undone: false, message: 'Dados do último lote corrompidos.' };
    }

    const { batchId, portfolioId } = parsedBatch;

    // 1. Delete transactions of this batch
    const allTxs = await transactionRepository.listByPortfolio(portfolioId);
    const affectedAssetIds = new Set<string>();

    for (const tx of allTxs) {
      if (tx.notes && tx.notes.includes(batchId)) {
        affectedAssetIds.add(tx.asset_id);
        await transactionRepository.deleteTransaction(tx.id);
      }
    }

    // 2. Delete incomes of this batch
    const allIncomes = await incomeRepository.listByPortfolio(portfolioId);
    for (const inc of allIncomes) {
      if (inc.notes && inc.notes.includes(batchId)) {
        await incomeRepository.deleteIncome(inc.id);
      }
    }

    // 3. Recalculate remaining assets or delete if empty
    for (const assetId of affectedAssetIds) {
      const remainingTxs = await transactionRepository.getTransactionsByAsset(assetId);
      if (remainingTxs.length === 0) {
        await assetRepository.deleteAsset(assetId);
      } else {
        const sorted = remainingTxs.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
        const pos = calculatePositionFromTransactions(
          sorted.map((t) => ({
            type: t.type as 'BUY' | 'SELL',
            quantity: t.quantity,
            price: t.unit_price,
            fees: t.fees,
          }))
        );
        const currentAsset = await assetRepository.getAssetById(assetId);
        if (currentAsset) {
          await assetRepository.updateAsset(assetId, {
            quantity: pos.quantity,
            average_price: pos.averagePrice,
          });
        }
      }
    }

    await appMetaRepository.set('b3:last_batch', '');
    walletsStore.requestRefresh();

    return { undone: true, batchId, message: 'Importação desfeita com sucesso.' };
  }
}

export const b3ImportService = new B3ImportService();
