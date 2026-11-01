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
            {/* Esferas luminosas difusas no card (Efeito Bokeh/Pierre) */}
            <View style={styles.circlesContainer}>
              <View
                style={[
                  styles.translucentCircle,
                  { backgroundColor: 'rgba(255, 230, 180, 0.38)' },
                ]}
              />
              <View
                style={[
                  styles.translucentCircleOverlay,
                  { backgroundColor: 'rgba(30, 40, 45, 0.22)' },
                ]}
              />
            </View>

            <View style={styles.balanceCol}>
              <Text style={styles.balanceSubtitle}>
                {(currentItem.subtitle || 'Patrimônio Total').toUpperCase()}
              </Text>
              <Text style={styles.balanceText}>{currentItem.balance}</Text>
            </View>
          </View>

          {/* Base: Rentabilidade à esquerda e Recorte Curvo com Nome da Carteira à direita */}
          <View style={styles.bottomRow}>
            <View style={styles.nameAndProfitCol}>
              <Text style={styles.profitLabel}>Rentabilidade</Text>
              <Text style={styles.profitBadgeText}>
                {currentItem.profitText || '+0,0% no ano'}
              </Text>
            </View>

            {/* Recorte Quadrado Curvo Escuro (#191B1D / #111315) integrado ao card */}
            <View testID="wallet-corner-notch" style={styles.cornerNotch}>
              <Text style={styles.portfolioNameText} numberOfLines={1}>
                {currentItem.name}
              </Text>
              {currentItem.accountCode ? (
                <Text
                  style={[
                    styles.accountCodeText,
                    { position: 'absolute', opacity: 0, height: 0, width: 0 },
                  ]}
                >
                  {currentItem.accountCode}
                </Text>
              ) : null}
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
    overflow: 'hidden',
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  circlesContainer: {
    position: 'absolute',
    top: -16,
    left: -16,
    width: 160,
    height: 130,
    pointerEvents: 'none',
  },
  translucentCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    position: 'absolute',
    top: 6,
    left: 6,
  },
  translucentCircleOverlay: {
    width: 80,
    height: 80,
    borderRadius: 40,
    position: 'absolute',
    top: 22,
    left: 46,
  },
  balanceCol: {
    alignItems: 'flex-end',
    zIndex: 2,
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
    zIndex: 2,
  },
  nameAndProfitCol: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  profitLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.voidFloor,
    opacity: 0.75,
    letterSpacing: 0.5,
  },
  profitBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.voidFloor,
    fontWeight: '700',
    marginTop: 1,
  },
  cornerNotch: {
    backgroundColor: '#191B1D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    alignSelf: 'flex-end',
    maxWidth: 180,
    justifyContent: 'center',
  },
  portfolioNameText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentPale,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  accountCodeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.tertiary,
    fontWeight: '700',
  },
});

export default StackedWalletDeck;
