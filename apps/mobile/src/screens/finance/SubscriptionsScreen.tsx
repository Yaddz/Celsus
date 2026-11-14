import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface SubscriptionsScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({
  testID = 'subscriptions-screen',
}) => {
  return <View testID={testID} />;
};
