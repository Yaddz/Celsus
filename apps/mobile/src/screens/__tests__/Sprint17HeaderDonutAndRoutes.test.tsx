import React from 'react';
import { Alert, ScrollView } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../../../App';
import {
  ClassDetailScreen,
  ClassAssetDetailItem,
} from '../ClassDetailScreen';
import { TransactionDetailHistoryScreen } from '../TransactionDetailHistoryScreen';
import { StatisticsScreen } from '../StatisticsScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { AllTransactionsScreen } from '../AllTransactionsScreen';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { FloatingBottomDock } from '../../components/ui/FloatingBottomDock';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, style }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock dos serviços e repositórios
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

const MOCK_ASSETS: ClassAssetDetailItem[] = [
  {
    id: 'asset-1',
    ticker: 'PETR4',
    name: 'Petróleo Brasileiro S.A.',
    assetClass: 'STOCK',
    currentAllocationPercentage: 50.0,
    grossBalance: 'R$ 5.400,00',
    quantity: '150',
    averagePrice: 'R$ 32,50',
    currentPrice: 'R$ 36,00',
    profitabilityPercentage: '+10,77%',
    profitabilityAmount: 'R$ +525,00',
    sliceColor: '#DB5A42',
  },
  {
    id: 'asset-2',
    ticker: 'VALE3',
    name: 'Vale S.A.',
    assetClass: 'STOCK',
    currentAllocationPercentage: 30.0,
    grossBalance: 'R$ 3.240,00',
    quantity: '45',
    averagePrice: 'R$ 68,00',
    currentPrice: 'R$ 72,00',
    profitabilityPercentage: '+5,88%',
    profitabilityAmount: 'R$ +180,00',
    sliceColor: '#F1CA78',
  },
];

