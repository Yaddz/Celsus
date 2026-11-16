import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface GoalsScreenProps {
  onBack: () => void;
  onOpenPortfolioTransaction?: (portfolioId: string) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

export const GoalsScreen: React.FC<GoalsScreenProps> = ({
  testID = 'goals-screen',
}) => {
  return <View testID={testID} />;
};
