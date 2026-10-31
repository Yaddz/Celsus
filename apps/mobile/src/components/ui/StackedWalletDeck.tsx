import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { colors, typography, borders, spacing } from '../../theme/tokens';
import { PORTFOLIO_PALETTES, PortfolioPalette } from '../../theme/palettes';

export interface StackedWalletItem {
  id: string;
  name: string;
  docketCode?: string;
  accountCode?: string;
  balance: string;
  subtitle?: string;
  profitText?: string;
  accentColor?: string;
  paletteId?: string;
}

export interface StackedWalletDeckProps {
  portfolios?: StackedWalletItem[];
  activeIndex?: number;
  onPortfolioChange?: (index: number, portfolio: StackedWalletItem) => void;
  onCycleNext?: () => void;
  onCyclePrev?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const StackedWalletDeck: React.FC<StackedWalletDeckProps> = ({
  portfolios = [],
  activeIndex = 0,
  onPortfolioChange,
  onCycleNext,
  onCyclePrev,
  testID = 'stacked-wallet-deck',
  style,
}) => {
  // Stub para Fase A (especificação TDD e bloqueio)
  return (
    <View testID={testID} style={[styles.container, style]}>
      <Text style={styles.stubText}>StackedWalletDeck Stub</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: spacing.md,
  },
  stubText: {
    fontFamily: typography.fontFamily,
    color: colors.parchmentPale,
  },
});

export default StackedWalletDeck;
