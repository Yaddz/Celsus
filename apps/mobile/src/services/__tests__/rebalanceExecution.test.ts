import {
  RebalanceExecutionService,
  BatchContributionInput,
  BatchContributionFromSuggestionsInput,
} from '../rebalanceExecution';
import { ITransactionService, TransactionExecutionResult } from '../transactionService';
import { RebalanceAssetSuggestion } from '../../domain/finance/types';
import { Asset, Transaction } from '../../db/schema';

describe('S4-T03: TestBatchConfirmSimulatedContributions', () => {
  let mockTxService: jest.Mocked<ITransactionService>;
  let executionService: RebalanceExecutionService;

  beforeEach(() => {
    mockTxService = {
      getAutoFillPrice: jest.fn(),
      executeTransaction: jest.fn(),
      getTransactionsByPortfolio: jest.fn(),
      getTransactionsByAsset: jest.fn(),
    };

    executionService = new RebalanceExecutionService(mockTxService);
  });

  it('should create BUY transactions for all suggestions with positive allocation', async () => {
    // 3 suggestions with positive quantity:
    // 1) WEGE3: 15 @ 40.00 = 600.00
    // 2) HGLG11: 5 @ 160.00 = 800.00
    // 3) BTC: 0.00250000 @ 350,000.00 = 875.00
    // Total Amount = 600 + 800 + 875 = 2275.00
    const mockTx1: Transaction = {
      id: 'tx-1',
      portfolio_id: 'port-1',
      asset_id: 'asset-wege3',
      type: 'BUY',
      trade_date: '2024-04-10',
      quantity: '15',
      unit_price: '40.00',
      fees: '0.00',
      total_amount: '600.00',
      notes: 'Simulador de Aporte',
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-10T12:00:00.000Z',
    };

    const mockTx2: Transaction = {
      id: 'tx-2',
      portfolio_id: 'port-1',
      asset_id: 'asset-hglg11',
      type: 'BUY',
      trade_date: '2024-04-10',
      quantity: '5',
      unit_price: '160.00',
      fees: '0.00',
      total_amount: '800.00',
      notes: 'Simulador de Aporte',
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-10T12:00:00.000Z',
    };

    const mockTx3: Transaction = {
      id: 'tx-3',
      portfolio_id: 'port-1',
      asset_id: 'asset-btc',
      type: 'BUY',
      trade_date: '2024-04-10',
      quantity: '0.00250000',
      unit_price: '350000.00',
      fees: '0.00',
      total_amount: '875.00',
      notes: 'Simulador de Aporte',
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-10T12:00:00.000Z',
    };

    const dummyAsset = (id: string, ticker: string, qty: string): Asset => ({
      id,
      portfolio_id: 'port-1',
      asset_class: 'STOCK',
      ticker,
      name: ticker,
      target_percentage_in_class: 50,
      quantity: qty,
      average_price: '50.00',
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2024-01-01',
      updated_at: '2024-04-10',
    });

    mockTxService.executeTransaction
      .mockResolvedValueOnce({ transaction: mockTx1, updatedAsset: dummyAsset('asset-wege3', 'WEGE3', '25') })
      .mockResolvedValueOnce({ transaction: mockTx2, updatedAsset: dummyAsset('asset-hglg11', 'HGLG11', '15') })
      .mockResolvedValueOnce({ transaction: mockTx3, updatedAsset: dummyAsset('asset-btc', 'BTC', '0.00500000') });

    const batchInput: BatchContributionInput = {
      portfolioId: 'port-1',
      tradeDate: '2024-04-10',
      items: [
        { assetId: 'asset-wege3', ticker: 'WEGE3', suggestedQuantity: 15, unitPrice: 40.0 },
        { assetId: 'asset-hglg11', ticker: 'HGLG11', suggestedQuantity: 5, unitPrice: 160.0 },
        { assetId: 'asset-btc', ticker: 'BTC', suggestedQuantity: '0.00250000', unitPrice: '350000.00' },
      ],
    };

    const result = await executionService.executeBatchContributions(batchInput);

    expect(result.totalExecuted).toBe(3);
    expect(result.totalAmountInvested).toBe('2275.00');
    expect(result.transactions).toHaveLength(3);
    expect(result.updatedAssets).toHaveLength(3);

    expect(mockTxService.executeTransaction).toHaveBeenCalledTimes(3);
    expect(mockTxService.executeTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        portfolioId: 'port-1',
        assetId: 'asset-wege3',
        type: 'BUY',
        quantity: 15,
        unitPrice: 40.0,
      })
    );
  });

  it('should skip assets with zero suggested allocation', async () => {
    // 2 suggestions with qty > 0, 2 suggestions with qty = 0 (assets already at or above target)
    const mockTx: Transaction = {
      id: 'tx-1',
      portfolio_id: 'port-1',
      asset_id: 'asset-itub4',
      type: 'BUY',
      trade_date: '2024-04-10',
      quantity: '20',
      unit_price: '30.00',
      fees: '0.00',
      total_amount: '600.00',
      notes: null,
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-10T12:00:00.000Z',
    };

    mockTxService.executeTransaction.mockResolvedValueOnce({
      transaction: mockTx,
      updatedAsset: {} as any,
    });

    const batchInput: BatchContributionInput = {
      portfolioId: 'port-1',
      tradeDate: '2024-04-10',
      items: [
        { assetId: 'asset-itub4', ticker: 'ITUB4', suggestedQuantity: 20, unitPrice: 30.0 },
        { assetId: 'asset-petr4', ticker: 'PETR4', suggestedQuantity: 0, unitPrice: 38.0 },
        { assetId: 'asset-vale3', ticker: 'VALE3', suggestedQuantity: '0', unitPrice: 65.0 },
      ],
    };

    const result = await executionService.executeBatchContributions(batchInput);

    expect(result.totalExecuted).toBe(1);
    expect(result.totalAmountInvested).toBe('600.00');
    expect(mockTxService.executeTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxService.executeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: 'asset-itub4',
        quantity: 20,
      })
    );
  });

  it('should update each asset quantity and average price after batch execution', async () => {
    const updatedAsset1: Asset = {
      id: 'asset-1',
      portfolio_id: 'port-1',
      asset_class: 'STOCK',
      ticker: 'WEGE3',
      name: 'Weg ON',
      target_percentage_in_class: 50,
      quantity: '25',
      average_price: '39.20',
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2024-01-01',
      updated_at: '2024-04-10',
    };

    mockTxService.executeTransaction.mockResolvedValueOnce({
      transaction: { id: 'tx-1' } as any,
      updatedAsset: updatedAsset1,
    });

    const result = await executionService.executeBatchContributions({
      portfolioId: 'port-1',
      tradeDate: '2024-04-10',
      items: [
        { assetId: 'asset-1', ticker: 'WEGE3', suggestedQuantity: 15, unitPrice: 40.0 },
      ],
    });

    expect(result.updatedAssets[0].quantity).toBe('25');
    expect(result.updatedAssets[0].average_price).toBe('39.20');
  });

  it('should accept RebalanceResult suggestions with assetId mapping (executeFromSuggestions)', async () => {
    const suggestions: RebalanceAssetSuggestion[] = [
      {
        ticker: 'KNCR11',
        assetClass: 'FII',
        currentQuantity: '10',
        currentPrice: '100.00',
        currentValue: '1000.00',
        currentWeightPercent: '20.00',
        targetWeightPercent: '30.00',
        targetValue: '1800.00',
        deficit: '800.00',
        suggestedAmount: '800.00',
        suggestedQuantity: '8',
        allocatedAmount: '800.00',
      },
      {
        ticker: 'MXRF11',
        assetClass: 'FII',
        currentQuantity: '50',
        currentPrice: '10.00',
        currentValue: '500.00',
        currentWeightPercent: '10.00',
        targetWeightPercent: '10.00',
        targetValue: '600.00',
        deficit: '0.00',
        suggestedAmount: '0.00',
        suggestedQuantity: '0',
        allocatedAmount: '0.00',
      },
    ];

    const assetIdMap = {
      KNCR11: 'uuid-kncr11',
      MXRF11: 'uuid-mxrf11',
    };

    const mockTx: Transaction = {
      id: 'tx-fii-1',
      portfolio_id: 'port-1',
      asset_id: 'uuid-kncr11',
      type: 'BUY',
      trade_date: '2024-04-15',
      quantity: '8',
      unit_price: '100.00',
      fees: '0.00',
      total_amount: '800.00',
      notes: 'Simulador de Aporte',
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-15T10:00:00.000Z',
    };

    mockTxService.executeTransaction.mockResolvedValueOnce({
      transaction: mockTx,
      updatedAsset: {} as any,
    });

    const input: BatchContributionFromSuggestionsInput = {
      portfolioId: 'port-1',
      tradeDate: '2024-04-15',
      suggestions,
      assetIdMap,
      notes: 'Aporte de Rebalanceamento Q2',
    };

    const result = await executionService.executeFromSuggestions(input);

    expect(result.totalExecuted).toBe(1);
    expect(result.totalAmountInvested).toBe('800.00');
    expect(mockTxService.executeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: 'port-1',
        assetId: 'uuid-kncr11',
        type: 'BUY',
        quantity: '8',
        unitPrice: '100.00',
        notes: 'Aporte de Rebalanceamento Q2',
      })
    );
  });

  it('should handle empty batch or batch where all suggestions are zero allocation', async () => {
    const result = await executionService.executeBatchContributions({
      portfolioId: 'port-1',
      tradeDate: '2024-04-10',
      items: [
        { assetId: 'asset-1', ticker: 'PETR4', suggestedQuantity: 0, unitPrice: 35.0 },
        { assetId: 'asset-2', ticker: 'VALE3', suggestedQuantity: '0', unitPrice: 65.0 },
      ],
    });

    expect(result.totalExecuted).toBe(0);
    expect(result.totalAmountInvested).toBe('0.00');
    expect(result.transactions).toEqual([]);
    expect(result.updatedAssets).toEqual([]);
    expect(mockTxService.executeTransaction).not.toHaveBeenCalled();
  });

  it('should include default notes marking simulation contribution batch', async () => {
    mockTxService.executeTransaction.mockResolvedValueOnce({
      transaction: { id: 'tx-1' } as any,
      updatedAsset: {} as any,
    });

    await executionService.executeBatchContributions({
      portfolioId: 'port-1',
      tradeDate: '2024-04-10',
      items: [
        { assetId: 'asset-1', ticker: 'WEGE3', suggestedQuantity: 10, unitPrice: 40.0 },
      ],
    });

    expect(mockTxService.executeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: 'Simulador de Aporte',
      })
    );
  });

  it('should abort and throw error if transaction execution fails for any item in batch', async () => {
    mockTxService.executeTransaction.mockRejectedValueOnce(
      new Error('Erro ao persistir transação no banco')
    );

    await expect(
      executionService.executeBatchContributions({
        portfolioId: 'port-1',
        tradeDate: '2024-04-10',
        items: [
          { assetId: 'asset-invalid', ticker: 'INVALID', suggestedQuantity: 10, unitPrice: 40.0 },
        ],
      })
    ).rejects.toThrow(/erro ao persistir transação no banco/i);
  });
});
