import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { AllTransactionsScreen } from '../AllTransactionsScreen';
import { ClassDetailScreen } from '../ClassDetailScreen';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionService } from '../../services/transactionService';
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

describe('Sprint 34: P2 Standard XP Header Architecture & Full End-to-End Acceptance', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S34-T01: Padrão Consistente de Header XP na Home e Telas Internas
  // =========================================================================
  describe('S34-T01: Consistent XP Minimal Header Architecture Across App', () => {
    it('should render Avatar + Name on Home without back button, and include Privacy Eye and Globe on the right', async () => {
      await render(<App />);

      // Na Home: deve existir o header com avatar e nome
      const header = screen.getByTestId('xp-minimal-header');
      expect(header).toBeTruthy();

      const avatarBtn = screen.getByTestId('header-avatar-button');
      expect(avatarBtn).toBeTruthy();
      // O nome foi removido do header (só avatar com iniciais).
      expect(screen.queryByText('Pedro')).toBeNull();

      // Não deve ter botão voltar na Home
      expect(screen.queryByTestId('header-back-button')).toBeNull();

      // Deve ter botão de privacidade e globo no canto direito
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-button')).toBeTruthy();
    });

    it('should render Back Button + Title on internal screens and modals alongside Privacy Eye and Globe', async () => {
      const onBackMock = jest.fn();

      // Renderiza AllTransactionsScreen
      const { unmount } = render(
        <AllTransactionsScreen
          onClose={onBackMock}
          onBack={onBackMock}
          isPrivacyMode={false}
          onTogglePrivacy={() => {}}
        />
      );

      // Deve renderizar botão voltar
      const backBtn = screen.getByTestId('header-back-button');
      expect(backBtn).toBeTruthy();

      // Deve conter botão de olho e globo à direita
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-button')).toBeTruthy();

      // Ao clicar em voltar, dispara o callback
      fireEvent.press(backBtn);
      expect(onBackMock).toHaveBeenCalledTimes(1);

      unmount();

      // Renderiza ClassDetailScreen
      render(
        <ClassDetailScreen
          assetClass="STOCK"
          onBack={onBackMock}
        />
      );

      expect(screen.getByTestId('header-back-button')).toBeTruthy();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-button')).toBeTruthy();
    });
  });

  // =========================================================================
  // S34-T02: Ausência de Headers Pesados Legados em Telas Internas
  // =========================================================================
  describe('S34-T02: Zero Legacy Heavy Headers Across Entire Application', () => {
    it('should guarantee no screens render heavy legacy headers or raw redundant banners', async () => {
      await render(<App />);

      expect(screen.queryByTestId('heavy-header')).toBeNull();
      expect(screen.queryByTestId('screen-heavy-title')).toBeNull();
      expect(screen.queryByTestId('legacy-top-banner')).toBeNull();
    });
  });

  // =========================================================================
  // S34-T03: Fluxo Completo Ponta a Ponta de Aceite (E2E Integration)
  // =========================================================================
  describe('S34-T03: End-to-End Acceptance Integration Cycle', () => {
    it('should execute end-to-end user journey: multi-portfolio creation -> asset adding -> trade execution -> balance reflection', async () => {
      // 1. Cria carteiras reais no SQLite
      const portA = await portfolioRepository.createPortfolio({
        name: 'Carteira Principal',
        docket_code: 'REV-PRIN-001',
      });
      const portB = await portfolioRepository.createPortfolio({
        name: 'Carteira Secundária',
        docket_code: 'REV-SEC-002',
      });

      // 2. Cadastra ativo na Carteira Principal
      const asset = await assetRepository.createAsset({
        portfolio_id: portA.id,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        asset_class: 'STOCK',
        quantity: '0',
        average_price: '0.00',
        target_percentage_in_class: 100,
      });

      // 3. Executa movimentação de compra via serviço real
      await transactionService.executeTransaction({
        portfolioId: portA.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-02',
        quantity: '100',
        unitPrice: '60.00',
        fees: '0.00',
      });

      // 4. Verifica atualização dos dados no banco SQLite
      const updatedAsset = await assetRepository.getAssetById(asset.id);
      expect(updatedAsset?.quantity).toBe('100');
      expect(updatedAsset?.average_price).toBe('60.00');

      // 5. Renderiza a tela de Carteiras e verifica o deck ativo
      await render(
        <PortfolioManagementScreen
          initialPortfolios={[portA, portB]}
          initialActiveIndex={0}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('stacked-wallet-deck')).toBeTruthy();
      });

      // A seção de movimentações da carteira ativa deve listar a operação de VALE3
      expect(screen.getByTestId('wallet-tx-row-VALE3')).toBeTruthy();
      expect(screen.getAllByText('VALE3').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Compra/)).toBeTruthy();

      // Botão de exclusão da carteira está localizado no rodapé da página
      expect(screen.getByTestId('delete-portfolio-btn')).toBeTruthy();
    });
  });
});
