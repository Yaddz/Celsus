import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { XpMinimalHeader } from '../XpMinimalHeader';
import { PORTFOLIO_PALETTES } from '../../../theme/palettes';

describe('S8-T03: TestXpMinimalHeaderAvatarGlobeAndEye', () => {
  const defaultProps = {
    userName: 'Pedro',
    userInitials: 'PL',
    isPrivacyModeEnabled: false,
    onAvatarPress: jest.fn(),
    onGlobePress: jest.fn(),
    onTogglePrivacy: jest.fn(),
    palette: PORTFOLIO_PALETTES.classic,
    themeMode: 'dark' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Avatar on Left Side (Settings Trigger)', () => {
    it('should render user avatar with initials and user name', async () => {
      await render(
        <XpMinimalHeader {...defaultProps} testID="xp-minimal-header" />
      );

      expect(screen.getByTestId('xp-minimal-header')).toBeDefined();
      expect(screen.getByText('PL')).toBeDefined();
      expect(screen.getByText('Pedro')).toBeDefined();
    });

    it('should trigger onAvatarPress when user taps the avatar button', async () => {
      const onAvatarPress = jest.fn();
      await render(
        <XpMinimalHeader {...defaultProps} onAvatarPress={onAvatarPress} />
      );

      const avatarButton = screen.getByTestId('header-avatar-button');
      expect(avatarButton).toBeDefined();

      fireEvent.press(avatarButton);
      expect(onAvatarPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Globe Placeholder Action on Right Side', () => {
    it('should render the globe placeholder button and trigger onGlobePress', async () => {
      const onGlobePress = jest.fn();
      await render(
        <XpMinimalHeader {...defaultProps} onGlobePress={onGlobePress} />
      );

      const globeButton = screen.getByTestId('header-globe-button');
      expect(globeButton).toBeDefined();

      fireEvent.press(globeButton);
      expect(onGlobePress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Eye Privacy Mode Action on Right Side', () => {
    it('should render eye button with open visibility icon when privacy is disabled', async () => {
      await render(
        <XpMinimalHeader {...defaultProps} isPrivacyModeEnabled={false} />
      );

      const privacyButton = screen.getByTestId('header-privacy-button');
      expect(privacyButton).toBeDefined();

      const icon = screen.getByTestId('privacy-icon-visibility');
      expect(icon).toBeDefined();
    });

    it('should render eye button with crossed visibility-off icon when privacy is enabled', async () => {
      await render(
        <XpMinimalHeader {...defaultProps} isPrivacyModeEnabled={true} />
      );

      const privacyButton = screen.getByTestId('header-privacy-button');
      expect(privacyButton).toBeDefined();

      const icon = screen.getByTestId('privacy-icon-visibility-off');
      expect(icon).toBeDefined();
    });

    it('should trigger onTogglePrivacy when user taps the eye button', async () => {
      const onTogglePrivacy = jest.fn();
      await render(
        <XpMinimalHeader {...defaultProps} onTogglePrivacy={onTogglePrivacy} />
      );

      const privacyButton = screen.getByTestId('header-privacy-button');
      fireEvent.press(privacyButton);
      expect(onTogglePrivacy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dynamic Palette and Theme Mode Integration', () => {
    it('should render smoothly when receiving custom active wallet palette and light theme', async () => {
      const harborPalette = PORTFOLIO_PALETTES.harbor;
      await render(
        <XpMinimalHeader
          {...defaultProps}
          palette={harborPalette}
          themeMode="light"
          testID="xp-header-harbor"
        />
      );

      expect(screen.getByTestId('xp-header-harbor')).toBeDefined();
    });
  });
});
