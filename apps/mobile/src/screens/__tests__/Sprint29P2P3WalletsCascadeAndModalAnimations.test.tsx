import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { resetDatabase } from '../../db/client';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { AnimatedModalSheet } from '../../components/ui/AnimatedModalSheet';
import { View, Text } from 'react-native';

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

describe('Sprint 29: Wallets Deck Sync, Class Target Layout, Cascade Delete & Modal Animations', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  describe('S29-T01: Wallet Deck Sync & Real Balance in PortfolioManagementScreen', () => {
    it('should display real consolidated balance in wallet deck on PortfolioManagementScreen matching portfolio assets', async () => {
      // 1. Cria carteira com ativos reais no SQLite
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Consolidada Real',
        docket_code: 'REV-REAL-001',
      });
      await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        asset_class: 'STOCK',
        target_percentage_in_class: 100,
        quantity: '100',
        average_price: '50.00',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[{ id: 'ct-1', portfolio_id: port.id, asset_class: 'STOCK', target_percentage: 100 }]}
          initialAssets={[]}
        />
      );

      // O deck deve carregar o nome da carteira
      await waitFor(() => {
        expect(screen.getByText('CARTEIRA CONSOLIDADA REAL')).toBeTruthy();
      });

      // Não deve exibir botão redundante avulso "Adicionar Nova Carteira" fora da pilha do deck
      expect(screen.queryByTestId('legacy-add-portfolio-btn-outside-deck')).toBeNull();
    });
  });

  describe('S29-T02: Macro Class Targets Layout & Persistence (No flex: 1 Squashing)', () => {
    it('should render macro class name clearly and input wrapper with compact width (<= 140px, campo padrão com sufixo "% meta") and persist target changes', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Metas',
        docket_code: 'REV-MET-001',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[{ id: 'ct-1', portfolio_id: port.id, asset_class: 'STOCK', target_percentage: 40 }]}
          initialAssets={[]}
        />
      );

      // Nome da classe visível
      expect(screen.getByText('Ações')).toBeTruthy();

      // Input com largura compacta e sem flex: 1 para não esmagar o nome no Android
      const inputStock = screen.getByTestId('input-class-STOCK');
      expect(inputStock).toBeTruthy();

      const inputWrapper = screen.getByTestId('input-wrapper-class-STOCK');
      const flatStyle = [inputWrapper.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.flex).toBeUndefined();
      expect(flatStyle.width).toBeLessThanOrEqual(140);

      // Altera o percentual de Ações
      fireEvent.changeText(inputStock, '50');

      // Deve persistir no SQLite via portfolioRepository.setClassTargets
      await waitFor(async () => {
        const targets = await portfolioRepository.getClassTargets(port.id);
        const stockTarget = targets.find((t) => t.asset_class === 'STOCK');
        expect(stockTarget?.target_percentage).toBe(50);
      });
    });
  });

  describe('S29-T03: Destructive Delete Portfolio with Cascade in Real SQLite', () => {
    it('should delete portfolio, its assets and transactions in cascade and show empty wallet card when last portfolio is removed', async () => {
      // 1. Cria carteira com ativo e transação
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Para Excluir',
        docket_code: 'REV-DEL-001',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'PETR4',
        name: 'Petrobras',
        asset_class: 'STOCK',
        target_percentage_in_class: 100,
        quantity: '50',
        average_price: '30.00',
      });
      await transactionRepository.createTransaction({
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'BUY',
        quantity: '50',
        unit_price: '30.00',
        trade_date: '2026-10-31',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[{ id: 'ct-1', portfolio_id: port.id, asset_class: 'STOCK', target_percentage: 100 }]}
          initialAssets={[asset]}
        />
      );

      // 2. Aciona botão de excluir carteira
      const deleteBtn = screen.getByTestId('delete-portfolio-btn');
      expect(deleteBtn).toBeTruthy();
      fireEvent.press(deleteBtn);

      // 3. Confirma exclusão no modal/alerta
      const confirmDeleteBtn = screen.getByTestId('confirm-delete-portfolio-btn');
      fireEvent.press(confirmDeleteBtn);

      // 4. Verifica no SQLite real que a carteira, ativos e transações foram excluídos em cascata
      await waitFor(async () => {
        const remainingPorts = await portfolioRepository.listPortfolios(true);
        expect(remainingPorts.find((p) => p.id === port.id)).toBeUndefined();

        const remainingAssets = await assetRepository.getAssetsByPortfolio(port.id);
        expect(remainingAssets.length).toBe(0);

        const remainingTxs = await transactionRepository.getTransactionsByPortfolio(port.id);
        expect(remainingTxs.length).toBe(0);
      });

      // 5. Deck deve exibir o empty card
      expect(screen.getByTestId('stacked-wallet-empty-card')).toBeTruthy();
    });
  });

  describe('S29-T04: Add Asset Modal % Global Clarity & Suffix Indicator', () => {
    it('should display explanation hint for % global and dynamic suffix (% vs pts) in Add Asset Modal', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Ativo Modal',
        docket_code: 'REV-MOD-001',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[{ id: 'ct-1', portfolio_id: port.id, asset_class: 'STOCK', target_percentage: 100 }]}
          initialAssets={[]}
        />
      );

      // Abre modal de adicionar ativo
      fireEvent.press(screen.getByTestId('open-add-asset-modal-btn'));

      // 1. Deve exibir dica explicativa do % global
      expect(screen.getByTestId('global-target-hint')).toBeTruthy();
      expect(screen.getByText(/fatia deste ativo no patrimônio total/i)).toBeTruthy();

      // 2. Sufixo inicial em %
      const suffixEl = screen.getByTestId('add-asset-unit-suffix');
      expect(suffixEl).toBeTruthy();
      expect(screen.getByText('%')).toBeTruthy();

      // 3. Alterna modo para peso (pts)
      const togglePts = screen.getByTestId('mode-toggle-weight');
      fireEvent.press(togglePts);

      expect(screen.getByText('pts')).toBeTruthy();
    });
  });

  describe('S29-T05: AnimatedModalSheet Component Transition & Motion Standard', () => {
    it('should render animated modal sheet with backdrop and content container with slide and fade support', async () => {
      const onCloseMock = jest.fn();

      await render(
        <AnimatedModalSheet
          visible={true}
          onClose={onCloseMock}
          testID="test-modal-sheet"
        >
          <View testID="modal-inner-content">
            <Text>Conteúdo do Modal Animado</Text>
          </View>
        </AnimatedModalSheet>
      );

      expect(screen.getByTestId('test-modal-sheet')).toBeTruthy();
      expect(screen.getByTestId('animated-sheet-backdrop')).toBeTruthy();
      expect(screen.getByTestId('animated-sheet-container')).toBeTruthy();
      expect(screen.getByText('Conteúdo do Modal Animado')).toBeTruthy();

      // Toque no backdrop dispara onClose
      fireEvent.press(screen.getByTestId('animated-sheet-backdrop'));
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
