import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export type FinanceRoute = 'home' | 'entries' | 'recurrences' | 'subscriptions' | 'accounts' | 'categories';

export interface FinanceHomeScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  onNavigate?: (route: FinanceRoute) => void;
  referenceDateIso?: string;
  testID?: string;
}

export const FinanceHomeScreen: React.FC<FinanceHomeScreenProps> = ({
  testID = 'finance-home-screen',
}) => {
  return <View testID={testID} />;
};
