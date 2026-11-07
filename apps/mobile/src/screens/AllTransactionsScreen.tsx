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
import { TransactionRow } from '../components/ui/TransactionRow';
import { colors, typography, spacing, borders, layout, space } from '../theme/tokens';

export interface AllTransactionsScreenProps {
  transactions?: RecentTransactionItem[];
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onClose?: () => void;
  onBack?: () => void;
  onSelectTransaction?: (tx: RecentTransactionItem) => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const AllTransactionsScreen: React.FC<AllTransactionsScreenProps> = ({
  transactions = [],
  isPrivacyMode = false,
  onTogglePrivacy,
  onClose,
  onBack,
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
        onBack={onBack || onClose}
        onTogglePrivacy={onTogglePrivacy}
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
            filteredList.map((tx, idx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                testID={`all-tx-row-${tx.ticker}`}
                isLast={idx === filteredList.length - 1}
                themeMode={themeMode}
                isPrivacyMode={isPrivacyMode}
                onPress={onSelectTransaction}
              />
            ))
          )}
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
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
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
  // Mesma superfície do card "Movimentações recentes" da Home.
  card: {
    backgroundColor: '#1C1E20',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
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
