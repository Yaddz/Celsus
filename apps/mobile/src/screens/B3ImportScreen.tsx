import React from 'react';
import { View, Text } from 'react-native';

export interface B3ImportScreenProps {
  onBack: () => void;
  onNavigateToPortfolio?: (portfolioId: string) => void;
  initialPortfolioId?: string;
  bottomOffset?: number;
}

export function B3ImportScreen(props: B3ImportScreenProps) {
  return (
    <View testID="b3-import-screen">
      <Text>Importar extrato da B3</Text>
    </View>
  );
}
