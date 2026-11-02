import Decimal from 'decimal.js';
import { Transaction, Asset } from '../db/schema';
import { IMarketApiService, marketApiService } from './marketApi';
import { TransactionRepository, transactionRepository } from '../repositories/transactionRepository';
import { AssetRepository, assetRepository } from '../repositories/assetRepository';
import { calculateBuyOperation, calculateSellOperation } from '../domain/finance/averagePrice';

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
  source?: 'MANUAL' | 'OPEN_FINANCE';
  externalId?: string | null;
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

    const result = await this.executeTransaction({
      ...params,
      assetId: targetAssetId,
    });

    const avgPriceDec = new Decimal(result.updatedAsset.average_price || 0);
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

    if (params.type === 'SELL') {
      if (qtyDec.gt(currentQtyDec)) {
        throw new Error(
          `Saldo insuficiente para venda: quantidade atual é ${currentQtyDec.toString()}, mas tentou vender ${qtyDec.toString()}`
        );
      }

      // Calcula novo PM (inalterado) e Lucro Realizado
      const sellResult = calculateSellOperation({
        currentQuantity: asset.quantity,
        currentAveragePrice: asset.average_price,
        sellQuantity: params.quantity,
        sellPrice: params.unitPrice,
        fees: params.fees ?? 0,
      });

      const totalAmount = qtyDec.mul(priceDec).minus(feesDec);

      // Persiste transação
      const transaction = await this.txRepo.createTransaction({
        id: params.id,
        portfolio_id: params.portfolioId,
        asset_id: params.assetId,
        type: 'SELL',
        trade_date: params.tradeDate,
        quantity: formatTxQuantity(qtyDec, params.quantity),
        unit_price: priceDec.toFixed(2),
        fees: feesDec.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        notes: params.notes ?? null,
        source: params.source ?? 'MANUAL',
        external_id: params.externalId ?? null,
      });

      // Atualiza ativo atomicamente
      const updatedAsset = await this.assetRepo.updateAsset(params.assetId, {
        quantity: sellResult.quantity,
        average_price: sellResult.averagePrice,
      });

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
      // BUY Operation
      const buyResult = calculateBuyOperation({
        currentQuantity: asset.quantity,
        currentAveragePrice: asset.average_price,
        buyQuantity: params.quantity,
        buyPrice: params.unitPrice,
        fees: params.fees ?? 0,
      });

      const totalAmount = qtyDec.mul(priceDec).plus(feesDec);

      // Persiste transação
      const transaction = await this.txRepo.createTransaction({
        id: params.id,
        portfolio_id: params.portfolioId,
        asset_id: params.assetId,
        type: 'BUY',
        trade_date: params.tradeDate,
        quantity: formatTxQuantity(qtyDec, params.quantity),
        unit_price: priceDec.toFixed(2),
        fees: feesDec.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        notes: params.notes ?? null,
        source: params.source ?? 'MANUAL',
        external_id: params.externalId ?? null,
      });

      // Atualiza ativo atomicamente
      const updatedAsset = await this.assetRepo.updateAsset(params.assetId, {
        quantity: buyResult.quantity,
        average_price: buyResult.averagePrice,
      });

      return {
        transaction,
        updatedAsset: updatedAsset ?? {
          ...asset,
          quantity: buyResult.quantity,
          average_price: buyResult.averagePrice,
        },
      };
    }
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
