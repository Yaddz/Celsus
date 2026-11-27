import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';
import { Transaction, Asset, FinEntry, transactions } from '../db/schema';
import { getDatabase, runInTransaction } from '../db/client';
import { decimalToCents } from '../domain/money';
import {
  isAppManagedCashAccount,
  matchBrokerSettlement,
  matchOpenFinanceInvestmentOutflow,
} from '../domain/financeFlow';
import { IMarketApiService, marketApiService } from './marketApi';
import { TransactionRepository, transactionRepository } from '../repositories/transactionRepository';
import { AssetRepository, assetRepository } from '../repositories/assetRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { finRepository } from '../repositories/finRepository';
import { finService } from './finService';
import {
  calculateBuyOperation,
  calculatePositionFromTransactions,
  calculateSellOperation,
} from '../domain/finance/averagePrice';

export interface CreateTransactionInput {
  id?: string;
  portfolioId: string;
  assetId: string;
  type: 'BUY' | 'SELL';
  tradeDate: string; // YYYY-MM-DD
  quantity: string | number;
  unitPrice: string | number;
  fees?: string | number;
  notes?: string | null;
  source?: 'MANUAL' | 'OPEN_FINANCE' | 'B3_IMPORT';
  externalId?: string | null;
  /** R40: conta de origem (BUY) ou destino (SELL). Omitido usa a corretora vinculada; null não lança em Finanças. */
  cashSource?: { accountId: string } | null;
  /** W3 (Sprint 116): lote de aporte; gravado no `investment_buy` (a transferência recebe o mesmo id). */
  batchId?: string | null;
}

export interface TransactionExecutionResult {
  transaction: Transaction;
  updatedAsset: Asset;
  realizedPnl?: string;
}

export interface ITransactionService {
  getAutoFillPrice(ticker: string, tradeDate: string): Promise<string | null>;
  executeTransaction(params: CreateTransactionInput): Promise<TransactionExecutionResult>;
  getTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]>;
  getTransactionsByAsset(assetId: string): Promise<Transaction[]>;
}

/** Mantém 2 casas no mínimo, mas não trunca preços/taxas com mais precisão (ex.: cripto). */
function formatMoney(val: Decimal): string {
  return val.decimalPlaces() <= 2 ? val.toFixed(2) : val.toString();
}

function formatTxQuantity(val: Decimal, inputStr: string | number): string {
  const str = inputStr.toString();
  const dotIndex = str.indexOf('.');
  const decimals = dotIndex === -1 ? 0 : str.length - dotIndex - 1;

  if (decimals >= 4) {
    return val.toFixed(8);
  }
  if (val.isInteger()) {
    return val.toFixed(0);
  }
  return val.decimalPlaces() <= 2 ? val.toFixed(2) : val.toString();
}

export class TransactionService implements ITransactionService {
  constructor(
    protected txRepo: TransactionRepository = transactionRepository,
    protected assetRepo: AssetRepository = assetRepository,
    protected marketApi: IMarketApiService = marketApiService
  ) {}

  /**
   * S4-T01: Pré-preenchimento automático do preço unitário na data da operação
   * a partir do histórico COTAHIST local ou fallback na API de mercado.
   */
  async getAutoFillPrice(ticker: string, tradeDate: string): Promise<string | null> {
    if (!ticker || !tradeDate) return null;
    const normalizedTicker = ticker.trim().toUpperCase();
    return this.marketApi.getHistoricalPrice(normalizedTicker, tradeDate);
  }

