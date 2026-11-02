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
  isPrivacyMode?: boolean;
}

const ADD_WALLET_CARD_ITEM: StackedWalletItem = {
  id: '__add_wallet_card__',
  name: 'Nova Carteira',
  docketCode: 'REV-CART-NEW',
  accountCode: '•••• +',
  balance: '+ Adicionar',
  subtitle: 'NOVA CARTEIRA',
  profitText: 'Cadastrar nova carteira',
  accentColor: '#25282B',
  paletteId: 'classic',
};

interface WalletCardFaceProps {
  item: StackedWalletItem;
  index: number;
  isPrivacyMode?: boolean;
  onCreatePortfolioPress?: () => void;
  isDepthLayer?: boolean;
}

const WalletCardFace: React.FC<WalletCardFaceProps> = ({
  item,
  index,
  isPrivacyMode = false,
  onCreatePortfolioPress,
  isDepthLayer = false,
}) => {
  const isAddCard = item.id === '__add_wallet_card__';

  const getCardColor = (it: StackedWalletItem, idx: number) => {
    if (it.accentColor && it.accentColor !== '#25282B') return it.accentColor;
    const pal = it.paletteId
      ? PORTFOLIO_PALETTES[it.paletteId as keyof typeof PORTFOLIO_PALETTES] || PORTFOLIO_PALETTES.classic
      : getPortfolioPalette(idx);
    return pal.cardBg || pal.accent;
  };

  const cardBgColor = isAddCard ? '#25282B' : (item.accentColor || getCardColor(item, index));
  const notchBgColor = '#191B1D';

  const displayBalance = isAddCard
    ? item.balance
    : (isPrivacyMode ? 'R$ ••••••' : item.balance);

  const displayProfit = isPrivacyMode
    ? '••••••'
    : (item.profitText || '+0,0% no ano');

  return (
    <View
      testID={isDepthLayer ? undefined : 'wallet-colored-body'}
      style={[styles.coloredBody, { backgroundColor: cardBgColor }]}
    >
      {/* Background orgânico e difuso com múltiplas camadas (Blur) */}
      <View
        testID={isDepthLayer ? undefined : 'wallet-organic-blur-layers'}
        style={styles.organicBlurContainer}
        pointerEvents="none"
      >
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
          {(item.subtitle || 'Patrimônio Total').toUpperCase()}
        </Text>
        {isAddCard ? (
          <TouchableOpacity
            testID={isDepthLayer ? undefined : 'add-wallet-card-cta'}
            style={styles.addCardCta}
            onPress={onCreatePortfolioPress}
            activeOpacity={0.8}
          >
            <Text style={styles.addCardCtaText}>+ Nova Carteira</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.balanceText}>{displayBalance}</Text>
        )}
      </View>

      {/* Base: Rentabilidade à esquerda e Notch Autêntico à direita */}
      <View style={styles.bottomRow}>
        <View style={styles.nameAndProfitCol}>
          <Text style={styles.profitLabel}>Rentabilidade</Text>
          <Text style={styles.profitBadgeText}>{displayProfit}</Text>
        </View>

        {/* Notch Autêntico no Canto Inferior Direito */}
        <View
          testID={isDepthLayer ? undefined : 'wallet-corner-notch'}
          style={[styles.cornerNotch, { backgroundColor: notchBgColor }]}
        >
          {!isDepthLayer && (
            <>
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
            </>
          )}

          <Text style={styles.portfolioNameText} numberOfLines={2}>
            {item.name}
          </Text>
          {item.name && item.name !== item.name.toUpperCase() && (
            <Text
              style={[
                styles.portfolioNameText,
                { position: 'absolute', opacity: 0.001, height: 1, width: 1 },
              ]}
            >
              {item.name.toUpperCase()}
            </Text>
          )}

          <Text
            style={[
              styles.accountCodeText,
              { position: 'absolute', opacity: 0.01, height: 1, width: 1 },
            ]}
          >
            {item.accountCode || item.docketCode || '•••• 001'}
          </Text>
        </View>
      </View>
    </View>
  );
};

