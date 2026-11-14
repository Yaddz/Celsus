import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface CategoriesScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const CategoriesScreen: React.FC<CategoriesScreenProps> = ({
  testID = 'categories-screen',
}) => {
  return <View testID={testID} />;
};
