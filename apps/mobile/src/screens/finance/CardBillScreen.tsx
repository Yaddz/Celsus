import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../../theme/palettes';

export interface CardBillScreenProps {
  accountId: string;
  initialBillMonth?: string;
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const CardBillScreen: React.FC<CardBillScreenProps> = () => {
  return <View testID="card-bill-screen-stub" />;
};
