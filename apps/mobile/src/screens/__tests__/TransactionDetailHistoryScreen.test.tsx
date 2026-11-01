import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  TransactionDetailHistoryScreen,
  TransactionDetailData,
  TransactionHistoryItem,
} from '../TransactionDetailHistoryScreen';
import App from '../../../App';

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

// Mock dos serviços e repositórios para renderização isolada do App
jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

jest.mock('../../services/transactionService', () => ({
  transactionService: {
    getTransactionsByPortfolio: jest.fn().mockResolvedValue([
      {
        id: 'tx-1',
        portfolio_id: 'default-portfolio',
        asset_id: 'asset-petr',
        type: 'BUY',
        trade_date: '2026-10-31',
        quantity: '10',
        unit_price: '48.00',
        fees: '2.50',
        total_amount: '482.50',
      },
    ]),
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
    getAssetById: jest.fn().mockResolvedValue({
      id: 'asset-petr',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      asset_class: 'STOCK',
    }),
  },
}));

const MOCK_TRANSACTION: TransactionDetailData = {
  id: 'tx-101',
  ticker: 'PETR4',
  assetName: 'Petróleo Brasileiro S.A.',
  assetClass: 'STOCK',
  type: 'BUY',
  tradeDate: '2026-10-31',
  investedAmount: 'R$ 1.500,00',
  unitPrice: 'R$ 35,00',
  quantity: '42',
  fees: 'R$ 5,00',
  portfolioName: 'Carteira Principal',
};

const MOCK_HISTORY: TransactionHistoryItem[] = [
  {
    id: 'tx-101',
    tradeDate: '2026-10-31',
    type: 'BUY',
    quantity: '42',
    unitPrice: 'R$ 35,00',
    totalAmount: 'R$ 1.470,00',
    fees: 'R$ 5,00',
    notes: 'Aporte mensal',
  },
  {
    id: 'tx-090',
    tradeDate: '2026-09-15',
    type: 'BUY',
    quantity: '50',
    unitPrice: 'R$ 34,00',
    totalAmount: 'R$ 1.700,00',
    fees: 'R$ 5,00',
    notes: 'Rebalanceamento',
  },
  {
    id: 'tx-080',
    tradeDate: '2026-08-10',
    type: 'BUY',
    quantity: '30',
    unitPrice: 'R$ 33,00',
    totalAmount: 'R$ 990,00',
    fees: 'R$ 3,00',
  },
];

describe('S10-T03: TestTransactionHistoryNavigationAndDetails', () => {
  describe('1. Detalhes da Movimentação (Valor Investido, Cotação, Quantidade, Taxas, Data)', () => {
    it('deve exibir os detalhes completos da movimentação selecionada', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={MOCK_TRANSACTION}
          history={MOCK_HISTORY}
        />
      );

      // Ticker e nome
      expect(screen.getByText('PETR4')).toBeTruthy();

      // Métricas principais da movimentação
      expect(screen.getByTestId('tx-detail-invested-amount')).toBeTruthy();
      expect(screen.getByText(/1\.500,00/)).toBeTruthy(); // Valor Investido

      expect(screen.getByTestId('tx-detail-unit-price')).toBeTruthy();
      expect(screen.getByText(/35,00/)).toBeTruthy(); // Cotação / Preço Unitário

      expect(screen.getByTestId('tx-detail-quantity')).toBeTruthy();
      expect(screen.getByText('42')).toBeTruthy(); // Quantidade

      expect(screen.getByTestId('tx-detail-fees')).toBeTruthy();
      expect(screen.getByText(/5,00/)).toBeTruthy(); // Taxas

      expect(screen.getByTestId('tx-detail-trade-date')).toBeTruthy();
      expect(screen.getByText(/2026-10-31/)).toBeTruthy(); // Data
    });

    it('deve ocultar valores monetários em modo privacidade (██████,██)', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={MOCK_TRANSACTION}
          history={MOCK_HISTORY}
          isPrivacyMode={true}
        />
      );

      expect(screen.queryByText('R$ 1.500,00')).toBeNull();
      expect(screen.getAllByText(/██████,██/).length).toBeGreaterThan(0);
    });
  });

  describe('2. Linha do Tempo e Histórico Completo de Movimentações', () => {
    it('deve renderizar a lista/linha do tempo com todas as movimentações históricas do ativo', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={MOCK_TRANSACTION}
          history={MOCK_HISTORY}
        />
      );

      const historyList = screen.getByTestId('tx-history-list');
      expect(historyList).toBeTruthy();

      // Devem constar os registros históricos
      expect(screen.getByText(/2026-09-15/)).toBeTruthy();
      expect(screen.getByText(/1\.700,00/)).toBeTruthy();

      expect(screen.getByText(/2026-08-10/)).toBeTruthy();
      expect(screen.getByText(/990,00/)).toBeTruthy();
    });
  });

  describe('3. Ausência de Header Pesado (SPEC v2 / Zero Header)', () => {
    it('não deve renderizar nenhum header pesado na página de histórico da movimentação', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={MOCK_TRANSACTION}
          history={MOCK_HISTORY}
        />
      );

      expect(screen.queryByTestId('heavy-header')).toBeNull();
      expect(screen.queryByTestId('screen-heavy-title')).toBeNull();
    });
  });

  describe('4. Navegação: Abertura ao Clicar em Movimentação Recente na Home', () => {
    it('deve abrir a tela de detalhe/histórico ao clicar em um registro na lista de Movimentações Recentes', async () => {
      await render(<App />);

      // Localiza o card de movimentações recentes na Home
      const recentTxSection = screen.getByTestId('home-recent-transactions');
      expect(recentTxSection).toBeTruthy();

      // Clica no primeiro item de movimentação recente (PETR4)
      const firstTxRow = screen.getByTestId('recent-tx-row-PETR4');
      fireEvent.press(firstTxRow);

      // Deve abrir a tela de detalhe/histórico da movimentação
      expect(screen.getByTestId('transaction-detail-history-screen')).toBeTruthy();
    });
  });
});
