import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import { colors, typography, borders, spacing } from '../../theme/tokens';
import { PORTFOLIO_PALETTES, PortfolioPalette, getPortfolioPalette } from '../../theme/palettes';

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

const DEFAULT_PORTFOLIOS: StackedWalletItem[] = [
  {
    id: 'default-portfolio',
    name: 'Carteira Principal',
    docketCode: 'REV-CART-001',
    accountCode: '•••• 001',
    balance: 'R$ 32.468,00',
    subtitle: 'Patrimônio Total',
    profitText: '+12,4% no ano',
    accentColor: '#D96628',
    paletteId: 'classic',
  },
];

export const StackedWalletDeck: React.FC<StackedWalletDeckProps> = ({
  portfolios = DEFAULT_PORTFOLIOS,
  activeIndex = 0,
  onPortfolioChange,
  onCycleNext,
  onCyclePrev,
  testID = 'stacked-wallet-deck',
  style,
}) => {
  const items = portfolios.length > 0 ? portfolios : DEFAULT_PORTFOLIOS;
  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const prevActiveIndexRef = useRef(activeIndex);

  useEffect(() => {
    if (activeIndex !== undefined && activeIndex !== prevActiveIndexRef.current) {
      prevActiveIndexRef.current = activeIndex;
      setCurrentIndex(activeIndex);
    }
  }, [activeIndex]);

  const cycleNext = () => {
    const nextIndex = (currentIndexRef.current + 1) % items.length;
    currentIndexRef.current = nextIndex;
    const act = (React as any).act;
    if (typeof act === 'function') {
      act(() => {
        setCurrentIndex(nextIndex);
      });
    } else {
      setCurrentIndex(nextIndex);
    }
    onPortfolioChange?.(nextIndex, items[nextIndex]);
    onCycleNext?.();
  };

  const cyclePrev = () => {
    const prevIndex = (currentIndexRef.current - 1 + items.length) % items.length;
    currentIndexRef.current = prevIndex;
    const act = (React as any).act;
    if (typeof act === 'function') {
      act(() => {
        setCurrentIndex(prevIndex);
      });
    } else {
      setCurrentIndex(prevIndex);
    }
    onPortfolioChange?.(prevIndex, items[prevIndex]);
    onCyclePrev?.();
  };

  const handleRelease = (e: any, gestureState?: PanResponderGestureState) => {
    const dy = gestureState?.dy ?? e?.gestureState?.dy ?? e?.nativeEvent?.translationY ?? 0;
    if (dy > 50) {
      cycleNext();
    } else if (dy < -50) {
      cyclePrev();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10,
      onPanResponderRelease: (e, gesture) => handleRelease(e, gesture),
    })
  ).current;

  const currentItem = items[currentIndex] || items[0];
  const palette: PortfolioPalette = currentItem.paletteId
    ? PORTFOLIO_PALETTES[currentItem.paletteId as keyof typeof PORTFOLIO_PALETTES] || PORTFOLIO_PALETTES.classic
    : getPortfolioPalette(currentIndex);

  const cardBgColor = currentItem.accentColor || palette.cardBg;

  return (
    <View testID={testID} style={[styles.heroWrapper, style]}>
      {/* Camadas inferiores empilhadas (Stacked Depth Layers) */}
      <View style={styles.heroLayerTwo} />
      <View style={styles.heroLayerOne} />

      {/* Cartão Ativo Principal com suporte a gesto vertical */}
      <View
        testID="stacked-wallet-card-active"
        style={styles.heroCard}
        {...panResponder.panHandlers}
        onResponderRelease={handleRelease}
      >
        {/* Corpo com cor estendida até a base da Rentabilidade */}
        <View
          testID="wallet-colored-body"
          style={[styles.coloredBody, { backgroundColor: cardBgColor }]}
        >
          {/* Topo: Círculos translúcidos e Saldo */}
          <View style={styles.topRow}>
            <View style={styles.circlesContainer}>
              <View style={[styles.translucentCircle, { backgroundColor: 'rgba(213, 202, 168, 0.45)' }]} />
              <View style={[styles.translucentCircleOverlay, { backgroundColor: 'rgba(46, 74, 68, 0.55)' }]} />
            </View>

            <View style={styles.balanceCol}>
              <Text style={styles.balanceSubtitle}>
                {(currentItem.subtitle || 'Patrimônio Total').toUpperCase()}
              </Text>
              <Text style={styles.balanceText}>{currentItem.balance}</Text>
            </View>
          </View>

          {/* Base: Nome da Carteira, Rentabilidade e Recorte Curvo Integrado */}
          <View style={styles.bottomRow}>
            <View style={styles.nameAndProfitCol}>
              <Text style={styles.portfolioNameText}>
                {currentItem.name}
              </Text>
              <Text style={styles.profitBadgeText}>
                {currentItem.profitText || '+0,0% no ano'}
              </Text>
            </View>

            {/* Recorte Quadrado Curvo Escuro (#191B1D / #111315) integrado ao card */}
            <View testID="wallet-corner-notch" style={styles.cornerNotch}>
              <Text style={styles.accountCodeText}>
                {currentItem.accountCode || '•••• 001'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroWrapper: {
    marginVertical: spacing.md,
    position: 'relative',
    alignItems: 'center',
    width: '100%',
  },
  heroLayerTwo: {
    position: 'absolute',
    top: 18,
    width: '88%',
    height: 30,
    backgroundColor: '#151719',
    borderRadius: borders.radiusXl,
    opacity: 0.8,
  },
  heroLayerOne: {
    position: 'absolute',
    top: 9,
    width: '94%',
    height: 30,
    backgroundColor: '#1A1C1E',
    borderRadius: borders.radiusXl,
    opacity: 0.95,
  },
  heroCard: {
    width: '100%',
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusXl,
    overflow: 'hidden',
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  coloredBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.md,
    borderRadius: borders.radiusXl,
    minHeight: 160,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circlesContainer: {
    flexDirection: 'row',
    position: 'relative',
    width: 52,
    height: 36,
    alignItems: 'center',
  },
  translucentCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    position: 'absolute',
    left: 0,
  },
  translucentCircleOverlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    position: 'absolute',
    left: 18,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.voidFloor,
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineLg.fontSize - 2,
    fontWeight: '700',
    color: colors.voidFloor,
    letterSpacing: -0.5,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.md,
  },
  nameAndProfitCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  portfolioNameText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.voidFloor,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  profitBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.voidFloor,
    fontWeight: '600',
    marginTop: 2,
    opacity: 0.9,
  },
  cornerNotch: {
    backgroundColor: '#191B1D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    alignSelf: 'flex-end',
  },
  accountCodeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.tertiary,
    fontWeight: '700',
  },
});

export default StackedWalletDeck;
