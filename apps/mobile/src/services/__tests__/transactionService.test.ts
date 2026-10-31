import {
  TransactionService,
  CreateTransactionInput,
} from '../transactionService';
import { IMarketApiService, MarketQuote } from '../marketApi';
import { Asset, Transaction } from '../../db/schema';
import { TransactionRepository } from '../../repositories/transactionRepository';
import { AssetRepository } from '../../repositories/assetRepository';

describe('S4-T01: TestAutoFillHistoricalPriceFromCotahistOnBuy', () => {
  let mockMarketApi: jest.Mocked<IMarketApiService>;
  let mockTxRepo: jest.Mocked<TransactionRepository>;
  let mockAssetRepo: jest.Mocked<AssetRepository>;
  let service: TransactionService;

  beforeEach(() => {
    mockMarketApi = {
      getHistoricalPrice: jest.fn(),
      fetchQuotes: jest.fn(),
      getCachedQuote: jest.fn(),
      saveHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
    };

    mockTxRepo = {
      createTransaction: jest.fn(),
      getTransactionsByPortfolio: jest.fn(),
      getTransactionsByAsset: jest.fn(),
    } as any;

    mockAssetRepo = {
      createAsset: jest.fn(),
      getAssetsByPortfolio: jest.fn(),
      getAssetsByClass: jest.fn(),
      getAssetById: jest.fn(),
      updateAsset: jest.fn(),
      updateAssetTargetInClass: jest.fn(),
      deleteAsset: jest.fn(),
    } as any;

    service = new TransactionService(mockTxRepo, mockAssetRepo, mockMarketApi);
  });

  it('should return historical close price when ticker and date exist in local COTAHIST', async () => {
    mockMarketApi.getHistoricalPrice.mockResolvedValue('38.50');

    const price = await service.getAutoFillPrice('PETR4', '2024-03-15');

    expect(price).toBe('38.50');
    expect(mockMarketApi.getHistoricalPrice).toHaveBeenCalledWith('PETR4', '2024-03-15');
  });

  it('should normalize lowercase ticker to uppercase before looking up historical price', async () => {
    mockMarketApi.getHistoricalPrice.mockResolvedValue('65.20');

    const price = await service.getAutoFillPrice('vale3', '2024-05-10');

    expect(price).toBe('65.20');
    expect(mockMarketApi.getHistoricalPrice).toHaveBeenCalledWith('VALE3', '2024-05-10');
  });

  it('should fetch from remote market API and cache locally when price is not in local database', async () => {
    // getHistoricalPrice internally falls back to remote API and caches
    mockMarketApi.getHistoricalPrice.mockResolvedValue('42.10');

    const price = await service.getAutoFillPrice('ITUB4', '2024-01-22');

    expect(price).toBe('42.10');
    expect(mockMarketApi.getHistoricalPrice).toHaveBeenCalledWith('ITUB4', '2024-01-22');
  });

  it('should return null when date is a non-trading day (weekend/holiday) and no quote exists', async () => {
    mockMarketApi.getHistoricalPrice.mockResolvedValue(null);

    const price = await service.getAutoFillPrice('PETR4', '2024-03-17'); // Sunday

    expect(price).toBeNull();
  });

  it('should return null when ticker is not found in market catalog or COTAHIST', async () => {
    mockMarketApi.getHistoricalPrice.mockResolvedValue(null);

    const price = await service.getAutoFillPrice('UNKNOWN3', '2024-06-01');

    expect(price).toBeNull();
  });

  it('should support FIIs and Stock tickers consistently', async () => {
    mockMarketApi.getHistoricalPrice
      .mockResolvedValueOnce('162.40') // HGLG11 (FII)
      .mockResolvedValueOnce('41.25');  // WEGE3 (Stock)

    const fiiPrice = await service.getAutoFillPrice('hglg11', '2024-04-12');
    const stockPrice = await service.getAutoFillPrice('wege3', '2024-04-12');

    expect(fiiPrice).toBe('162.40');
    expect(stockPrice).toBe('41.25');
    expect(mockMarketApi.getHistoricalPrice).toHaveBeenCalledWith('HGLG11', '2024-04-12');
    expect(mockMarketApi.getHistoricalPrice).toHaveBeenCalledWith('WEGE3', '2024-04-12');
  });
});

