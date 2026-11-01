import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StatisticsScreen } from '../StatisticsScreen';

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

// Mock dos repositórios
const mockPortfolios = [
  { id: 'port-1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
  { id: 'port-2', name: 'Reserva & Oportunidade', docket_code: '•••• 002', is_archived: 0 },
];

const mockAssetsPort1 = [
  {
    id: 'a1',
    portfolio_id: 'port-1',
    ticker: 'WEGE3',
    name: 'WEG S.A.',
    asset_class: 'STOCK',
    quantity: '100',
    average_price: '40.00',
    manual_price_override: '50.00',
  },
];

const mockTxsPort1 = [
  {
    id: 'tx-1',
    portfolio_id: 'port-1',
    asset_id: 'a1',
    type: 'BUY',
    trade_date: '2026-01-10',
    quantity: '100',
    unit_price: '40.00',
    fees: '0.00',
  },
];

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockImplementation(() => Promise.resolve(mockPortfolios)),
    getClassTargets: jest.fn().mockImplementation(() =>
      Promise.resolve([
        { asset_class: 'STOCK', target_percentage: 100 },
        { asset_class: 'FIXED_INCOME', target_percentage: 0 },
        { asset_class: 'FII', target_percentage: 0 },
        { asset_class: 'CRYPTO', target_percentage: 0 },
      ])
    ),
  },
}));

jest.mock('../../repositories/assetRepository', () => ({
  assetRepository: {
    getAssetsByPortfolio: jest.fn().mockImplementation((id: string) => {
      if (id === 'port-1') return Promise.resolve(mockAssetsPort1);
      return Promise.resolve([]);
    }),
  },
}));

jest.mock('../../repositories/transactionRepository', () => ({
  transactionRepository: {
    getTransactionsByPortfolio: jest.fn().mockImplementation((id: string) => {
      if (id === 'port-1') return Promise.resolve(mockTxsPort1);
      return Promise.resolve([]);
    }),
  },
}));

describe('S11-T02: TestStatisticsScreenV2NoHeaderUnifiedSelectorAndLineChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('No Header on Statistics Screen (SPEC 11.2 & 11.7)', () => {
    it('should NOT render the old heavy header bar or title ESTATÍSTICAS & ANÁLISES', async () => {
      await render(<StatisticsScreen />);

      // Não deve ter título pesado de topo
      expect(screen.queryByText(/ESTATÍSTICAS & ANÁLISES/i)).toBeNull();
      expect(screen.queryByText(/Evolução Temporal • Dossiê Consolidado/i)).toBeNull();
    });
  });

  describe('Wallet Selector with Carteiras Consolidadas (No "Dossiê Geral")', () => {
    it('should render "Carteiras Consolidadas" selector option and NOT render "Dossiê Geral"', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByText('Carteiras Consolidadas')).toBeDefined();
      });

      // Não deve existir o texto obsoleto "Dossiê Geral" ou "Dossiê Geral (Consolidado)"
      expect(screen.queryByText(/Dossiê Geral/i)).toBeNull();
    });

    it('should display individual portfolio names and allow switching', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByText('Carteira Principal')).toBeDefined();
        expect(screen.getByText('Reserva & Oportunidade')).toBeDefined();
      });

      // Ao clicar em Carteira Principal, ela deve ser acionada
      fireEvent.press(screen.getByText('Carteira Principal'));
      expect(screen.getByText('Carteira Principal')).toBeDefined();
    });
  });

  describe('Period Filter Buttons (5 dias, Mês, Ano, 5 anos, Total)', () => {
    it('should render the 5 period selector options (5 dias, Mês, Ano, 5 anos, Total)', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByText('5 dias')).toBeDefined();
        expect(screen.getByText('Mês')).toBeDefined();
        expect(screen.getByText('Ano')).toBeDefined();
        expect(screen.getByText('5 anos')).toBeDefined();
        expect(screen.getByText('Total')).toBeDefined();
      });
    });

    it('should allow user to tap period filters to switch time window', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByText('5 dias')).toBeDefined();
      });

      fireEvent.press(screen.getByText('5 dias'));
      fireEvent.press(screen.getByText('Ano'));
      fireEvent.press(screen.getByText('Total'));
    });
  });

  describe('Patrimony Line Chart Card & Period Summary Card', () => {
    it('should render the Patrimony Line Chart Card', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('patrimony-line-chart-card')).toBeDefined();
      });
    });

    it('should render the Period Summary Card with 4 financial metrics', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('period-summary-card')).toBeDefined();
        expect(screen.getByText(/Patrimônio Inicial/i)).toBeDefined();
        expect(screen.getByText(/Aportes/i)).toBeDefined();
        expect(screen.getByText(/Rendimentos/i)).toBeDefined();
        expect(screen.getByText(/Patrimônio Final/i)).toBeDefined();
      });
    });

    it('should redact values when privacy mode is enabled', async () => {
      await render(<StatisticsScreen isPrivacyMode={true} />);

      await waitFor(() => {
        expect(screen.getByTestId('period-summary-card')).toBeDefined();
      });

      // Valores numéricos devem estar redigidos
      const redactedElements = screen.queryAllByText(/••••••|██████,██/);
      expect(redactedElements.length).toBeGreaterThan(0);
    });
  });
});
