import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AssetClass } from './AttributeStatBar';

export interface AssetSearchItem {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change24h: number;
}

export interface AssetSearchRowProps {
  item: AssetSearchItem;
  onPress?: (item: AssetSearchItem) => void;
  themeMode?: 'dark' | 'light';
}

export const AssetSearchRow: React.FC<AssetSearchRowProps> = ({ item, onPress }) => {
  return (
    <TouchableOpacity
      testID={`asset-search-row-${item.ticker}`}
      onPress={() => onPress?.(item)}
      style={styles.row}
    >
      <Text>{item.ticker}</Text>
      <Text>{item.name}</Text>
      <Text>{item.price.toFixed(2)}</Text>
      <Text>{item.change24h >= 0 ? `+${item.change24h.toFixed(2)}%` : `${item.change24h.toFixed(2)}%`}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
  },
});
