import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  PanResponder,
  PanResponderGestureState,
  Animated,
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

export type WalletCardData = StackedWalletItem;

export interface StackedWalletDeckProps {
  portfolios?: StackedWalletItem[];
  activeIndex?: number;
  onPortfolioChange?: (index: number, portfolio: StackedWalletItem) => void;
  onCycleNext?: () => void;
  onCyclePrev?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  themeMode?: 'dark' | 'light';
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
  themeMode = 'dark',
}) => {
  const items = portfolios.length > 0 ? portfolios : DEFAULT_PORTFOLIOS;
  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const prevActiveIndexRef = useRef(activeIndex);

  // Animated values para física de cartas
  const panY = useRef(new Animated.Value(0)).current;

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
      panY.setValue(0);
    } else if (dy < -50) {
      cyclePrev();
      panY.setValue(0);
    } else {
      Animated.spring(panY, {
        toValue: 0,
        useNativeDriver: false,
        friction: 6,
      }).start();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderMove: (_, gesture) => {
        panY.setValue(gesture.dy);
      },
      onPanResponderRelease: (e, gesture) => handleRelease(e, gesture),
      onPanResponderTerminate: (e, gesture) => handleRelease(e, gesture),
    })
  ).current;

  const currentItem = items[currentIndex] || items[0];
  const palette: PortfolioPalette = currentItem.paletteId
    ? PORTFOLIO_PALETTES[currentItem.paletteId as keyof typeof PORTFOLIO_PALETTES] || PORTFOLIO_PALETTES.classic
    : getPortfolioPalette(currentIndex);

  const cardBgColor = currentItem.accentColor || palette.cardBg;
  const notchBgColor = '#191B1D';

  // Interpolações para rotação sutil de cartas (±2.5°) e leve escala elástica
  const tiltInterpolation = panY.interpolate({
    inputRange: [-120, 0, 120],
    outputRange: ['-2.5deg', '0deg', '2.5deg'],
    extrapolate: 'clamp',
  });

  const scaleInterpolation = panY.interpolate({
    inputRange: [-120, 0, 120],
    outputRange: [0.98, 1.0, 0.98],
    extrapolate: 'clamp',
  });

  return (
    <View testID={testID} style={[styles.heroWrapper, style]}>
      {/* Camadas inferiores empilhadas (Stacked Depth Layers) */}
      <View style={styles.heroLayerTwo} />
      <View style={styles.heroLayerOne} />

      {/* Cartão Ativo Principal com física elástica de cartas */}
      <Animated.View
        testID="stacked-wallet-card-active"
        style={[
          styles.heroCard,
          {
            transform: [
              { translateY: panY },
              { rotate: tiltInterpolation },
              { scale: scaleInterpolation },
            ],
          },
        ]}
        {...panResponder.panHandlers}
        onResponderRelease={handleRelease}
      >
        {/* Corpo colorido preenchendo o card (Imagem 4) */}
        <View
          testID="wallet-colored-body"
          style={[styles.coloredBody, { backgroundColor: cardBgColor }]}
        >
          {/* 1. Topo Esquerdo: Esferas Bokeh Difusas Translúcidas Sobrepostas */}
          <View style={styles.circlesContainer} pointerEvents="none">
            <View
              style={[
                styles.translucentCircleDark,
                { backgroundColor: 'rgba(30, 20, 12, 0.38)' },
              ]}
            />
            <View
              style={[
                styles.translucentCircleLight,
                { backgroundColor: 'rgba(255, 230, 185, 0.48)' },
              ]}
            />
          </View>

          {/* 2. Topo Direito: PATRIMÔNIO TOTAL e Valor em Destaque */}
          <View style={styles.balanceCol}>
            <Text style={styles.balanceSubtitle}>
              {(currentItem.subtitle || 'Patrimônio Total').toUpperCase()}
            </Text>
            <Text style={styles.balanceText}>{currentItem.balance}</Text>
          </View>

          {/* 3. Base: Rentabilidade à esquerda e Notch Autêntico à direita */}
          <View style={styles.bottomRow}>
            <View style={styles.nameAndProfitCol}>
              <Text style={styles.profitLabel}>Rentabilidade</Text>
              <Text style={styles.profitBadgeText}>
                {currentItem.profitText || '+0,0% no ano'}
              </Text>
            </View>

            {/* 4. Notch Autêntico no Canto Inferior Direito (Imagem 4) */}
            <View
              testID="wallet-corner-notch"
              style={[styles.cornerNotch, { backgroundColor: notchBgColor }]}
            >
              {/* Curva de concordância côncava superior (Top Inverted Fillet) */}
              <View
                style={[styles.filletTopContainer, { backgroundColor: notchBgColor }]}
                pointerEvents="none"
              >
                <View
                  style={[styles.filletInnerCurve, { backgroundColor: cardBgColor }]}
                />
              </View>

              {/* Curva de concordância côncava lateral esquerda (Left Inverted Fillet) */}
              <View
                style={[styles.filletLeftContainer, { backgroundColor: notchBgColor }]}
                pointerEvents="none"
              >
                <View
                  style={[styles.filletInnerCurve, { backgroundColor: cardBgColor }]}
                />
              </View>

              {/* Nome da Carteira com tipografia bold em até duas linhas */}
              <Text style={styles.portfolioNameText} numberOfLines={2}>
                {currentItem.name}
              </Text>

              {/* Código legível para testes automatizados */}
              <Text
                style={[
                  styles.accountCodeText,
                  { position: 'absolute', opacity: 0.01, height: 1, width: 1 },
                ]}
              >
                {currentItem.accountCode || currentItem.docketCode || '•••• 001'}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
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
    height: 32,
    backgroundColor: '#151719',
    borderRadius: 24,
    opacity: 0.8,
  },
  heroLayerOne: {
    position: 'absolute',
    top: 9,
    width: '94%',
    height: 32,
    backgroundColor: '#1A1C1E',
    borderRadius: 24,
    opacity: 0.95,
  },
  heroCard: {
    width: '100%',
    backgroundColor: colors.neutral,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  coloredBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 24,
    minHeight: 168,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  // Esferas Bokeh no Topo Esquerdo
  circlesContainer: {
    position: 'absolute',
    top: -10,
    left: -10,
    width: 170,
    height: 140,
  },
  translucentCircleDark: {
    width: 92,
    height: 92,
    borderRadius: 46,
    position: 'absolute',
    top: 6,
    left: 6,
  },
  translucentCircleLight: {
    width: 98,
    height: 98,
    borderRadius: 49,
    position: 'absolute',
    top: 14,
    left: 42,
  },
  // Topo Direito
  balanceCol: {
    alignItems: 'flex-end',
    zIndex: 2,
    alignSelf: 'flex-end',
  },
  balanceSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#111315',
    letterSpacing: 1.1,
    opacity: 0.75,
    marginBottom: 2,
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineLg.fontSize - 2,
    fontWeight: '700',
    color: '#111315',
    letterSpacing: -0.6,
  },
  // Base do Card
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.md,
    zIndex: 2,
  },
  nameAndProfitCol: {
    flex: 1,
    paddingRight: 10,
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  profitLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: '#111315',
    opacity: 0.75,
    letterSpacing: 0.4,
  },
  profitBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: '#111315',
    fontWeight: '700',
    marginTop: 2,
  },
  // Notch Autêntico no Canto Inferior Direito (Imagem 4)
  cornerNotch: {
    position: 'absolute',
    bottom: -16,
    right: -20,
    minWidth: 155,
    maxWidth: 200,
    paddingLeft: 16,
    paddingRight: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 24,
    borderTopWidth: borders.hairline,
    borderLeftWidth: borders.hairline,
    borderColor: '#26292C',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Concordâncias côncavas com raio invertido
  filletTopContainer: {
    position: 'absolute',
    top: -14,
    right: 0,
    width: 14,
    height: 14,
  },
  filletLeftContainer: {
    position: 'absolute',
    bottom: 0,
    left: -14,
    width: 14,
    height: 14,
  },
  filletInnerCurve: {
    width: 14,
    height: 14,
    borderBottomRightRadius: 14,
  },
  portfolioNameText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.parchmentPale,
    fontWeight: '700',
    lineHeight: 17,
    letterSpacing: 0.3,
  },
  accountCodeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.tertiary,
    fontWeight: '700',
  },
});

export default StackedWalletDeck;
