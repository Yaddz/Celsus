import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/tokens';
import { AssetClass } from '../components/ui/AttributeStatBar';

export interface TransactionDetailData {
  id: string;
  ticker: string;
  assetName?: string;
  assetClass?: AssetClass;
  type: 'BUY' | 'SELL';
  tradeDate: string;
  investedAmount: string;
  unitPrice: string;
  quantity: string;
  fees: string;
  portfolioName?: string;
  notes?: string;
}

export interface TransactionHistoryItem {
  id: string;
  tradeDate: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  fees: string;
  notes?: string;
}

export interface TransactionDetailHistoryScreenProps {
  transactionId?: string;
  transaction?: TransactionDetailData;
  history?: TransactionHistoryItem[];
  isPrivacyMode?: boolean;
  onClose?: () => void;
  testID?: string;
}

export const TransactionDetailHistoryScreen: React.FC<TransactionDetailHistoryScreenProps> = ({
  testID = 'transaction-detail-history-screen',
}) => {
  return (
    <View testID={testID} style={styles.container}>
      <Text style={styles.text}>TransactionDetailHistoryScreen Stub</Text>
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
