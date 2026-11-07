import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { borders, colors, spacing, typography } from '../../theme/tokens';
import { ASSET_CLASS_ATTRIBUTE_MAP, AssetClass } from './AttributeStatBar';
import { JellyPressable } from './JellyPressable';

export interface TransactionRowItem {
  id: string;
  ticker: string;
  assetClass: AssetClass;
  type: 'BUY' | 'SELL';
  dateText: string;
  amountText: string;
}

const CATEGORY_MATERIAL_ICONS: Record<AssetClass, keyof typeof MaterialIcons.glyphMap> = {
  FIXED_INCOME: 'account-balance',
  FII: 'apartment',
  STOCK: 'trending-up',
  CRYPTO: 'currency-bitcoin',
};

/** "2026-10-28" → "28/10/2026"; textos que já não são ISO são mantidos. */
export function formatTxDate(text: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : text;
}

export const MASKED_AMOUNT = 'R$ ••••••';

export interface TransactionRowProps<T extends TransactionRowItem = TransactionRowItem> {
  tx: T;
  isLast?: boolean;
  themeMode?: 'dark' | 'light';
  /** Mascara o valor (modo privacidade). */
  isPrivacyMode?: boolean;
  onPress?: (tx: T) => void;
  testID?: string;
}

/**
 * Linha de movimentação única do app (Home, Extrato completo e carteira): avatar da categoria,
 * ticker, "data • Compra/Venda" e valor com sinal. Mudar aqui muda todas as listas.
 */
export function TransactionRow<T extends TransactionRowItem = TransactionRowItem>({
  tx,
  isLast = false,
  themeMode = 'dark',
  isPrivacyMode = false,
  onPress,
  testID,
}: TransactionRowProps<T>) {
  const isLight = themeMode === 'light';
  const config = ASSET_CLASS_ATTRIBUTE_MAP[tx.assetClass] || { color: colors.primary, label: 'Ativo' };
  const iconName = CATEGORY_MATERIAL_ICONS[tx.assetClass] || 'trending-up';
  const isBuy = tx.type === 'BUY';
  const amount = isPrivacyMode ? MASKED_AMOUNT : tx.amountText;

  return (
    <JellyPressable
      testID={testID}
      intensity="subtle"
      onPress={() => onPress?.(tx)}
      style={[styles.row, !isLast && (isLight ? styles.borderLight : styles.border)]}
    >
      <View style={[styles.avatar, { backgroundColor: config.color }]}>
        <MaterialIcons name={iconName} size={21} color="#111315" style={styles.iconGlyph} />
      </View>
      <View style={styles.center}>
        <Text style={[styles.ticker, isLight && styles.tickerLight]}>{tx.ticker}</Text>
        <Text style={[styles.sub, isLight && styles.subLight]}>
          {formatTxDate(tx.dateText)} • {isBuy ? 'Compra' : 'Venda'}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          isBuy ? (isLight ? styles.positiveLight : styles.positive) : isLight ? styles.negativeLight : styles.negative,
        ]}
      >
        {isBuy ? `+${amount}` : `-${amount}`}
      </Text>
    </JellyPressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingVertical: spacing.md - 2 },
  border: { borderBottomWidth: borders.hairline, borderBottomColor: '#26292C' },
  borderLight: { borderBottomWidth: borders.hairline, borderBottomColor: '#F0EBE1' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm + 4 },
  iconGlyph: { textAlign: 'center', textAlignVertical: 'center' },
  center: { flex: 1 },
  ticker: { fontFamily: typography.fontFamily, fontSize: typography.bodyMd.fontSize, fontWeight: '700', color: colors.parchmentPale },
  tickerLight: { color: '#111315' },
  sub: { fontFamily: typography.fontFamily, fontSize: typography.labelSm.fontSize, color: '#8A8A8E', marginTop: 2 },
  subLight: { color: '#6E6A63' },
  amount: { fontFamily: typography.fontFamily, fontSize: typography.bodyMd.fontSize, fontWeight: '700' },
  positive: { color: '#AECDC5' },
  negative: { color: colors.primary },
  positiveLight: { color: '#1D6F5B' },
  negativeLight: { color: '#C24D18' },
});
