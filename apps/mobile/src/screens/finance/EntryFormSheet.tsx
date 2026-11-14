import React from 'react';
import { View } from 'react-native';
import type { FinEntry } from '../../db/schema';
import type { InstallmentScope } from '../../domain/financeFlow';
import type { ThemeMode } from '../../theme/palettes';

export interface EntryFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editingEntry?: FinEntry | null;
  installmentScope?: InstallmentScope;
  themeMode?: ThemeMode;
  testID?: string;
}

export const EntryFormSheet: React.FC<EntryFormSheetProps> = ({
  visible,
  testID = 'entry-form-sheet',
}) => {
  if (!visible) return null;
  return <View testID={testID} />;
};