  /**
   * Auto-cadastra ativo se ainda não cadastrado na carteira (conforme especificação ponta a ponta)
   * e executa atomicamente a transação atualizando PM e quantidade.
   */
  async createTransaction(
    params: (CreateTransactionInput | (Omit<CreateTransactionInput, 'assetId'> & { assetId?: string; ticker?: string; assetClass?: string }))
  ): Promise<TransactionExecutionResult> {
    let targetAssetId = (params as any).assetId;
    if (!targetAssetId && (params as any).ticker) {
      const existingAssets = await this.assetRepo.getAssetsByPortfolio(params.portfolioId);
      const found = existingAssets.find(
        (a) => a.ticker.toUpperCase() === (params as any).ticker.toUpperCase()
      );
      if (found) {
        targetAssetId = found.id;
      } else {
        const newAsset = await this.assetRepo.createAsset({
          portfolio_id: params.portfolioId,
          ticker: (params as any).ticker.toUpperCase(),
          name: (params as any).ticker.toUpperCase(),
          asset_class: (params as any).assetClass || 'STOCK',
          quantity: '0',
          average_price: '0.00',
        });
        targetAssetId = newAsset.id;
      }
    }

    if (!targetAssetId) {
      throw new Error('Identificador do ativo (assetId ou ticker) é obrigatório');
    }

    // Snapshot da posição anterior: permite recalcular o PM sem o arredondamento
    // de 2 casas aplicado por executeTransaction.
    const before = await this.assetRepo.getAssetById(targetAssetId);

    const result = await this.executeTransaction({
      ...params,
      assetId: targetAssetId,
    });

    let avgPriceDec = new Decimal(result.updatedAsset.average_price || 0);
    if (before) {
      const prevQty = new Decimal(before.quantity || 0);
      const prevPm = new Decimal(before.average_price || 0);
      if (params.type === 'BUY') {
        const newQty = prevQty.plus(new Decimal(params.quantity));
        if (newQty.gt(0)) {
          avgPriceDec = prevQty
            .mul(prevPm)
            .plus(new Decimal(params.quantity).mul(new Decimal(params.unitPrice)))
            .plus(new Decimal(params.fees ?? 0))
            .div(newQty);
        }
      } else if (params.type === 'SELL') {
        // Venda não altera o PM; zera apenas se a posição foi encerrada.
        avgPriceDec = new Decimal(result.updatedAsset.quantity || 0).isZero()
          ? new Decimal(0)
          : prevPm;
      }
    }
    const avgPrice8 = avgPriceDec.toFixed(8);
    const updatedWith8 = await this.assetRepo.updateAsset(targetAssetId, {
      quantity: result.updatedAsset.quantity,
      average_price: avgPrice8,
    });

    return {
      ...result,
      updatedAsset: updatedWith8 || {
        ...result.updatedAsset,
        average_price: avgPrice8,
      },
    };
  }

