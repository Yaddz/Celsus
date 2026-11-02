import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
    currentAllocationPercentage: 60.0,
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
    currentAllocationPercentage: 40.0,
    grossBalance: 'R$ 3.600,00',
    quantity: '50',
    averagePrice: 'R$ 68,00',
    currentPrice: 'R$ 72,00',
    profitabilityPercentage: '+5,88%',
    profitabilityAmount: 'R$ +200,00',
    sliceColor: '#F1CA78',
  },
];

describe('S10-T02: TestAssetDetailInformationCards', () => {
  describe('1. Exibição dos Cards Detalhados dos Ativos (Estilo BTG / XP)', () => {
    it('deve exibir cards para cada ativo com Saldo Bruto, Quantidade, Preço Médio, Preço Atual e Rentabilidade', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      // Card do ativo PETR4
      const petrCard = screen.getByTestId('asset-card-PETR4');
      expect(petrCard).toBeTruthy();

      // Métricas de PETR4
      expect(screen.getByText('PETR4')).toBeTruthy();
      expect(screen.getByText('Petróleo Brasileiro S.A.')).toBeTruthy();
      expect(screen.getByText(/5\.400,00/)).toBeTruthy(); // Saldo Bruto
      expect(screen.getByText(/150/)).toBeTruthy(); // Quantidade
      expect(screen.getByText(/32,50/)).toBeTruthy(); // Preço Médio
      expect(screen.getByText(/36,00/)).toBeTruthy(); // Preço / Cotação Atual
      expect(screen.getByText(/\+10,77%/)).toBeTruthy(); // Rentabilidade %

      // Card do ativo VALE3
      const valeCard = screen.getByTestId('asset-card-VALE3');
      expect(valeCard).toBeTruthy();
      expect(screen.getByText('VALE3')).toBeTruthy();
      expect(screen.getByText(/3\.600,00/)).toBeTruthy(); // Saldo Bruto
      expect(screen.getByText(/50/)).toBeTruthy(); // Quantidade
      expect(screen.getByText(/68,00/)).toBeTruthy(); // Preço Médio
      expect(screen.getByText(/72,00/)).toBeTruthy(); // Preço Atual
      expect(screen.getByText(/\+5,88%/)).toBeTruthy(); // Rentabilidade
    });

    it('deve ocultar valores em modo privacidade (••••••)', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
          isPrivacyMode={true}
        />
      );

      // Valores numéricos monetários devem ser redigidos
      expect(screen.queryByText('R$ 5.400,00')).toBeNull();
      expect(screen.getAllByText(/••••••|██████,██/).length).toBeGreaterThan(0);
    });
  });

  describe('2. Ausência de Header Pesado (SPEC v2 / Zero Header)', () => {
    it('não deve renderizar nenhum header pesado ou banner de título na página', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          className="Ações"
          assets={MOCK_ASSETS}
        />
      );

      // Ausência total de header pesado (SPEC v2 Seção 11.2)
      expect(screen.queryByTestId('heavy-header')).toBeNull();
      expect(screen.queryByTestId('screen-heavy-title')).toBeNull();
    });
  });
});
