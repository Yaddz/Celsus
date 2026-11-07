import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { RankingItem } from '../../domain/finance/assetProfile';

export interface RankingTableProps {
  items: RankingItem[];
  sortBy?: 'dy' | 'pvp' | 'change' | 'price' | 'ticker';
  sortDir?: 'asc' | 'desc';
  onSortChange?: (by: 'dy' | 'pvp' | 'change' | 'price' | 'ticker') => void;
  onRowPress?: (ticker: string) => void;
  themeMode?: 'dark' | 'light';
}

export const RankingTable: React.FC<RankingTableProps> = ({
  items,
  onSortChange,
  onRowPress,
}) => {
  return (
    <View testID="ranking-table">
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity testID="ranking-header-ticker" onPress={() => onSortChange?.('ticker')}>
          <Text>Ativo</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="ranking-header-price" onPress={() => onSortChange?.('price')}>
          <Text>Preço</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="ranking-header-dy" onPress={() => onSortChange?.('dy')}>
          <Text>DY 12M</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="ranking-header-pvp" onPress={() => onSortChange?.('pvp')}>
          <Text>P/VP</Text>
        </TouchableOpacity>
      </View>
      {items.map((it) => (
        <TouchableOpacity
          key={it.ticker}
          testID={`ranking-row-${it.ticker}`}
          onPress={() => onRowPress?.(it.ticker)}
          style={{ flexDirection: 'row' }}
        >
          <Text>{it.ticker}</Text>
          <Text>{it.price.toFixed(2).replace('.', ',')}</Text>
          <Text>{it.dy12m != null ? `${it.dy12m.toFixed(1).replace('.', ',')}%` : '—'}</Text>
          <Text>{it.pvp != null ? it.pvp.toFixed(2).replace('.', ',') : '—'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
