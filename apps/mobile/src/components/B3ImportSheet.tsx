import React from 'react';
import { View } from 'react-native';

export interface B3ImportSheetProps {
  visible: boolean;
  onClose: () => void;
  isLight?: boolean;
  initialPortfolioId?: string;
  onNavigateToPortfolio?: (portfolioId: string, options?: { openMetas?: boolean }) => void;
}

export function B3ImportSheet(_props: B3ImportSheetProps) {
  return <View testID="b3-import-sheet-stub" />;
}
