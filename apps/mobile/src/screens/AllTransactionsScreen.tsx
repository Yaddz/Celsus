import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { ThemeMode } from '../theme/palettes';
import { RecentTransactionItem } from '../components/ui/RecentTransactionsCard';

export interface AllTransactionsScreenProps {
  transactions?: RecentTransactionItem[];
  isPrivacyMode?: boolean;
  onClose?: () => void;
  onSelectTransaction?: (tx: RecentTransactionItem) => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const AllTransactionsScreen: React.FC<AllTransactionsScreenProps> = ({
  testID = 'all-transactions-screen',
  onClose,
}) => {
  return (
    <View testID={testID} style={styles.container}>
      <XpMinimalHeader onBack={onClose} title="Extrato Completo" />
      <Text>Extrato Completo</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
