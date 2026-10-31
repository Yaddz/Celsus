import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StackedWalletDeck, StackedWalletItem } from '../StackedWalletDeck';

describe('S9-T01: TestStackedWalletPullDownUpAndCornerCutout', () => {
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
    {
      id: 'port-3',
      name: 'Reserva & Cripto',
      docketCode: 'REV-CART-003',
      accountCode: '•••• 003',
      balance: 'R$ 15.300,00',
      subtitle: 'Patrimônio Total',
      profitText: '+6,5% no ano',
      accentColor: '#EF9F43',
      paletteId: 'docks',
    },
  ];

  describe('Wallet Deck Cycling via Pull-Down and Pull-Up Gestures', () => {
    it('should render the active portfolio initially at index 0', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      expect(screen.getByTestId('stacked-wallet-deck')).toBeDefined();
      expect(screen.getByText('Carteira Principal')).toBeDefined();
      expect(screen.getByText('R$ 32.468,00')).toBeDefined();
      expect(screen.getByText('+12,4% no ano')).toBeDefined();
      expect(screen.getByText('•••• 001')).toBeDefined();
    });

    it('should advance to the next portfolio when pulling down (dy > 50)', async () => {
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

      // Puxar para baixo (Swipe Down / Pull Down) avança para a próxima carteira
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 80, dx: 0 },
      });

      expect(onPortfolioChange).toHaveBeenCalledWith(1, mockPortfolios[1]);
      expect(screen.getByText('Dossiê Aposentadoria')).toBeDefined();
      expect(screen.getByText('R$ 55.120,50')).toBeDefined();
      expect(screen.getByText('+18,2% no ano')).toBeDefined();
      expect(screen.getByText('•••• 002')).toBeDefined();
    });

    it('should cycle back to the first portfolio after the last one on pull down', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={2}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      const activeCard = screen.getByTestId('stacked-wallet-card-active');

      // Da última (index 2), puxar para baixo cicla de volta para a primeira (index 0)
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: 80, dx: 0 },
      });

      expect(onPortfolioChange).toHaveBeenCalledWith(0, mockPortfolios[0]);
      expect(screen.getByText('Carteira Principal')).toBeDefined();
    });

    it('should return to previous portfolio when pulling up (dy < -50)', async () => {
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

      // Puxar para cima (Swipe Up / Pull Up) volta uma carteira
      fireEvent(activeCard, 'responderRelease', {
        gestureState: { dy: -80, dx: 0 },
      });

      expect(onPortfolioChange).toHaveBeenCalledWith(0, mockPortfolios[0]);
      expect(screen.getByText('Carteira Principal')).toBeDefined();
    });
  });

  describe('Extended Palette Color Embracing Profitability Area', () => {
    it('should extend the portfolio accent color over the card body containing profitability', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const coloredBody = screen.getByTestId('wallet-colored-body');
      expect(coloredBody).toBeDefined();

      const flattenedStyle = Array.isArray(coloredBody.props.style)
        ? Object.assign({}, ...coloredBody.props.style.filter(Boolean))
        : coloredBody.props.style;

      // Cor estendida da carteira ativa (#D96628)
      expect(flattenedStyle.backgroundColor.toUpperCase()).toBe('#D96628');

      // A Rentabilidade está contida dentro da área colorida
      expect(screen.getByText('+12,4% no ano')).toBeDefined();
    });
  });

  describe('Dark Curved Corner Notch for Code Badge', () => {
    it('should render the code badge in a dark curved corner notch (#191B1D)', async () => {
      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          testID="stacked-wallet-deck"
        />
      );

      const cornerNotch = screen.getByTestId('wallet-corner-notch');
      expect(cornerNotch).toBeDefined();

      const flattenedStyle = Array.isArray(cornerNotch.props.style)
        ? Object.assign({}, ...cornerNotch.props.style.filter(Boolean))
        : cornerNotch.props.style;

      // Recorte escuro integrado (#191B1D ou #111315) com cantos arredondados
      expect(['#191B1D', '#111315']).toContain(flattenedStyle.backgroundColor.toUpperCase());
      expect(flattenedStyle.borderRadius).toBeGreaterThanOrEqual(10);
      expect(screen.getByText('•••• 001')).toBeDefined();
    });
  });
});
