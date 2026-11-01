import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';

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

// Mock do marketApi
jest.mock('../../services/marketApi', () => ({
  marketApiService: {
    searchCatalog: jest.fn().mockResolvedValue([]),
    getQuotes: jest.fn().mockResolvedValue({}),
  },
}));

describe('S11-T03: TestPortfolioManagementV2NoHeaderStackedDeckAndNoAITexts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('No Heavy Header on Portfolio Screen (SPEC 11.2 & 11.7)', () => {
    it('should NOT render the old heavy header bar or title CARTEIRAS & ALOCAÇÃO', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.queryByText(/CARTEIRAS & ALOCAÇÃO/i)).toBeNull();
    });
  });

  describe('Stacked Wallet Deck Reused for Portfolio Switching', () => {
    it('should render the StackedWalletDeck component for wallet switching', async () => {
      await render(<PortfolioManagementScreen />);

      // Deve reaproveitar o StackedWalletDeck da Home
      expect(screen.getByTestId('stacked-wallet-deck')).toBeDefined();
    });
  });

  describe('Strict Removal of AI Buzzwords & Robotic Labels (SPEC 11.7)', () => {
    it('should NOT render "SISTEMA DE PESOS EM 2 NÍVEIS"', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.queryByText(/SISTEMA DE PESOS EM 2 NÍVEIS/i)).toBeNull();
    });

    it('should NOT render "NÍVEL 1: METAS MACRO (Wc)"', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.queryByText(/NÍVEL 1: METAS MACRO/i)).toBeNull();
    });

    it('should NOT render "NÍVEL 2: METAS MICRO (wi,c)"', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.queryByText(/NÍVEL 2: METAS MICRO/i)).toBeNull();
    });

    it('should NOT render "META GLOBAL Ti"', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.queryByText(/META GLOBAL Ti/i)).toBeNull();
    });
  });

  describe('Clean Asset Class & Asset Target Configuration', () => {
    it('should render real asset classes cleanly (Renda Fixa, FIIs, Ações, Criptomoedas)', async () => {
      await render(<PortfolioManagementScreen />);

      expect(screen.getAllByText('Renda Fixa').length).toBeGreaterThan(0);
      expect(screen.getAllByText('FIIs').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ações').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Criptomoedas').length).toBeGreaterThan(0);
    });
  });
});
