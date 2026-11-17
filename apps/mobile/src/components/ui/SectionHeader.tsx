import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { JellyPressable } from './JellyPressable';
import { colors, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';

export interface SectionHeaderProps {
  testID?: string;
  title: string;
  /** Ação à direita (ex.: "Ver tudo ›"). Só aparece com `onAction`. */
  actionLabel?: string;
  onAction?: () => void;
  themeMode?: ThemeMode;
  /** Cor do título; padrão: texto discreto do tema. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Cabeçalho de seção único dos dois módulos: título em caixa alta e ação opcional à direita. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  testID,
  title,
  actionLabel,
  onAction,
  themeMode = 'dark',
  color,
  style,
}) => {
  const titleColor = color ?? (themeMode === 'light' ? '#6E6A63' : colors.subtleText);
  return (
    <View testID={testID} style={[styles.row, style]}>
      <Text testID={testID ? `${testID}-title` : undefined} numberOfLines={1} style={[styles.title, { color: titleColor }]}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <JellyPressable
          testID={testID ? `${testID}-action` : undefined}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={space.md}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </JellyPressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: {
    flexShrink: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: typography.weights.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  action: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
});
