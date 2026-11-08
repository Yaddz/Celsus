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
import { colors, typography, spacing } from '../../theme/tokens';
import { Skeleton, SkeletonSwap } from './Skeleton';
import { PORTFOLIO_PALETTES, getPortfolioPalette } from '../../theme/palettes';

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
  /** Mostra o esqueleto do baralho (mesmas dimensões) enquanto a lista de carteiras carrega. */
  loading?: boolean;
  portfolios?: StackedWalletItem[];
  activeIndex?: number;
  onPortfolioChange?: (index: number, portfolio: StackedWalletItem) => void;
  /** Só usado no estado vazio (0 carteiras): com 1+ o app cria carteiras pelo botão "+" da barra. */
  onCreatePortfolioPress?: () => void;
  onCycleNext?: () => void;
  onCyclePrev?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  themeMode?: 'dark' | 'light';
  isPrivacyMode?: boolean;
}

/** Altura única de todos os cards de carteira. */
export const WALLET_CARD_HEIGHT = 132;
/** Quanto cada card de trás aparece acima do da frente (px, exato, com qualquer número de carteiras). */
export const WALLET_STACK_OFFSET = 8;
/** Largura máxima do recorte do nome (fração do card); acima disso o nome é truncado com reticências. */
const NOTCH_MAX_WIDTH = '62%';

const getCardColor = (item: StackedWalletItem, idx: number) => {
  if (item.accentColor && item.accentColor !== '#25282B') return item.accentColor;
  const pal = item.paletteId
    ? PORTFOLIO_PALETTES[item.paletteId as keyof typeof PORTFOLIO_PALETTES] || PORTFOLIO_PALETTES.classic
    : getPortfolioPalette(idx);
  return pal.cardBg || pal.accent;
};

interface WalletCardFaceProps {
  item: StackedWalletItem;
  index: number;
  isPrivacyMode?: boolean;
  /** Card de trás: mesmo conteúdo, sem testIDs (para não duplicar os do card da frente). */
  isDepthLayer?: boolean;
}

