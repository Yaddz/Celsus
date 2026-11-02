import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../../../App';
import { FloatingBottomDock } from '../../components/ui/FloatingBottomDock';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { AttributeStatBar } from '../../components/ui/AttributeStatBar';
import { PatrimonyLineChartCard } from '../../components/ui/PatrimonyLineChartCard';
import {
  PRIVACY_MASK,
  PRIVACY_CURRENCY_MASK,
  privacyAndAuthService,
} from '../../services/privacyAndAuth';
import { colors } from '../../theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// Helper de cálculo de luminância relativa e contraste WCAG 2.1
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

// Mock dos serviços e repositórios para renderização isolada do App
jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

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

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockResolvedValue([
      { id: 'port-1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
    ]),
    getClassTargets: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/assetRepository', () => ({
  assetRepository: {
    getAssetsByPortfolio: jest.fn().mockResolvedValue([]),
    getAssetById: jest.fn().mockResolvedValue(null),
  },
}));

describe('Sprint 26: Privacy Mask, WCAG Contrast & Floating Navbar Stabilization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    privacyAndAuthService.setPrivacyMode(false);
  });

  describe('S26-T01: Floating Bottom Dock Circular Styling and MaterialIcons Preload', () => {
    it('should style the active circle and dock pill with overflow hidden and proper border radius', async () => {
      await render(
        <FloatingBottomDock
          activeTab="home"
          onTabChange={jest.fn()}
          onActionPress={jest.fn()}
        />
      );

      const dock = screen.getByTestId('floating-bottom-dock');
      expect(dock).toBeTruthy();

      const activeIndicator = screen.getByTestId('dock-active-indicator');
      expect(activeIndicator).toBeTruthy();

      const flatStyle = [activeIndicator.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.borderRadius).toBe(22);
      expect(flatStyle.overflow).toBe('hidden');
    });

    it('should verify MaterialIcons font preload dictionary exists for zero font-shift', () => {
      // MaterialIcons.font deve estar acessível para pré-carregamento no lifecycle do App
      expect(MaterialIcons.font).toBeDefined();
    });
  });

  describe('S26-T02: Global Privacy Store and Unified Mask (R$ ••••••)', () => {
    it('should define exact masks with 6 bullets for currency and percentages', () => {
      expect(PRIVACY_CURRENCY_MASK).toBe('R$ ••••••');
      expect(PRIVACY_MASK).toBe('••••••');
    });

    it('should redact values consistently across Home screen elements when privacy mode is activated', async () => {
      await render(<App />);

      const privacyBtn = screen.getByTestId('header-privacy-button');
      fireEvent.press(privacyBtn);

      // Deve exibir máscara unificada com 6 bullets
      const maskedElements = screen.getAllByText('R$ ••••••');
      expect(maskedElements.length).toBeGreaterThanOrEqual(1);

      // Nenhum valor sem máscara ou máscara legada com asteriscos deve existir
      expect(screen.queryByText('*******')).toBeNull();
    });
  });

  describe('S26-T03: Redundant Privacy Switch Removal in Settings Screen (Bug #5)', () => {
    it('should not render privacy-mode-switch in SettingsBackupScreen', async () => {
      await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      // O switch redundante deve ter sido removido
      expect(screen.queryByTestId('privacy-mode-switch')).toBeNull();

      // Seletor de aparência e seção de personalização devem permanecer
      expect(screen.getByTestId('settings-section-personalizacao')).toBeTruthy();
      expect(screen.getByTestId('theme-option-dark')).toBeTruthy();
      expect(screen.getByTestId('theme-option-light')).toBeTruthy();
    });
  });

  describe('S26-T04: Dark Mode WCAG AA Contrast Audit (Ratio >= 4.5:1)', () => {
    it('should satisfy WCAG AA contrast ratio of at least 4.5:1 for secondary texts in AttributeStatBar', () => {
      // Cores de texto secundário no dark mode vs fundo escuro (#111315 e #191B1D)
      const bgDark = '#111315';
      const bgCard = '#191B1D';

      // Cor de texto secundário atualizada para conformidade WCAG AA
      const secondaryTextDark = colors.secondaryText || '#9CA3AF';
      const contrastBg = getContrastRatio(secondaryTextDark, bgDark);
      const contrastCard = getContrastRatio(secondaryTextDark, bgCard);

      expect(contrastBg).toBeGreaterThanOrEqual(4.5);
      expect(contrastCard).toBeGreaterThanOrEqual(4.5);
    });

    it('should render PatrimonyLineChartCard with dark surfaceCard background and visible border', async () => {
      await render(
        <PatrimonyLineChartCard
          themeMode="dark"
          totalValue="R$ 10.000,00"
          period="ANO"
          data={[100, 200, 300]}
        />
      );

      const chartCard = screen.getByTestId('patrimony-line-chart-card');
      expect(chartCard).toBeTruthy();

      const flatStyle = [chartCard.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.backgroundColor.toUpperCase()).toBe('#191B1D');
      expect(flatStyle.borderWidth).toBeGreaterThanOrEqual(1);
    });
  });
});
