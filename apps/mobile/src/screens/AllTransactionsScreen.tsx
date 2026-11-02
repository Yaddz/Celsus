import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { ThemeMode } from '../theme/palettes';
import { RecentTransactionItem } from '../components/ui/RecentTransactionsCard';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { ASSET_CLASS_ATTRIBUTE_MAP, AssetClass } from '../components/ui/AttributeStatBar';

export interface AllTransactionsScreenProps {
  transactions?: RecentTransactionItem[];
  isPrivacyMode?: boolean;
  onClose?: () => void;
  onSelectTransaction?: (tx: RecentTransactionItem) => void;
  themeMode?: ThemeMode;
  testID?: string;
}

const CATEGORY_ICONS: Record<AssetClass, keyof typeof MaterialIcons.glyphMap> = {
  FIXED_INCOME: 'account-balance',
  FII: 'apartment',
  STOCK: 'trending-up',
  CRYPTO: 'currency-bitcoin',
};

export const AllTransactionsScreen: React.FC<AllTransactionsScreenProps> = ({
  transactions = [],
  isPrivacyMode = false,
  onClose,
  onSelectTransaction,
  themeMode = 'dark',
  testID = 'all-transactions-screen',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const txList = transactions || [];
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const filteredList = txList.filter((tx) => {
    if (filterType === 'ALL') return true;
    return tx.type === filterType;
  });

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* Header Minimalista XP com Voltar */}
      <XpMinimalHeader
        onBack={onClose}
        title="Extrato Completo"
        subtitle={`${txList.length} ${txList.length === 1 ? 'movimentação' : 'movimentações'}`}
        isPrivacyModeEnabled={isPrivacyMode}
        themeMode={themeMode}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 60 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Filtros rápidos: Todos, Compras, Vendas */}
        <View style={styles.filterRow}>
          {(['ALL', 'BUY', 'SELL'] as const).map((ft) => {
            const isActive = filterType === ft;
            const label = ft === 'ALL' ? 'Todas' : ft === 'BUY' ? 'Compras' : 'Vendas';
            return (
              <TouchableOpacity
                key={ft}
                testID={`filter-tx-${ft.toLowerCase()}`}
                activeOpacity={0.75}
                onPress={() => setFilterType(ft)}
                style={[
                  styles.filterPill,
                  isLight && styles.filterPillLight,
                  isActive && (isLight ? styles.filterPillActiveLight : styles.filterPillActive),
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    isLight && styles.filterTextLight,
                    isActive && styles.filterTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Lista de Transações */}
        <View style={[styles.card, isLight && styles.cardLight]}>
          {filteredList.length === 0 ? (
            <View testID="all-transactions-empty" style={styles.emptyContainer}>
              <MaterialIcons name="receipt-long" size={32} color={isLight ? '#999' : '#555'} />
              <Text style={[styles.emptyTitle, isLight && styles.emptyTitleLight]}>
                Nenhuma movimentação registrada
              </Text>
              <Text style={[styles.emptySubtitle, isLight && styles.emptySubtitleLight]}>
                Suas operações cadastradas aparecerão listadas aqui.
              </Text>
            </View>
          ) : (
            filteredList.map((tx, idx) => {
            const config = ASSET_CLASS_ATTRIBUTE_MAP[tx.assetClass] || {
              color: colors.primary,
              name: 'Ativo',
            };
            const iconName = CATEGORY_ICONS[tx.assetClass] || 'trending-up';
            const isBuy = tx.type === 'BUY';
            const isLast = idx === filteredList.length - 1;
            const displayAmount = isPrivacyMode ? 'R$ ••••••' : tx.amountText;

            return (
              <TouchableOpacity
                key={tx.id}
                testID={`all-tx-row-${tx.ticker}`}
                activeOpacity={0.7}
                onPress={() => onSelectTransaction?.(tx)}
                style={[
                  styles.txRow,
                  !isLast && (isLight ? styles.txBorderBottomLight : styles.txBorderBottom),
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: config.color }]}>
                  <MaterialIcons name={iconName} size={20} color="#111315" />
                </View>

                <View style={styles.txInfo}>
                  <View style={styles.topRow}>
                    <Text style={[styles.tickerText, isLight && styles.tickerTextLight]}>
                      {tx.ticker}
                    </Text>
                    <Text
                      style={[
                        styles.amountText,
                        isLight && styles.amountTextLight,
                        { color: isBuy ? (isLight ? '#2E4A44' : colors.tertiary) : colors.deficit },
                      ]}
                    >
                      {displayAmount}
                    </Text>
                  </View>

                  <View style={styles.bottomRow}>
                    <Text style={[styles.dateText, isLight && styles.dateTextLight]}>
                      {tx.dateText}
                    </Text>
                    <View
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: isBuy
                            ? (isLight ? '#E5F3EE' : '#1D2E28')
                            : (isLight ? '#FCEBEA' : '#331C18'),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          { color: isBuy ? (isLight ? '#2E4A44' : colors.tertiary) : colors.deficit },
                        ]}
                      >
                        {isBuy ? 'Compra' : 'Venda'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borders.radiusFull,
    backgroundColor: colors.neutral,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  filterPillLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillActiveLight: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.parchmentPale,
  },
  filterTextLight: {
    color: '#6E6A63',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    paddingHorizontal: 16,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  txBorderBottom: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  txBorderBottomLight: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#F0ECE1',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  tickerTextLight: {
    color: '#111315',
  },
  amountText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  amountTextLight: {},
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8A8E',
  },
  dateTextLight: {
    color: '#8A8A8E',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    textAlign: 'center',
  },
  emptyTitleLight: {
    color: '#111315',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8C90',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptySubtitleLight: {
    color: '#6E6A63',
  },
});
