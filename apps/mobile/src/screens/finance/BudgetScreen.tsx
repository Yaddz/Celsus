import React from 'react';
import type { ThemeMode } from '../../theme/palettes';

export interface BudgetScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const BudgetScreen: React.FC<BudgetScreenProps> = () => {
  return null;
};
