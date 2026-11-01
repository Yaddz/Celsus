import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  variant?: 'default' | 'v2';
  fillDirection?: 'left-to-right' | 'right-to-left';
  onRebalancePress?: () => void;
  onClassPress?: (assetClass: AssetClass) => void;
  themeMode?: 'dark' | 'light';
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
  variant = 'default',
  fillDirection = 'left-to-right',
  onRebalancePress,
  onClassPress,
  themeMode = 'dark',
}) => {
  const isV2 = variant === 'v2';
  const isLight = themeMode === 'light';

  return (
    <View style={[styles.card, isLight && styles.cardLight]} testID={testID}>
      {/* Topo do Card com Botão Rebalancear (v2) ou Saldo Consolidado (padrão) */}
      <View style={[styles.header, isLight && styles.headerLight]}>
        <View>
          <Text style={[styles.title, isLight && styles.titleLight]}>ALOCAÇÃO POR CATEGORIA</Text>
          {!isV2 && (
            <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>Matriz de Pontos • 4 Classes Reais</Text>
          )}
        </View>

        {isV2 ? (
          <TouchableOpacity
            testID="card-rebalance-button"
            style={styles.rebalanceButton}
            onPress={onRebalancePress}
            activeOpacity={0.8}
          >
            <Text style={styles.rebalanceButtonText}>Rebalancear</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.balanceBadge, isLight && styles.balanceBadgeLight]} testID="card-header-total-balance">
            <Text style={styles.balanceText}>
              {isPrivacyMode ? 'R$ ••••••••' : totalBalance}
            </Text>
          </View>
        )}
      </View>

      {/* Grade de Matriz de Pontos para cada uma das 4 Classes */}
      <View style={styles.barsContainer}>
        {allocations.map((item) => (
          <AttributeStatBar
            key={item.assetClass}
            assetClass={item.assetClass}
            currentPercentage={item.currentPercentage}
            targetPercentage={item.targetPercentage}
            marketValue={item.marketValue}
            variant={variant}
            fillDirection={fillDirection}
            onPress={onClassPress}
            isPrivacyMode={isPrivacyMode}
            themeMode={themeMode}
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
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowColor: '#111315',
    shadowOpacity: 0.08,
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
  headerLight: {
    borderBottomColor: '#EAE4D7',
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 1.1,
  },
  titleLight: {
    color: '#111315',
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  subtitleLight: {
    color: '#6F6A5A',
  },
  balanceBadge: {
    backgroundColor: '#111315',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  balanceBadgeLight: {
    backgroundColor: '#F4F1EA',
    borderColor: '#EAE4D7',
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  rebalanceButton: {
    backgroundColor: '#D5CAA8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rebalanceButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#111315',
    letterSpacing: 0.5,
  },
  barsContainer: {
    gap: spacing.sm,
  },
});

export default DotMatrixAllocationCard;
