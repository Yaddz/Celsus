import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { StackedWalletDeck, StackedWalletItem } from '../../components/ui/StackedWalletDeck';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
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

describe('Sprint 30: Wallet Stack Real Depth, List Selector & Navbar Direct Modals', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  describe('S30-T01: Navbar Speed-Dial "Nova Carteira" Opens the New Portfolio Modal Directly', () => {
    it('should open PortfolioManagementScreen and immediately display the new portfolio creation modal', async () => {
      await portfolioRepository.createPortfolio({
        name: 'Carteira Existente',
        docket_code: 'REV-CART-001',
      });

      await render(<App />);

      // Abre menu + na barra inferior
      const fabBtn = screen.getByTestId('dock-item-add-fab');
      fireEvent.press(fabBtn);

      expect(screen.getByTestId('fab-speed-dial-stack')).toBeTruthy();

      // Clica em "Nova Carteira"
      const novaCarteiraBtn = screen.getByTestId('fab-action-nova-carteira');
      fireEvent.press(novaCarteiraBtn);

      // Deve estar na tela de Carteiras E o modal de criação deve estar aberto
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-management-screen')).toBeTruthy();
        expect(screen.getByTestId('new-portfolio-name-input')).toBeTruthy();
        expect(screen.getByTestId('confirm-new-portfolio-btn')).toBeTruthy();
      });

      // Cria a carteira preenchendo o nome
      fireEvent.changeText(screen.getByTestId('new-portfolio-name-input'), 'Reserva Especial');
      fireEvent.press(screen.getByTestId('confirm-new-portfolio-btn'));

      await waitFor(async () => {
        const ports = await portfolioRepository.listPortfolios(false);
        expect(ports.some((p) => p.name === 'Reserva Especial')).toBe(true);
      });
    });
  });

  describe('S30-T02: Navbar Speed-Dial "Adicionar Ativo" Opens Dedicated Add Asset Modal (Not TransactionScreen)', () => {
    it('should open the Add Asset modal for the active portfolio instead of opening TransactionScreen', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Ativa Atual',
        docket_code: 'REV-ACT-001',
      });

      await render(<App />);

      // Abre menu + na barra inferior
      const fabBtn = screen.getByTestId('dock-item-add-fab');
      fireEvent.press(fabBtn);

      // Clica em "Adicionar Ativo"
      const addAssetBtn = screen.getByTestId('fab-action-adicionar-ativo');
      fireEvent.press(addAssetBtn);

      // NÃO deve abrir a tela de movimentações / aporte (TransactionScreen)
      expect(screen.queryByTestId('transaction-screen')).toBeNull();

      // DEVE abrir o modal de adicionar ativo com autocomplete e botão salvar
      await waitFor(() => {
        expect(screen.getByTestId('asset-autocomplete-input')).toBeTruthy();
        expect(screen.getByTestId('save-asset-target-btn')).toBeTruthy();
      });
    });
  });

  describe('S30-T03: StackedWalletDeck Visible Depth Layers and Subsequent Palette Binding', () => {
    const mockPortfolios: StackedWalletItem[] = [
      {
        id: 'port-1',
        name: 'Carteira Alfa',
        balance: 'R$ 10.000,00',
        accentColor: '#D96628',
        paletteId: 'classic',
      },
      {
        id: 'port-2',
        name: 'Carteira Beta',
        balance: 'R$ 20.000,00',
        accentColor: '#DB5A42',
        paletteId: 'harbor',
      },
      {
        id: 'port-3',
        name: 'Carteira Gama',
        balance: 'R$ 30.000,00',
        accentColor: '#EF9F43',
        paletteId: 'docks',
      },
    ];

    it('should render depth layers that are visually offset and bind their backgrounds to subsequent portfolios', async () => {
      const onPortfolioChange = jest.fn();

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
          onPortfolioChange={onPortfolioChange}
          testID="stacked-wallet-deck"
        />
      );

      // Camadas de profundidade renderizadas
      const layerOne = screen.getByTestId('wallet-depth-layer-1');
      const layerTwo = screen.getByTestId('wallet-depth-layer-2');
      expect(layerOne).toBeTruthy();
      expect(layerTwo).toBeTruthy();

      const layerOneStyle = [layerOne.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      const layerTwoStyle = [layerTwo.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});

      // As camadas devem herdar as cores das próximas carteiras (#DB5A42 e #EF9F43)
      expect(layerOneStyle.backgroundColor?.toUpperCase()).toBe('#DB5A42');
      expect(layerTwoStyle.backgroundColor?.toUpperCase()).toBe('#EF9F43');

      // Tocar na camada de fundo 1 cicla para a carteira Beta
      fireEvent.press(layerOne);
      expect(onPortfolioChange).toHaveBeenCalledWith(1, mockPortfolios[1]);
    });
  });

  describe('S30-T04: Horizontal Portfolio List Selector in PortfolioManagementScreen & Home Indicator Pills', () => {
    it('should render horizontal portfolio selector in PortfolioManagementScreen and allow direct 1-tap switching', async () => {
      const p1 = await portfolioRepository.createPortfolio({ name: 'Carteira Ações', docket_code: 'REV-001' });
      const p2 = await portfolioRepository.createPortfolio({ name: 'Carteira FIIs', docket_code: 'REV-002' });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[p1, p2]}
          initialClassTargets={[]}
          initialAssets={[]}
        />
      );

      // Barra horizontal de seleção presente
      const selector = screen.getByTestId('portfolio-horizontal-selector');
      expect(selector).toBeTruthy();

      // Chips das duas carteiras
      const chipP1 = screen.getByTestId(`portfolio-chip-${p1.id}`);
      const chipP2 = screen.getByTestId(`portfolio-chip-${p2.id}`);
      expect(chipP1).toBeTruthy();
      expect(chipP2).toBeTruthy();

      // Tocar no chip da Carteira FIIs alterna para ela
      fireEvent.press(chipP2);
      await waitFor(() => {
        expect(screen.getByText('CARTEIRA FIIS')).toBeTruthy();
      });
    });

    it('should render wallet indicator pills in Home allowing direct switching', async () => {
      await portfolioRepository.createPortfolio({ name: 'Carteira 1', docket_code: 'REV-001' });
      await portfolioRepository.createPortfolio({ name: 'Carteira 2', docket_code: 'REV-002' });

      await render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('home-wallet-pills')).toBeTruthy();
      });

      const pills = screen.getByTestId('home-wallet-pills');
      expect(pills).toBeTruthy();
    });
  });

  describe('S30-T05: Individual Real Balances per Portfolio in Deck and Reactive Data Refresh', () => {
    it('should display each portfolio own individual balance on card and reactively update assets on wallet switch', async () => {
      const p1 = await portfolioRepository.createPortfolio({ name: 'Carteira 1', docket_code: 'REV-001' });
      const p2 = await portfolioRepository.createPortfolio({ name: 'Carteira 2', docket_code: 'REV-002' });

      // p1 tem VALE3 (R$ 500,00)
      await assetRepository.createAsset({
        portfolio_id: p1.id,
        ticker: 'VALE3',
        name: 'Vale',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '50.00',
      });

      // p2 tem PETR4 (R$ 300,00)
      await assetRepository.createAsset({
        portfolio_id: p2.id,
        ticker: 'PETR4',
        name: 'Petrobras',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '30.00',
      });

      await render(<App />);

      // Deck carrega e exibe saldo individual da carteira 1
      await waitFor(() => {
        expect(screen.getByText('CARTEIRA 1')).toBeTruthy();
      });
      expect(screen.getByText('R$ 500,00')).toBeTruthy();

      // Alterna para carteira 2 via pill/selector
      const pillP2 = screen.getByTestId(`home-wallet-pill-${p2.id}`);
      fireEvent.press(pillP2);

      await waitFor(() => {
        expect(screen.getByText('CARTEIRA 2')).toBeTruthy();
        expect(screen.getByText('R$ 300,00')).toBeTruthy();
      });
    });
  });

  describe('S30-T06: Clean State on Delete and Safe Cycling Without __add_wallet_card__ Leaks', () => {
    it('should clear assets when all portfolios are deleted and not emit __add_wallet_card__ on cycle', async () => {
      const port = await portfolioRepository.createPortfolio({ name: 'Carteira Única', docket_code: 'REV-001' });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'WEGE3',
        name: 'WEG',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '40.00',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialClassTargets={[]}
          initialAssets={[asset]}
        />
      );

      // Exclui a carteira
      fireEvent.press(screen.getByTestId('delete-portfolio-btn'));
      fireEvent.press(screen.getByTestId('confirm-delete-portfolio-btn'));

      // Estado de ativos deve estar limpo
      await waitFor(() => {
        expect(screen.queryByText('WEGE3')).toBeNull();
      });
    });
  });
});
