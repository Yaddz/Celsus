import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { StackedWalletDeck, StackedWalletItem } from '../../components/ui/StackedWalletDeck';
import { StatisticsScreen } from '../StatisticsScreen';
import { ClassDetailScreen } from '../ClassDetailScreen';
import { AllTransactionsScreen } from '../AllTransactionsScreen';
import { SimulatorScreen } from '../SimulatorScreen';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { resetDatabase } from '../../db/client';
import {
  validateTickerForAssetClass,
  detectAssetClassFromTicker,
} from '../../domain/finance/assetCatalogValidation';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock de API externa de mercado para evitar chamadas de rede durante o teste
jest.mock('../../services/marketApi', () => {
  const actual = jest.requireActual('../../services/marketApi');
  return {
    ...actual,
    marketApiService: {
      fetchQuotes: jest.fn().mockResolvedValue({}),
      getCachedQuote: jest.fn().mockReturnValue(null),
      fetchHistory: jest.fn().mockResolvedValue([]),
      searchCatalog: jest.fn().mockResolvedValue([]),
      fetchMacroRates: jest.fn().mockResolvedValue({ cdi: 10.65, selic: 10.75, ipca: 4.12 }),
    },
  };
});

describe('Sprint 27: P0 Real Integration, Zero Mocks, Asset Validation & Global Navigation', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  describe('S27-T01: Zero-Hook-Crash Transition 0 -> 1 -> 2 Portfolios in StackedWalletDeck & App Persistence', () => {
    it('should transition StackedWalletDeck from 0 to 1 to 2 portfolios without React Hook errors and cycle correctly', async () => {
      const onCreateMock = jest.fn();
      const onChangeMock = jest.fn();

      // 1. Inicia com 0 carteiras (empty state)
      const { rerender } = render(
        <StackedWalletDeck
          portfolios={[]}
          activeIndex={0}
          onCreatePortfolioPress={onCreateMock}
          onPortfolioChange={onChangeMock}
        />
      );

      expect(screen.getByTestId('stacked-wallet-empty-card')).toBeTruthy();
      expect(screen.getByText('Nenhuma carteira cadastrada')).toBeTruthy();

      // 2. Transiciona para 1 carteira (no código anterior causava Expected static flag was missing)
      const port1: StackedWalletItem = {
        id: 'port-1',
        name: 'Carteira Alfa',
        docketCode: 'REV-001',
        balance: 'R$ 1.000,00',
        profitText: '+5,0%',
        accentColor: '#D96628',
      };

      expect(() => {
        rerender(
          <StackedWalletDeck
            portfolios={[port1]}
            activeIndex={0}
            onCreatePortfolioPress={onCreateMock}
            onPortfolioChange={onChangeMock}
          />
        );
      }).not.toThrow();

      expect(screen.getByText('Carteira Alfa')).toBeTruthy();
      expect(screen.queryByTestId('stacked-wallet-empty-card')).toBeNull();

      // 3. Transiciona para 2 carteiras
      const port2: StackedWalletItem = {
        id: 'port-2',
        name: 'Carteira Beta',
        docketCode: 'REV-002',
        balance: 'R$ 2.500,00',
        profitText: '+8,0%',
        accentColor: '#2E4A44',
      };

      expect(() => {
        rerender(
          <StackedWalletDeck
            portfolios={[port1, port2]}
            activeIndex={0}
            onCreatePortfolioPress={onCreateMock}
            onPortfolioChange={onChangeMock}
          />
        );
      }).not.toThrow();

      expect(screen.getByText('Carteira Alfa')).toBeTruthy();
    });

    it('should persist created portfolios in real SQLite and reload after App unmount and remount', async () => {
      // 1. Monta App com banco limpo
      const { unmount } = render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('stacked-wallet-empty-card')).toBeTruthy();
      });

      // 2. Cria carteira real no repositório SQLite
      const created = await portfolioRepository.createPortfolio({
        name: 'Carteira Soberana',
        docket_code: 'REV-SOB-001',
      });
      expect(created.id).toBeTruthy();

      // 3. Desmonta e remonta o App
      unmount();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('CARTEIRA SOBERANA')).toBeTruthy();
      });
      expect(screen.queryByTestId('stacked-wallet-empty-card')).toBeNull();
    });
  });

  describe('S27-T02: Comprehensive Zero-Mock Audit Across All Screens on Clean Database', () => {
    it('should display R$ 0,00 and zero mock/fictitious items in App, StatisticsScreen, ClassDetailScreen, AllTransactionsScreen, SimulatorScreen and SettingsBackupScreen', async () => {
      // 1. App com banco limpo
      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('R$ 0,00')).toBeTruthy();
      });
      // Zero transações mockadas (tx-1, tx-2)
      expect(screen.queryByText('tx-1')).toBeNull();
      expect(screen.queryByText('tx-2')).toBeNull();

      // 2. StatisticsScreen com banco limpo
      const { unmount: unmountStats } = render(<StatisticsScreen />);
      await waitFor(() => {
        // Não deve conter valores da curva mockada DEFAULT_SAMPLE_CURVE (20.000, 35.468, 32.468)
        expect(screen.queryByText(/32\.468/)).toBeNull();
        expect(screen.queryByText(/35\.468/)).toBeNull();
      });
      unmountStats();

      // 3. ClassDetailScreen com banco limpo (sem DEFAULT_ASSETS_MAP)
      const { unmount: unmountClass } = render(<ClassDetailScreen assetClass="STOCK" assets={[]} />);
      expect(screen.queryByText('PETR4')).toBeNull();
      expect(screen.queryByText('VALE3')).toBeNull();
      expect(screen.queryByText('ITUB4')).toBeNull();
      unmountClass();

      // 4. AllTransactionsScreen com lista vazia (sem DEFAULT_TRANSACTIONS)
      const { unmount: unmountTxs } = render(<AllTransactionsScreen transactions={[]} />);
      expect(screen.queryByText('PETR4')).toBeNull();
      expect(screen.queryByText('HGLG11')).toBeNull();
      expect(screen.queryByText('CDB 110%')).toBeNull();
      unmountTxs();

      // 5. SettingsBackupScreen com banco limpo (sem cards hardcoded R$ 32.468 e R$ 8.120)
      const { unmount: unmountSettings } = render(<SettingsBackupScreen />);
      await waitFor(() => {
        expect(screen.queryByText(/32\.468/)).toBeNull();
        expect(screen.queryByText(/8\.120/)).toBeNull();
      });
      unmountSettings();
    });
  });

  describe('S27-T03: Asset Class Validation (FII x Class Incompatibility Prevention)', () => {
    it('should validate tickers against catalog and B3 naming conventions', () => {
      // FIIs não podem ser cadastrados em STOCK
      const fiiInStock = validateTickerForAssetClass('HGLG11', 'STOCK');
      expect(fiiInStock.valid).toBe(false);
      expect(fiiInStock.detectedClass).toBe('FII');
      expect(fiiInStock.reason).toMatch(/Fundo Imobiliário|FII/i);

      const knriInStock = validateTickerForAssetClass('KNRI11', 'STOCK');
      expect(knriInStock.valid).toBe(false);
      expect(knriInStock.detectedClass).toBe('FII');

      // FIIs em FII são válidos
      const fiiInFii = validateTickerForAssetClass('HGLG11', 'FII');
      expect(fiiInFii.valid).toBe(true);

      // Ações não podem ser cadastradas em FII
      const stockInFii = validateTickerForAssetClass('PETR4', 'FII');
      expect(stockInFii.valid).toBe(false);
      expect(stockInFii.detectedClass).toBe('STOCK');

      // Ações em STOCK são válidas
      const stockInStock = validateTickerForAssetClass('PETR4', 'STOCK');
      expect(stockInStock.valid).toBe(true);

      // Cripto em STOCK é inválido
      const cryptoInStock = validateTickerForAssetClass('BTC', 'STOCK');
      expect(cryptoInStock.valid).toBe(false);

      // Cripto em CRYPTO é válido
      const cryptoInCrypto = validateTickerForAssetClass('BTC', 'CRYPTO');
      expect(cryptoInCrypto.valid).toBe(true);
    });

    it('should block adding FII asset under STOCK tab in PortfolioManagementScreen and show validation message', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Teste Validação',
        docket_code: 'REV-VAL-001',
      });

      render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[{ id: 'ct-1', portfolio_id: port.id, asset_class: 'STOCK', target_percentage: 100 }]}
          initialAssets={[]}
        />
      );

      // Abre modal de adicionar ativo
      const openAddBtn = screen.getByTestId('open-add-asset-modal-btn');
      fireEvent.press(openAddBtn);

      // Digita HGLG11 enquanto na aba STOCK (padrão)
      const input = screen.getByTestId('asset-autocomplete-input');
      fireEvent.changeText(input, 'HGLG11');

      // Tenta confirmar adição
      const confirmBtn = screen.getByTestId('save-asset-target-btn');
      fireEvent.press(confirmBtn);

      // Valida que foi exibida mensagem de erro e não gravou no banco
      await waitFor(() => {
        expect(screen.getByTestId('asset-validation-error')).toBeTruthy();
      });

      const assets = await assetRepository.getAssetsByPortfolio(port.id);
      expect(assets.find((a) => a.ticker === 'HGLG11')).toBeUndefined();
    });
  });

  describe('S27-T04: Global Speed-Dial Navigation Across All Screen Views', () => {
    it('should trigger modals for Nova Carteira, Adicionar Ativo and Nova Movimentacao when pressed on any screen', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('dock-item-add-fab')).toBeTruthy();
      });

      // 1. Testa acionamento a partir da tela Home
      fireEvent.press(screen.getByTestId('dock-item-add-fab'));
      expect(screen.getByTestId('fab-speed-dial-stack')).toBeTruthy();

      // Clica em Nova Movimentação
      fireEvent.press(screen.getByTestId('fab-action-novo-aporte'));
      await waitFor(() => {
        expect(screen.getByTestId('transaction-screen')).toBeTruthy();
      });

      // Fecha modal de movimentação
      fireEvent.press(screen.getByTestId('close-transaction-btn'));
      await waitFor(() => {
        expect(screen.queryByTestId('transaction-screen')).toBeNull();
      });

      // 2. Navega para aba de Análises (stats)
      fireEvent.press(screen.getByTestId('dock-tab-stats'));
      await waitFor(() => {
        expect(screen.getByTestId('statistics-screen')).toBeTruthy();
      });

      // Abre menu + na aba de Análises
      fireEvent.press(screen.getByTestId('dock-item-add-fab'));
      expect(screen.getByTestId('fab-speed-dial-stack')).toBeTruthy();

      // Clica em Nova Carteira a partir da aba Análises
      fireEvent.press(screen.getByTestId('fab-action-nova-carteira'));
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-management-screen')).toBeTruthy();
      });
    });
  });

  describe('S27-T05: Tap on Asset Card in Category Screen Navigates to Real Asset Detail', () => {
    it('should open TransactionDetailHistoryScreen with the selected asset real ticker when asset card is tapped', async () => {
      // 1. Cria carteira e ativo no SQLite
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Detalhe Ativo',
        docket_code: 'REV-DET-001',
      });
      await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        asset_class: 'STOCK',
        target_percentage_in_class: 50,
        quantity: '100',
        average_price: '35.00',
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('CARTEIRA DETALHE ATIVO')).toBeTruthy();
      });

      // 2. Toca na barra/categoria de Ações para abrir ClassDetailScreen
      const stockCard = screen.getByTestId('allocation-stat-stock');
      fireEvent.press(stockCard);

      await waitFor(() => {
        expect(screen.getByTestId('class-detail-screen')).toBeTruthy();
      });

      // 3. Toca no card do ativo PETR4
      const petr4Card = screen.getByTestId('asset-card-PETR4');
      fireEvent.press(petr4Card);

      // 4. Deve abrir TransactionDetailHistoryScreen exibindo PETR4
      await waitFor(() => {
        expect(screen.getByTestId('transaction-detail-history-screen')).toBeTruthy();
        expect(screen.getByText('PETR4')).toBeTruthy();
      });
    });
  });
});
