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

      // Sem legenda abaixo do gráfico: percentuais só aparecem no rótulo ao tocar na fatia
      expect(screen.queryByText(/^50(\.0)?%$/)).toBeNull();
      expect(screen.queryByText(/• PETR4/)).toBeNull();
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

      // O rótulo mostra ticker e percentual da fatia
      expect(screen.getByTestId('donut-tooltip')).toBeTruthy();
      expect(screen.getByTestId('donut-tooltip-percent').props.children.join('')).toBe('50.0%');

      // Outra fatia (VALE3) atualiza o rótulo
      fireEvent.press(screen.getByTestId('donut-slice-VALE3'));
      expect(screen.getByTestId('donut-tooltip-percent').props.children.join('')).toBe('30.0%');

      // Tocar de novo na mesma fatia esconde o rótulo
      fireEvent.press(screen.getByTestId('donut-slice-VALE3'));
      expect(screen.queryByTestId('donut-tooltip')).toBeNull();
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

  describe('3. Cores distintas e estáveis por ativo', () => {
    it('cada ativo tem cor própria e a mesma cor se mantém entre renderizações', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      const colorOf = (ticker: string) =>
        [screen.getByTestId(`donut-segment-${ticker}-0`).props.style].flat(Infinity).reduce((a: any, s: any) => ({ ...a, ...s }), {})
          .backgroundColor;
      const first = ['PETR4', 'VALE3', 'ITUB4'].map(colorOf);
      expect(new Set(first).size).toBe(3);

      screen.unmount();
      await render(<ClassDetailScreen assetClass="STOCK" className="Ações" assets={[...MOCK_ASSETS].reverse()} />);
      expect(['PETR4', 'VALE3', 'ITUB4'].map(colorOf)).toEqual(first);
    });
  });
});