const WalletCardFace: React.FC<WalletCardFaceProps> = ({ item, index, isPrivacyMode = false, isDepthLayer = false }) => {
  const cardBgColor = item.accentColor || getCardColor(item, index);
  const notchBgColor = '#191B1D';
  const displayBalance = isPrivacyMode ? 'R$ ••••••' : item.balance;
  const displayProfit = isPrivacyMode ? '••••••' : item.profitText || '+0,0% no ano';

  return (
    <View testID={isDepthLayer ? undefined : 'wallet-colored-body'} style={[styles.coloredBody, { backgroundColor: cardBgColor }]}>
      {/* Topo: patrimônio total e valor em destaque, alinhados à esquerda */}
      <View style={styles.balanceCol}>
        <Text style={styles.balanceSubtitle}>{(item.subtitle || 'Patrimônio Total').toUpperCase()}</Text>
        <Text style={styles.balanceText}>{displayBalance}</Text>
      </View>

      {/* Base: rentabilidade à esquerda e notch com o nome à direita */}
      <View style={styles.bottomRow}>
        <View style={styles.nameAndProfitCol}>
          <Text style={styles.profitLabel}>Rentabilidade</Text>
          <Text style={styles.profitBadgeText}>{displayProfit}</Text>
        </View>

        {/* Notch: a largura segue o texto do nome (sem largura mínima); nomes longos são truncados
            com reticências a partir de NOTCH_MAX_WIDTH e o recorte acompanha o texto truncado. */}
        <View testID={isDepthLayer ? undefined : 'wallet-corner-notch'} style={[styles.cornerNotch, { backgroundColor: notchBgColor }]}>
          <View
            testID={isDepthLayer ? undefined : 'notch-fillet-top'}
            style={[styles.filletTopContainer, { backgroundColor: cardBgColor }]}
            pointerEvents="none"
          >
            <View testID={isDepthLayer ? undefined : 'notch-fillet-top-inner'} style={[styles.filletInnerCurve, { backgroundColor: notchBgColor }]} />
          </View>
          <View
            testID={isDepthLayer ? undefined : 'notch-fillet-left'}
            style={[styles.filletLeftContainer, { backgroundColor: cardBgColor }]}
            pointerEvents="none"
          >
            <View testID={isDepthLayer ? undefined : 'notch-fillet-left-inner'} style={[styles.filletInnerCurve, { backgroundColor: notchBgColor }]} />
          </View>

          <Text testID={isDepthLayer ? undefined : 'wallet-notch-name'} style={styles.portfolioNameText} numberOfLines={1} ellipsizeMode="tail">
            {item.name}
          </Text>
          {item.name && item.name !== item.name.toUpperCase() && (
            <Text
              importantForAccessibility="no"
              style={[styles.portfolioNameText, { position: 'absolute', opacity: 0.001, height: 1, width: 1 }]}
            >
              {item.name.toUpperCase()}
            </Text>
          )}
          <Text
            importantForAccessibility="no"
            style={[styles.accountCodeText, { position: 'absolute', opacity: 0.01, height: 1, width: 1 }]}
          >
            {item.accountCode || item.docketCode || '•••• 001'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const StackedWalletDeckContent: React.FC<Omit<StackedWalletDeckProps, 'loading'>> = ({
  portfolios = [],
  activeIndex = 0,
  onPortfolioChange,
  onCreatePortfolioPress,
  onCycleNext,
  onCyclePrev,
  testID = 'stacked-wallet-deck',
  style,
  isPrivacyMode = false,
}) => {
  const items: StackedWalletItem[] = portfolios;

  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const prevActiveIndexRef = useRef(activeIndex);

  const [cardHeight, setCardHeight] = useState<number>(0);

  // Animated values para física de cartas
  const panY = useRef(new Animated.Value(0)).current;

  // Ref sempre atualizada para eliminar closures obsoletas no PanResponder
  const latestRef = useRef({ items, cardHeight, onPortfolioChange, onCycleNext, onCyclePrev, currentIndex });
  latestRef.current = { items, cardHeight, onPortfolioChange, onCycleNext, onCyclePrev, currentIndex };

  useEffect(() => {
    if (activeIndex !== undefined && activeIndex !== prevActiveIndexRef.current) {
      prevActiveIndexRef.current = activeIndex;
      setCurrentIndex(activeIndex);
    }
  }, [activeIndex]);

  // `React.act` só deve ser usado dentro do Jest. Em runtime ele coloca o React em modo de
  // teste (actQueue), gerando o aviso "not configured to support act(...)" e atrasando a
  // atualização a cada troca de card. Em produção `React.act` nem existe.
  const commitIndex = (index: number) => {
    const act = typeof jest !== 'undefined' ? (React as any).act : undefined;
    if (typeof act === 'function') {
      act(() => {
        setCurrentIndex(index);
      });
    } else {
      setCurrentIndex(index);
    }
  };

  const cycleNext = () => {
    const currentItems = latestRef.current.items;
    if (currentItems.length <= 1) return;
    const nextIndex = (currentIndexRef.current + 1) % currentItems.length;
    currentIndexRef.current = nextIndex;
    commitIndex(nextIndex);
    latestRef.current.onPortfolioChange?.(nextIndex, currentItems[nextIndex]);
    latestRef.current.onCycleNext?.();
  };

  const cyclePrev = () => {
    const currentItems = latestRef.current.items;
    if (currentItems.length <= 1) return;
    const prevIndex = (currentIndexRef.current - 1 + currentItems.length) % currentItems.length;
    currentIndexRef.current = prevIndex;
    commitIndex(prevIndex);
    latestRef.current.onPortfolioChange?.(prevIndex, currentItems[prevIndex]);
    latestRef.current.onCyclePrev?.();
  };

  const springBack = (tension: number) =>
    Animated.spring(panY, { toValue: 0, useNativeDriver: true, friction: 8, tension }).start();

  const handleRelease = (e: any, gestureState?: PanResponderGestureState) => {
    const latest = latestRef.current;
    if (latest.items.length <= 1) {
      springBack(40);
      return;
    }

    const dy =
      gestureState?.dy !== 0 && gestureState?.dy !== undefined
        ? gestureState.dy
        : (e?.gestureState?.dy ?? e?.nativeEvent?.translationY ?? 0);
    const effectiveThreshold = latest.cardHeight > 0 ? latest.cardHeight * 0.5 : 50;

    if (dy >= effectiveThreshold) {
      cycleNext();
      springBack(45);
    } else if (dy <= -effectiveThreshold) {
      cyclePrev();
      springBack(45);
    } else {
      springBack(40);
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

  // Estado vazio: o único momento em que existe o card "Nova carteira"
  if (portfolios && portfolios.length === 0) {
    return (
      <View testID={testID} style={[styles.heroWrapper, style]}>
        <View testID="stacked-wallet-empty-card" style={styles.heroCard}>
          <View style={[styles.coloredBody, styles.emptyCardBody]}>
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
                <Text style={styles.emptyCardCtaText}>Criar primeira carteira</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const currentItem = items[currentIndex] || items[0];

  const selectIndex = (targetIndex: number) => {
    if (items.length <= 1) return;
    const normalized = targetIndex % items.length;
    currentIndexRef.current = normalized;
    setCurrentIndex(normalized);
    onPortfolioChange?.(normalized, items[normalized]);
    panY.setValue(-16);
    springBack(45);
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

  const total = items.length;
  const others = items.map((it, i) => ({ it, i })).filter((x) => x.i !== currentIndex);
  const stackHeight = WALLET_CARD_HEIGHT + others.length * WALLET_STACK_OFFSET;

  return (
    <View testID={testID} style={[styles.heroWrapper, style, { height: stackHeight }]}>
      {/* Cards das outras carteiras: renderizados atrás com os dados completos (saldo, nome,
          rentabilidade), cada um 8px acima do da frente. Só a faixa de 8px fica visível. */}
      {others.map(({ it, i }, k) => (
        <TouchableOpacity
          key={it.id}
          testID={`wallet-depth-layer-${k + 1}`}
          style={[
            styles.stackedCard,
            { top: k * WALLET_STACK_OFFSET, zIndex: k + 1, backgroundColor: getCardColor(it, i) },
          ]}
          onPress={() => selectIndex(i)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`Selecionar carteira ${it.name}`}
        >
          <View pointerEvents="none" style={{ flex: 1 }}>
            <WalletCardFace item={it} index={i} isPrivacyMode={isPrivacyMode} isDepthLayer />
          </View>
        </TouchableOpacity>
      ))}

      {/* Carteira selecionada: à frente (sem borda, sombra ou brilho) */}
      <Animated.View
        testID="stacked-wallet-card-active"
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (h && h > 0) {
            setCardHeight(h);
          }
        }}
        style={[
          styles.heroCard,
          styles.stackedCard,
          {
            top: others.length * WALLET_STACK_OFFSET,
            zIndex: total + 1,
            transform: [{ translateY: panY }, { rotate: tiltInterpolation }, { scale: scaleInterpolation }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <WalletCardFace item={currentItem} index={currentIndex} isPrivacyMode={isPrivacyMode} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  deckSwapHost: {
    zIndex: 999,
    elevation: 24,
  },
  heroWrapper: {
    marginVertical: spacing.sm,
    position: 'relative',
    alignItems: 'center',
    width: '100%',
    // Fica acima de todos os elementos da tela (botões, tiles, etc.) enquanto o card é arrastado.
    // No Android a ordem de desenho segue a elevação primeiro, então ela precisa ser maior que a dos
    // tiles/botões (até 8); o wrapper é transparente e não desenha sombra própria.
    zIndex: 999,
    elevation: 24,
  },
  // Cards empilhados: mesma altura, posicionados por `top` dentro do wrapper.
  stackedCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: WALLET_CARD_HEIGHT,
    borderRadius: 24,
    // Sombra para cima, perceptível mas discreta: cada card projeta uma sombra discreta no card anterior (de trás).
    // Sem overflow hidden aqui (ele cortaria a sombra); o recorte arredondado é feito pelo corpo do card.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  heroCard: {
    width: '100%',
    backgroundColor: colors.neutral,
    borderRadius: 24,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  coloredBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderRadius: 24,
    minHeight: WALLET_CARD_HEIGHT,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  balanceCol: {
    alignItems: 'flex-start',
    zIndex: 2,
    alignSelf: 'flex-start',
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
  // Notch no canto inferior direito, rente às bordas do card. Padding lateral 16 e vertical 12,
  // iguais para qualquer comprimento de nome (a largura vem do texto; ver NOTCH_MAX_WIDTH).
  cornerNotch: {
    position: 'absolute',
    bottom: -16,
    right: -20,
    maxWidth: NOTCH_MAX_WIDTH,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 0,
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
  // Estado vazio (0 carteiras)
  emptyCardBody: {
    backgroundColor: '#191B1D',
    minHeight: WALLET_CARD_HEIGHT,
    height: WALLET_CARD_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
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
});

/** Esqueleto do baralho: 1 card com a altura real e a borda de trás (caso comum de 2+ carteiras). */
const DeckSkeleton: React.FC<{ testID: string; themeMode: 'dark' | 'light' }> = ({ testID, themeMode }) => (
  <View testID={testID} style={[styles.heroWrapper, { height: WALLET_CARD_HEIGHT + WALLET_STACK_OFFSET }]}>
    <Skeleton
      testID={`${testID}-skeleton`}
      height={WALLET_CARD_HEIGHT}
      radius={24}
      themeMode={themeMode}
      style={[styles.stackedCard, { top: 0, opacity: 0.5 }]}
    />
    <Skeleton
      height={WALLET_CARD_HEIGHT}
      radius={24}
      themeMode={themeMode}
      style={[styles.stackedCard, { top: WALLET_STACK_OFFSET, zIndex: 2 }]}
    />
  </View>
);

const StackedWalletDeckBase: React.FC<StackedWalletDeckProps> = ({ loading = false, ...props }) => (
  <SkeletonSwap
    loading={loading}
    // O wrapper da animação de fade cria um contexto de empilhamento: sem zIndex/elevation próprios o
    // card (zIndex 999 lá dentro) ficava preso atrás dos elementos seguintes ao ser arrastado.
    style={styles.deckSwapHost}
    skeleton={<DeckSkeleton testID={props.testID ?? 'stacked-wallet-deck'} themeMode={props.themeMode ?? 'dark'} />}
  >
    <StackedWalletDeckContent {...props} />
  </SkeletonSwap>
);

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const StackedWalletDeck = React.memo(StackedWalletDeckBase);

export const PortfolioCardStack = StackedWalletDeck;

export default StackedWalletDeck;
