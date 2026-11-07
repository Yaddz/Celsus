import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { PricePoint } from '../../domain/finance/assetProfile';

export type ChartRange = '7D' | '30D' | '6M' | '1A' | '5A' | 'MAX';

export interface PriceAreaChartProps {
  points: PricePoint[];
  activeRange: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  themeMode?: 'dark' | 'light';
}

export const PriceAreaChart: React.FC<PriceAreaChartProps> = ({ points, activeRange, onRangeChange }) => {
  const ranges: ChartRange[] = ['7D', '30D', '6M', '1A', '5A', 'MAX'];

  return (
    <View testID="price-area-chart-container">
      <View style={{ flexDirection: 'row' }}>
        {ranges.map((r) => (
          <TouchableOpacity key={r} testID={`range-chip-${r}`} onPress={() => onRangeChange(r)}>
            <Text>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text>Variação 12 meses</Text>
    </View>
  );
};
