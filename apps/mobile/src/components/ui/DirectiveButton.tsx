import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from '../../theme/tokens';

export type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

export interface DirectiveButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'neutral' | 'destructive';
  isBentoTile?: boolean;
  materialIcon?: MaterialIconName;
  icon?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const DirectiveButton: React.FC<DirectiveButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  isBentoTile = false,
  materialIcon,
  icon,
  disabled = false,
  style,
  testID,
}) => {
  // Bento Tile Mode (WalleZ Quick Action Tile)
  if (isBentoTile) {
    const isPrimary = variant === 'primary';
    const isSecondary = variant === 'secondary';

    const tileBg = isPrimary
      ? colors.primary
      : isSecondary
      ? colors.secondary
      : colors.neutral;

    const textColor = isPrimary
      ? colors.voidFloor
      : colors.parchmentPale;

    const iconColor = textColor;
    const defaultMaterialIcon: MaterialIconName = isPrimary
      ? 'north-east'
      : isSecondary
      ? 'calculate'
      : 'grid-view';

    const iconToRender = materialIcon || defaultMaterialIcon;

    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={[
          styles.bentoTile,
          { backgroundColor: tileBg },
          variant === 'neutral' && styles.bentoTileNeutralBorder,
          disabled && styles.disabled,
          style,
        ]}
      >
        <MaterialIcons name={iconToRender} size={24} color={iconColor} />
        <Text style={[styles.bentoLabel, { color: textColor }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  // Standard Pill / Rounded Action Button Mode
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDestructive = variant === 'destructive';

  const containerStyle = isPrimary
    ? styles.primaryContainer
    : isSecondary
    ? styles.secondaryContainer
    : isDestructive
    ? styles.destructiveContainer
    : styles.neutralContainer;

  const textStyle = isPrimary
    ? styles.primaryText
    : isSecondary
    ? styles.secondaryText
    : isDestructive
    ? styles.destructiveText
    : styles.neutralText;

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.base, containerStyle, disabled && styles.disabled, style]}
    >
      <View style={styles.buttonInnerRow}>
        {materialIcon ? (
          <MaterialIcons
            name={materialIcon}
            size={18}
            color={textStyle.color}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text style={[styles.baseText, textStyle]}>
          {isDestructive ? `[!] ${label.toUpperCase()}` : label.toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

/**
 * 3 Bento Tiles de Ação Rápida lado a lado (WalleZ Modern Bento Row)
 */
export const QuickActionBentoRow: React.FC<{
  onAportar?: () => void;
  onSimular?: () => void;
  onMais?: () => void;
  style?: StyleProp<ViewStyle>;
}> = ({ onAportar = () => {}, onSimular = () => {}, onMais = () => {}, style }) => {
  return (
    <View style={[styles.bentoRow, style]}>
      <DirectiveButton
        label="Aportar"
        isBentoTile
        variant="primary"
        materialIcon="north-east"
        onPress={onAportar}
      />
      <DirectiveButton
        label="Simular"
        isBentoTile
        variant="secondary"
        materialIcon="calculate"
        onPress={onSimular}
      />
      <DirectiveButton
        label="Mais"
        isBentoTile
        variant="neutral"
        materialIcon="grid-view"
        onPress={onMais}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Bento Tile Styles
  bentoRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginVertical: spacing.sm,
  },
  bentoTile: {
    flex: 1,
    height: 104,
    borderRadius: borders.radiusLg,
    padding: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  bentoTileNeutralBorder: {
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  bentoLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize + 1,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Standard Pill Action Button Styles
  base: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: borders.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelLg.fontSize,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  primaryContainer: {
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: colors.voidFloor,
  },
  secondaryContainer: {
    backgroundColor: colors.secondary,
  },
  secondaryText: {
    color: colors.parchmentPale,
  },
  neutralContainer: {
    backgroundColor: colors.neutral,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  neutralText: {
    color: colors.parchmentPale,
  },
  destructiveContainer: {
    backgroundColor: colors.deficit,
  },
  destructiveText: {
    color: colors.parchmentPale,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default DirectiveButton;
