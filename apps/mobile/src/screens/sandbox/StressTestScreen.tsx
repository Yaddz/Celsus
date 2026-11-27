import React from 'react';
import { View } from 'react-native';

export interface StressTestScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

export const StressTestScreen: React.FC<StressTestScreenProps> = () => <View />;
export default StressTestScreen;
