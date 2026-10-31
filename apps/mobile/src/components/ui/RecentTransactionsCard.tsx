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
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CATEGORY_MATERIAL_ICONS: Record<AssetClass, keyof typeof MaterialIcons.glyphMap> = {
  FIXED_INCOME: 'account-balance',
  FII: 'domain',
  STOCK: 'trending-up',
  CRYPTO: 'currency-bitcoin',
};

export const RecentTransactionsCard: React.FC<RecentTransactionsCardProps> = ({
  transactions,
  onViewAll = () => {},
  style,
  testID,
}) => {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Cabeçalho */}
      <View style={styles.headerRow}>
        <Text style={styles.titleText}>Movimentações Recentes</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={onViewAll} style={styles.viewAllBtn}>
          <Text style={styles.viewAllText}>Ver tudo</Text>
          <MaterialIcons name="chevron-right" size={16} color={colors.tertiary} />
        </TouchableOpacity>
      </View>

      {/* Card de Transações estilo WalleZ */}
      <View style={styles.card}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={32} color="#55585C" />
            <Text style={styles.emptyText}>Nenhuma movimentação recente registrada</Text>
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
              <View
                key={tx.id}
                style={[styles.txRow, !isLast && styles.txBorderBottom]}
              >
                {/* Avatar Circular 44x44 com cor e ícone da categoria */}
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: config.color },
                  ]}
                >
                  <MaterialIcons name={iconName} size={22} color={colors.voidFloor} />
                </View>

                {/* Detalhes Centrais */}
                <View style={styles.centerCol}>
                  <Text style={styles.tickerText}>{tx.ticker}</Text>
                  <Text style={styles.subText}>
                    {tx.dateText} • {isBuy ? 'Compra' : 'Venda'}
                  </Text>
                </View>

                {/* Valor à Direita */}
                <View style={styles.rightCol}>
                  <Text
                    style={[
                      styles.amountText,
                      isBuy ? styles.amountPositive : styles.amountNegative,
                    ]}
                  >
                    {isBuy ? `+${tx.amountText}` : `-${tx.amountText}`}
                  </Text>
                </View>
              </View>
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
});

export default RecentTransactionsCard;
