import React from 'react';
import { View, Text } from 'react-native';

export interface IncomeHistoryScreenProps {
  onBack: () => void;
  onOpenB3Import?: () => void;
  initialPortfolioId?: string;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
  bottomOffset?: number;
  testID?: string;
}

export const IncomeHistoryScreen: React.FC<IncomeHistoryScreenProps> = ({
  onBack,
  testID = 'income-history-screen',
}) => {
  return (
    <View testID={testID}>
      <Text>IncomeHistoryScreen Stub</Text>
    </View>
  );
};
