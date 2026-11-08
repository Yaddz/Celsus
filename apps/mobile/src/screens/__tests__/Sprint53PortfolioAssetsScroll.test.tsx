import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PortfolioManagementScreen, AssetItem } from '../PortfolioManagementScreen';

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

// Mock do marketApi
jest.mock('../../services/marketApi', () => ({
  marketApiService: {
    searchCatalog: jest.fn().mockResolvedValue([]),
    getQuotes: jest.fn().mockResolvedValue({}),
  },
}));

describe('Sprint 53 — Frente B: Portfolio Assets Scrollable List', () => {
  const generateMockAssets = (count: number): AssetItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `asset-${i + 1}`,
      ticker: `ATV${String(i + 1).padStart(2, '0')}`,
      name: `Ativo Teste ${i + 1}`,
      assetClass: 'STOCK',
      targetInClass: Number((100 / count).toFixed(2)),
      quantity: '100',
      price: '10.00',
    }));
  };

  it('S53-T08: portfolio-assets-list exists when assets are present, has nestedScrollEnabled and maxHeight style', async () => {
    const assets = generateMockAssets(5);

    render(
      <PortfolioManagementScreen
        initialAssets={assets}
        initialPortfolios={[{ id: 'port-1', name: 'Carteira Principal' }]}
        initialPortfolioId="port-1"
      />
    );

    const list = screen.getByTestId('portfolio-assets-list');
    expect(list).toBeTruthy();

    // Valida propriedades de rolagem aninhada
    expect(list.props.nestedScrollEnabled).toBe(true);

    // Valida maxHeight no estilo
    const flatStyle = Array.isArray(list.props.style)
      ? Object.assign({}, ...list.props.style.flat(Infinity).filter(Boolean))
      : list.props.style;

    expect(flatStyle.maxHeight).toBeDefined();
    expect(flatStyle.maxHeight).toBeGreaterThan(0);
  });

  it('S53-T09: mounts all 30 assets within the scrollable container', async () => {
    const assets30 = generateMockAssets(30);

    render(
      <PortfolioManagementScreen
        initialAssets={assets30}
        initialPortfolios={[{ id: 'port-1', name: 'Carteira Grande' }]}
        initialPortfolioId="port-1"
      />
    );

    expect(screen.getByTestId('portfolio-assets-list')).toBeTruthy();

    // Valida que o primeiro e o último ativo estão montados
    expect(screen.getByText('ATV01')).toBeTruthy();
    expect(screen.getByText('ATV30')).toBeTruthy();
  });

  it('S53-T10: when 0 assets, renders portfolio-assets-empty and does NOT render portfolio-assets-list', async () => {
    render(
      <PortfolioManagementScreen
        initialAssets={[]}
        initialPortfolios={[{ id: 'port-1', name: 'Carteira Vazia' }]}
        initialPortfolioId="port-1"
      />
    );

    expect(screen.getByTestId('portfolio-assets-empty')).toBeTruthy();
    expect(screen.queryByTestId('portfolio-assets-list')).toBeNull();
  });
});
