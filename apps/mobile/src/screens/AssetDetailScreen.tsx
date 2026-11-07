import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AssetClass } from '../components/ui/AttributeStatBar';

export interface AssetDetailScreenProps {
  ticker: string;
  onBack: () => void;
  onAddAsset?: (prefill: { ticker: string; name: string; assetClass: AssetClass; price: string }) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
}

export const AssetDetailScreen: React.FC<AssetDetailScreenProps> = ({
  ticker,
  onBack,
  onAddAsset,
}) => {
  return (
    <View testID="asset-detail-screen">
      <TouchableOpacity testID="header-back-button" onPress={onBack}>
        <Text>Voltar</Text>
      </TouchableOpacity>
      <Text testID="asset-detail-ticker">{ticker}</Text>
      <TouchableOpacity
        testID="sticky-add-action-btn"
        onPress={() =>
          onAddAsset?.({
            ticker,
            name: `${ticker} Name`,
            assetClass: 'STOCK',
            price: '38.42',
          })
        }
      >
        <Text>Adicionar à carteira</Text>
      </TouchableOpacity>
    </View>
  );
};