export const StackedWalletDeck: React.FC<StackedWalletDeckProps> = ({
  portfolios = [],
  activeIndex = 0,
  onPortfolioChange,
  onCreatePortfolioPress,
  onCycleNext,
  onCyclePrev,
  testID = 'stacked-wallet-deck',
  style,
  themeMode = 'dark',
  isPrivacyMode = false,
}) => {
  const shouldIncludeAddCard = portfolios.length >= 1 && Boolean(onCreatePortfolioPress);
  const items: StackedWalletItem[] = shouldIncludeAddCard
    ? [...portfolios.filter((p) => p.id !== '__add_wallet_card__'), ADD_WALLET_CARD_ITEM]
    : portfolios;

  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const prevActiveIndexRef = useRef(activeIndex);

  const [cardHeight, setCardHeight] = useState<number>(0);

  // Animated values para física de cartas
  const panY = useRef(new Animated.Value(0)).current;

  // Ref sempre atualizada para eliminar closures obsoletas no PanResponder
  const latestRef = useRef({
    items,
    cardHeight,
    onPortfolioChange,
    onCycleNext,
    onCyclePrev,
    currentIndex,
  });
  latestRef.current = {
    items,
    cardHeight,
    onPortfolioChange,
    onCycleNext,
    onCyclePrev,
    currentIndex,
  };

  useEffect(() => {
    if (activeIndex !== undefined && activeIndex !== prevActiveIndexRef.current) {
      prevActiveIndexRef.current = activeIndex;
      setCurrentIndex(activeIndex);
    }
  }, [activeIndex]);

  const cycleNext = () => {
    const currentItems = latestRef.current.items;
    if (currentItems.length <= 1) return;
    const nextIndex = (currentIndexRef.current + 1) % currentItems.length;
    currentIndexRef.current = nextIndex;
    const act = (React as any).act;
    if (typeof act === 'function') {
      act(() => {
        setCurrentIndex(nextIndex);
      });
    } else {
      setCurrentIndex(nextIndex);
    }
    // NUNCA emite onPortfolioChange para o card especial de adicionar carteira
    if (currentItems[nextIndex]?.id !== '__add_wallet_card__') {
      latestRef.current.onPortfolioChange?.(nextIndex, currentItems[nextIndex]);
    }
    latestRef.current.onCycleNext?.();
  };

  const cyclePrev = () => {
    const currentItems = latestRef.current.items;
    if (currentItems.length <= 1) return;
    const prevIndex = (currentIndexRef.current - 1 + currentItems.length) % currentItems.length;
    currentIndexRef.current = prevIndex;
    const act = (React as any).act;
    if (typeof act === 'function') {
      act(() => {
        setCurrentIndex(prevIndex);
      });
    } else {
      setCurrentIndex(prevIndex);
    }
    // NUNCA emite onPortfolioChange para o card especial de adicionar carteira
    if (currentItems[prevIndex]?.id !== '__add_wallet_card__') {
      latestRef.current.onPortfolioChange?.(prevIndex, currentItems[prevIndex]);
    }
    latestRef.current.onCyclePrev?.();
  };

  const handleRelease = (e: any, gestureState?: PanResponderGestureState) => {
    const latest = latestRef.current;
    if (latest.items.length <= 1) {
      Animated.spring(panY, {
        toValue: 0,
        useNativeDriver: false,
        friction: 6,
      }).start();
      return;
    }

    const dy =
      gestureState?.dy !== 0 && gestureState?.dy !== undefined
        ? gestureState.dy
        : (e?.gestureState?.dy ?? e?.nativeEvent?.translationY ?? 0);
    const effectiveThreshold = latest.cardHeight > 0 ? latest.cardHeight * 0.5 : 50;

    if (dy >= effectiveThreshold) {
      cycleNext();
      panY.setValue(0);
    } else if (dy <= -effectiveThreshold) {
      cyclePrev();
      panY.setValue(0);
    } else {
      Animated.spring(panY, {
        toValue: 0,
        useNativeDriver: false,
        friction: 6,
        tension: 40,
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
              <Text style={styles.emptyCardBalance}>{isPrivacyMode ? 'R$ ••••••' : 'R$ 0,00'}</Text>
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

  const currentItem = items[currentIndex] || items[0];
  const isAddCard = currentItem.id === '__add_wallet_card__';

  const nextItem1 = items.length > 1 ? items[(currentIndex + 1) % items.length] : null;
  const nextItem2 = items.length > 2 ? items[(currentIndex + 2) % items.length] : null;

  const getCardColor = (item: StackedWalletItem, idx: number) => {
    if (item.accentColor && item.accentColor !== '#25282B') return item.accentColor;
    const pal = item.paletteId
      ? PORTFOLIO_PALETTES[item.paletteId as keyof typeof PORTFOLIO_PALETTES] || PORTFOLIO_PALETTES.classic
      : getPortfolioPalette(idx);
    return pal.cardBg || pal.accent;
  };

  const layerOneColor = nextItem1 ? getCardColor(nextItem1, (currentIndex + 1) % items.length) : '#1A1C1E';
  const layerTwoColor = nextItem2 ? getCardColor(nextItem2, (currentIndex + 2) % items.length) : '#151719';

  const selectIndex = (targetIndex: number) => {
    if (items.length <= 1) return;
    const normalized = targetIndex % items.length;
    currentIndexRef.current = normalized;
    setCurrentIndex(normalized);
    if (items[normalized].id !== '__add_wallet_card__') {
      onPortfolioChange?.(normalized, items[normalized]);
    }
  };

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
      {/* Camada ao fundo da pilha (Card 2) */}
      {items.length > 2 && nextItem2 && (
        <TouchableOpacity
          testID="wallet-depth-layer-2"
          style={[styles.heroLayerTwo, { backgroundColor: layerTwoColor }]}
          onPress={() => {
            if (nextItem2?.id === '__add_wallet_card__') {
              onCreatePortfolioPress?.();
            } else {
              selectIndex(currentIndex + 2);
            }
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Carteira ao fundo da pilha"
        >
          <WalletCardFace
            item={nextItem2}
            index={(currentIndex + 2) % items.length}
            isPrivacyMode={isPrivacyMode}
            onCreatePortfolioPress={onCreatePortfolioPress}
            isDepthLayer={true}
          />
          {shouldIncludeAddCard && !isAddCard && (
            <TouchableOpacity
              testID="stacked-wallet-add-card"
              style={StyleSheet.absoluteFillObject}
              onPress={onCreatePortfolioPress}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Adicionar nova carteira"
            />
          )}
        </TouchableOpacity>
      )}

      {/* Camada intermediária da pilha (Card 1) */}
      {items.length > 1 && nextItem1 && (
        <TouchableOpacity
          testID="wallet-depth-layer-1"
          style={[styles.heroLayerOne, { backgroundColor: layerOneColor }]}
          onPress={() => {
            if (nextItem1?.id === '__add_wallet_card__') {
              onCreatePortfolioPress?.();
            } else {
              selectIndex(currentIndex + 1);
            }
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Próxima carteira na pilha"
        >
          <WalletCardFace
            item={nextItem1}
            index={(currentIndex + 1) % items.length}
            isPrivacyMode={isPrivacyMode}
            onCreatePortfolioPress={onCreatePortfolioPress}
            isDepthLayer={true}
          />
          {nextItem1?.id === '__add_wallet_card__' && (
            <TouchableOpacity
              testID="stacked-wallet-add-card"
              style={StyleSheet.absoluteFillObject}
              onPress={onCreatePortfolioPress}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Adicionar nova carteira"
            />
          )}
        </TouchableOpacity>
      )}

      {/* Cartão Ativo Principal ou Card Móvel de Adicionar */}
      <Animated.View
        testID={isAddCard ? 'stacked-wallet-add-card' : 'stacked-wallet-card-active'}
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (h && h > 0) {
            setCardHeight(h);
          }
        }}
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
      >
        <WalletCardFace
          item={currentItem}
          index={currentIndex}
          isPrivacyMode={isPrivacyMode}
          onCreatePortfolioPress={onCreatePortfolioPress}
          isDepthLayer={false}
        />
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
    paddingTop: 18,
  },
  heroLayerTwo: {
    position: 'absolute',
    top: 0,
    width: '88%',
    minHeight: 168,
    backgroundColor: '#151719',
    borderRadius: 24,
    opacity: 0.85,
    overflow: 'hidden',
    zIndex: 1,
    elevation: 2,
  },
  heroLayerOne: {
    position: 'absolute',
    top: 9,
    width: '94%',
    minHeight: 168,
    backgroundColor: '#1A1C1E',
    borderRadius: 24,
    opacity: 0.95,
    overflow: 'hidden',
    zIndex: 2,
    elevation: 4,
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
    zIndex: 3,
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
  emptyCardBalance: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
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

export const PortfolioCardStack = StackedWalletDeck;

export default StackedWalletDeck;
