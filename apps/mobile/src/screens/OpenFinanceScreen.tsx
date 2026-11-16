import React from 'react';
import { View } from 'react-native';
import { ThemeMode } from '../theme/palettes';
import { PluggyClient } from '../services/pluggy/pluggyClient';

export interface OpenFinanceScreenProps {
  onClose?: () => void;
  themeMode?: ThemeMode;
  client?: PluggyClient;
  testID?: string;
}

export const OpenFinanceScreen: React.FC<OpenFinanceScreenProps> = ({
  testID = 'open-finance-screen',
}) => {
  return <View testID={testID} />;
};

export default OpenFinanceScreen;
