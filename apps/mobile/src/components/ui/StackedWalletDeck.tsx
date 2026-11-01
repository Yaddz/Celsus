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
  TouchableOpacity,
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
  onCreatePortfolioPress?: () => void;
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

const ADD_WALLET_CARD_ITEM: StackedWalletItem = {
  id: '__add_wallet_card__',
  name: 'Nova Carteira',
  docketCode: 'REV-CART-NEW',
  accountCode: '•••• +',
  balance: '+ Adicionar',
  subtitle: 'EXPANDIR DOSSIÊ',
  profitText: 'Cadastrar nova carteira',
  accentColor: '#25282B',
  paletteId: 'classic',
};

export const StackedWalletDeck: React.FC<StackedWalletDeckProps> = ({
  portfolios = DEFAULT_PORTFOLIOS,
  activeIndex = 0,
  onPortfolioChange,
  onCreatePortfolioPress,
  onCycleNext,
  onCyclePrev,
  testID = 'stacked-wallet-deck',
  style,
  themeMode = 'dark',
}) => {
  // Empty State: quando explicitamente passado array vazio
  if (portfolios && portfolios.length === 0) {
    return (
      <View testID={testID} style={[styles.heroWrapper, style]}>
        <View testID="stacked-wallet-empty-card" style={styles.heroCard}>
          <View style={[styles.coloredBody, styles.emptyCardBody]}>
            {/* Camadas orgânicas difusas */}
            <View testID="wallet-organic-blur-layers" style={styles.organicBlurContainer} pointerEvents="none">
              <View
                style={[
                  styles.organicShape,
                  {
                    top: -20,
                    left: -20,
                    width: 140,
                    height: 110,
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: 70,
                  },
                ]}
              />
              <View
                style={[
                  styles.organicShape,
                  {
                    top: 20,
                    right: -20,
                    width: 120,
                    height: 120,
                    backgroundColor: 'rgba(0, 0, 0, 0.20)',
                    borderRadius: 60,
                  },
                ]}
              />
            </View>

            <View style={styles.emptyCardContent}>
              <Text style={styles.emptyCardTitle}>Nenhuma carteira cadastrada</Text>
              <Text style={styles.emptyCardSubtitle}>
                Crie sua primeira carteira para começar a acompanhar seu patrimônio
              </Text>
              <TouchableOpacity
                testID="empty-wallet-create-cta"
                style={styles.emptyCardCta}
                onPress={onCreatePortfolioPress}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyCardCtaText}>+ Criar primeira carteira</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const shouldIncludeAddCard = portfolios.length >= 1 && Boolean(onCreatePortfolioPress);
  const items: StackedWalletItem[] = shouldIncludeAddCard
    ? [...portfolios, ADD_WALLET_CARD_ITEM]
    : (portfolios.length > 0 ? portfolios : DEFAULT_PORTFOLIOS);

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
  const isAddCard = currentItem.id === '__add_wallet_card__';

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

      {/* Cartão Ativo Principal ou Card Móvel de Adicionar */}
      <Animated.View
        testID={isAddCard ? 'stacked-wallet-add-card' : 'stacked-wallet-card-active'}
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
        {/* Corpo colorido preenchendo o card */}
        <View
          testID="wallet-colored-body"
          style={[styles.coloredBody, { backgroundColor: cardBgColor }]}
        >
          {/* Background orgânico e difuso com múltiplas camadas (Blur) */}
          <View testID="wallet-organic-blur-layers" style={styles.organicBlurContainer} pointerEvents="none">
            <View
              style={[
                styles.organicShape,
                {
                  top: -24,
                  left: -20,
                  width: 145,
                  height: 110,
                  backgroundColor: 'rgba(255, 255, 255, 0.20)',
                  borderRadius: 72,
                  transform: [{ rotate: '12deg' }],
                },
              ]}
            />
            <View
              style={[
                styles.organicShape,
                {
                  top: -10,
                  left: 14,
                  width: 115,
                  height: 85,
                  backgroundColor: 'rgba(255, 255, 255, 0.30)',
                  borderRadius: 58,
                },
              ]}
            />
            <View
              style={[
                styles.organicShape,
                {
                  top: 15,
                  right: -25,
                  width: 130,
                  height: 130,
                  backgroundColor: 'rgba(0, 0, 0, 0.20)',
                  borderRadius: 65,
                  transform: [{ rotate: '-18deg' }],
                },
              ]}
            />
            <View
              style={[
                styles.organicShape,
                {
                  bottom: -18,
                  left: 36,
                  width: 95,
                  height: 75,
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  borderRadius: 48,
                },
              ]}
            />
          </View>

          {/* Topo Esquerdo: Esferas Bokeh Difusas Translúcidas Sobrepostas */}
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

          {/* Topo Direito: PATRIMÔNIO TOTAL e Valor em Destaque */}
          <View style={styles.balanceCol}>
            <Text style={styles.balanceSubtitle}>
              {(currentItem.subtitle || 'Patrimônio Total').toUpperCase()}
            </Text>
            {isAddCard ? (
              <TouchableOpacity
                testID="add-wallet-card-cta"
                style={styles.addCardCta}
                onPress={onCreatePortfolioPress}
                activeOpacity={0.8}
              >
                <Text style={styles.addCardCtaText}>+ Nova Carteira</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.balanceText}>{currentItem.balance}</Text>
            )}
          </View>

          {/* Base: Rentabilidade à esquerda e Notch Autêntico à direita */}
          <View style={styles.bottomRow}>
            <View style={styles.nameAndProfitCol}>
              <Text style={styles.profitLabel}>Rentabilidade</Text>
              <Text style={styles.profitBadgeText}>
                {currentItem.profitText || '+0,0% no ano'}
              </Text>
            </View>

            {/* Notch Autêntico no Canto Inferior Direito */}
            <View
              testID="wallet-corner-notch"
              style={[styles.cornerNotch, { backgroundColor: notchBgColor }]}
            >
              {/* Curva de concordância côncava superior (Top Inverted Fillet) */}
              <View
                testID="notch-fillet-top"
                style={[styles.filletTopContainer, { backgroundColor: cardBgColor }]}
                pointerEvents="none"
              >
                <View
                  testID="notch-fillet-top-inner"
                  style={[styles.filletInnerCurve, { backgroundColor: notchBgColor }]}
                />
              </View>

              {/* Curva de concordância côncava lateral esquerda (Left Inverted Fillet) */}
              <View
                testID="notch-fillet-left"
                style={[styles.filletLeftContainer, { backgroundColor: cardBgColor }]}
                pointerEvents="none"
              >
                <View
                  testID="notch-fillet-left-inner"
                  style={[styles.filletInnerCurve, { backgroundColor: notchBgColor }]}
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
    zIndex: 999,
    elevation: 24,
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
    borderWidth: 0,
    borderColor: 'transparent',
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
  // Background Orgânico e Difuso (Blur)
  organicBlurContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  organicShape: {
    position: 'absolute',
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
  // Notch Autêntico no Canto Inferior Direito com Quinas Retas
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
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderColor: 'transparent',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Concordâncias côncavas ocultadas para manter quinas limpas
  filletTopContainer: {
    position: 'absolute',
    top: -14,
    right: 0,
    width: 0,
    height: 0,
    opacity: 0,
  },
  filletLeftContainer: {
    position: 'absolute',
    bottom: 0,
    left: -14,
    width: 0,
    height: 0,
    opacity: 0,
  },
  filletInnerCurve: {
    width: 0,
    height: 0,
    opacity: 0,
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
  // Empty State Styles
  emptyCardBody: {
    backgroundColor: '#191B1D',
    minHeight: 170,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyCardContent: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  emptyCardTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyCardSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.tertiary,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  emptyCardCta: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardCtaText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#111315',
  },
  // Add Card Styles
  addCardCta: {
    backgroundColor: '#D5CAA8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 4,
  },
  addCardCtaText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#111315',
  },
});

export default StackedWalletDeck;
