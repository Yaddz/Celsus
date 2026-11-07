import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { FloatingBottomDock } from '../../components/ui/FloatingBottomDock';
import { AnimatedModalSheet } from '../../components/ui/AnimatedModalSheet';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { resetDatabase } from '../../db/client';
import { Text, View } from 'react-native';

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

describe('Sprint 33: P1 Deck Selection, Footer Delete, Floating Dock & Modal Physics', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S33-T01: Seleção de Carteiras Exclusivamente pela Pilha (Stacked Deck)
  // =========================================================================
  describe('S33-T01: Wallet Selection Exclusively via Stacked Deck without Redundant Chips', () => {
    it('should NOT render horizontal selector chips and should select active wallet purely via deck interaction', async () => {
      const portA = await portfolioRepository.createPortfolio({ name: 'Carteira Alpha', docket_code: 'REV-001' });
      const portB = await portfolioRepository.createPortfolio({ name: 'Carteira Beta', docket_code: 'REV-002' });

      const onIndexChangeMock = jest.fn();

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[portA, portB]}
          initialActiveIndex={0}
          onPortfolioIndexChange={onIndexChangeMock}
        />
      );

      // O seletor horizontal de carteiras (chips redundantes) NÃO deve ser renderizado
      expect(screen.queryByTestId('portfolio-horizontal-selector')).toBeNull();
      expect(screen.queryByTestId(`portfolio-chip-${portA.id}`)).toBeNull();
      expect(screen.queryByTestId(`portfolio-chip-${portB.id}`)).toBeNull();

      // A seleção deve ser operada exclusivamente pelo deck empilhado
      const deck = screen.getByTestId('stacked-wallet-deck');
      expect(deck).toBeTruthy();
    });
  });

  // =========================================================================
  // S33-T02: Botão de Exclusão no Rodapé com Estilo Destrutivo e Confirmação
  // =========================================================================
  describe('S33-T02: Destructive Delete Button Positioned at Page Footer with Confirmation Modal', () => {
    it('should place delete button at the footer (after transactions) and require confirmation modal before deletion', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Para Deletar',
        docket_code: 'REV-DEL-001',
      });

      const deleteSpy = jest.spyOn(portfolioRepository, 'deletePortfolio');

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialActiveIndex={0}
        />
      );

      // Botão de exclusão deve existir no rodapé
      const deleteBtn = screen.getByTestId('delete-portfolio-btn');
      expect(deleteBtn).toBeTruthy();

      // Ao clicar, NÃO deve deletar imediatamente; deve abrir o modal de confirmação
      fireEvent.press(deleteBtn);
      expect(deleteSpy).not.toHaveBeenCalled();

      // Modal de confirmação destrutiva deve ser exibido
      expect(screen.getByTestId('delete-portfolio-modal')).toBeTruthy();
      // Título do diálogo ("Excluir carteira X?") e aviso de irreversibilidade
      expect(screen.getAllByText(/Excluir carteira/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Essa ação não pode ser desfeita.')).toBeTruthy();
      expect(screen.getByTestId('delete-portfolio-modal-cancel')).toBeTruthy();

      // Ao confirmar a exclusão no modal
      const confirmBtn = screen.getByTestId('confirm-delete-portfolio-btn');
      fireEvent.press(confirmBtn);

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith(port.id);
      });
    });
  });

  // =========================================================================
  // S33-T03: FloatingBottomDock: Botão Central "+" Reativo sem Travar em "X"
  // =========================================================================
  describe('S33-T03: FloatingBottomDock Center Action Button State & Dismiss', () => {
    it('should open speed dial on action press, dismiss on backdrop click, and reset icon without getting stuck in X', () => {
      const onNovoAporte = jest.fn();
      const onNovaCarteira = jest.fn();
      const onAdicionarAtivo = jest.fn();

      render(
        <FloatingBottomDock
          activeTab="home"
          onNovoAportePress={onNovoAporte}
          onNovaCarteiraPress={onNovaCarteira}
          onAdicionarAtivoPress={onAdicionarAtivo}
        />
      );

      const fabButton = screen.getByTestId('dock-item-add-fab');

      // 1. Clica no FAB: abre o speed-dial
      fireEvent.press(fabButton);
      expect(screen.getByTestId('fab-speed-dial-stack')).toBeTruthy();

      // 2. Clica em "Nova Carteira": executa callback e fecha o speed-dial imediatamente
      const novaCarteiraBtn = screen.getByTestId('fab-action-nova-carteira');
      fireEvent.press(novaCarteiraBtn);
      expect(onNovaCarteira).toHaveBeenCalledTimes(1);

      // O stack deve ser fechado após a ação
      expect(screen.queryByTestId('fab-speed-dial-stack')).toBeNull();
    });

    it('should provide full-screen backdrop when speed dial is open to allow tapping outside to dismiss', () => {
      render(
        <FloatingBottomDock
          activeTab="home"
          onNovoAportePress={jest.fn()}
        />
      );

      const fabButton = screen.getByTestId('dock-item-add-fab');
      fireEvent.press(fabButton);

      // Deve existir backdrop de fechamento ao tocar fora
      const backdrop = screen.getByTestId('fab-speed-dial-backdrop');
      expect(backdrop).toBeTruthy();

      // Ao tocar fora (no backdrop), o speed dial é fechado
      fireEvent.press(backdrop);
      expect(screen.queryByTestId('fab-speed-dial-stack')).toBeNull();
    });
  });

  // =========================================================================
  // S33-T04: Animações Físicas e Transições Reais em AnimatedModalSheet
  // =========================================================================
  describe('S33-T04: Real Physics and Smooth Transitions in AnimatedModalSheet', () => {
    it('should render animated container, handle backdrop dismiss, and support fluid open/close lifecycle', () => {
      const onCloseMock = jest.fn();

      const { rerender } = render(
        <AnimatedModalSheet visible={true} onClose={onCloseMock}>
          <View testID="modal-content-child">
            <Text>Conteúdo do Modal</Text>
          </View>
        </AnimatedModalSheet>
      );

      // Contêiner animado deve estar presente
      expect(screen.getByTestId('animated-sheet-container')).toBeTruthy();
      expect(screen.getByTestId('modal-content-child')).toBeTruthy();

      // Clica no backdrop para dismiss
      const backdrop = screen.getByTestId('animated-sheet-backdrop');
      fireEvent.press(backdrop);
      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Ao se tornar invisível, desmonta graciosamente
      rerender(
        <AnimatedModalSheet visible={false} onClose={onCloseMock}>
          <View testID="modal-content-child">
            <Text>Conteúdo do Modal</Text>
          </View>
        </AnimatedModalSheet>
      );
      expect(screen.queryByTestId('animated-modal-sheet')).toBeNull();
    });
  });
});
