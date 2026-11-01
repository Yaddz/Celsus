import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StackedWalletDeck, StackedWalletItem } from '../StackedWalletDeck';
import { DotMatrixAllocationCard } from '../DotMatrixAllocationCard';
import { AttributeStatBar, DotMatrixGrid } from '../AttributeStatBar';

describe('Sprint 16: Wallet Stack Notch, Organic Blur, Empty/Add States & Left-to-Right Charts', () => {
  const mockPortfolios: StackedWalletItem[] = [
    {
      id: 'port-1',
      name: 'Carteira Principal',
      docketCode: 'REV-CART-001',
      accountCode: '•••• 001',
      balance: 'R$ 32.468,00',
      subtitle: 'Patrimônio Total',
      profitText: '+12,4% no ano',
      accentColor: '#D96628',
      paletteId: 'classic',
    },
    {
      id: 'port-2',
      name: 'Dossiê Aposentadoria',
      docketCode: 'REV-CART-002',
      accountCode: '•••• 002',
      balance: 'R$ 55.120,50',
      subtitle: 'Patrimônio Total',
      profitText: '+18,2% no ano',
      accentColor: '#DB5A42',
      paletteId: 'harbor',
    },
  ];

  describe('Module 1: Card Geometry, Notch Corners and Inverted Fillet Colors', () => {
    it('should enforce borderWidth: 0 on heroCard and cornerNotch', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');
      const cardStyle = Array.isArray(activeCard.props.style)
        ? Object.assign({}, ...activeCard.props.style.filter(Boolean))
        : activeCard.props.style;

      expect(cardStyle.borderWidth ?? 0).toBe(0);

      const cornerNotch = screen.getByTestId('wallet-corner-notch');
      const notchStyle = Array.isArray(cornerNotch.props.style)
        ? Object.assign({}, ...cornerNotch.props.style.filter(Boolean))
        : cornerNotch.props.style;

      expect(notchStyle.borderWidth ?? notchStyle.borderTopWidth ?? 0).toBe(0);
      expect(notchStyle.borderLeftWidth ?? 0).toBe(0);
    });

    it('should have straight bottom-left and top-right notch corners (borderRadius: 0)', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const cornerNotch = screen.getByTestId('wallet-corner-notch');
      const notchStyle = Array.isArray(cornerNotch.props.style)
        ? Object.assign({}, ...cornerNotch.props.style.filter(Boolean))
        : cornerNotch.props.style;

      expect(notchStyle.borderBottomLeftRadius).toBe(0);
      expect(notchStyle.borderTopRightRadius).toBe(0);
    });

    it('should invert fillet curves: outer container has cardBgColor and inner curve has notchBgColor', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const cardBgColor = '#D96628';
      const notchBgColor = '#191B1D';

      // Top Fillet
      const filletTop = screen.getByTestId('notch-fillet-top');
      const filletTopStyle = Array.isArray(filletTop.props.style)
        ? Object.assign({}, ...filletTop.props.style.filter(Boolean))
        : filletTop.props.style;
      expect(filletTopStyle.backgroundColor?.toUpperCase()).toBe(cardBgColor.toUpperCase());

      const filletTopInner = screen.getByTestId('notch-fillet-top-inner');
      const filletTopInnerStyle = Array.isArray(filletTopInner.props.style)
        ? Object.assign({}, ...filletTopInner.props.style.filter(Boolean))
        : filletTopInner.props.style;
      expect(filletTopInnerStyle.backgroundColor?.toUpperCase()).toBe(notchBgColor.toUpperCase());

      // Left Fillet
      const filletLeft = screen.getByTestId('notch-fillet-left');
      const filletLeftStyle = Array.isArray(filletLeft.props.style)
        ? Object.assign({}, ...filletLeft.props.style.filter(Boolean))
        : filletLeft.props.style;
      expect(filletLeftStyle.backgroundColor?.toUpperCase()).toBe(cardBgColor.toUpperCase());

      const filletLeftInner = screen.getByTestId('notch-fillet-left-inner');
      const filletLeftInnerStyle = Array.isArray(filletLeftInner.props.style)
        ? Object.assign({}, ...filletLeftInner.props.style.filter(Boolean))
        : filletLeftInner.props.style;
      expect(filletLeftInnerStyle.backgroundColor?.toUpperCase()).toBe(notchBgColor.toUpperCase());
    });
  });

  describe('Module 1: Deck Elevation (zIndex >= 100) and Organic Background Blur', () => {
    it('should elevate deck container with zIndex >= 100 to layer over dock and buttons during drag', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const deck = screen.getByTestId('stacked-wallet-deck');
      const deckStyle = Array.isArray(deck.props.style)
        ? Object.assign({}, ...deck.props.style.filter(Boolean))
        : deck.props.style;

      expect(deckStyle.zIndex).toBeGreaterThanOrEqual(100);
    });

    it('should render organic diffuse background shapes with multi-layer opacity inside card body', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const organicBackground = screen.getByTestId('wallet-organic-blur-layers');
      expect(organicBackground).toBeDefined();
    });
  });

  describe('Module 1: Deck States (Empty State vs 1+ Portfolios Extra Add Card)', () => {
    it('should render stationary empty card when portfolios is empty array', async () => {
      const onCreatePortfolioPress = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={[]}
          onCreatePortfolioPress={onCreatePortfolioPress}
          testID="stacked-wallet-deck"
        />
      );

      // Card fixo de estado vazio
      const emptyCard = screen.getByTestId('stacked-wallet-empty-card');
      expect(emptyCard).toBeDefined();
      expect(screen.getByText(/Nenhuma carteira cadastrada/i)).toBeDefined();

      // CTA para criar primeira carteira
      const createCta = screen.getByTestId('empty-wallet-create-cta');
      expect(createCta).toBeDefined();
      fireEvent.press(createCta);
      expect(onCreatePortfolioPress).toHaveBeenCalledTimes(1);

      // Não deve renderizar card ativo regular
      expect(screen.queryByTestId('stacked-wallet-card-active')).toBeNull();
    });

    it('should append an extra add-wallet card at the end of the stack when portfolios.length >= 1', async () => {
      const onCreatePortfolioPress = jest.fn();
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          onCreatePortfolioPress={onCreatePortfolioPress}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      // Com 2 carteiras, o total de cartas na pilha é 3 (2 carteiras + 1 card de adicionar)
      // Avança da carteira 0 para a carteira 1
      const activeCard0 = screen.getByTestId('stacked-wallet-card-active');
      fireEvent(activeCard0, 'responderRelease', { gestureState: { dy: 80, dx: 0 } });

      // Avança da carteira 1 para o card extra de adicionar
      const activeCard1 = screen.getByTestId('stacked-wallet-card-active');
      fireEvent(activeCard1, 'responderRelease', { gestureState: { dy: 80, dx: 0 } });

      // O card ativo agora é o card de adicionar carteira
      const addCard = screen.getByTestId('stacked-wallet-add-card');
      expect(addCard).toBeDefined();

      const addCta = screen.getByTestId('add-wallet-card-cta');
      expect(addCta).toBeDefined();
      fireEvent.press(addCta);
      expect(onCreatePortfolioPress).toHaveBeenCalledTimes(1);

      // Mais um pull-down deve ciclar de volta para a primeira carteira
      fireEvent(addCard, 'responderRelease', { gestureState: { dy: 80, dx: 0 } });
      expect(screen.getByText('Carteira Principal')).toBeDefined();
    });
  });

  describe('Module 2: Left-to-Right Allocation Chart Pre-filling', () => {
    it('should fill DotMatrixAllocationCard (v2) columns from left to right (col 0 before col 9)', async () => {
      await render(
        <DotMatrixAllocationCard
          allocations={[
            { assetClass: 'FIXED_INCOME', currentPercentage: 10.0, targetPercentage: 30.0, marketValue: '1.000,00' },
          ]}
          variant="v2"
          testID="allocation-card-ltr"
        />
      );

      // Na grade de 4x10, 10% = 4 pontos, que devem preencher a coluna 0 (esquerda)
      const col0Dot = screen.getByTestId('dot-3-0');
      const col0Style = Array.isArray(col0Dot.props.style)
        ? Object.assign({}, ...col0Dot.props.style.filter(Boolean))
        : col0Dot.props.style;
      expect(col0Style.backgroundColor?.toUpperCase()).toBe('#2E4A44');

      // Coluna 9 (direita) deve estar vazia
      const col9Dot = screen.getByTestId('dot-3-9');
      const col9Style = Array.isArray(col9Dot.props.style)
        ? Object.assign({}, ...col9Dot.props.style.filter(Boolean))
        : col9Dot.props.style;
      expect(col9Style.backgroundColor?.toUpperCase()).not.toBe('#2E4A44');
    });

    it('should render AttributeStatBar with left-to-right fill direction by default', async () => {
      await render(
        <AttributeStatBar
          assetClass="STOCK"
          currentPercentage={10.0}
          targetPercentage={30.0}
          testID="stat-bar-ltr"
        />
      );

      const col0Dot = screen.getByTestId('dot-3-0');
      const col0Style = Array.isArray(col0Dot.props.style)
        ? Object.assign({}, ...col0Dot.props.style.filter(Boolean))
        : col0Dot.props.style;
      expect(col0Style.backgroundColor?.toUpperCase()).toBe('#D96628');
    });
  });
});
