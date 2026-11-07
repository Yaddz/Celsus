import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import {
  PRIVACY_ASTERISK_MASK,
  redactWithAsterisks,
  redactCurrencyValue,
  privacyAndAuthService,
} from '../privacyAndAuth';
import {
  THEME_COLORS,
  LIGHT_THEME_TOKENS,
  themeModeService,
} from '../../theme/palettes';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, style }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock dos serviços e repositórios
jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

jest.mock('../../services/transactionService', () => ({
  transactionService: {
    getTransactionsByPortfolio: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockResolvedValue([
      { id: 'default-portfolio', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
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

describe('S12-T02: TestPrivacyAsteriskMaskAndLightThemeTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    themeModeService.reset();
    privacyAndAuthService.setPrivacyMode(false);
  });

  describe('Asterisk Privacy Mask Specification (redactWithAsterisks)', () => {
    it('should define exact PRIVACY_ASTERISK_MASK as R$ ••••••', () => {
      expect(PRIVACY_ASTERISK_MASK).toBe('R$ ••••••');
    });

    it('should redact currency value with asterisks when privacy mode is enabled', () => {
      expect(redactWithAsterisks('R$ 32.468,00', true)).toBe('R$ ••••••');
      expect(redactWithAsterisks('R$ 1.500,00', true)).toBe('R$ ••••••');
      expect(redactWithAsterisks(32468, true)).toBe('R$ ••••••');
    });

    it('should preserve original value when privacy mode is disabled', () => {
      expect(redactWithAsterisks('R$ 32.468,00', false)).toBe('R$ 32.468,00');
      expect(redactWithAsterisks('+12,4% no ano', false)).toBe('+12,4% no ano');
    });

    it('should keep redactCurrencyValue unified with R$ •••••• for backward compatibility', () => {
      expect(redactCurrencyValue('R$ 32.468,00', true)).toBe('R$ ••••••');
      expect(redactCurrencyValue('R$ 32.468,00', false)).toBe('R$ 32.468,00');
    });
  });

  describe('Light Theme Tokens Definition', () => {
    it('should define exact light tokens for backgroundPrimary, cardBackground and textPrimary', () => {
      expect(LIGHT_THEME_TOKENS.backgroundPrimary.toUpperCase()).toBe('#F4F1EA');
      expect(LIGHT_THEME_TOKENS.cardBackground.toUpperCase()).toBe('#FFFFFF');
      expect(LIGHT_THEME_TOKENS.textPrimary.toUpperCase()).toBe('#111315');

      expect(THEME_COLORS.light.background.toUpperCase()).toBe('#F4F1EA');
      expect(THEME_COLORS.light.surface.toUpperCase()).toBe('#FFFFFF');
    });
  });

  describe('Home Screen Integration: Privacy Asterisks and Light Theme Mode', () => {
    it('should hide values with asterisks ******* on Home screen when privacy mode is active', async () => {
      await render(React.createElement(App));

      const privacyButton = screen.getByTestId('header-privacy-button');
      expect(privacyButton).toBeDefined();

      // Ativa o modo de privacidade na Home
      fireEvent.press(privacyButton);

      // Verifica que a máscara 'R$ ••••••' é exibida na Home (o baralho mostra skeleton até a 1ª carga)
      await waitFor(() => {
        expect(screen.getAllByText('R$ ••••••').length).toBeGreaterThanOrEqual(1);
      });

      // Verifica que o valor aberto não está mais visível
      expect(screen.queryByText('R$ 32.468,00')).toBeNull();
    });

    it('should apply light theme tokens to Home screen container when theme is switched to light', async () => {
      themeModeService.setThemeMode('light');

      await render(React.createElement(App));

      // Verifica que o tema ativo no serviço é light
      expect(themeModeService.getThemeMode()).toBe('light');

      // Verifica se o container raiz recebe a cor de fundo do tema claro
      const homeRoot = screen.getByTestId('home-screen-root');
      expect(homeRoot).toBeDefined();

      const flatStyle = [homeRoot.props.style].flat().reduce((acc, s) => ({ ...acc, ...s }), {});
      expect(flatStyle.backgroundColor.toUpperCase()).toBe(LIGHT_THEME_TOKENS.backgroundPrimary.toUpperCase());
    });
  });
});
