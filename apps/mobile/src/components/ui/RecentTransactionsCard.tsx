import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from '../../theme/tokens';
import { AssetClass, ASSET_CLASS_ATTRIBUTE_MAP } from './AttributeStatBar';

export interface RecentTransactionItem {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  type: 'BUY' | 'SELL';
  dateText: string;
  amountText: string;
}

export interface RecentTransactionsCardProps {
  transactions: RecentTransactionItem[];
  onViewAll?: () => void;
  onSelectTransaction?: (tx: RecentTransactionItem) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

const CATEGORY_MATERIAL_ICONS: Record<AssetClass, keyof typeof MaterialIcons.glyphMap> = {
  FIXED_INCOME: 'account-balance',
  FII: 'apartment',
  STOCK: 'trending-up',
  CRYPTO: 'currency-bitcoin',
};

export const RecentTransactionsCard: React.FC<RecentTransactionsCardProps> = ({
  transactions,
  onViewAll = () => {},
  onSelectTransaction,
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
      <View style={[styles.card, isLight && styles.cardLight]}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={32} color={isLight ? '#A09D96' : '#55585C'} />
            <Text style={[styles.emptyText, isLight && styles.subTextLight]}>
              Nenhuma movimentação recente registrada
            </Text>
          </View>
        ) : (
          transactions.map((tx, idx) => {
            const config = ASSET_CLASS_ATTRIBUTE_MAP[tx.assetClass] || {
              color: colors.primary,
              label: 'Ativo',
            };
            const iconName = CATEGORY_MATERIAL_ICONS[tx.assetClass] || 'trending-up';
            const isBuy = tx.type === 'BUY';
            const isLast = idx === transactions.length - 1;

            return (
              <TouchableOpacity
                key={tx.id}
                testID={`recent-tx-row-${tx.ticker}`}
                activeOpacity={0.7}
                onPress={() => onSelectTransaction?.(tx)}
                style={[
                  styles.txRow,
                  !isLast && (isLight ? styles.txBorderBottomLight : styles.txBorderBottom),
                ]}
              >
                {/* Avatar Circular 44x44 com cor e ícone da categoria */}
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: config.color },
                  ]}
                >
                  <MaterialIcons
                    name={iconName}
                    size={21}
                    color="#111315"
                    style={styles.iconGlyph}
                  />
                </View>

                {/* Detalhes Centrais */}
                <View style={styles.centerCol}>
                  <Text style={[styles.tickerText, isLight && styles.tickerTextLight]}>
                    {tx.ticker}
                  </Text>
                  <Text style={[styles.subText, isLight && styles.subTextLight]}>
                    {tx.dateText} • {isBuy ? 'Compra' : 'Venda'}
                  </Text>
                </View>

                {/* Valor à Direita */}
                <View style={styles.rightCol}>
                  <Text
                    style={[
                      styles.amountText,
                      isBuy
                        ? (isLight ? styles.amountPositiveLight : styles.amountPositive)
                        : (isLight ? styles.amountNegativeLight : styles.amountNegative),
                    ]}
                  >
                    {isBuy ? `+${tx.amountText}` : `-${tx.amountText}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
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
    fontSize: typography.headlineSm.fontSize - 2,
    fontWeight: '700',
    color: colors.parchmentPale,
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
  card: {
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    paddingHorizontal: spacing.md,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
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
  txBorderBottom: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 4,
  },
  centerCol: {
    flex: 1,
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  subText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 2,
  },
  rightCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    fontWeight: '700',
  },
  amountPositive: {
    color: '#AECDC5',
  },
  amountNegative: {
    color: colors.primary,
  },
  titleTextLight: {
    color: '#111315',
  },
  viewAllTextLight: {
    color: colors.primary,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowOpacity: 0.08,
    elevation: 2,
  },
  txBorderBottomLight: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#F0EBE1',
  },
  tickerTextLight: {
    color: '#111315',
  },
  subTextLight: {
    color: '#6E6A63',
  },
  amountPositiveLight: {
    color: '#1D6F5B',
  },
  amountNegativeLight: {
    color: '#C24D18',
  },
  iconGlyph: {
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});

export default RecentTransactionsCard;
