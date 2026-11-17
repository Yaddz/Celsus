import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BentoTile } from './BentoGrid';
import { JellyPressable } from './JellyPressable';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { bento, BentoVariant, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';

export interface FinHeroSecondary {
  value: React.ReactNode;
  support?: string;
  valueTestID?: string;
}

export interface FinHeroTileProps {
  testID?: string;
  /** Rótulo em caixa alta acima do valor (ex.: "SALDO TOTAL"). */
  label: string;
  /** Valor já formatado. Com `isPrivacyMode`, é trocado pela máscara única do app. */
  value: React.ReactNode;
  /** testID do valor; padrão `${testID}-value`. */
  valueTestID?: string;
  /** Linha de apoio sob o valor. */
  support?: string;
  /** Segundo valor, ao lado do principal (ex.: total por ano). */
  secondary?: FinHeroSecondary;
  /** Cor do tile. Sem variante, segue o tema (escuro → dark, claro → light). */
  variant?: BentoVariant;
  themeMode?: ThemeMode;
  isPrivacyMode?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Destaque numérico de uma tela (saldo total, patrimônio, gasto mensal): rótulo, valor, linha de apoio e ação
 * opcional, com a mesma anatomia do card de carteira da Home de Investimentos. Um componente só para os dois módulos.
 */
export const FinHeroTile: React.FC<FinHeroTileProps> = ({
  testID,
  label,
  value,
  valueTestID,
  support,
  secondary,
  variant,
  themeMode = 'dark',
  isPrivacyMode = false,
  actionLabel,
  onAction,
  children,
  style,
}) => {
  const resolvedVariant: BentoVariant = variant ?? (themeMode === 'light' ? 'light' : 'dark');
  const palette = bento.variants[resolvedVariant];
  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);
  const valueStyle = [secondary ? styles.valueCompact : styles.value, { color: palette.foreground }];
  const shown = (node: React.ReactNode) => (isPrivacyMode ? PRIVACY_CURRENCY_MASK : node);

  return (
    <BentoTile variant={resolvedVariant} testID={testID} style={style}>
      <View style={styles.headerRow}>
        <Text testID={id('label')} numberOfLines={1} style={[styles.label, { color: palette.muted }]}>
          {label}
        </Text>
        {actionLabel && onAction ? (
          <JellyPressable
            testID={id('action')}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={space.md}
          >
            <Text style={[styles.action, { color: palette.foreground }]}>{actionLabel}</Text>
          </JellyPressable>
        ) : null}
      </View>

      <View style={styles.valuesRow}>
        <View style={styles.valueCol}>
          <Text
            testID={valueTestID ?? id('value')}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={valueStyle}
          >
            {shown(value)}
          </Text>
          {support ? (
            <Text testID={id('support')} style={[styles.support, { color: palette.muted }]}>
              {support}
            </Text>
          ) : null}
        </View>
        {secondary ? (
          <View style={styles.valueCol}>
            <Text
              testID={secondary.valueTestID ?? id('secondary-value')}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={valueStyle}
            >
              {shown(secondary.value)}
            </Text>
            {secondary.support ? (
              <Text style={[styles.support, { color: palette.muted }]}>{secondary.support}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {children}
    </BentoTile>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  label: {
    flexShrink: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  action: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.bold,
  },
  valuesRow: {
    flexDirection: 'row',
    gap: space.lg,
    marginTop: space.sm,
  },
  valueCol: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  value: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.hero,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  support: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
  },
});
