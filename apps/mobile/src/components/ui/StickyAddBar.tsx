import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AssetClass } from './AttributeStatBar';
import { colors, typography, borders } from '../../theme/tokens';

export interface StickyAddBarProps {
  walletName: string;
  assetClass: AssetClass;
  /** Meta do ativo na classe; ausente quando o ativo ainda não está na carteira. */
  targetPercentage?: number | null;
  /** Distância até o fim da tela (ex.: altura do dock flutuante), para o botão não ficar por baixo dele. */
  bottomOffset?: number;
  isAlreadyInWallet?: boolean;
  onAddPress: () => void;
  onWalletSelectPress: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const CLASS_NAMES: Record<AssetClass, string> = {
  FIXED_INCOME: 'Renda fixa',
  FII: 'FIIs',
  STOCK: 'Ações',
  CRYPTO: 'Cripto',
};

export const StickyAddBar: React.FC<StickyAddBarProps> = ({
  walletName = 'Carteira',
  assetClass = 'STOCK',
  targetPercentage = null,
  bottomOffset = 0,
  isAlreadyInWallet = false,
  onAddPress,
  onWalletSelectPress,
  themeMode = 'dark',
  testID = 'sticky-add-bar',
}) => {
  const isLight = themeMode === 'light';
  const barBg = isLight ? '#FFFFFF' : '#111315';
  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const chipBg = isLight ? '#EAE5D9' : '#22252A';
  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: barBg, borderTopColor: borderColor, marginBottom: bottomOffset }]}>
      {/* Linha Superior: Seletor de Carteira e Meta */}
      <View style={styles.topRow}>
        <View style={styles.walletRow}>
          <Text style={[styles.metaLabel, { color: subtextColor }]}>Adicionar em</Text>
          <TouchableOpacity
            testID="wallet-selector-chip"
            activeOpacity={0.7}
            onPress={onWalletSelectPress}
            style={[styles.walletChip, { backgroundColor: chipBg }]}
            accessibilityRole="button"
            accessibilityLabel={`Carteira selecionada: ${walletName}`}
          >
            <Text style={[styles.walletChipText, { color: textColor }]}>{walletName}</Text>
            <MaterialIcons name="expand-more" size={14} color={subtextColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.metaRight}>
          {isAlreadyInWallet ? (
            <View style={styles.badgeInWallet}>
              <Text style={styles.badgeInWalletText}>
                {typeof targetPercentage === 'number' ? `Na carteira · meta ${targetPercentage}%` : 'Na carteira'}
              </Text>
            </View>
          ) : (
            <Text style={[styles.metaText, { color: subtextColor }]}>
              {CLASS_NAMES[assetClass] || 'Ativo'}
            </Text>
          )}
        </View>
      </View>

      {/* Botão de Ação: Adicionar à Carteira OU Ajustar Meta */}
      <TouchableOpacity
        testID="sticky-add-action-btn"
        activeOpacity={0.85}
        onPress={onAddPress}
        style={[
          styles.actionBtn,
          { backgroundColor: isAlreadyInWallet ? '#2D3239' : colors.primary },
        ]}
        accessibilityRole="button"
        accessibilityLabel={isAlreadyInWallet ? 'Ajustar meta do ativo' : 'Adicionar ativo à carteira'}
      >
        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
          {isAlreadyInWallet ? 'Ajustar meta' : 'Adicionar à carteira'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusFull,
    gap: 2,
  },
  walletChipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  metaText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  badgeInWallet: {
    backgroundColor: 'rgba(40,116,101,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borders.radiusSm,
  },
  badgeInWalletText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.tertiary,
    fontWeight: '600',
  },
  actionBtn: {
    height: 48,
    borderRadius: borders.radiusBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
