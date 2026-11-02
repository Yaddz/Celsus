import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { colors, spacing } from '../../theme/tokens';
import { PatrimonyLineChartCard } from '../../components/ui/PatrimonyLineChartCard';
import { DotMatrixAllocationCard } from '../../components/ui/DotMatrixAllocationCard';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { TransactionScreen } from '../TransactionScreen';
import { SimulatorScreen } from '../SimulatorScreen';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { ClassDetailScreen } from '../ClassDetailScreen';
import { HistoricalPricePoint } from '../../domain/finance/portfolioHistory';

// Helper de cálculo de luminância e contraste WCAG 2.1
function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

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

describe('Sprint 28: P1 Visual Consistency, Tokens, Contrast & Solid Charts', () => {
  describe('S28-T01: Dark Mode Contrast Audit & colors.parchmentMuted Token', () => {
    it('should define parchmentMuted token in tokens.ts with contrast >= 4.5:1 against dark card surface', () => {
      // 1. O token parchmentMuted deve estar definido e não ser undefined
      expect((colors as any).parchmentMuted).toBeDefined();
      expect((colors as any).parchmentMuted).toBe('#B8B2A6');

      // 2. Razão de contraste WCAG AA deve ser >= 4.5:1 contra #191B1D (superfície do card no Dark Mode)
      const cardDarkBg = '#191B1D';
      const contrast = getContrastRatio((colors as any).parchmentMuted, cardDarkBg);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    });

    it('should render PatrimonyLineChartCard in dark mode without any undefined color in texts', async () => {
      await render(
        <PatrimonyLineChartCard
          themeMode="dark"
          curve={[
            { date: '2026-10-01', marketValue: '1000.00', investedCapital: '950.00' },
            { date: '2026-10-15', marketValue: '1050.00', investedCapital: '950.00' },
          ]}
        />
      );

      const headerLabel = screen.getByText('PATRIMÔNIO HISTÓRICO');
      expect(headerLabel).toBeTruthy();
      const flatStyle = [headerLabel.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.color).toBeDefined();
      expect(flatStyle.color).not.toBe('undefined');
      expect(getContrastRatio(flatStyle.color, '#191B1D')).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('S28-T02: Light Mode Close Buttons, Borders & Card Consistency', () => {
    it('should style modal close buttons with light background in light theme mode (contrast >= 4.5:1)', async () => {
      // 1. TransactionScreen close button
      await render(<TransactionScreen onClose={jest.fn()} themeMode="light" />);
      const closeTxBtn = screen.getByTestId('close-transaction-btn');
      expect(closeTxBtn).toBeTruthy();
      const txBtnStyle = [closeTxBtn.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(txBtnStyle.backgroundColor).not.toBe('#191B1D');
      expect(['#F0EDE6', '#EAE4D7', '#FFFFFF', '#F4F1EA']).toContain(txBtnStyle.backgroundColor.toUpperCase());

      // 2. SimulatorScreen close button
      await render(<SimulatorScreen onClose={jest.fn()} themeMode="light" />);
      const closeSimBtn = screen.getByTestId('close-simulator-btn');
      expect(closeSimBtn).toBeTruthy();
      const simBtnStyle = [closeSimBtn.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(simBtnStyle.backgroundColor).not.toBe('#191B1D');

      // 3. SettingsBackupScreen close button
      await render(<SettingsBackupScreen onClose={jest.fn()} themeMode="light" />);
      const closeSettingsBtn = screen.getByTestId('close-settings-btn');
      expect(closeSettingsBtn).toBeTruthy();
      const settingsBtnStyle = [closeSettingsBtn.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(settingsBtnStyle.backgroundColor).not.toBe('#191B1D');
    });

    it('should share unified border color (#EAE4D7) and borderRadius (24) between PatrimonyLineChartCard and DotMatrixAllocationCard in Light Mode', async () => {
      await render(<PatrimonyLineChartCard themeMode="light" curve={[]} />);
      const chartCard = screen.getByTestId('patrimony-line-chart-card');
      const chartStyle = [chartCard.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});

      await render(<DotMatrixAllocationCard themeMode="light" allocations={[]} />);
      const dotCard = screen.getByTestId('home-dot-matrix-card');
      const dotStyle = [dotCard.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});

      expect(chartStyle.borderRadius).toBe(24);
      expect(dotStyle.borderRadius).toBe(24);
      expect(chartStyle.borderColor?.toUpperCase()).toBe('#EAE4D7');
      expect(dotStyle.borderColor?.toUpperCase()).toBe('#EAE4D7');
    });
  });

  describe('S28-T03: Redesigned PatrimonyLineChartCard with References, Legend and Empty State', () => {
    it('should render empty state message when curve is empty array', async () => {
      await render(<PatrimonyLineChartCard curve={[]} themeMode="dark" />);
      expect(screen.getByTestId('chart-empty-state')).toBeTruthy();
      expect(screen.getByText('Nenhum histórico registrado no período')).toBeTruthy();
    });

    it('should render Y-axis reference levels and comparative legend (Valor de Mercado vs Capital Investido)', async () => {
      const sampleCurve: HistoricalPricePoint[] = [
        { date: '2026-09-01', marketValue: '10000.00', investedCapital: '9000.00' },
        { date: '2026-09-15', marketValue: '10500.00', investedCapital: '9500.00' },
        { date: '2026-10-01', marketValue: '11200.00', investedCapital: '10000.00' },
      ];

      await render(<PatrimonyLineChartCard curve={sampleCurve} themeMode="dark" />);

      // 1. Eixo Y de referência (mín e máx)
      expect(screen.getByTestId('chart-y-axis-min')).toBeTruthy();
      expect(screen.getByTestId('chart-y-axis-max')).toBeTruthy();

      // 2. Legenda comparativa
      expect(screen.getByTestId('chart-legend-market-value')).toBeTruthy();
      expect(screen.getByTestId('chart-legend-invested-capital')).toBeTruthy();

      // 3. Inspeção por toque de ponto
      const firstBarPoint = screen.getByTestId('chart-bar-point-0');
      fireEvent.press(firstBarPoint);
      expect(screen.getByTestId('chart-point-tooltip')).toBeTruthy();
    });
  });

  describe('S28-T04: Solid Donut Slices and Screen Header Alignment', () => {
    it('should render Donut chart segments with solid opacity 1 without translucent striping', async () => {
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          assets={[
            {
              id: 'a1',
              ticker: 'PETR4',
              name: 'Petrobras PN',
              targetAllocationPercentage: 50,
              currentAllocationPercentage: 60,
              grossBalance: 'R$ 6.000,00',
              averagePrice: 'R$ 30,00',
              currentPrice: 'R$ 36,00',
              profitabilityPercentage: '+20,0%',
              totalQuantity: 100,
            },
            {
              id: 'a2',
              ticker: 'VALE3',
              name: 'Vale ON',
              targetAllocationPercentage: 50,
              currentAllocationPercentage: 40,
              grossBalance: 'R$ 4.000,00',
              averagePrice: 'R$ 60,00',
              currentPrice: 'R$ 55,00',
              profitabilityPercentage: '-8,3%',
              totalQuantity: 50,
            },
          ]}
        />
      );

      const petr4Slice = screen.getByTestId('donut-slice-PETR4');
      expect(petr4Slice).toBeTruthy();

      // Verifica os segmentos da fatia: todos devem ter opacity = 1
      const segmentElements = screen.getAllByTestId(/^donut-segment-PETR4/);
      expect(segmentElements.length).toBeGreaterThan(0);
      for (const seg of segmentElements) {
        const flat = [seg.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
        expect(flat.opacity).toBe(1);
      }
    });

    it('should align XpMinimalHeader paddingHorizontal with screen standard 16px', async () => {
      await render(<XpMinimalHeader userName="Pedro" userInitials="PL" />);
      const headerContainer = screen.getByTestId('xp-minimal-header');
      const flatStyle = [headerContainer.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.paddingHorizontal).toBe(16);
    });
  });
});
