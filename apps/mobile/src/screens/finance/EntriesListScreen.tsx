import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface EntriesListScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

export const EntriesListScreen: React.FC<EntriesListScreenProps> = ({
  testID = 'entries-list-screen',
}) => {
  return <View testID={testID} />;
};
