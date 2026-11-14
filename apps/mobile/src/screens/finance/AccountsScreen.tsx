import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface AccountsScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const AccountsScreen: React.FC<AccountsScreenProps> = ({
  testID = 'accounts-screen',
}) => {
  return <View testID={testID} />;
};