describe('Sprint 17 — Módulos 3, 6 e 8 (Header Global, Donut Interativo, Speed-Dial e Rotas)', () => {
  let alertSpy: jest.SpyInstance;
  let scrollToSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    alertSpy.mockRestore();
    scrollToSpy.mockRestore();
  });

  describe('1. Módulo 3: Padronização do XpMinimalHeader e Remoção do Indicador • PETR4', () => {
    it('deve exibir XpMinimalHeader com botão voltar em TransactionDetailHistoryScreen e remover indicador • PETR4', async () => {
      const onClose = jest.fn();
      await render(
        <TransactionDetailHistoryScreen
          transaction={{
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
          }}
          onClose={onClose}
        />
      );

      // Header padronizado XpMinimalHeader presente
      expect(screen.getByTestId('xp-minimal-header')).toBeTruthy();

      // Indicador avulso antigo • PETR4 no topo NÃO deve mais existir
      expect(screen.queryByText('• PETR4')).toBeNull();

      // Botão voltar do XpMinimalHeader presente e funcional
      const backBtn = screen.getByTestId('header-back-button');
      expect(backBtn).toBeTruthy();
      fireEvent.press(backBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('deve renderizar XpMinimalHeader em ClassDetailScreen com suporte a onBack', async () => {
      const onClose = jest.fn();
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
          onClose={onClose}
        />
      );

      expect(screen.getByTestId('xp-minimal-header')).toBeTruthy();
      const backBtn = screen.getByTestId('header-back-button');
      expect(backBtn).toBeTruthy();
      fireEvent.press(backBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('deve renderizar XpMinimalHeader em StatisticsScreen e PortfolioManagementScreen', async () => {
      await render(<StatisticsScreen />);
      expect(screen.getByTestId('xp-minimal-header')).toBeTruthy();

      await render(<PortfolioManagementScreen />);
      expect(screen.getAllByTestId('xp-minimal-header').length).toBeGreaterThan(0);
    });

    it('XpMinimalHeader deve renderizar avatar quando onBack não for informado e botão voltar quando onBack for informado', async () => {
      const onBack = jest.fn();
      const onAvatar = jest.fn();

      const { unmount } = await render(
        <XpMinimalHeader userName="Pedro" userInitials="PL" onAvatarPress={onAvatar} />
      );
      expect(screen.getByTestId('header-avatar-button')).toBeTruthy();
      expect(screen.queryByTestId('header-back-button')).toBeNull();
      unmount();

      await render(
        <XpMinimalHeader title="Carteiras" onBack={onBack} />
      );
      expect(screen.getByTestId('header-back-button')).toBeTruthy();
      fireEvent.press(screen.getByTestId('header-back-button'));
      expect(onBack).toHaveBeenCalled();
    });
  });

  describe('2. Módulo 6: Donut Chart Circular e Interações em ClassDetailScreen', () => {
    it('deve renderizar o Donut Chart circular oco e não possuir onLongPress nas fatias', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      expect(screen.getByTestId('class-donut-chart')).toBeTruthy();

      const petrSlice = screen.getByTestId('donut-slice-PETR4');
      expect(petrSlice).toBeTruthy();
      expect(petrSlice.props.onLongPress).toBeUndefined();
    });

    it('deve abrir tooltip de resumo no onPress simples da fatia', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      expect(screen.queryByTestId('donut-tooltip')).toBeNull();

      // Clique simples na fatia PETR4
      fireEvent.press(screen.getByTestId('donut-slice-PETR4'));

      expect(screen.getByTestId('donut-tooltip')).toBeTruthy();
      // Os 2 ativos do mock somam 80: a fatia é normalizada para fechar 100% da categoria (50/80 = 62,5%)
      expect(screen.getByTestId('donut-tooltip-percent').props.children.join('')).toBe('62.5%');
    });

    it('não exibe legenda abaixo do donut (ticker e % só no rótulo da fatia)', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      expect(screen.queryByText(/• VALE3/)).toBeNull();
      fireEvent.press(screen.getByTestId('donut-slice-VALE3'));
      expect(screen.getByTestId('donut-tooltip-percent').props.children.join('')).toBe('37.5%');
    });

    it('deve disparar onAssetPress ao clicar no card do ativo na listagem', async () => {
      const onAssetPress = jest.fn();
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
          onAssetPress={onAssetPress}
        />
      );

      const assetCard = screen.getByTestId('asset-card-PETR4');
      fireEvent.press(assetCard);

      expect(onAssetPress).toHaveBeenCalled();
    });
  });

  describe('3. Módulo 8: Speed-Dial da Navbar, Avisos "Funcionalidade em desenvolvimento" e Rota de Extrato', () => {
    it('deve exibir speed-dial stack acima do botão + na FloatingBottomDock sem abrir Modal', async () => {
      await render(
        <FloatingBottomDock
          activeTab="home"
          onNovoAportePress={jest.fn()}
          onNovaCarteiraPress={jest.fn()}
          onAdicionarAtivoPress={jest.fn()}
        />
      );

      // Antes do clique o stack de ações não está visível
      expect(screen.queryByTestId('fab-speed-dial-stack')).toBeNull();

      // Clica no botão circular +
      const fabBtn = screen.getByTestId('floating-dock-action-button');
      fireEvent.press(fabBtn);

      // Deve renderizar os botões empilhados no stack
      expect(screen.getByTestId('fab-speed-dial-stack')).toBeTruthy();
      expect(screen.getByTestId('fab-action-nova-carteira')).toBeTruthy();
      expect(screen.getByTestId('fab-action-adicionar-ativo')).toBeTruthy();
      expect(screen.getByTestId('fab-action-novo-aporte')).toBeTruthy();
    });

    it('deve exibir aviso "Funcionalidade em desenvolvimento" ao clicar no Globo, Bento Mais e 3º ícone da Navbar', async () => {
      await render(<App />);

      // 1. Clicar no botão de Globo do Header
      const globeBtn = screen.getByTestId('header-globe-button');
      fireEvent.press(globeBtn);

      const hasGlobeNotice = alertSpy.mock.calls.some((args) =>
        args.some((a: any) => typeof a === 'string' && /desenvolvimento/i.test(a))
      ) || screen.queryByText(/desenvolvimento/i) !== null;
      expect(hasGlobeNotice).toBe(true);
      alertSpy.mockClear();

      // 2. O botão Bento "Mais" foi removido da Home
      expect(screen.queryByTestId('quick-action-mais')).toBeNull();

      // 3. Clicar no 3º ícone da Navbar (dock-tab-history)
      const historyTabBtn = screen.getByTestId('dock-tab-history');
      fireEvent.press(historyTabBtn);

      const hasHistoryNotice = alertSpy.mock.calls.some((args) =>
        args.some((a: any) => typeof a === 'string' && /desenvolvimento/i.test(a))
      ) || screen.queryByText(/desenvolvimento/i) !== null;
      expect(hasHistoryNotice).toBe(true);
    });

    it('deve redirecionar "Ver tudo >" de Movimentações Recentes para all-transactions-screen e não abrir tela de criar transação', async () => {
      await render(<App />);

      const viewAllBtn = screen.getByTestId('recent-tx-view-all-btn');
      fireEvent.press(viewAllBtn);

      // Deve renderizar a tela de Extrato Completo
      expect(screen.getByTestId('all-transactions-screen')).toBeTruthy();
      // Não deve renderizar a tela/modal de registrar nova movimentação
      expect(screen.queryByTestId('transaction-screen')).toBeNull();
    });
  });
});
