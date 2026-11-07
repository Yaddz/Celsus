import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { StackedWalletDeck, StackedWalletItem, PortfolioCardStack } from '../StackedWalletDeck';
import { walletStore } from '../../../stores/walletStore';

describe('Sprint 35: Portfolio Card Stack Gestures, 50% Threshold, Full Content Depth & Cyclic Loop', () => {
  const mockPortfolios: StackedWalletItem[] = [
    {
      id: 'port-1',
      name: 'Carteira Alfa',
      docketCode: 'REV-CART-001',
      accountCode: '•••• 001',
      balance: 'R$ 10.000,00',
      subtitle: 'Patrimônio Total',
      profitText: '+5,0% no ano',
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
      profitText: '+8,0% no ano',
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
      profitText: '+12,0% no ano',
      accentColor: '#EF9F43',
      paletteId: 'docks',
    },
  ];

  beforeEach(() => {
    walletStore.reset();
    jest.clearAllMocks();
  });

  describe('S35-T01: Visible Depth Layers Render Real Full Content (Not Empty Bars)', () => {
    it('should render the other wallets as stacked cards behind the active one with full data, 8px apart', async () => {
      await render(
        <PortfolioCardStack
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      // Card ativo na frente (Alfa) com conteúdo real
      expect(screen.getByTestId('stacked-wallet-card-active')).toBeTruthy();
      expect(screen.getByText('Carteira Alfa')).toBeTruthy();
      expect(screen.getByText('R$ 10.000,00')).toBeTruthy();

      // As demais carteiras são cards de trás com os dados completos (só uma faixa de 8px fica visível)
      const layerOne = screen.getByTestId('wallet-depth-layer-1');
      const layerTwo = screen.getByTestId('wallet-depth-layer-2');
      const top = (el: any) => [el.props.style].flat(Infinity).reduce((a: any, s: any) => ({ ...a, ...s }), {}).top;
      const active = screen.getByTestId('stacked-wallet-card-active');
      expect(top(active) - top(layerTwo)).toBe(8);
      expect(top(layerTwo) - top(layerOne)).toBe(8);
      expect(screen.getByText('Carteira Beta')).toBeTruthy();
      expect(screen.getByText('R$ 20.000,00')).toBeTruthy();
      expect(screen.getByText('Carteira Gama')).toBeTruthy();
      expect(screen.getByText('R$ 30.000,00')).toBeTruthy();
    });
  });

  describe('S35-T02: "Nova Carteira" card only exists in the empty state', () => {
    it('should not add a "Nova Carteira" card to the stack when there are 1+ wallets', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios.slice(0, 2)}
          activeIndex={1}
          onCreatePortfolioPress={jest.fn()}
          testID="stacked-wallet-deck"
        />
      );

      expect(screen.getByText('Carteira Beta')).toBeTruthy();
      expect(screen.queryByText('Nova Carteira')).toBeNull();
      expect(screen.queryByTestId('stacked-wallet-add-card')).toBeNull();
      // 2 carteiras => 1 card atrás
      expect(screen.getByTestId('wallet-depth-layer-1')).toBeTruthy();
      expect(screen.queryByTestId('wallet-depth-layer-2')).toBeNull();
    });
  });

  describe('S35-T03: Full Cyclic Loop Around the Deck', () => {
    it('should loop back to index 0 when pulling down from the last item of the deck', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={2} // Última carteira (Gama)
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      // Layout do card com altura 180px
      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      // Puxar verticalmente além do limiar de 50% (95px > 90px)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 95, dx: 0 },
      });

      // Cicla de volta para o primeiro item (Alfa, index 0)
      expect(onPortfolioChange).toHaveBeenCalledWith(0, mockPortfolios[0]);
    });
  });

  describe('S35-T04: 50% Height Threshold - Reverts with Spring on Drag < 50%', () => {
    it('should NOT trigger portfolio change when dragging less than 50% of card height', async () => {
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

      // Altura do card: 180px -> limiar de 50% = 90px
      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      // Arraste de 80px (44,4% da altura, ou seja, < 50%)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 80, dx: 0 },
      });

      // Não deve confirmar a troca
      expect(onPortfolioChange).not.toHaveBeenCalled();
      // Permanece no card Alfa
      expect(screen.getByText('Carteira Alfa')).toBeTruthy();
    });
  });

  describe('S35-T05: 50% Height Threshold - Confirms Swap on Drag >= 50%', () => {
    it('should confirm portfolio change when dragging >= 50% of card height downwards', async () => {
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

      // Altura do card: 180px -> limiar de 50% = 90px
      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      // Arraste de 92px (51,1% da altura, ou seja, >= 50%)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 92, dx: 0 },
      });

      // Confirma troca para Carteira Beta (index 1)
      expect(onPortfolioChange).toHaveBeenCalledWith(1, mockPortfolios[1]);
    });

    it('should confirm portfolio change to previous when dragging <= -50% upwards', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={1}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      fireEvent(activeCard, 'layout', {
        nativeEvent: { layout: { width: 340, height: 180, x: 0, y: 0 } },
      });

      // Arraste para cima de -95px (módulo >= 50%)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: -95, dx: 0 },
      });

      // Volta para Carteira Alfa (index 0)
      expect(onPortfolioChange).toHaveBeenCalledWith(0, mockPortfolios[0]);
    });
  });

  describe('S35-T06: Edge Cases - Empty Deck and Single Portfolio Deck', () => {
    it('should render empty state when 0 portfolios are provided', async () => {
      const onCreate = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={[]}
          onCreatePortfolioPress={onCreate}
          testID="stacked-wallet-deck"
        />
      );

      expect(screen.getByTestId('stacked-wallet-empty-card')).toBeTruthy();
      expect(screen.getByText('Nenhuma carteira cadastrada')).toBeTruthy();

      const createBtn = screen.getByTestId('empty-wallet-create-cta');
      fireEvent.press(createBtn);
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('should render only 1 card and ignore swap gestures when only 1 portfolio exists without add card', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={[mockPortfolios[0]]}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      expect(screen.getByText('Carteira Alfa')).toBeTruthy();
      // Não deve renderizar camadas de profundidade
      expect(screen.queryByTestId('wallet-depth-layer-1')).toBeNull();

      const activeCard = screen.getByTestId('stacked-wallet-card-active');
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 120, dx: 0 },
      });

      expect(onPortfolioChange).not.toHaveBeenCalled();
    });
  });

  describe('S35-T07: Privacy Mode Masks Balances Across All Rendered Cards in the Stack', () => {
    it('should mask balances with R$ •••••• on both active and depth layer cards in privacy mode', async () => {
      await render(
        <PortfolioCardStack
          portfolios={mockPortfolios}
          activeIndex={0}
          isPrivacyMode={true}
          testID="stacked-wallet-deck"
        />
      );

      // Não deve exibir nenhum saldo numérico real
      expect(screen.queryByText('R$ 10.000,00')).toBeNull();
      expect(screen.queryByText('R$ 20.000,00')).toBeNull();

      // Deve exibir máscara de privacidade
      const maskedTexts = screen.getAllByText('R$ ••••••');
      expect(maskedTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('S35-T08: Central walletStore Reactive Synchronization', () => {
    it('should manage and notify active wallet index changes to all subscribers', () => {
      const listener = jest.fn();
      const unsubscribe = walletStore.subscribe(listener);

      expect(walletStore.getState().activeWalletIndex).toBe(0);

      act(() => {
        walletStore.setActiveIndex(2, 'port-3');
      });

      expect(walletStore.getState().activeWalletIndex).toBe(2);
      expect(walletStore.getState().activePortfolioId).toBe('port-3');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });
});
