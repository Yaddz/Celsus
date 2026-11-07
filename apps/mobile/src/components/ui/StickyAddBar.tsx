import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AssetClass } from './AttributeStatBar';

export interface StickyAddBarProps {
  walletName: string;
  assetClass: AssetClass;
  targetPercentage: number;
  isAlreadyInWallet?: boolean;
  onAddPress: () => void;
  onWalletSelectPress: () => void;
  themeMode?: 'dark' | 'light';
}

export const StickyAddBar: React.FC<StickyAddBarProps> = ({
  walletName,
  targetPercentage,
  isAlreadyInWallet,
  onAddPress,
  onWalletSelectPress,
}) => {
  return (
    <View testID="sticky-add-bar">
      <TouchableOpacity testID="wallet-selector-chip" onPress={onWalletSelectPress}>
        <Text>Adicionar em {walletName}</Text>
      </TouchableOpacity>
      {isAlreadyInWallet ? (
        <Text>Na carteira · meta {targetPercentage}%</Text>
      ) : null}
      <TouchableOpacity testID="sticky-add-action-btn" onPress={onAddPress}>
        <Text>{isAlreadyInWallet ? 'Ajustar meta' : 'Adicionar à carteira'}</Text>
      </TouchableOpacity>
    </View>
  );
};
