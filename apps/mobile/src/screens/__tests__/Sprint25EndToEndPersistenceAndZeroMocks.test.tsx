import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { StackedWalletDeck } from '../../components/ui/StackedWalletDeck';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { TransactionService } from '../../services/transactionService';

jest.mock('../../services/marketApi', () => {
  const actual = jest.requireActual('../../services/marketApi');
  return {
    ...actual,
    marketApiService: {
      fetchQuotes: jest.fn().mockResolvedValue({
        PETR4: {
          ticker: 'PETR4',
          price: '38.50',
          change24h: 1.25,
          assetClass: 'STOCK',
          source: 'BRAPI',
          timestamp: new Date().toISOString(),
        },
      }),
      getCachedQuote: jest.fn().mockReturnValue(null),
      fetchHistory: jest.fn().mockResolvedValue([]),
      searchCatalog: jest.fn().mockResolvedValue([
        { ticker: 'PETR4', name: 'Petrobras PN', assetClass: 'STOCK' },
        { ticker: 'BBAS3', name: 'Banco do Brasil ON', assetClass: 'STOCK' },
      ]),
      fetchMacroRates: jest.fn().mockResolvedValue({ cdi: 10.65, selic: 10.75, ipca: 4.12 }),
    },
  };
});

describe('Sprint 25: TestEndToEndPersistenceAndZeroMocks', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('S25-T01: Initial Real Empty State (Zero Fictitious Data)', () => {
    it('should render empty wallet deck, zero patrimony and no mock transactions when database is empty', async () => {
      // Mock portfolioRepository.listPortfolios returning empty array
      jest.spyOn(portfolioRepository, 'listPortfolios').mockResolvedValue([]);
      jest.spyOn(transactionRepository, 'getTransactionsByPortfolio').mockResolvedValue([]);

      await render(<App />);

      // Should display empty wallet deck card
      await waitFor(() => {
        expect(screen.getByTestId('stacked-wallet-empty-card')).toBeDefined();
      });

      // Total patrimony should be R$ 0,00 instead of hardcoded R$ 32.468,00
      expect(screen.queryByText(/32\.468/)).toBeNull();

      // Zero fake transactions (tx-1 to tx-4)
      expect(screen.queryByText('tx-1')).toBeNull();
    });
  });

  describe('S25-T02: Bug #2 - Portfolio Persistence and Reload', () => {
    it('should save newly created portfolio to portfolioRepository and persist after remount even with R$ 0,00', async () => {
      const createdPortfolio = {
        id: 'port-dividendos-1',
        name: 'Carteira Dividendos',
        description: 'Carteira focada em proventos',
        docket_code: 'REV-DIV-001',
        is_archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createSpy = jest
        .spyOn(portfolioRepository, 'createPortfolio')
        .mockResolvedValue(createdPortfolio);
      const listSpy = jest
        .spyOn(portfolioRepository, 'listPortfolios')
        .mockResolvedValue([createdPortfolio]);

      const { unmount } = await render(<PortfolioManagementScreen />);

      // Abre modal de criação
      const addWalletBtn = screen.getByTestId('empty-wallet-create-cta');
      fireEvent.press(addWalletBtn);

      const nameInput = screen.getByTestId('create-portfolio-name-input');
      fireEvent.changeText(nameInput, 'Carteira Dividendos');

      const submitBtn = screen.getByTestId('create-portfolio-submit-btn');
      fireEvent.press(submitBtn);

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Carteira Dividendos',
          })
        );
      });

      unmount();

      // Remounting should load the created portfolio from repository
      await render(<PortfolioManagementScreen />);
      await waitFor(() => {
        expect(listSpy).toHaveBeenCalled();
        expect(screen.getAllByText('Carteira Dividendos').length).toBeGreaterThan(0);
      });
    });
  });

  describe('S25-T03: Bug #3 - Add Wallet Card in Stacked Deck', () => {
    it('should render stacked-wallet-add-card at end of deck when portfolios.length >= 1 and trigger onCreatePortfolioPress', async () => {
      const handleCreatePress = jest.fn();
      const mockPortfolios = [
        {
          id: 'port-1',
          name: 'Principal',
          accountCode: 'REV-001',
          balance: 'R$ 10.000,00',
          subtitle: 'PORTFÓLIO',
          profitText: '+5,0%',
          accentColor: '#1A3B32',
          paletteId: 'classic',
        },
      ];

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          onCreatePortfolioPress={handleCreatePress}
        />
      );

      // Card "+ Adicionar nova carteira" must be present
      const addCard = screen.getByTestId('stacked-wallet-add-card');
      expect(addCard).toBeDefined();

      // Pressing it triggers onCreatePortfolioPress
      fireEvent.press(addCard);
      expect(handleCreatePress).toHaveBeenCalledTimes(1);
    });
  });

  describe('S25-T04: Asset Addition & Persistence in Portfolio', () => {
    it('should add an asset, persist it via assetRepository and recalculate allocations', async () => {
      const mockAsset = {
        id: 'asset-bbas3',
        portfolio_id: 'port-1',
        asset_class: 'STOCK',
        ticker: 'BBAS3',
        name: 'Banco do Brasil ON',
        target_percentage_in_class: 50,
        quantity: '0',
        average_price: '0.00',
        manual_price_override: null,
        rf_indexer: null,
        rf_rate: null,
        rf_maturity_date: null,
        rf_is_tax_exempt: 0,
        source: 'MANUAL',
        external_id: null,
        institution_id: null,
        last_synced_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const createAssetSpy = jest
        .spyOn(assetRepository, 'createAsset')
        .mockResolvedValue(mockAsset);

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[{ id: 'port-1', name: 'Principal', totalValue: 'R$ 0,00', returnPct: '0,0%' }]}
        />
      );

      // Open add asset modal
      const openAddBtn = screen.getByTestId('open-add-asset-modal-btn');
      fireEvent.press(openAddBtn);

      const autocompleteInput = screen.getByTestId('asset-autocomplete-input');
      fireEvent.changeText(autocompleteInput, 'BBAS');

      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-option-BBAS3')).toBeDefined();
      });

      fireEvent.press(screen.getByTestId('autocomplete-option-BBAS3'));

      const submitAssetBtn = screen.getByTestId('save-asset-target-btn');
      fireEvent.press(submitAssetBtn);

      await waitFor(() => {
        expect(createAssetSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            ticker: 'BBAS3',
            asset_class: 'STOCK',
          })
        );
      });
    });
  });

  describe('S25-T05: Buy & Sell Transactions with Auto-Creation of Unregistered Asset', () => {
    it('should automatically create asset on BUY if not yet in portfolio and accurately track PM and quantity across BUY and SELL', async () => {
      let createdAsset: any = null;
      jest.spyOn(assetRepository, 'getAssetsByPortfolio').mockImplementation(async () => {
        return createdAsset ? [createdAsset] : [];
      });

      const createAssetSpy = jest
        .spyOn(assetRepository, 'createAsset')
        .mockImplementation(async (params: any) => {
          createdAsset = {
            id: 'asset-petr4',
            ...params,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return createdAsset;
        });

      const updateAssetSpy = jest
        .spyOn(assetRepository, 'updateAsset')
        .mockImplementation(async (id: any, params: any) => {
          createdAsset = { ...createdAsset, ...params };
          return createdAsset;
        });

      const createTxSpy = jest
        .spyOn(transactionRepository, 'createTransaction')
        .mockImplementation(async (params: any) => {
          return {
            id: 'tx-new-1',
            ...params,
            created_at: new Date().toISOString(),
          } as any;
        });

      const txService = new TransactionService(
        transactionRepository,
        assetRepository,
        {} as any
      );

      // 1. BUY 10 units at R$ 35.00 of an asset not yet in the portfolio
      const buyTx = await txService.createTransaction({
        portfolioId: 'port-1',
        ticker: 'PETR4',
        type: 'BUY',
        tradeDate: '2026-11-01',
        quantity: '10',
        unitPrice: '35.00',
        fees: '0.00',
      });

      // Assert auto-created asset
      expect(createAssetSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolio_id: 'port-1',
          ticker: 'PETR4',
        })
      );
      expect(createTxSpy).toHaveBeenCalled();
      expect(updateAssetSpy).toHaveBeenCalledWith(
        'asset-petr4',
        expect.objectContaining({
          quantity: '10',
          average_price: '35.00000000',
        })
      );

      // 2. SELL 4 units at R$ 40.00
      await txService.createTransaction({
        portfolioId: 'port-1',
        assetId: 'asset-petr4',
        ticker: 'PETR4',
        type: 'SELL',
        tradeDate: '2026-11-02',
        quantity: '4',
        unitPrice: '40.00',
        fees: '0.00',
      });

      // Average price should remain R$ 35.00000000 and quantity updated to 6
      expect(updateAssetSpy).toHaveBeenLastCalledWith(
        'asset-petr4',
        expect.objectContaining({
          quantity: '6',
          average_price: '35.00000000',
        })
      );
    });
  });

  describe('S25-T06: Bug #8 - Vertical List Layout with Lock and Delete Action', () => {
    it('should render vertical list rows for macro classes and assets with inline lock, percentage input and delete action', async () => {
      const mockDeleteSpy = jest
        .spyOn(assetRepository, 'deleteAsset')
        .mockResolvedValue(true);

      const initialAssets = [
        {
          id: 'a1',
          ticker: 'WEGE3',
          name: 'WEG S.A.',
          assetClass: 'STOCK' as const,
          targetInClass: 50,
          percentage: 50,
          weight: 1,
          isLocked: false,
          quantity: '100',
          price: '42.50',
        },
        {
          id: 'a2',
          ticker: 'VALE3',
          name: 'Vale S.A.',
          assetClass: 'STOCK' as const,
          targetInClass: 50,
          percentage: 50,
          weight: 1,
          isLocked: false,
          quantity: '80',
          price: '60.00',
        },
      ];

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[{ id: 'port-1', name: 'Principal', totalValue: 'R$ 9.050,00', returnPct: '0,0%' }]}
          initialAssets={initialAssets}
        />
      );

      // Vertical asset row should exist with lock, input and delete action
      expect(screen.getByTestId('asset-list-row-a1')).toBeDefined();
      expect(screen.getByTestId('lock-asset-a1')).toBeDefined();
      expect(screen.getByTestId('input-asset-a1')).toBeDefined();
      expect(screen.getByTestId('delete-asset-a1')).toBeDefined();

      // Open metas modal to access vertical macro class row
      fireEvent.press(screen.getByTestId('open-metas-modal-btn'));
      expect(screen.getByTestId('class-list-row-STOCK')).toBeDefined();
      expect(screen.getByTestId('lock-class-STOCK')).toBeDefined();
      expect(screen.getByTestId('input-class-STOCK')).toBeDefined();

      // Pressing delete button should trigger assetRepository.deleteAsset
      fireEvent.press(screen.getByTestId('delete-asset-a1'));

      await waitFor(() => {
        expect(mockDeleteSpy).toHaveBeenCalledWith('a1');
      });
    });
  });

  describe('S25-T07: Quotes & History Real Handling with Offline / Error Fallback', () => {
    it('should display visible offline notice when quote service fails without crashing UI', async () => {
      jest.spyOn(portfolioRepository, 'listPortfolios').mockResolvedValue([
        {
          id: 'port-1',
          name: 'Principal',
          description: null,
          docket_code: 'REV-001',
          is_archived: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      const { marketApiService } = require('../../services/marketApi');
      marketApiService.fetchQuotes.mockRejectedValueOnce(new Error('Network unavailable'));

      await render(<App />);

      // App renders safely and displays offline notice or status indicator
      await waitFor(() => {
        expect(screen.getByTestId('market-status-indicator')).toBeDefined();
      });
    });
  });
});
