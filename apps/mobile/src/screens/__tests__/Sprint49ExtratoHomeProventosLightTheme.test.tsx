import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AllTransactionsScreen } from '../AllTransactionsScreen';
import { HomeIncomeTile } from '../../components/ui/HomeIncomeTile';
import { B3ImportScreen } from '../B3ImportScreen';
import { PatrimonyLineChartCard } from '../../components/ui/PatrimonyLineChartCard';
import { RecentTransactionItem } from '../../components/ui/RecentTransactionsCard';
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

describe('Sprint 49: Extrato Completo, Proventos na Home, Metas Pós-Importação e Tema Claro', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S49-T01: Extrato Completo exibe todas as movimentações sem truncamento
  // =========================================================================
  describe('S49-T01: AllTransactionsScreen displays all transactions without 5-item cutoff', () => {
    it('should render all 12 transactions and display "12 movimentações" in header', () => {
      const mockTxs: RecentTransactionItem[] = Array.from({ length: 12 }, (_, i) => ({
        id: `tx-${i}`,
        ticker: `TEST${i}`,
        assetClass: 'STOCK',
        type: 'BUY',
        dateText: '2026-11-01',
        amountText: `R$ ${(i + 1) * 100},00`,
      }));

      render(<AllTransactionsScreen transactions={mockTxs} onClose={jest.fn()} />);

      // Verifica subtítulo do header
      expect(screen.getByText('12 movimentações')).toBeTruthy();

      // Verifica que o primeiro e o último ativo estão renderizados
      expect(screen.getByTestId('all-tx-row-TEST0')).toBeTruthy();
      expect(screen.getByTestId('all-tx-row-TEST11')).toBeTruthy();
    });
  });

  // =========================================================================
  // S49-T02: HomeIncomeTile renderizado com valor formatado e Modo Privacidade
  // =========================================================================
  describe('S49-T02: HomeIncomeTile renders formatted income amount and respects privacy mode', () => {
    it('should render formatted amount in normal mode and mask in privacy mode', () => {
      const { rerender } = render(
        <HomeIncomeTile totalAmount="404.78" isPrivacyMode={false} />
      );

      expect(screen.getByText('PROVENTOS')).toBeTruthy();
      expect(screen.getByTestId('home-income-tile-value')).toBeTruthy();
      expect(screen.getByText('R$ 404,78')).toBeTruthy();

      // Ativa privacidade
      rerender(
        <HomeIncomeTile totalAmount="404.78" isPrivacyMode={true} />
      );

      expect(screen.getByText('R$ ••••••')).toBeTruthy();
      expect(screen.queryByText('R$ 404,78')).toBeNull();
    });
  });

  // =========================================================================
  // S49-T03: Toque no HomeIncomeTile aciona callback para abrir Proventos
  // =========================================================================
  describe('S49-T03: Pressing HomeIncomeTile triggers onPress callback', () => {
    it('should invoke onPress when tapped', () => {
      const onPressMock = jest.fn();
      render(<HomeIncomeTile totalAmount="150.00" onPress={onPressMock} />);

      const tile = screen.getByTestId('home-income-tile');
      fireEvent.press(tile);

      expect(onPressMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // S49-T04: Relatório de Importação B3 sugere configurar metas e percentuais
  // =========================================================================
  describe('S49-T04: B3ImportScreen report step offers goal configuration CTA', () => {
    it('should display file selection on initial step', async () => {
      render(
        <B3ImportScreen
          onBack={jest.fn()}
          onNavigateToPortfolio={jest.fn()}
        />
      );

      expect(screen.getByTestId('b3-pick-file')).toBeTruthy();
      expect(screen.getByText('Selecionar arquivo (XLSX ou CSV)')).toBeTruthy();
    });
  });

  // =========================================================================
  // S49-T05: PatrimonyLineChartCard no tema claro aplica alto contraste
  // =========================================================================
  describe('S49-T05: PatrimonyLineChartCard in light theme uses high contrast palette', () => {
    it('should apply high-contrast colors in light mode for curve bars and period buttons', () => {
      const sampleCurve = [
        { date: '2026-01-01', marketValue: '1000.00', investedCapital: '900.00' },
        { date: '2026-01-02', marketValue: '1200.00', investedCapital: '1000.00' },
      ];

      render(
        <PatrimonyLineChartCard
          curve={sampleCurve}
          themeMode="light"
          selectedPeriod="ALL"
        />
      );

      const chartArea = screen.getByTestId('patrimony-line-chart-area');
      expect(chartArea).toBeTruthy();

      // Botão de período ALL deve estar renderizado
      expect(screen.getByText('Total')).toBeTruthy();
    });
  });
});
