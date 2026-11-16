import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface NetWorthScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

export const NetWorthScreen: React.FC<NetWorthScreenProps> = ({
  testID = 'net-worth-screen',
}) => {
  return <View testID={testID} />;
};
