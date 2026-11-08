import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import {
  ThemeMode,
  THEME_COLORS,
  getThemeColors,
  themeModeService,
  ASSET_CLASS_COLORS,
} from '../palettes';
import { SettingsBackupScreen } from '../../screens/SettingsBackupScreen';

describe('S8-T02: TestDarkAndLightThemeModeSwitch', () => {
  beforeEach(() => {
    themeModeService.reset();
  });

  describe('Dark & Light Theme Mode Specification Tokens', () => {
    it('should define exact Dark Theme tokens with background #111315', () => {
      const darkTokens = THEME_COLORS.dark;
      expect(darkTokens).toBeDefined();
      expect(darkTokens.background.toUpperCase()).toBe('#111315');
      expect(darkTokens.surface.toUpperCase()).toBe('#191B1D');
      expect(darkTokens.surfaceContainer.toUpperCase()).toBe('#202224');
      expect(darkTokens.onSurface.toUpperCase()).toBe('#E6DECA');
      expect(darkTokens.muted.toUpperCase()).toBe('#8A8A8E');
    });

    it('should define exact Light Theme tokens with background #F4F1EA', () => {
      const lightTokens = THEME_COLORS.light;
      expect(lightTokens).toBeDefined();
      expect(lightTokens.background.toUpperCase()).toBe('#F4F1EA');
      expect(lightTokens.surface.toUpperCase()).toBe('#FFFFFF');
      expect(lightTokens.surfaceContainer.toUpperCase()).toBe('#EAE4D7');
      expect(lightTokens.onSurface.toUpperCase()).toBe('#191B1D');
      expect(lightTokens.muted.toUpperCase()).toBe('#6E6A63');
    });

    it('should retrieve colors for requested theme mode via getThemeColors', () => {
      expect(getThemeColors('dark').background.toUpperCase()).toBe('#111315');
      expect(getThemeColors('light').background.toUpperCase()).toBe('#F4F1EA');
    });
  });

  describe('Theme Mode Service State Transitions', () => {
    it('should default to dark theme mode', () => {
      expect(themeModeService.getThemeMode()).toBe('dark');
    });

    it('should switch theme mode to light and toggle back to dark', () => {
      const lightMode = themeModeService.setThemeMode('light');
      expect(lightMode).toBe('light');
      expect(themeModeService.getThemeMode()).toBe('light');

      const toggledDark = themeModeService.toggleThemeMode();
      expect(toggledDark).toBe('dark');
      expect(themeModeService.getThemeMode()).toBe('dark');

      const toggledLight = themeModeService.toggleThemeMode();
      expect(toggledLight).toBe('light');
      expect(themeModeService.getThemeMode()).toBe('light');
    });

    it('should preserve immutable asset class colors across theme changes', () => {
      themeModeService.setThemeMode('dark');
      expect(ASSET_CLASS_COLORS.FIXED_INCOME.toUpperCase()).toBe('#2E4A44');
      expect(ASSET_CLASS_COLORS.FII.toUpperCase()).toBe('#D5CAA8');
      expect(ASSET_CLASS_COLORS.STOCK.toUpperCase()).toBe('#D96628');
      expect(ASSET_CLASS_COLORS.CRYPTO.toUpperCase()).toBe('#C49A45');

      themeModeService.setThemeMode('light');
      expect(ASSET_CLASS_COLORS.FIXED_INCOME.toUpperCase()).toBe('#2E4A44');
      expect(ASSET_CLASS_COLORS.FII.toUpperCase()).toBe('#D5CAA8');
      expect(ASSET_CLASS_COLORS.STOCK.toUpperCase()).toBe('#D96628');
      expect(ASSET_CLASS_COLORS.CRYPTO.toUpperCase()).toBe('#C49A45');
    });
  });

  describe('Theme Mode Selector in Settings Screen (SettingsBackupScreen)', () => {
    it('should render theme mode options and trigger onThemeModeChange when selected', async () => {
      const onThemeModeChange = jest.fn();
      const onTogglePrivacy = jest.fn();

      await render(
        React.createElement(SettingsBackupScreen, {
          isPrivacyMode: false,
          onTogglePrivacyMode: onTogglePrivacy,
          themeMode: 'dark',
          onThemeModeChange: onThemeModeChange,
        })
      );

      fireEvent.press(screen.getByTestId('appearance-row'));
      const lightButton = screen.getByTestId('theme-option-light');
      expect(lightButton).toBeDefined();

      fireEvent.press(lightButton);
      expect(onThemeModeChange).toHaveBeenCalledWith('light');

      const darkButton = screen.getByTestId('theme-option-dark');
      expect(darkButton).toBeDefined();

      fireEvent.press(darkButton);
      expect(onThemeModeChange).toHaveBeenCalledWith('dark');
    });
  });
});
