import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AssetClass } from './AttributeStatBar';
import { JellyPressable } from './JellyPressable';
import { colors, typography, borders } from '../../theme/tokens';
import { THEME_COLORS } from '../../theme/palettes';

export interface AssetSearchItem {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  /** Variação do dia; ausente quando não há cotação (nunca preenchida com valor inventado). */
  change24h?: number;
}

export interface AssetSearchRowProps {
  item: AssetSearchItem;
  onPress?: (item: AssetSearchItem) => void;
  themeMode?: 'dark' | 'light';
  isLast?: boolean;
}

const CLASS_COLORS: Record<AssetClass, string> = {
  FIXED_INCOME: colors.fixedIncome,
  FII: colors.fii,
  STOCK: colors.stock || colors.primary,
  CRYPTO: colors.crypto,
};

export const AssetSearchRow: React.FC<AssetSearchRowProps> = ({
  item,
  onPress,
  themeMode = 'dark',
  isLast = false,
}) => {
  const isLight = themeMode === 'light';
  const hasChange = typeof item.change24h === 'number';
  const change = item.change24h ?? 0;
  const isPositive = change >= 0;
  const changeColor = isPositive ? colors.tertiary : colors.deficit;
  const changeIcon = isPositive ? 'arrow-upward' : 'arrow-downward';
  const prefix = isPositive ? '+' : '';
  const initials = item.ticker.slice(0, 2).toUpperCase();

  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  return (
    <JellyPressable
      testID={`asset-search-row-${item.ticker}`}
      onPress={() => onPress?.(item)}
      style={[styles.container, !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`${item.ticker}, ${item.name}, R$ ${item.price.toFixed(2)}`}
    >
      {/* Avatar com iniciais */}
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

      {/* Info do ativo: Ticker e Nome */}
      <View style={styles.infoCol}>
        <Text style={[styles.tickerText, { color: textColor }]}>{item.ticker}</Text>
        <Text numberOfLines={1} style={[styles.nameText, { color: subtextColor }]}>
          {item.name}
        </Text>
      </View>

      {/* Cotação e variação 24h */}
      <View style={styles.priceCol}>
        <Text style={[styles.priceText, { color: textColor }]}>
          R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        {hasChange ? (
          <View style={styles.changeRow}>
            <MaterialIcons name={changeIcon as any} size={12} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {prefix}{change.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
            </Text>
          </View>
        ) : null}
      </View>
    </JellyPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 56,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nameText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 2,
  },
  priceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  changeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
});
