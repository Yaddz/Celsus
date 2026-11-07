import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { RankingItem } from '../../domain/finance/assetProfile';
import { colors, typography, borders } from '../../theme/tokens';

export interface RankingTableProps {
  items: RankingItem[];
  sortBy?: 'dy' | 'pvp' | 'change' | 'price' | 'ticker';
  sortDir?: 'asc' | 'desc';
  onSortChange?: (by: 'dy' | 'pvp' | 'change' | 'price' | 'ticker') => void;
  onRowPress?: (ticker: string) => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const RankingTable: React.FC<RankingTableProps> = ({
  items = [],
  sortBy = 'dy',
  sortDir = 'desc',
  onSortChange,
  onRowPress,
  themeMode = 'dark',
  testID = 'ranking-table',
}) => {
  const isLight = themeMode === 'light';
  const cardBg = isLight ? '#FFFFFF' : '#1A1D21';
  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  const renderSortIndicator = (col: 'dy' | 'pvp' | 'change' | 'price' | 'ticker') => {
    if (sortBy === col) {
      return (
        <MaterialIcons
          name={sortDir === 'asc' ? 'arrow-upward' : 'arrow-downward'}
          size={12}
          color={colors.primary}
        />
      );
    }
    return <Text style={[styles.sortNeutral, { color: subtextColor }]}>↕</Text>;
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: cardBg }]}>
      {/* Cabeçalho da Tabela */}
      <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          testID="ranking-header-ticker"
          onPress={() => onSortChange?.('ticker')}
          style={styles.colAsset}
          accessibilityRole="button"
        >
          <Text style={[styles.headerText, { color: subtextColor }]}>Ativo</Text>
          {renderSortIndicator('ticker')}
        </TouchableOpacity>

        <TouchableOpacity
          testID="ranking-header-price"
          onPress={() => onSortChange?.('price')}
          style={styles.colPrice}
          accessibilityRole="button"
        >
          <Text style={[styles.headerText, { color: subtextColor }]}>Preço</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="ranking-header-dy"
          onPress={() => onSortChange?.('dy')}
          style={styles.colDY}
          accessibilityRole="button"
        >
          <Text style={[styles.headerText, { color: subtextColor }]}>DY 12M</Text>
          {renderSortIndicator('dy')}
        </TouchableOpacity>

        <TouchableOpacity
          testID="ranking-header-pvp"
          onPress={() => onSortChange?.('pvp')}
          style={styles.colPVP}
          accessibilityRole="button"
        >
          <Text style={[styles.headerText, { color: subtextColor }]}>P/VP</Text>
          {renderSortIndicator('pvp')}
        </TouchableOpacity>
      </View>

      {/* Linhas da Tabela */}
      {items.length > 0 ? (
        items.map((it, idx) => {
          const initials = it.ticker.slice(0, 2).toUpperCase();
          const isLast = idx === items.length - 1;

          return (
            <TouchableOpacity
              key={it.ticker}
              testID={`ranking-row-${it.ticker}`}
              activeOpacity={0.7}
              onPress={() => onRowPress?.(it.ticker)}
              style={[
                styles.row,
                !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${it.ticker}, preço R$ ${it.price.toFixed(2)}`}
            >
              {/* Coluna 1: Avatar e Ticker */}
              <View style={styles.colAsset}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: isLight ? '#EAE5D9' : '#22252A',
                      borderColor: isLight ? '#D5CAA8' : '#33383F',
                    },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: isLight ? '#111315' : '#D5CAA8' }]}>
                    {initials}
                  </Text>
                </View>
                <Text style={[styles.tickerText, { color: textColor }]}>{it.ticker}</Text>
              </View>

              {/* Coluna 2: Preço */}
              <View style={styles.colPrice}>
                <Text style={[styles.cellText, { color: textColor }]}>
                  {it.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

              {/* Coluna 3: DY 12M (verde) */}
              <View style={styles.colDY}>
                <Text style={[styles.dyText, { color: colors.tertiary }]}>
                  {it.dy12m != null
                    ? `${it.dy12m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                    : '—'}
                </Text>
              </View>

              {/* Coluna 4: P/VP */}
              <View style={styles.colPVP}>
                <Text style={[styles.cellText, { color: textColor }]}>
                  {it.pvp != null
                    ? it.pvp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : '—'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: subtextColor }]}>
            Nenhum ativo no ranking no momento.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borders.radiusLg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  sortNeutral: {
    fontSize: 10,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
  },
  colAsset: {
    flex: 2.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  colPrice: {
    flex: 1.5,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  colDY: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  colPVP: {
    flex: 1.2,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  dyText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
});
