import React from 'react';
import { View } from 'react-native';

export interface CompareScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

export const CompareScreen: React.FC<CompareScreenProps> = () => <View />;
export default CompareScreen;
