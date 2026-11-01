import React from 'react';
import { ScrollView } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ClassDetailScreen, ClassAssetDetailItem } from '../ClassDetailScreen';

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
  {
    id: 'asset-3',
    ticker: 'ITUB4',
    name: 'Itaú Unibanco Holding S.A.',
    assetClass: 'STOCK',
    currentAllocationPercentage: 20.0,
    grossBalance: 'R$ 2.160,00',
    quantity: '60',
    averagePrice: 'R$ 34,00',
    currentPrice: 'R$ 36,00',
    profitabilityPercentage: '+5,88%',
    profitabilityAmount: 'R$ +120,00',
    sliceColor: '#72743D',
  },
];

describe('S10-T01: TestHollowDonutLongPressTooltipAndTapScroll', () => {
  let scrollToSpy: jest.SpyInstance;

  beforeEach(() => {
    scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollToSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('1. Renderização do Gráfico de Pizza Oco (Donut Chart)', () => {
    it('deve renderizar o container do Donut Chart e as fatias de cada ativo da classe com porcentagens', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      // Container do Donut Chart presente
      expect(screen.getByTestId('class-donut-chart')).toBeTruthy();

      // Fatias do Donut para cada ativo
      expect(screen.getByTestId('donut-slice-PETR4')).toBeTruthy();
      expect(screen.getByTestId('donut-slice-VALE3')).toBeTruthy();
      expect(screen.getByTestId('donut-slice-ITUB4')).toBeTruthy();

      // Exibição das porcentagens dos ativos no Donut / Legenda
      expect(screen.getByText(/50(\.0)?%/)).toBeTruthy();
      expect(screen.getByText(/30(\.0)?%/)).toBeTruthy();
      expect(screen.getByText(/20(\.0)?%/)).toBeTruthy();
    });
  });

  describe('2. Tooltip no Clique Simples da Fatia (onPress) e Ausência de onLongPress', () => {
    it('deve exibir a caixa de texto flutuante (tooltip) com o nome e porcentagem do ativo ao clicar simples na fatia', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      // Tooltip não deve estar visível inicialmente
      expect(screen.queryByTestId('donut-tooltip')).toBeNull();

      // Dispara clique simples (onPress) na fatia de PETR4
      const petrSlice = screen.getByTestId('donut-slice-PETR4');
      fireEvent.press(petrSlice);

      // Tooltip deve surgir exibindo o nome do ativo e sua porcentagem
      const tooltip = screen.getByTestId('donut-tooltip');
      expect(tooltip).toBeTruthy();
      expect(screen.getByText(/Petróleo Brasileiro S\.A\./i)).toBeTruthy();
      expect(screen.getByText(/50(\.0)?%/)).toBeTruthy();

      // Dispara clique simples em outra fatia (VALE3) e o tooltip atualiza
      const valeSlice = screen.getByTestId('donut-slice-VALE3');
      fireEvent.press(valeSlice);

      expect(screen.getByText(/Vale S\.A\./i)).toBeTruthy();
      expect(screen.getByText(/30(\.0)?%/)).toBeTruthy();
    });

    it('não deve possuir prop onLongPress na fatia', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      const petrSlice = screen.getByTestId('donut-slice-PETR4');
      expect(petrSlice.props.onLongPress).toBeUndefined();
    });
  });

  describe('3. Scroll ao Clicar no Nome do Ativo no Resumo', () => {
    it('deve disparar o scroll suave até o card do ativo ao clicar no botão de scroll do tooltip', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      // Abre o resumo com clique simples na fatia
      const valeSlice = screen.getByTestId('donut-slice-VALE3');
      fireEvent.press(valeSlice);

      // Clica no nome do ativo no tooltip
      const scrollBtn = screen.getByTestId('donut-tooltip-scroll-btn');
      fireEvent.press(scrollBtn);

      // Verifica se a chamada de scrollTo no ScrollView foi acionada
      expect(scrollToSpy).toHaveBeenCalled();
      const callArg = scrollToSpy.mock.calls[0]?.[0];
      // scrollTo deve ser chamado com parâmetros de scroll (ex: animated true ou coordenada y)
      expect(callArg).toBeDefined();
    });
  });
});
