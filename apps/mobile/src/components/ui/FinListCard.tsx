import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ThemeMode } from '../../theme/palettes';

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
 * Tile único de lista do módulo Finanças (stub Fase A).
 */
export const FinListCard: React.FC<FinListCardProps> = ({
  testID,
  children,
}) => {
  return <View testID={testID}>{children}</View>;
};

/**
 * Linha interna de `FinListCard` (stub Fase A).
 */
export const FinListRow: React.FC<FinListRowProps> = ({
  testID,
  rightAccessory,
  bottomContent,
}) => {
  return (
    <View testID={testID}>
      {rightAccessory}
      {bottomContent}
    </View>
  );
};
