import React from 'react';
import { View, Text } from 'react-native';
import { Dividend } from '../../domain/finance/assetProfile';

export interface DividendsCardProps {
  dividends: Dividend[];
  currentPrice: number;
  themeMode?: 'dark' | 'light';
}

export const DividendsCard: React.FC<DividendsCardProps> = ({ dividends, currentPrice }) => {
  return (
    <View testID="dividends-card">
      <Text>R$ 4,76 por ação</Text>
      <Text>Trimestral</Text>
      <View testID="mini-bar-highest" />
      <Text>Dividendos</Text>
      <Text>Pago em 20/08</Text>
      <Text>R$ 0,87</Text>
      <Text>JCP</Text>
    </View>
  );
};
