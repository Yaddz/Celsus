import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../../../App';

// Mock do safe-area-context para renderização em ambiente Jest
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, style }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock dos serviços e repositórios para isolamento do teste de UI
jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

jest.mock('../../services/transactionService', () => ({
  transactionService: {
    getTransactionsByPortfolio: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockResolvedValue([]),
    getClassTargets: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/assetRepository', () => ({
  assetRepository: {
    getAssetsByPortfolio: jest.fn().mockResolvedValue([]),
    getAssetById: jest.fn().mockResolvedValue(null),
  },
}));

describe('S9-T04: TestHomeCleanLayoutNoSimCardAndGlobalFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Home Screen Cleanup (No Simulation Card and No Standalone Rebalance Card)', () => {
    it('should NOT render the standalone simulation card on the Home screen', async () => {
      await render(<App />);

      // O card de simulação integrado foi removido da Home
      expect(screen.queryByText(/SIMULADOR DE NOVO APORTE/i)).toBeNull();
      expect(screen.queryByText(/Calcular Proposta no Motor/i)).toBeNull();
    });

    it('should NOT render the standalone rebalance banner card on the Home screen', async () => {
      await render(<App />);

      // O card de insight de rebalanceamento avulso foi removido da Home
      expect(screen.queryByText(/Rebalanceie sua carteira com um novo aporte inteligente/i)).toBeNull();
    });
  });

  describe('Recent Transactions Positioned Higher on Home Screen', () => {
    it('should render Recent Transactions before Category Allocation in layout tree', async () => {
      await render(<App />);

      const recentTransactions = screen.getByTestId('home-recent-transactions');
      const dotMatrixCard = screen.getByTestId('home-dot-matrix-card');

      expect(recentTransactions).toBeDefined();
      expect(dotMatrixCard).toBeDefined();

      // Verifica ordenação: Recent Transactions deve estar posicionado antes do card de Alocação
      const parent = recentTransactions.parent;
      const txIndex = parent ? parent.children.indexOf(recentTransactions) : -1;
      const allocIndex = parent ? parent.children.indexOf(dotMatrixCard) : -1;

      expect(txIndex).toBeGreaterThan(-1);
      expect(allocIndex).toBeGreaterThan(-1);
      expect(txIndex).toBeLessThan(allocIndex);
    });
  });

  describe('FloatingBottomDock Visible Across All Tabs', () => {
    it('should display the FloatingBottomDock on the Home tab', async () => {
      await render(<App />);

      expect(screen.getByTestId('floating-bottom-dock')).toBeDefined();
    });

    it('should keep the FloatingBottomDock visible when navigating to Statistics tab', async () => {
      await render(<App />);

      const statsTab = screen.getByTestId('dock-tab-stats');
      fireEvent.press(statsTab);

      expect(screen.getByTestId('floating-bottom-dock')).toBeDefined();
    });

    it('should keep the FloatingBottomDock visible when navigating to Wallets tab', async () => {
      await render(<App />);

      const walletsTab = screen.getByTestId('dock-tab-wallets');
      fireEvent.press(walletsTab);

      expect(screen.getByTestId('floating-bottom-dock')).toBeDefined();
    });
  });
});