describe('S4-T02: TestAtomicTransactionInsertAndAssetRecalculation', () => {
  let mockMarketApi: jest.Mocked<IMarketApiService>;
  let mockTxRepo: jest.Mocked<TransactionRepository>;
  let mockAssetRepo: jest.Mocked<AssetRepository>;
  let service: TransactionService;

  const mockExistingAsset: Asset = {
    id: 'asset-uuid-1',
    portfolio_id: 'port-uuid-1',
    asset_class: 'STOCK',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    target_percentage_in_class: 50.0,
    quantity: '100',
    average_price: '30.00',
    manual_price_override: null,
    rf_indexer: null,
    rf_rate: null,
    rf_maturity_date: null,
    rf_is_tax_exempt: 0,
    source: 'MANUAL',
    external_id: null,
    institution_id: null,
    last_synced_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockMarketApi = {
      getHistoricalPrice: jest.fn(),
      fetchQuotes: jest.fn(),
      getCachedQuote: jest.fn(),
      saveHistoricalPrice: jest.fn(),
      searchCatalog: jest.fn(),
      fetchMacroRates: jest.fn(),
    };

    mockTxRepo = {
      createTransaction: jest.fn(),
      getTransactionsByPortfolio: jest.fn(),
      getTransactionsByAsset: jest.fn(),
    } as any;

    mockAssetRepo = {
      createAsset: jest.fn(),
      getAssetsByPortfolio: jest.fn(),
      getAssetsByClass: jest.fn(),
      getAssetById: jest.fn(),
      updateAsset: jest.fn(),
      updateAssetTargetInClass: jest.fn(),
      deleteAsset: jest.fn(),
    } as any;

    service = new TransactionService(mockTxRepo, mockAssetRepo, mockMarketApi);
  });

  it('should execute BUY transaction and update asset quantity and average price with brokerage fees', async () => {
    // Initial: Qty 100 @ PM 30.00 (Cost = 3000.00)
    // Buy: Qty 100 @ 40.00 + Fees 10.00 (Buy Cost = 4010.00)
    // New Total Cost = 7010.00, New Qty = 200, New PM = 35.05
    mockAssetRepo.getAssetById.mockResolvedValueOnce({ ...mockExistingAsset });
    mockTxRepo.createTransaction.mockImplementation(async (params) => ({
      id: 'tx-uuid-1',
      portfolio_id: params.portfolio_id,
      asset_id: params.asset_id,
      type: params.type,
      trade_date: params.trade_date,
      quantity: params.quantity,
      unit_price: params.unit_price,
      fees: params.fees ?? '0.00',
      total_amount: params.total_amount,
      notes: params.notes ?? null,
      source: params.source ?? 'MANUAL',
      external_id: params.external_id ?? null,
      created_at: '2024-03-15T12:00:00.000Z',
    }));

    mockAssetRepo.updateAsset.mockResolvedValueOnce({
      ...mockExistingAsset,
      quantity: '200',
      average_price: '35.05',
    });

    const input: CreateTransactionInput = {
      portfolioId: 'port-uuid-1',
      assetId: 'asset-uuid-1',
      type: 'BUY',
      tradeDate: '2024-03-15',
      quantity: 100,
      unitPrice: 40.0,
      fees: 10.0,
      notes: 'Aporte mensal',
    };

    const result = await service.executeTransaction(input);

    expect(result.transaction).toBeDefined();
    expect(result.transaction.type).toBe('BUY');
    expect(result.transaction.quantity).toBe('100');
    expect(result.transaction.unit_price).toBe('40.00');
    expect(result.transaction.fees).toBe('10.00');
    expect(result.transaction.total_amount).toBe('4010.00');

    expect(mockAssetRepo.updateAsset).toHaveBeenCalledWith(
      'asset-uuid-1',
      expect.objectContaining({
        quantity: '200',
        average_price: '35.05',
      })
    );
    expect(result.updatedAsset.quantity).toBe('200');
    expect(result.updatedAsset.average_price).toBe('35.05');
  });

  it('should execute SELL transaction maintaining average price intact and returning realized PnL', async () => {
    // Initial: Qty 200 @ PM 60.00
    // Sell: Qty 50 @ 70.00 - Fees 5.00
    // Net Sell Amount = (50 * 70) - 5 = 3495.00
    // Cost of Sold Shares = 50 * 60 = 3000.00
    // Realized PnL = 3495.00 - 3000.00 = +495.00
    // New Qty = 150, PM remains 60.00
    const assetWith200Shares: Asset = {
      ...mockExistingAsset,
      ticker: 'VALE3',
      quantity: '200',
      average_price: '60.00',
    };

    mockAssetRepo.getAssetById.mockResolvedValueOnce(assetWith200Shares);
    mockTxRepo.createTransaction.mockImplementation(async (params) => ({
      id: 'tx-uuid-2',
      portfolio_id: params.portfolio_id,
      asset_id: params.asset_id,
      type: params.type,
      trade_date: params.trade_date,
      quantity: params.quantity,
      unit_price: params.unit_price,
      fees: params.fees ?? '0.00',
      total_amount: params.total_amount,
      notes: params.notes ?? null,
      source: params.source ?? 'MANUAL',
      external_id: params.external_id ?? null,
      created_at: '2024-03-20T12:00:00.000Z',
    }));

    mockAssetRepo.updateAsset.mockResolvedValueOnce({
      ...assetWith200Shares,
      quantity: '150',
      average_price: '60.00',
    });

    const input: CreateTransactionInput = {
      portfolioId: 'port-uuid-1',
      assetId: 'asset-uuid-1',
      type: 'SELL',
      tradeDate: '2024-03-20',
      quantity: 50,
      unitPrice: 70.0,
      fees: 5.0,
      notes: 'Realização de lucro',
    };

    const result = await service.executeTransaction(input);

    expect(result.transaction.type).toBe('SELL');
    expect(result.realizedPnl).toBe('495.00');
    expect(mockAssetRepo.updateAsset).toHaveBeenCalledWith(
      'asset-uuid-1',
      expect.objectContaining({
        quantity: '150',
        average_price: '60.00',
      })
    );
    expect(result.updatedAsset.quantity).toBe('150');
    expect(result.updatedAsset.average_price).toBe('60.00');
  });

  it('should liquidate asset position when selling entire quantity and reset PM to 0.00', async () => {
    // Initial: Qty 100 @ PM 25.00
    // Sell: Qty 100 @ 30.00
    // Realized PnL = (100 * 30) - (100 * 25) = 500.00
    // New Qty = 0, New PM = 0.00
    const assetToLiquidate: Asset = {
      ...mockExistingAsset,
      quantity: '100',
      average_price: '25.00',
    };

    mockAssetRepo.getAssetById.mockResolvedValueOnce(assetToLiquidate);
    mockTxRepo.createTransaction.mockImplementation(async (params) => ({
      id: 'tx-uuid-3',
      portfolio_id: params.portfolio_id,
      asset_id: params.asset_id,
      type: params.type,
      trade_date: params.trade_date,
      quantity: params.quantity,
      unit_price: params.unit_price,
      fees: params.fees ?? '0.00',
      total_amount: params.total_amount,
      notes: null,
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-03-25T12:00:00.000Z',
    }));

    mockAssetRepo.updateAsset.mockResolvedValueOnce({
      ...assetToLiquidate,
      quantity: '0',
      average_price: '0.00',
    });

    const result = await service.executeTransaction({
      portfolioId: 'port-uuid-1',
      assetId: 'asset-uuid-1',
      type: 'SELL',
      tradeDate: '2024-03-25',
      quantity: 100,
      unitPrice: 30.0,
    });

    expect(result.realizedPnl).toBe('500.00');
    expect(mockAssetRepo.updateAsset).toHaveBeenCalledWith(
      'asset-uuid-1',
      expect.objectContaining({
        quantity: '0',
        average_price: '0.00',
      })
    );
    expect(result.updatedAsset.quantity).toBe('0');
    expect(result.updatedAsset.average_price).toBe('0.00');
  });

  it('should reject SELL transaction when quantity exceeds current asset balance (prevent short selling)', async () => {
    mockAssetRepo.getAssetById.mockResolvedValueOnce({
      ...mockExistingAsset,
      quantity: '50',
    });

    await expect(
      service.executeTransaction({
        portfolioId: 'port-uuid-1',
        assetId: 'asset-uuid-1',
        type: 'SELL',
        tradeDate: '2024-03-25',
        quantity: 60, // Exceeds balance of 50
        unitPrice: 35.0,
      })
    ).rejects.toThrow(/saldo insuficiente|insufficient/i);

    expect(mockTxRepo.createTransaction).not.toHaveBeenCalled();
    expect(mockAssetRepo.updateAsset).not.toHaveBeenCalled();
  });

  it('should reject transaction with zero or negative quantity or price', async () => {
    mockAssetRepo.getAssetById.mockResolvedValue({ ...mockExistingAsset });

    await expect(
      service.executeTransaction({
        portfolioId: 'port-uuid-1',
        assetId: 'asset-uuid-1',
        type: 'BUY',
        tradeDate: '2024-03-25',
        quantity: 0,
        unitPrice: 30.0,
      })
    ).rejects.toThrow(/quantidade inválida|invalid quantity/i);

    await expect(
      service.executeTransaction({
        portfolioId: 'port-uuid-1',
        assetId: 'asset-uuid-1',
        type: 'BUY',
        tradeDate: '2024-03-25',
        quantity: -10,
        unitPrice: 30.0,
      })
    ).rejects.toThrow(/quantidade inválida|invalid quantity/i);

    await expect(
      service.executeTransaction({
        portfolioId: 'port-uuid-1',
        assetId: 'asset-uuid-1',
        type: 'BUY',
        tradeDate: '2024-03-25',
        quantity: 10,
        unitPrice: -5.0,
      })
    ).rejects.toThrow(/preço inválido|invalid price/i);
  });

  it('should handle fractional crypto transactions with 8 decimal places precision', async () => {
    const cryptoAsset: Asset = {
      ...mockExistingAsset,
      asset_class: 'CRYPTO',
      ticker: 'BTC',
      name: 'Bitcoin',
      quantity: '0.05000000',
      average_price: '300000.00',
    };

    mockAssetRepo.getAssetById.mockResolvedValueOnce(cryptoAsset);
    mockTxRepo.createTransaction.mockImplementation(async (params) => ({
      id: 'tx-crypto-1',
      portfolio_id: params.portfolio_id,
      asset_id: params.asset_id,
      type: params.type,
      trade_date: params.trade_date,
      quantity: params.quantity,
      unit_price: params.unit_price,
      fees: params.fees ?? '0.00',
      total_amount: params.total_amount,
      notes: null,
      source: 'MANUAL',
      external_id: null,
      created_at: '2024-04-01T10:00:00.000Z',
    }));

    // Initial Cost: 0.05 * 300,000 = 15,000.00
    // Buy: 0.025 * 360,000 = 9,000.00
    // Total Cost = 24,000.00
    // Total Qty = 0.07500000
    // New PM = 24,000 / 0.075 = 320,000.00
    mockAssetRepo.updateAsset.mockResolvedValueOnce({
      ...cryptoAsset,
      quantity: '0.07500000',
      average_price: '320000.00',
    });

    const result = await service.executeTransaction({
      portfolioId: 'port-uuid-1',
      assetId: 'asset-uuid-1',
      type: 'BUY',
      tradeDate: '2024-04-01',
      quantity: '0.02500000',
      unitPrice: '360000.00',
      fees: 0,
    });

    expect(result.transaction.quantity).toBe('0.02500000');
    expect(result.transaction.total_amount).toBe('9000.00');
    expect(mockAssetRepo.updateAsset).toHaveBeenCalledWith(
      'asset-uuid-1',
      expect.objectContaining({
        quantity: '0.07500000',
        average_price: '320000.00',
      })
    );
  });

  it('should throw error and perform no changes if asset does not exist', async () => {
    mockAssetRepo.getAssetById.mockResolvedValueOnce(null);

    await expect(
      service.executeTransaction({
        portfolioId: 'port-uuid-1',
        assetId: 'non-existent-asset',
        type: 'BUY',
        tradeDate: '2024-03-25',
        quantity: 10,
        unitPrice: 50.0,
      })
    ).rejects.toThrow(/ativo não encontrado|asset not found/i);

    expect(mockTxRepo.createTransaction).not.toHaveBeenCalled();
    expect(mockAssetRepo.updateAsset).not.toHaveBeenCalled();
  });
});
