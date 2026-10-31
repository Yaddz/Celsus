import Decimal from 'decimal.js';
import { Transaction, Asset } from '../db/schema';
import { RebalanceAssetSuggestion } from '../domain/finance/types';
import { ITransactionService, transactionService } from './transactionService';

export interface BatchContributionItem {
  assetId: string;
  ticker: string;
  suggestedQuantity: string | number;
  unitPrice: string | number;
  fees?: string | number;
  notes?: string;
}

export interface BatchContributionInput {
  portfolioId: string;
  tradeDate: string;
  items: BatchContributionItem[];
  defaultNotes?: string;
}

export interface BatchContributionFromSuggestionsInput {
  portfolioId: string;
  tradeDate: string;
  suggestions: RebalanceAssetSuggestion[];
  assetIdMap: Record<string, string>; // ticker -> assetId
  notes?: string;
}

export interface BatchContributionResult {
  totalExecuted: number;
  totalAmountInvested: string;
  transactions: Transaction[];
  updatedAssets: Asset[];
}

export interface IRebalanceExecutionService {
  executeBatchContributions(params: BatchContributionInput): Promise<BatchContributionResult>;
  executeFromSuggestions(params: BatchContributionFromSuggestionsInput): Promise<BatchContributionResult>;
}

export class RebalanceExecutionService implements IRebalanceExecutionService {
  constructor(
    protected txService: ITransactionService = transactionService
  ) {}

  /**
   * S4-T03: Conversão em lote das sugestões do Simulador de Aporte em lançamentos BUY no Livro-Razão.
   */
  async executeBatchContributions(params: BatchContributionInput): Promise<BatchContributionResult> {
    const activeItems = params.items.filter((item) => {
      try {
        const qty = new Decimal(item.suggestedQuantity || 0);
        return qty.gt(0);
      } catch {
        return false;
      }
    });

    if (activeItems.length === 0) {
      return {
        totalExecuted: 0,
        totalAmountInvested: '0.00',
        transactions: [],
        updatedAssets: [],
      };
    }

    const transactions: Transaction[] = [];
    const updatedAssets: Asset[] = [];
    let totalInvested = new Decimal(0);

    for (const item of activeItems) {
      const execResult = await this.txService.executeTransaction({
        portfolioId: params.portfolioId,
        assetId: item.assetId,
        type: 'BUY',
        tradeDate: params.tradeDate,
        quantity: item.suggestedQuantity,
        unitPrice: item.unitPrice,
        fees: item.fees ?? '0.00',
        notes: item.notes ?? params.defaultNotes ?? 'Simulador de Aporte',
      });

      transactions.push(execResult.transaction);
      updatedAssets.push(execResult.updatedAsset);

      const qty = new Decimal(item.suggestedQuantity);
      const price = new Decimal(item.unitPrice);
      const fees = new Decimal(item.fees ?? 0);
      totalInvested = totalInvested.plus(qty.mul(price).plus(fees));
    }

    return {
      totalExecuted: transactions.length,
      totalAmountInvested: totalInvested.toFixed(2),
      transactions,
      updatedAssets,
    };
  }

  /**
   * S4-T03: Executa aportes em lote a partir do array direto de sugestões da calculadora.
   */
  async executeFromSuggestions(params: BatchContributionFromSuggestionsInput): Promise<BatchContributionResult> {
    const activeSuggestions = params.suggestions.filter((s) => {
      try {
        return new Decimal(s.suggestedQuantity || 0).gt(0);
      } catch {
        return false;
      }
    });

    const items: BatchContributionItem[] = activeSuggestions.map((s) => {
      const assetId = params.assetIdMap[s.ticker];
      if (!assetId) {
        throw new Error(`Ativo não mapeado para o ticker ${s.ticker}`);
      }
      return {
        assetId,
        ticker: s.ticker,
        suggestedQuantity: s.suggestedQuantity,
        unitPrice: s.currentPrice,
        notes: params.notes,
      };
    });

    return this.executeBatchContributions({
      portfolioId: params.portfolioId,
      tradeDate: params.tradeDate,
      items,
      defaultNotes: params.notes,
    });
  }
}

export const rebalanceExecutionService = new RebalanceExecutionService();
