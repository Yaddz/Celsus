import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders, layout, space } from '../../theme/tokens';
import { AssetClass } from './AttributeStatBar';
import { Skeleton, SkeletonSwap } from './Skeleton';
import { TransactionRow } from './TransactionRow';

export interface RecentTransactionItem {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  type: 'BUY' | 'SELL';
  dateText: string;
  amountText: string;
  unitPrice?: string;
  quantity?: string;
  fees?: string;
  assetName?: string;
}

export interface RecentTransactionsCardProps {
  transactions: RecentTransactionItem[];
  onViewAll?: () => void;
  onSelectTransaction?: (tx: RecentTransactionItem) => void;
  /** Mostra linhas em esqueleto (mesmas dimensões) enquanto a carteira carrega. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

/** Linhas de esqueleto exibidas enquanto carrega (a lista real mostra até 5). */
const RECENT_SKELETON_ROWS = 3;

const RecentTransactionsCardBase: React.FC<RecentTransactionsCardProps> = ({
  transactions,
  onViewAll = () => {},
  onSelectTransaction,
  loading = false,
  style,
  testID,
  themeMode = 'dark',
}) => {
  const isLight = themeMode === 'light';

  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Cabeçalho */}
      <View style={styles.headerRow}>
        <Text style={[styles.titleText, isLight && styles.titleTextLight]}>
          Movimentações Recentes
        </Text>
        <TouchableOpacity
          testID="recent-tx-view-all-btn"
          activeOpacity={0.7}
          onPress={onViewAll}
          style={styles.viewAllBtn}
        >
          <Text style={[styles.viewAllText, isLight && styles.viewAllTextLight]}>Ver tudo</Text>
          <MaterialIcons name="chevron-right" size={16} color={isLight ? colors.primary : colors.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Card de Transações estilo WalleZ */}
      <SkeletonSwap
        loading={loading}
        skeleton={
          <View style={[styles.card, isLight && styles.cardLight]} testID="recent-tx-skeleton">
            {Array.from({ length: RECENT_SKELETON_ROWS }).map((_, i) => (
              <View key={i} style={styles.txRow}>
                <Skeleton width={44} height={44} radius={22} themeMode={themeMode} style={{ marginRight: spacing.sm + 4 }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="42%" height={14} themeMode={themeMode} />
                  <Skeleton width="30%" height={10} themeMode={themeMode} />
                </View>
                <Skeleton width={72} height={14} themeMode={themeMode} />
              </View>
            ))}
          </View>
        }
      >
      <View style={[styles.card, isLight && styles.cardLight]}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={32} color={isLight ? '#A09D96' : '#55585C'} />
            <Text style={[styles.emptyText, isLight && styles.subTextLight]}>
              Nenhuma movimentação recente registrada
            </Text>
          </View>
        ) : (
          transactions.map((tx, idx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              testID={`recent-tx-row-${tx.ticker}`}
              isLast={idx === transactions.length - 1}
              themeMode={themeMode}
              onPress={onSelectTransaction}
            />
          ))
        )}
      </View>
      </SkeletonSwap>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: layout.sectionGap - space.sm,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
    paddingHorizontal: 4,
  },
  titleText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.tertiary,
    fontWeight: '700',
  },
  // Lista plana: sem superfície, itens separados por linhas finas.
  card: {
    backgroundColor: '#1C1E20',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: '#8A8A8E',
    textAlign: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md - 2,
  },
  titleTextLight: {
    color: '#6E6A63',
  },
  viewAllTextLight: {
    color: colors.primary,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
  },
  subTextLight: {
    color: '#6E6A63',
  },
});

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const RecentTransactionsCard = React.memo(RecentTransactionsCardBase);

export default RecentTransactionsCard;
