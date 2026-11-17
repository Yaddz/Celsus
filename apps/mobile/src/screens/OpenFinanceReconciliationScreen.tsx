import React from 'react';
import { View } from 'react-native';
import type { PluggyClient } from '../services/pluggy/pluggyClient';
import type { ThemeMode } from '../theme/palettes';

export interface OpenFinanceReconciliationScreenProps {
  onClose?: () => void;
  themeMode?: ThemeMode;
  client?: PluggyClient;
  onCopyReport?: (text: string) => void | Promise<void>;
  now?: () => Date;
  testID?: string;
}

export const OpenFinanceReconciliationScreen: React.FC<
  OpenFinanceReconciliationScreenProps
> = ({ testID = 'of-reconciliation-screen' }) => {
  return <View testID={testID} />;
};

export default OpenFinanceReconciliationScreen;