  /**
   * S4-T02: Persistência transacional de compra/venda atualizando
   * atomicamente quantidade e preço médio do ativo no banco local.
   */
  async executeTransaction(params: CreateTransactionInput): Promise<TransactionExecutionResult> {
    const qtyDec = new Decimal(params.quantity);
    if (qtyDec.lte(0) || isNaN(qtyDec.toNumber())) {
      throw new Error('Quantidade inválida: deve ser maior que zero');
    }

    const priceDec = new Decimal(params.unitPrice);
    if (priceDec.lte(0) || isNaN(priceDec.toNumber())) {
      throw new Error('Preço inválido: deve ser maior que zero');
    }

    const feesDec = new Decimal(params.fees ?? 0);
    if (feesDec.lt(0)) {
      throw new Error('Taxas inválidas: não podem ser negativas');
    }

    let asset = await this.assetRepo.getAssetById(params.assetId);
    if (!asset) {
      const portAssets = await this.assetRepo.getAssetsByPortfolio(params.portfolioId);
      asset =
        (portAssets || []).find(
          (a) =>
            a.id === params.assetId ||
            ((params as any).ticker && a.ticker.toUpperCase() === (params as any).ticker.toUpperCase())
        ) || null;
    }
    if (!asset) {
      throw new Error('Ativo não encontrado na carteira');
    }

    const currentQtyDec = new Decimal(asset.quantity || 0);

    if (params.type === 'SELL' && qtyDec.gt(currentQtyDec)) {
      throw new Error(
        `Saldo insuficiente para venda: quantidade atual é ${currentQtyDec.toString()}, mas tentou vender ${qtyDec.toString()}`
      );
    }

    const portfolio = await portfolioRepository.getPortfolioById(params.portfolioId);
    const brokerAccountId = portfolio?.fin_account_id ?? null;
    const linkedAccount = brokerAccountId ? await finRepository.getAccountById(brokerAccountId) : null;
    // W1a (Sprint 116): conta vinculada Open Finance = o extrato do banco manda; o app não lança dinheiro.
    const isAppManagedCash = isAppManagedCashAccount(linkedAccount);
    const isManualSource = !params.source || params.source === 'MANUAL';
    const shouldPostCash =
      Boolean(brokerAccountId) &&
      isAppManagedCash &&
      params.cashSource !== null &&
      isManualSource;
    // W1b: em conta Open Finance só se tenta ligar a liquidação do pregão (sem mudar tipo nem valor)
    const shouldLinkSettlement = Boolean(brokerAccountId) && !isAppManagedCash && isManualSource;
    const selectedCashAccountId = params.cashSource?.accountId || brokerAccountId;

    return runInTransaction(async () => {
      if (params.type === 'SELL') {
        const sellResult = calculateSellOperation({
          currentQuantity: asset.quantity,
          currentAveragePrice: asset.average_price,
          sellQuantity: params.quantity,
          sellPrice: params.unitPrice,
          fees: params.fees ?? 0,
        });

        const totalAmount = qtyDec.mul(priceDec).minus(feesDec);

        const transaction = await this.txRepo.createTransaction({
          id: params.id,
          portfolio_id: params.portfolioId,
          asset_id: params.assetId,
          type: 'SELL',
          trade_date: params.tradeDate,
          quantity: formatTxQuantity(qtyDec, params.quantity),
          unit_price: formatMoney(priceDec),
          fees: formatMoney(feesDec),
          total_amount: totalAmount.toFixed(2),
          notes: params.notes ?? null,
          source: params.source ?? 'MANUAL',
          external_id: params.externalId ?? null,
        });

        const updatedAsset = await this.assetRepo.updateAsset(params.assetId, {
          quantity: sellResult.quantity,
          average_price: sellResult.averagePrice,
        });

        if (shouldLinkSettlement && brokerAccountId) {
          await this.linkBrokerSettlement(params.portfolioId, brokerAccountId, params.tradeDate, transaction.id);
        }

        if (shouldPostCash && brokerAccountId) {
          const amountCents = decimalToCents(totalAmount);
          if (amountCents > 0) {
            await finRepository.createEntry({
              kind: 'investment_sell',
              amount_cents: amountCents,
              due_date: params.tradeDate,
              paid_date: params.tradeDate,
              paid_amount_cents: amountCents,
              status: 'paid',
              account_id: brokerAccountId,
              category_id: 'cat-outros-receita',
              description: `Venda ${asset.ticker}`,
              linked_transaction_id: transaction.id,
            });
            if (selectedCashAccountId && selectedCashAccountId !== brokerAccountId) {
              await finService.createTransfer({
                fromAccountId: brokerAccountId,
                toAccountId: selectedCashAccountId,
                amountCents,
                dateIso: params.tradeDate,
                description: `Resgate ${asset.ticker}`,
                linkedTransactionId: transaction.id,
              });
            }
          }
        }

        return {
          transaction,
          updatedAsset: updatedAsset ?? {
            ...asset,
            quantity: sellResult.quantity,
            average_price: sellResult.averagePrice,
          },
          realizedPnl: sellResult.realizedPnl,
        };
      } else {
        const buyResult = calculateBuyOperation({
          currentQuantity: asset.quantity,
          currentAveragePrice: asset.average_price,
          buyQuantity: params.quantity,
          buyPrice: params.unitPrice,
          fees: params.fees ?? 0,
        });

        const totalAmount = qtyDec.mul(priceDec).plus(feesDec);

        const transaction = await this.txRepo.createTransaction({
          id: params.id,
          portfolio_id: params.portfolioId,
          asset_id: params.assetId,
          type: 'BUY',
          trade_date: params.tradeDate,
          quantity: formatTxQuantity(qtyDec, params.quantity),
          unit_price: formatMoney(priceDec),
          fees: formatMoney(feesDec),
          total_amount: totalAmount.toFixed(2),
          notes: params.notes ?? null,
          source: params.source ?? 'MANUAL',
          external_id: params.externalId ?? null,
        });

        const updatedAsset = await this.assetRepo.updateAsset(params.assetId, {
          quantity: buyResult.quantity,
          average_price: buyResult.averagePrice,
        });

        if (shouldLinkSettlement && brokerAccountId) {
          await this.linkBrokerSettlement(params.portfolioId, brokerAccountId, params.tradeDate, transaction.id);
        }

        if (shouldPostCash && brokerAccountId) {
          const amountCents = decimalToCents(totalAmount);
          if (amountCents > 0) {
            if (selectedCashAccountId && selectedCashAccountId !== brokerAccountId) {
              const allEntries = await finRepository.listAllEntries();
              const matchedOf = matchOpenFinanceInvestmentOutflow(allEntries, {
                accountId: selectedCashAccountId,
                amountCents,
                tradeDate: params.tradeDate,
                brokerAccountId,
              });
              if (matchedOf) {
                const transferGroupId =
                  matchedOf.transfer_group_id ??
                  `tr-of-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const restorePayload =
                  matchedOf.of_link_restore ??
                  JSON.stringify({
                    kind: matchedOf.kind,
                    transfer_group_id: matchedOf.transfer_group_id ?? null,
                    of_class_reason: matchedOf.of_class_reason ?? null,
                  });
                const matchedCents =
                  matchedOf.status === 'paid'
                    ? (matchedOf.paid_amount_cents ?? matchedOf.amount_cents)
                    : matchedOf.amount_cents;
                await finRepository.updateEntry(matchedOf.id, {
                  kind: 'transfer_out',
                  transfer_group_id: transferGroupId,
                  linked_transaction_id: transaction.id,
                  of_class_reason: matchedOf.of_class_reason ?? 'INVESTMENT_MOVE',
                  of_link_restore: restorePayload,
                  batch_id: params.batchId ?? null,
                });
                await finRepository.createEntry({
                  kind: 'transfer_in',
                  amount_cents: matchedCents,
                  due_date: params.tradeDate,
                  paid_date: params.tradeDate,
                  paid_amount_cents: matchedCents,
                  status: 'paid',
                  account_id: brokerAccountId,
                  category_id: 'cat-outros-receita',
                  description: `Aporte ${asset.ticker}`,
                  transfer_group_id: transferGroupId,
                  linked_transaction_id: transaction.id,
                  batch_id: params.batchId ?? null,
                });
              } else {
                await finService.createTransfer({
                  fromAccountId: selectedCashAccountId,
                  toAccountId: brokerAccountId,
                  amountCents,
                  dateIso: params.tradeDate,
                  description: `Aporte ${asset.ticker}`,
                  linkedTransactionId: transaction.id,
                });
              }
            }
            await finRepository.createEntry({
              kind: 'investment_buy',
              amount_cents: amountCents,
              due_date: params.tradeDate,
              paid_date: params.tradeDate,
              paid_amount_cents: amountCents,
              status: 'paid',
              account_id: brokerAccountId,
              category_id: 'cat-outros-despesa',
              description: `Compra ${asset.ticker}`,
              linked_transaction_id: transaction.id,
              batch_id: params.batchId ?? null,
            });
          }
        }

        return {
          transaction,
          updatedAsset: updatedAsset ?? {
            ...asset,
            quantity: buyResult.quantity,
            average_price: buyResult.averagePrice,
          },
        };
      }
    });
  }

  /**
   * W1b (Sprint 116): liga a compra/venda manual à liquidação do pregão no extrato Open Finance da conta
   * vinculada. A nota agrupa as operações do pregão, então o casamento usa a soma líquida (compras − vendas
   * manuais) da carteira no pregão. Só grava `linked_transaction_id` (guardando `of_link_restore`); nunca muda
   * tipo nem valor. Sem casamento, não grava nada.
   */
  private async linkBrokerSettlement(
    portfolioId: string,
    accountId: string,
    tradeDate: string,
    transactionId: string
  ): Promise<void> {
    const portfolioTxs = await this.txRepo.getTransactionsByPortfolio(portfolioId);
    let netCents = 0;
    for (const t of portfolioTxs) {
      if (t.trade_date !== tradeDate) continue;
      if (t.source && t.source !== 'MANUAL') continue;
      const cents = decimalToCents(t.total_amount);
      if (t.type === 'BUY') netCents += cents;
      else if (t.type === 'SELL') netCents -= cents;
    }
    if (netCents === 0) return;

    const [y, m, d] = tradeDate.split('-').map(Number);
    const endIso = new Date(Date.UTC(y, m - 1, d + 10)).toISOString().slice(0, 10);
    const entries = await finRepository.listEntriesBetween(tradeDate, endIso);
    const match = matchBrokerSettlement(entries, { accountId, tradeDate, netCents });
    if (!match) return;
    await finRepository.updateEntry(match.id, {
      linked_transaction_id: transactionId,
      of_link_restore:
        match.of_link_restore ??
        JSON.stringify({
          kind: match.kind,
          transfer_group_id: match.transfer_group_id ?? null,
          of_class_reason: match.of_class_reason ?? null,
        }),
    });
  }

  /**
   * W3 (Sprint 116): ao excluir uma compra de um lote de aporte (`batch_id`), a transferência do lote cai pelo
   * valor dela (transfer_out e transfer_in juntos; se o transfer_out é Open Finance casado, só o transfer_in é
   * ajustado e a diferença fica no saldo da corretora). Excluir a última compra apaga a transferência
   * (restaurando o lançamento Open Finance pelo caminho da V4).
   */
  private async detachFromContributionBatch(transactionId: string): Promise<void> {
    const linked = await finRepository.listEntriesByLinkedTransactionId(transactionId);
    const buyEntry = linked.find((e) => e.kind === 'investment_buy' && e.batch_id);
    if (!buyEntry?.batch_id) return;

    const batchEntries = await finRepository.listEntriesByBatchId(buyEntry.batch_id);
    const siblings = batchEntries.filter((e) => e.kind === 'investment_buy' && e.id !== buyEntry.id);
    const transfers = batchEntries.filter((e) => e.kind === 'transfer_in' || e.kind === 'transfer_out');
    const buyCents = buyEntry.paid_amount_cents ?? buyEntry.amount_cents;

    if (siblings.length > 0) {
      const anchorTxId = siblings[0].linked_transaction_id ?? null;
      for (const t of transfers) {
        const patch: Partial<FinEntry> = {};
        if (t.linked_transaction_id === transactionId) {
          patch.linked_transaction_id = anchorTxId;
        }
        if (t.source !== 'OPEN_FINANCE') {
          patch.amount_cents = Math.max(0, t.amount_cents - buyCents);
          patch.paid_amount_cents = Math.max(0, (t.paid_amount_cents ?? t.amount_cents) - buyCents);
        }
        if (Object.keys(patch).length > 0) {
          await finRepository.updateEntry(t.id, patch);
        }
      }
    } else {
      // Última compra do lote: a transferência (e o casamento OF) passa a depender só dela
      for (const t of transfers) {
        if (t.linked_transaction_id !== transactionId) {
          await finRepository.updateEntry(t.id, { linked_transaction_id: transactionId });
        }
      }
    }
  }

  /**
   * Exclui movimentação e todos os lançamentos financeiros ligados na mesma transação,
   * recalculando a posição do ativo a partir das movimentações restantes.
   */
  async deleteTransaction(transactionId: string): Promise<void> {
    await runInTransaction(async () => {
      const db = getDatabase();
      const [targetTx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));

      await this.detachFromContributionBatch(transactionId);
      await finRepository.deleteEntriesByLinkedTransactionId(transactionId);
      await this.txRepo.deleteTransaction(transactionId);

      if (targetTx) {
        const remaining = await this.txRepo.getTransactionsByAsset(targetTx.asset_id);
        const pos = calculatePositionFromTransactions(
          remaining.map((r) => ({
            type: r.type as 'BUY' | 'SELL',
            quantity: r.quantity,
            unitPrice: r.unit_price,
            fees: r.fees,
            tradeDate: r.trade_date,
          }))
        );
        await this.assetRepo.updateAsset(targetTx.asset_id, {
          quantity: pos.quantity,
          average_price: pos.averagePrice,
        });
      }
    });
  }

  /**
   * Consulta histórico de movimentações da carteira.
   */
  async getTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]> {
    return this.txRepo.getTransactionsByPortfolio(portfolioId);
  }

  /**
   * Consulta histórico de movimentações de um ativo específico.
   */
  async getTransactionsByAsset(assetId: string): Promise<Transaction[]> {
    return this.txRepo.getTransactionsByAsset(assetId);
  }
}

export const transactionService = new TransactionService();
