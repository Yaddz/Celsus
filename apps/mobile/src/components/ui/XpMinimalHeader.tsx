import React from 'react';
import { View } from 'react-native';
import { PortfolioPalette, ThemeMode } from '../../theme/palettes';

export interface XpMinimalHeaderProps {
  userName?: string;
  userInitials?: string;
  isPrivacyModeEnabled?: boolean;
  onAvatarPress?: () => void;
  onGlobePress?: () => void;
  onTogglePrivacy?: () => void;
  palette?: PortfolioPalette;
  themeMode?: ThemeMode;
  testID?: string;
}

export const XpMinimalHeader: React.FC<XpMinimalHeaderProps> = () => {
  // Stub: to be implemented in Phase B
  return null;
};
