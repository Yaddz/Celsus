import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { bento, borders, colors, spacing, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { JellyPressable } from './JellyPressable';

export interface FinListCardProps {
  title?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionTestID?: string;
  themeMode?: ThemeMode;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}

export interface FinListRowProps {
  testID?: string;
  avatarTestID?: string;
  subtitleTestID?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  avatarColor: string;
  avatarSize?: number;
  avatarRingColor?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  amountText?: string;
  amountColor?: string;
  rightSubtitle?: string;
  rightSubtitleColor?: string;
  rightAccessory?: React.ReactNode;
  bottomContent?: React.ReactNode;
  isLast?: boolean;
  themeMode?: ThemeMode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tile único de lista do módulo Finanças: cabeçalho opcional em caixa alta e
 * container Bento único (#1C1E20 escuro / #FFFFFF claro, raio 28).
 */
export const FinListCard: React.FC<FinListCardProps> = ({
  title,
  actionLabel,
  onActionPress,
  actionTestID,
  themeMode = 'dark',
  style,
  cardStyle,
  testID,
  children,
}) => {
  const isLight = themeMode === 'light';

  return (
    <View style={[styles.wrapper, style]}>
      {title || actionLabel ? (
        <View style={styles.headerRow}>
          {title ? (
            <Text style={[styles.sectionTitle, isLight && styles.sectionTitleLight]}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {actionLabel ? (
            <TouchableOpacity
              testID={actionTestID}
              accessibilityRole="button"
              onPress={onActionPress}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.actionLabel, { color: colors.tertiary }]}>
                {actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View
        testID={testID}
        style={[
          styles.card,
          { backgroundColor: isLight ? '#FFFFFF' : '#1C1E20' },
          cardStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
};

/**
 * Linha interna de `FinListCard` seguindo o padrão de `TransactionRow`:
 * avatar circular com ícone Material, título 13px bold, subtítulo 11px, valor à direita
 * e filete inferior (removido na última linha).
 */
export const FinListRow: React.FC<FinListRowProps> = ({
  testID,
  avatarTestID,
  subtitleTestID,
  icon,
  avatarColor,
  avatarSize = 44,
  avatarRingColor,
  iconColor,
  title,
  subtitle,
  subtitleColor,
  amountText,
  amountColor,
  rightSubtitle,
  rightSubtitleColor,
  rightAccessory,
  bottomContent,
  isLast = false,
  themeMode = 'dark',
  onPress,
  style,
}) => {
  const isLight = themeMode === 'light';
  const resolvedIconColor =
    iconColor ?? (avatarColor.toUpperCase() === '#2E4A44' ? '#E6DECA' : '#111315');

  const rowContainerStyle: ViewStyle = {
    minHeight: 72,
    paddingVertical: 12,
    justifyContent: 'center',
    borderBottomWidth: isLast ? 0 : borders.hairline,
    borderBottomColor: isLight ? '#F0EBE1' : '#26292C',
  };

  const inner = (
    <>
      <View style={styles.mainLine}>
        <View
          testID={avatarTestID}
          style={[
            styles.avatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: avatarColor,
            },
            avatarRingColor ? { borderWidth: 2, borderColor: avatarRingColor } : null,
          ]}
        >
          <MaterialIcons name={icon} size={21} color={resolvedIconColor} />
        </View>

        <View style={styles.center}>
          <Text
            style={[styles.title, { color: isLight ? '#111315' : '#E6DECA' }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              testID={subtitleTestID}
              style={[
                styles.subtitle,
                { color: subtitleColor ?? (isLight ? '#6E6A63' : '#8A8A8E') },
              ]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {amountText || rightSubtitle || rightAccessory ? (
          <View style={styles.rightCol}>
            {amountText ? (
              <Text
                style={[
                  styles.amount,
                  { color: amountColor ?? (isLight ? '#111315' : '#E6DECA') },
                ]}
              >
                {amountText}
              </Text>
            ) : null}
            {rightSubtitle ? (
              <Text
                style={[
                  styles.rightSubtitle,
                  { color: rightSubtitleColor ?? (isLight ? '#6E6A63' : '#8A8A8E') },
                ]}
              >
                {rightSubtitle}
              </Text>
            ) : null}
            {rightAccessory}
          </View>
        ) : null}
      </View>

      {bottomContent ? <View style={styles.bottomWrap}>{bottomContent}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <JellyPressable
        testID={testID}
        intensity="subtle"
        accessibilityRole="button"
        onPress={onPress}
        containerStyle={[rowContainerStyle, style]}
      >
        {inner}
      </JellyPressable>
    );
  }

  return (
    <View testID={testID} style={[rowContainerStyle, style]}>
      {inner}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8A8A8E',
  },
  sectionTitleLight: {
    color: '#6E6A63',
  },
  actionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: bento.tileRadius,
    paddingHorizontal: bento.tilePadding,
    paddingVertical: 6,
  },
  mainLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 4,
  },
  center: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 2,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  amount: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  rightSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
  bottomWrap: {
    marginTop: 10,
    paddingLeft: 56,
  },
});
