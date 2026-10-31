import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';
import { AttributeStatBar, AssetClass } from './AttributeStatBar';

export interface CategoryAllocationData {
  assetClass: AssetClass;
  currentPercentage: number;
  targetPercentage: number;
  marketValue?: string;
}

export interface DotMatrixAllocationCardProps {
  totalBalance?: string;
  allocations?: CategoryAllocationData[];
  isPrivacyMode?: boolean;
  testID?: string;
}

const DEFAULT_ALLOCATIONS: CategoryAllocationData[] = [
  { assetClass: 'FIXED_INCOME', currentPercentage: 32.0, targetPercentage: 30.0, marketValue: '10.389,76' },
  { assetClass: 'FII', currentPercentage: 24.5, targetPercentage: 25.0, marketValue: '7.954,66' },
  { assetClass: 'STOCK', currentPercentage: 33.5, targetPercentage: 35.0, marketValue: '10.876,78' },
  { assetClass: 'CRYPTO', currentPercentage: 10.0, targetPercentage: 10.0, marketValue: '3.246,80' },
];

export const DotMatrixAllocationCard: React.FC<DotMatrixAllocationCardProps> = ({
  totalBalance = 'R$ 32.468,00',
  allocations = DEFAULT_ALLOCATIONS,
  isPrivacyMode = false,
  testID,
}) => {
  return (
    <View style={styles.card} testID={testID}>
      {/* Topo do Card com Saldo Total Consolidado */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ALOCAÇÃO POR CATEGORIA</Text>
          <Text style={styles.subtitle}>Matriz de Pontos • 4 Classes Reais</Text>
        </View>
        <View style={styles.balanceBadge}>
          <Text style={styles.balanceText}>
            {isPrivacyMode ? 'R$ ••••••••' : totalBalance}
          </Text>
        </View>
      </View>

      {/* Grade de Matriz de Pontos para cada uma das 4 Classes */}
      <View style={styles.barsContainer}>
        {allocations.map((item) => (
          <AttributeStatBar
            key={item.assetClass}
            assetClass={item.assetClass}
            currentPercentage={item.currentPercentage}
            targetPercentage={item.targetPercentage}
            testID={`allocation-stat-${item.assetClass.toLowerCase()}`}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    padding: spacing.md,
    marginVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#25282B',
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 1.1,
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: '#111315',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  barsContainer: {
    gap: spacing.sm,
  },
});

export default DotMatrixAllocationCard;
