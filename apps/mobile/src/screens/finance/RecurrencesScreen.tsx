import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface RecurrencesScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const RecurrencesScreen: React.FC<RecurrencesScreenProps> = ({
  testID = 'recurrences-screen',
}) => {
  return <View testID={testID} />;
};
