import React from 'react';
import { View } from 'react-native';
import type { ThemeMode } from '../theme/palettes';

export interface StatementImportSheetProps {
  visible: boolean;
  onClose: () => void;
  initialAccountId?: string;
  onCompleted?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const StatementImportSheet: React.FC<StatementImportSheetProps> = () => {
  return <View />;
};
