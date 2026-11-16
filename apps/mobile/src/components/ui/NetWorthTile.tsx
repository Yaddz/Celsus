import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BentoTile } from './BentoGrid';
import { SkeletonSwap, SkeletonTile } from './Skeleton';
import type { NetWorthSnapshot } from '../../db/schema';
import type { NetWorthResult } from '../../domain/finance/goal';
import { formatCentsBRL } from '../../domain/financeFlow';
import type { ThemeMode } from '../../theme/palettes';
import { typography } from '../../theme/tokens';

export interface NetWorthTileProps {
  netWorth: NetWorthResult;
  snapshots?: NetWorthSnapshot[];
  isPrivacyMode?: boolean;
  loading?: boolean;
  onPress?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

const MASK = 'R$ ••••••';

export const NetWorthTile: React.FC<NetWorthTileProps> = ({
  netWorth,
  snapshots = [],
  isPrivacyMode = false,
  loading = false,
  onPress,
  themeMode = 'dark',
  testID = 'home-net-worth-tile',
}) => {
  const isLight = themeMode === 'light';
  const showCents = (cents: number) => (isPrivacyMode ? MASK : formatCentsBRL(cents));
  const lastSnap = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const deltaCents = lastSnap ? netWorth.totalCents - lastSnap.total_cents : null;

  return (
    <SkeletonSwap
      loading={loading}
      skeleton={<SkeletonTile height={118} testID={`${testID}-skeleton`} />}
    >
      <BentoTile
        variant={isLight ? 'light' : 'dark'}
        title="Patrimônio líquido"
        onPress={onPress}
        testID={testID}
      >
        <View style={styles.headerRow}>
          <Text
            testID={`${testID}-total`}
            style={[
              styles.totalText,
              { color: isLight ? '#14171A' : '#FFFFFF' },
            ]}
          >
            {showCents(netWorth.totalCents)}
          </Text>
          {deltaCents !== null && !isPrivacyMode ? (
            <Text
              style={[
                styles.deltaText,
                { color: deltaCents >= 0 ? '#4F9A65' : '#D96628' },
              ]}
            >
              {deltaCents >= 0 ? '+' : ''}
              {formatCentsBRL(deltaCents)}
            </Text>
          ) : null}
        </View>
        <View style={styles.compRow}>
          <Text style={[styles.compItem, { color: isLight ? '#5B626A' : '#9AA0A6' }]}>
            Contas {showCents(netWorth.accountsCents)}
          </Text>
          <Text style={[styles.compItem, { color: isLight ? '#5B626A' : '#9AA0A6' }]}>
            Invest. {showCents(netWorth.investmentsCents)}
          </Text>
          <Text style={[styles.compItem, { color: isLight ? '#5B626A' : '#9AA0A6' }]}>
            Cartão -{showCents(netWorth.cardDebtCents)}
          </Text>
        </View>
      </BentoTile>
    </SkeletonSwap>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  totalText: {
    fontFamily: typography.fontFamily,
    fontSize: 24,
    fontWeight: '700',
  },
  deltaText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  compRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  compItem: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
});
