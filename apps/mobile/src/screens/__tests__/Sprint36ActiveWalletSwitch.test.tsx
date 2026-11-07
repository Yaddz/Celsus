import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../../../App';
import {
  StackedWalletDeck,
  StackedWalletItem,
  PortfolioCardStack,
} from '../../components/ui/StackedWalletDeck';
import { StatisticsScreen } from '../StatisticsScreen';
import { walletStore } from '../../stores/walletStore';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { resetDatabase } from '../../db/client';

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

// Mock da API externa de mercado
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

describe('Sprint 36: Active Wallet Switching, Deck Gestures, Home Derivation & Statistics Consolidation', () => {
  const mockPortfolios: StackedWalletItem[] = [
    {
      id: 'port-1',
      name: 'Carteira Alfa',
      docketCode: 'REV-CART-001',
      accountCode: '•••• 001',
      balance: 'R$ 10.000,00',
      subtitle: 'Patrimônio Total',
      profitText: '+5,0% total',
      accentColor: '#D96628',
      paletteId: 'classic',
    },
    {
      id: 'port-2',
      name: 'Carteira Beta',
      docketCode: 'REV-CART-002',
      accountCode: '•••• 002',
      balance: 'R$ 20.000,00',
      subtitle: 'Patrimônio Total',
      profitText: '+8,0% total',
      accentColor: '#DB5A42',
      paletteId: 'harbor',
    },
    {
      id: 'port-3',
      name: 'Carteira Gama',
      docketCode: 'REV-CART-003',
      accountCode: '•••• 003',
      balance: 'R$ 30.000,00',
      subtitle: 'Patrimônio Total',
      profitText: '+12,0% total',
      accentColor: '#EF9F43',
      paletteId: 'docks',
    },
  ];

  beforeEach(async () => {
    resetDatabase();
    walletStore.reset();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S36-T04: Real PanResponder Gesture Cycle
  // =========================================================================
  describe('S36-T04: PanResponder Gesture Dispatch with GestureState Threshold', () => {
    it('should cycle to next wallet when pan responder release occurs with dy >= 50% card height', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      // Layout do card com altura 180px -> limiar de 50% = 90px
      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      // Dispara responderRelease com dy = 95px (>= 50% de 180px)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 95, dx: 0 },
      });

      expect(onPortfolioChange).toHaveBeenCalledTimes(1);
      expect(onPortfolioChange).toHaveBeenCalledWith(1, mockPortfolios[1]);
    });
  });

  // =========================================================================
  // S36-T05: Release Handler Idempotency (Single Execution)
  // =========================================================================
  describe('S36-T05: Single Release Invocation per Gesture', () => {
    it('should execute onPortfolioChange exactly once without redundant callbacks', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 100, dx: 0 },
      });

      expect(onPortfolioChange).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // S36-T06: Fresh State in Dynamic Rerenders (No Stale Closures)
  // =========================================================================
  describe('S36-T06: PanResponder Interacts with Updated Items after Dynamic Re-render', () => {
    it('should use the updated portfolios list rather than stale closed-over items', async () => {
      const onPortfolioChange = jest.fn();

      // Render inicial com apenas 1 carteira
      const { rerender } = await render(
        <StackedWalletDeck
          portfolios={[mockPortfolios[0]]}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      // Re-render assíncrono recebendo lista atualizada com 3 carteiras
      await rerender(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 100, dx: 0 },
      });

      // Deve ciclar com sucesso para Beta da lista atualizada
      expect(onPortfolioChange).toHaveBeenCalledWith(1, mockPortfolios[1]);
    });
  });

  // =========================================================================
  // S36-T07: Gesture Cycling Never Emits '__add_wallet_card__'
  // =========================================================================
  describe('S36-T07: Cyclic Gesture Loops Through Real Wallets Only', () => {
    it('should cycle only through real portfolios (no extra add card) and emit every change', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios.slice(0, 2)}
          activeIndex={1} // Na segunda carteira (Beta)
          onPortfolioChange={onPortfolioChange}
          onCreatePortfolioPress={jest.fn()}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');
      fireEvent(activeCard, 'layout', { nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } } });

      // Da carteira Beta (index 1), puxar para baixo volta direto para a primeira carteira (Alfa, index 0)
      fireEvent(activeCard, 'responderRelease', { gestureState: { dy: 100, dx: 0 } });

      expect(screen.queryByTestId('stacked-wallet-add-card')).toBeNull();
      expect(onPortfolioChange).toHaveBeenCalledTimes(1);
      expect(onPortfolioChange).toHaveBeenCalledWith(0, mockPortfolios[0]);
    });
  });

  // =========================================================================
  // S36-T08: Home Derives All Figures from Active Wallet (Q1 Decision)
  // =========================================================================
  describe('S36-T08: Home Dashboard Reflects Active Wallet (Patrimony, Allocation, Transactions)', () => {
    it('should update Home patrimony and transactions when switching active wallet via walletStore or pill', async () => {
      const portA = await portfolioRepository.createPortfolio({
        name: 'Carteira Alfa',
        docket_code: 'CART-001',
      });
      const portB = await portfolioRepository.createPortfolio({
        name: 'Carteira Beta',
        docket_code: 'CART-002',
      });

      // Ativo em A: STOCK PETR4 R$ 300,00
      await assetRepository.createAsset({
        portfolio_id: portA.id,
        name: 'Petrobras PN',
        ticker: 'PETR4',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '30.00',
      });

      // Ativo em B: FII HGLG11 R$ 1.200,00
      await assetRepository.createAsset({
        portfolio_id: portB.id,
        name: 'CSHG Logística',
        ticker: 'HGLG11',
        asset_class: 'FII',
        quantity: '12',
        average_price: '100.00',
      });

      await render(<App />);

      // Inicialmente na Carteira Alfa
      await waitFor(() => {
        expect(screen.getByText('CARTEIRA ALFA')).toBeTruthy();
      });

      // Troca para Carteira Beta via pill
      const pillBeta = screen.getByTestId(`home-wallet-pill-${portB.id}`);
      fireEvent.press(pillBeta);

      // Saldo da Home e card ativo agora devem refletir a Carteira Beta (R$ 1.200,00), NÃO o consolidado de R$ 1.500,00
      await waitFor(() => {
        expect(screen.getByText('CARTEIRA BETA')).toBeTruthy();
        expect(screen.getByText('R$ 1.200,00')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // S36-T09: StatisticsScreen Displays Consolidated Data Independently of Active Wallet
  // =========================================================================
  describe('S36-T09: Statistics Screen Displays Consolidated Dossier Independent of Active Wallet', () => {
    it('should display consolidated metrics across all portfolios in StatisticsScreen without altering on active wallet switch', async () => {
      const portA = await portfolioRepository.createPortfolio({
        name: 'Carteira Alfa',
        docket_code: 'CART-001',
      });
      const portB = await portfolioRepository.createPortfolio({
        name: 'Carteira Beta',
        docket_code: 'CART-002',
      });

      // Ativo em A: R$ 300,00
      await assetRepository.createAsset({
        portfolio_id: portA.id,
        name: 'Petrobras PN',
        ticker: 'PETR4',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '30.00',
      });

      // Ativo em B: R$ 1.200,00
      await assetRepository.createAsset({
        portfolio_id: portB.id,
        name: 'Vale ON',
        ticker: 'VALE3',
        asset_class: 'STOCK',
        quantity: '20',
        average_price: '60.00',
      });

      await render(<StatisticsScreen />);

      // Estatísticas deve conter "Carteiras Consolidadas"
      await waitFor(() => {
        expect(screen.getByText('Carteiras Consolidadas')).toBeTruthy();
      });

      // Troca walletStore.setActiveIndex para Carteira Alfa
      act(() => {
        walletStore.setActiveIndex(0, portA.id);
      });

      // Estatísticas permanece exibindo o consolidado
      expect(screen.getByText('Carteiras Consolidadas')).toBeTruthy();
    });
  });

  // =========================================================================
  // S36-T10: Accessibility Hit Slop on Home Indicator Pills
  // =========================================================================
  describe('S36-T10: Indicator Pills HitSlop Touch Area >= 44dp', () => {
    it('should configure hitSlop on indicator pills providing >= 44dp accessible touch target', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Única',
        docket_code: 'CART-001',
      });

      await render(<App />);

      await waitFor(() => {
        const pill = screen.getByTestId(`home-wallet-pill-${port.id}`);
        expect(pill).toBeTruthy();
        // hitSlop deve estar presente e garantir dimensões totais >= 44dp (largura 6 + 19 + 19 = 44)
        const hitSlop = pill.props.hitSlop;
        expect(hitSlop).toBeDefined();
        const vertical = (hitSlop.top || 0) + (hitSlop.bottom || 0) + 6;
        const horizontal = (hitSlop.left || 0) + (hitSlop.right || 0) + 6;
        expect(vertical).toBeGreaterThanOrEqual(44);
        expect(horizontal).toBeGreaterThanOrEqual(44);
      });
    });
  });
});
