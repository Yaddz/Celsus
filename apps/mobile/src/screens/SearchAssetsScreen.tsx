import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export interface SearchAssetsScreenProps {
  onSelectAsset: (ticker: string) => void;
  onProfilePress?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
}

export const SearchAssetsScreen: React.FC<SearchAssetsScreenProps> = ({
  onSelectAsset,
}) => {
  return (
    <View testID="search-assets-screen">
      <Text>Pesquisa de Ativos</Text>
      <TouchableOpacity testID="shortcut-tile-dividends" onPress={() => {}}>
        <Text>Maiores dividendos</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="shortcut-tile-gainers" onPress={() => {}}>
        <Text>Maiores altas</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="recent-chip-PETR4" onPress={() => onSelectAsset('PETR4')}>
        <Text>PETR4</Text>
      </TouchableOpacity>
    </View>
  );
};
