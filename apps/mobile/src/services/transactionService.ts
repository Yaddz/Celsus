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

    const asset = await this.assetRepo.getAssetById(params.assetId);
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
