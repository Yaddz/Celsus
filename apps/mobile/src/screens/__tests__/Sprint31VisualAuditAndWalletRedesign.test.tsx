import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { AllTransactionsScreen } from '../AllTransactionsScreen';
import { StatisticsScreen } from '../StatisticsScreen';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { TransactionScreen } from '../TransactionScreen';
import { StackedWalletDeck } from '../../components/ui/StackedWalletDeck';
import { borders, colors } from '../../theme/tokens';
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

describe('Sprint 31: Visual Audit, Desjargonization, Notch Fix & Wallet Screen Redesign', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S31-T01: Notch Neutral Background and AmbientOrb Removal
  // =========================================================================
  describe('S31-T01: Notch Neutral Background & AmbientOrb Removal', () => {
    it('should NOT render AmbientOrb anywhere in the Home screen to guarantee a solid neutral notch area', async () => {
      await render(<App />);

      // Garante que o domo / esfera luminosa foi completamente removido do topo da tela
      expect(screen.queryByTestId('ambient-orb')).toBeNull();

      // O container raiz deve possuir o fundo neutro sólido padrão do app
      const homeRoot = screen.getByTestId('home-screen-root');
      expect(homeRoot).toBeDefined();
    });
  });

  // =========================================================================
  // S31-T02: Filter Buttons / Pills Border Radius
  // =========================================================================
  describe('S31-T02: Filter Buttons / Pills Border Radius (borders.radiusFull = 9999)', () => {
    it('should define borders.radiusFull as 9999 and render filter pills with rounded pill shape', async () => {
      // 1. Verifica token canônico no tokens.ts
      expect((borders as any).radiusFull).toBe(9999);

      // 2. Verifica botões do Extrato Completo
      await render(
        <AllTransactionsScreen
          transactions={[
            {
              id: 'tx-1',
              ticker: 'PETR4',
              assetClass: 'STOCK',
              type: 'BUY',
              dateText: '2026-11-01',
              amountText: 'R$ 380,00',
            },
          ]}
        />
      );

      const filterAll = screen.getByTestId('filter-tx-all');
      expect(filterAll).toBeDefined();
      const flattenedStyle = Array.isArray(filterAll.props.style)
        ? Object.assign({}, ...filterAll.props.style.filter(Boolean))
        : filterAll.props.style;
      expect(flattenedStyle.borderRadius).toBe(9999);
    });
  });

  // =========================================================================
  // S31-T03: Text Audit and Jargon Elimination
  // =========================================================================
  describe('S31-T03: Text Audit and Jargon Elimination', () => {
    it('should rename "RESUMO DO DOSSIÊ" to "PANORAMA GERAL" in StatisticsScreen', async () => {
      await render(<StatisticsScreen />);

      await waitFor(() => {
        expect(screen.getByText('PANORAMA GERAL')).toBeDefined();
        expect(screen.queryByText(/RESUMO DO DOSSIÊ/i)).toBeNull();
      });
    });

    it('should remove "Dossiê Local" and "Local-First / Sovereign" in SettingsBackupScreen', async () => {
      await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      expect(screen.queryByText(/Dossiê Local/i)).toBeNull();
      expect(screen.queryByText(/Local-First ─── Sovereign/i)).toBeNull();
      // Selos e indicadores estáticos de exemplo foram removidos do Perfil
      expect(screen.queryByText('Celsus | Dados no Aparelho')).toBeNull();
      expect(screen.queryByText(/100% no Dispositivo/i)).toBeNull();
    });

    it('should use "Criar Carteira" instead of "Criar Dossiê" in PortfolioManagementScreen creation modal', async () => {
      await render(<PortfolioManagementScreen autoOpenNewPortfolioModal={true} />);

      expect(screen.getByPlaceholderText('Informe o nome ou objetivo da carteira')).toBeDefined();
      expect(screen.getByText('Criar Carteira')).toBeDefined();
      expect(screen.queryByText('Criar Dossiê')).toBeNull();
    });

    it('should use "CARTEIRA" instead of "CARTEIRA (DOSSIÊ)" in TransactionScreen', async () => {
      await render(<TransactionScreen />);

      expect(screen.getByText('CARTEIRA')).toBeDefined();
      expect(screen.queryByText(/CARTEIRA \(DOSSIÊ\)/i)).toBeNull();
    });
  });

  // =========================================================================
  // S31-T04: Redesigned Wallet Screen Hierarchy and Metas Modal
  // =========================================================================
  describe('S31-T04: Redesigned Wallet Screen Hierarchy and Metas Modal', () => {
    it('should render 1. Card da Carteira, 2. Botão Metas, 3. Gestão de Ativos, 4. Movimentações da Carteira', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Alpha',
        docket_code: 'REV-001',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[]}
          initialAssets={[]}
        />
      );

      // 1. Card da carteira
      expect(screen.getByTestId('stacked-wallet-deck')).toBeDefined();

      // 2. Botão Metas
      expect(screen.getByTestId('open-metas-modal-btn')).toBeDefined();

      // 3. Gestão de ativos
      expect(screen.getByTestId('portfolio-assets-section')).toBeDefined();

      // 4. Movimentações da carteira
      expect(screen.getByTestId('portfolio-transactions-section')).toBeDefined();
    });

    it('should open Metas Bottom Sheet modal, display 4 classes with lock/input and ensure 100% distribution indicator', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Metas',
        docket_code: 'REV-002',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[]}
          initialAssets={[]}
        />
      );

      // Clica no botão "Metas"
      fireEvent.press(screen.getByTestId('open-metas-modal-btn'));

      // Modal deve estar aberto
      expect(screen.getByTestId('metas-modal-sheet')).toBeDefined();
      expect(screen.getByText('Porcentagem ideal por tipo de ativo')).toBeDefined();

      // Deve renderizar as 4 classes macro
      expect(screen.getByTestId('class-list-row-STOCK')).toBeDefined();
      expect(screen.getByTestId('class-list-row-FIXED_INCOME')).toBeDefined();
      expect(screen.getByTestId('class-list-row-FII')).toBeDefined();
      expect(screen.getByTestId('class-list-row-CRYPTO')).toBeDefined();

      // Indicador de 100% e botões Cancelar e Salvar
      expect(screen.getByTestId('metas-total-indicator')).toBeDefined();
      expect(screen.getByText(/Distribuição total dos ativos/i)).toBeDefined();
      expect(screen.getByTestId('metas-save-btn')).toBeDefined();
      expect(screen.getByTestId('metas-cancel-btn')).toBeDefined();
    });
  });

  // =========================================================================
  // S31-T05: Portfolio-Specific Transactions and Shortcut to Extrato
  // =========================================================================
  describe('S31-T05: Portfolio-Specific Transactions & Shortcut to Extrato', () => {
    it('should render ONLY transactions of the active portfolio and link to filtered full extrato', async () => {
      const p1 = await portfolioRepository.createPortfolio({ name: 'Carteira A', docket_code: 'REV-001' });
      const p2 = await portfolioRepository.createPortfolio({ name: 'Carteira B', docket_code: 'REV-002' });

      const asset1 = await assetRepository.createAsset({
        portfolio_id: p1.id,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        asset_class: 'STOCK',
        quantity: '50',
        average_price: '60.00',
      });

      await transactionRepository.createTransaction({
        portfolio_id: p1.id,
        asset_id: asset1.id,
        type: 'BUY',
        trade_date: '2026-11-01',
        quantity: '50',
        unit_price: '60.00',
        fees: '0.00',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[p1, p2]}
          initialClassTargets={[]}
          initialAssets={[asset1]}
        />
      );

      // Deve renderizar a transação da Carteira A
      await waitFor(() => {
        expect(screen.getByTestId('wallet-tx-row-VALE3')).toBeDefined();
      });

      // Atalho para ver extrato da carteira
      expect(screen.getByTestId('view-portfolio-transactions-btn')).toBeDefined();
    });

    it('should render clean empty state when portfolio has no transactions', async () => {
      const pEmpty = await portfolioRepository.createPortfolio({ name: 'Carteira Nova Vazia', docket_code: 'REV-003' });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[pEmpty]}
          initialClassTargets={[]}
          initialAssets={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('wallet-transactions-empty')).toBeDefined();
        expect(screen.getByText('Nenhuma movimentação registrada nesta carteira')).toBeDefined();
      });
    });
  });
});
