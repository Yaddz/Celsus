import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/tokens';
import { AssetClass } from '../components/ui/AttributeStatBar';

export interface ClassAssetDetailItem {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currentAllocationPercentage: number;
  grossBalance: string;
  quantity: string;
  averagePrice: string;
  currentPrice: string;
  profitabilityPercentage: string;
  profitabilityAmount?: string;
  sliceColor?: string;
}

export interface ClassDetailScreenProps {
  assetClass?: AssetClass;
  className?: string;
  portfolioId?: string;
  assets?: ClassAssetDetailItem[];
  isPrivacyMode?: boolean;
  onClose?: () => void;
  onAssetPress?: (assetId: string) => void;
  testID?: string;
}

export const DONUT_SLICE_COLORS = [
  '#DB5A42',
  '#F1CA78',
  '#EDE8B8',
  '#72743D',
  '#D1DDF7',
  '#EF9F43',
  '#4A525D',
  '#AC4B25',
];

export const ClassDetailScreen: React.FC<ClassDetailScreenProps> = ({
  testID = 'class-detail-screen',
}) => {
  return (
    <View testID={testID} style={styles.container}>
      <Text style={styles.text}>ClassDetailScreen Stub</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  text: {
    color: colors.parchmentPale,
  },
});
