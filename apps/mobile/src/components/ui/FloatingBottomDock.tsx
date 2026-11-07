import React, { useState, useRef, useEffect, startTransition } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
  Easing,
  Alert,
  LayoutChangeEvent,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders, dock } from '../../theme/tokens';
import { springs, durations, pillStretch } from '../../theme/motion';

/** Fade horizontal do texto da aba: deslocamento (px) e tempos (ms). */
const LABEL_SLIDE = -10;
const LABEL_OUT_MS = 110;
const LABEL_IN_MS = 200;
const LABEL_IN_DELAY_MS = 40;
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { JellyPressable } from './JellyPressable';

export type DockTab = 'home' | 'stats' | 'search' | 'wallets';

export interface FloatingBottomDockProps {
  activeTab?: DockTab;
  onTabChange?: (tab: DockTab) => void;
  onActionPress?: () => void;
  onNovoAportePress?: () => void;
  onNovaCarteiraPress?: () => void;
  onAdicionarAtivoPress?: () => void;
  forceClose?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

interface TabItem {
  id: DockTab;
  iconName: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

const TABS: TabItem[] = [
  { id: 'home', iconName: 'home', label: 'Início' },
  { id: 'stats', iconName: 'bar-chart', label: 'Análises' },
  { id: 'search', iconName: 'receipt-long', label: 'Busca' },
  { id: 'wallets', iconName: 'account-balance-wallet', label: 'Carteiras' },
];

// Geometria da barra (valores em theme/tokens -> dock). A pílula ativa mede
// padding + ícone + gap + texto, ou seja, envolve o conteúdo com pouca folga.
const TRACK_PAD = 8;
const SLOT_W = dock.inactiveSlotWidth;
const ICON = dock.iconSize;
const PAD_X = dock.pillPaddingX;
const LABEL_GAP = dock.labelGap;
const PILL_H = dock.pillHeight;
const CHAR_W = 7.4; // estimativa de largura por caractere até o onLayout medir de verdade

const estimateLabelW = (label: string) => Math.round(label.length * CHAR_W);

/** Largura da pílula ativa de cada aba. */
const pillWidth = (labelW: number) => PAD_X * 2 + ICON + LABEL_GAP + labelW;

/** x (esquerda) de cada slot; as sobras de largura viram espaço entre as abas. */
function slotLefts(activeIndex: number, pillW: number[], trackW: number): number[] {
  const widths = TABS.map((_, i) => (i === activeIndex ? pillW[i] : SLOT_W));
  const total = widths.reduce((a, b) => a + b, 0);
  const gap = Math.max(0, (trackW - 2 * TRACK_PAD - total) / (TABS.length - 1));
  const lefts: number[] = [];
  let x = TRACK_PAD;
  widths.forEach((w) => {
    lefts.push(x);
    x += w + gap;
  });
  return lefts;
}

/**
 * O App monta um FloatingBottomDock diferente em cada aba (ramos de render distintos),
 * então o componente é desmontado/remontado a cada troca e perderia a animação.
 * Guardamos o último índice ativo no módulo: o novo dock nasce na posição do anterior
 * e anima até a aba atual, dando continuidade à pílula elástica.
 */
let lastDockIndex: number | null = null;

/**
 * Ícone + que gira 45° (vira ×). Fica isolado e memoizado para NÃO re-renderizar
 * quando o dock muda de estado: re-renders no meio da animação faziam o
 * Animated.View perder o vínculo com o valor e o ícone ficava preso em ×.
 */
const RotatingPlusIcon = React.memo(({ progress }: { progress: Animated.Value }) => {
  const rotation = useRef(
    progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
  ).current;
  return (
    <Animated.View style={{ transform: [{ rotate: rotation }] }}>
      <MaterialIcons name="add" size={28} color="#FFFFFF" />
    </Animated.View>
  );
});

const MENU_ITEMS = [
  { id: 'nova-carteira', testID: 'fab-action-nova-carteira', icon: 'account-balance-wallet', label: 'Nova carteira', sub: 'Criar uma carteira vazia', tint: 'tertiary' },
  { id: 'adicionar-ativo', testID: 'fab-action-adicionar-ativo', icon: 'playlist-add', label: 'Adicionar ativo', sub: 'Incluir um ativo em uma carteira', tint: 'stock' },
  { id: 'novo-aporte', testID: 'fab-action-novo-aporte', icon: 'north-east', label: 'Nova movimentação', sub: 'Registrar compra ou venda', tint: 'primary' },
] as const;

const FloatingBottomDockBase: React.FC<FloatingBottomDockProps> = ({
  activeTab = 'home',
  onTabChange = () => {},
  onActionPress,
  onNovoAportePress,
  onNovaCarteiraPress,
  onAdicionarAtivoPress,
  forceClose = false,
  style,
  testID = 'floating-bottom-dock',
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);
  const isLight = themeMode === 'light';
  const reduced = useReducedMotion();

  // Aba exibida pelo dock: muda NA HORA do toque (render urgente só do dock), enquanto a troca da
  // tela roda em transição. Assim a pílula/texto animam sem esperar a nova tela montar.
  const [shownTab, setShownTab] = useState<DockTab>(activeTab);
  useEffect(() => {
    setShownTab(activeTab);
  }, [activeTab]);
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === shownTab));
  const { width: windowW } = useWindowDimensions();
  // Estimativa inicial (largura da tela - margens - gap - botão +); refinada pelo onLayout.
  const estimatedTrackW = Math.max(0, Math.round(windowW - 32 - 12 - 60));
  const [trackW, setTrackW] = useState(estimatedTrackW);
  const [labelW, setLabelW] = useState<number[]>(() => TABS.map((t) => estimateLabelW(t.label)));
  const pillW = labelW.map(pillWidth);
  const maxPillW = Math.max(...pillW);
  const lefts = slotLefts(activeIndex, pillW, trackW);

  // Posição inicial = onde o dock anterior parou (ou a aba atual, no primeiro uso).
  const initIndex = useRef(lastDockIndex ?? activeIndex).current;
  const initLefts = slotLefts(initIndex, pillW, estimatedTrackW);
  // A pílula base tem largura maxPillW (transform-origin no centro); a largura exibida
  // é obtida por scaleX, então o x do transform compensa o centro.
  const pillTx = (i: number, L: number[]) => L[i] + (maxPillW * (pillW[i] / maxPillW - 1)) / 2;
  const initContent = (i: number) =>
    i === initIndex ? initLefts[i] : initLefts[i] + (SLOT_W - ICON) / 2 - PAD_X;
  // ---- Valores animados (todos transform/opacity => driver nativo) ----
  const pillX = useRef(new Animated.Value(pillTx(initIndex, initLefts))).current;
  const pillBaseScale = useRef(new Animated.Value(pillW[initIndex] / maxPillW)).current;
  const pillScaleX = useRef(new Animated.Value(1)).current;
  const pillScaleY = useRef(
    pillScaleX.interpolate({
      inputRange: [1, pillStretch.maxScaleX],
      outputRange: [1, pillStretch.minScaleY],
      extrapolate: 'clamp',
    })
  ).current;
  const tabX = useRef(TABS.map((_, i) => new Animated.Value(initContent(i)))).current;
  const tabScale = useRef(TABS.map(() => new Animated.Value(1))).current;
  const labelOpacity = useRef(TABS.map((_, i) => new Animated.Value(i === initIndex ? 1 : 0))).current;
  // Fade horizontal do texto: ao sair ele desliza para o lado do ícone enquanto some; ao entrar volta
  // para a posição. Assim não fica um texto "pendurado" enquanto a pílula (mola) ainda está chegando.
  const labelShift = useRef(TABS.map((_, i) => new Animated.Value(i === initIndex ? 0 : LABEL_SLIDE))).current;
  const prevIndexRef = useRef<number | null>(lastDockIndex);
  const pillXValue = useRef(pillTx(initIndex, initLefts));

  // x do conteúdo (ícone+label) de cada aba: ativo alinha com a pílula; inativo centraliza no slot.
  const contentTargets = TABS.map((_, i) =>
    i === activeIndex ? lefts[i] : lefts[i] + (SLOT_W - ICON) / 2 - PAD_X
  );

  useEffect(() => {
    if (trackW === 0) return;
    const first = prevIndexRef.current === null;
    const targetPillTx = pillTx(activeIndex, lefts);
    const distance = first ? 0 : Math.abs(targetPillTx - pillXValue.current);
    prevIndexRef.current = activeIndex;
    lastDockIndex = activeIndex;

    const toX = (v: Animated.Value, to: number, kind: 'jelly' | 'soft') => {
      if (first) {
        v.setValue(to);
        return;
      }
      if (reduced) {
        Animated.timing(v, { toValue: to, duration: durations.reduced, useNativeDriver: true }).start();
      } else {
        Animated.spring(v, { toValue: to, ...springs[kind], useNativeDriver: true }).start();
      }
    };

    toX(pillX, targetPillTx, 'jelly');
    toX(pillBaseScale, pillW[activeIndex] / maxPillW, 'soft');
    pillXValue.current = targetPillTx;
    TABS.forEach((_, i) => {
      toX(tabX[i], contentTargets[i], 'soft');
      const target = i === activeIndex ? 1 : 0;
      if (first) {
        labelOpacity[i].setValue(target);
        labelShift[i].setValue(target === 1 ? 0 : LABEL_SLIDE);
      } else if (reduced) {
        Animated.timing(labelOpacity[i], { toValue: target, duration: durations.reduced, useNativeDriver: true }).start();
        labelShift[i].setValue(target === 1 ? 0 : LABEL_SLIDE);
      } else if (target === 0) {
        // Saída rápida (antes da pílula terminar de sair): some deslizando para o ícone.
        Animated.parallel([
          Animated.timing(labelOpacity[i], { toValue: 0, duration: LABEL_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(labelShift[i], { toValue: LABEL_SLIDE, duration: LABEL_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]).start();
      } else {
        // Entrada: espera a pílula chegar perto e surge deslizando do ícone para a posição final.
        Animated.parallel([
          Animated.timing(labelOpacity[i], { toValue: 1, duration: LABEL_IN_MS, delay: LABEL_IN_DELAY_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(labelShift[i], { toValue: 0, duration: LABEL_IN_MS, delay: LABEL_IN_DELAY_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start();
      }
    });

    // Squash & stretch proporcional à distância percorrida.
    if (!first && !reduced && distance > 0) {
      const norm = Math.min(1, distance / Math.max(1, trackW));
      const peak = Math.min(pillStretch.maxScaleX, 1 + norm * pillStretch.gain * 2);
      Animated.sequence([
        Animated.timing(pillScaleX, { toValue: peak, duration: durations.fast, useNativeDriver: true }),
        Animated.spring(pillScaleX, { toValue: 1, ...springs.jelly, useNativeDriver: true }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, trackW, labelW.join(',')]);

  // ---- Speed dial (+) ----
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const menuAnims = useRef(MENU_ITEMS.map(() => new Animated.Value(0))).current;

  // Voltar com o menu "+" aberto fecha só o menu (registrado depois do handler do App,
  // então roda primeiro).
  useEffect(() => {
    if (!isSheetOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetOpen]);

  useEffect(() => {
    if (forceClose && isSheetOpen) {
      closeSheet();
    }
  }, [forceClose]);

  const animateSheet = (open: boolean) => {
    // Rotação do + em animação própria (timing) e item a item com mola no menu.
    Animated.timing(rotateAnim, {
      toValue: open ? 1 : 0,
      duration: reduced ? durations.reduced : durations.rotate,
      // Animação minúscula (1 ícone): driver JS evita o valor nativo ficar
      // dessincronizado da view ao reabrir/fechar.
      useNativeDriver: false,
    }).start();
    if (open) {
      menuAnims.forEach((a) => a.setValue(0));
      if (reduced) {
        Animated.parallel(
          menuAnims.map((a) => Animated.timing(a, { toValue: 1, duration: durations.reduced, useNativeDriver: true }))
        ).start();
      } else {
        Animated.stagger(
          durations.stagger,
          [...menuAnims].reverse().map((a) =>
            Animated.spring(a, { toValue: 1, ...springs.jelly, useNativeDriver: true })
          )
        ).start();
      }
    }
  };

  const toggleSheet = () => {
    const nextState = !isSheetOpen;
    setIsSheetOpen(nextState);
    animateSheet(nextState);

    // Se não houver callbacks específicos de opções, delega para onActionPress
    if (!onNovoAportePress && !onNovaCarteiraPress && !onAdicionarAtivoPress) {
      onActionPress?.();
    }
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    animateSheet(false);
  };

  const handleTabPress = (tabId: DockTab) => {
    if (isSheetOpen) closeSheet();
    if (tabId === shownTab) return;
    setShownTab(tabId);
    startTransition(() => onTabChange(tabId));
  };

  const pressTab = (i: number, down: boolean) => {
    if (reduced) return;
    Animated.spring(tabScale[i], {
      toValue: down ? 0.86 : 1,
      ...(down ? springs.snappy : springs.jelly),
      useNativeDriver: true,
    }).start();
  };

  const optionHandlers: Record<string, () => void> = {
    'nova-carteira': () => onNovaCarteiraPress?.(),
    'adicionar-ativo': () => onAdicionarAtivoPress?.(),
    'novo-aporte': () => (onNovoAportePress || onActionPress)?.(),
  };
  const tintColor = (t: string) =>
    t === 'tertiary' ? colors.tertiary : t === 'stock' ? colors.stock : colors.primary;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== trackW) setTrackW(w);
  };

  return (
    <View
      style={[styles.wrapper, { paddingBottom: bottomPadding }, style]}
      testID={testID}
      pointerEvents="box-none"
    >
      {/* Backdrop para fechar o speed dial ao tocar fora */}
      {isSheetOpen && (
        <TouchableOpacity
          testID="fab-speed-dial-backdrop"
          activeOpacity={1}
          onPress={closeSheet}
          style={styles.backdrop}
        />
      )}

      {/* Menu do +: cada opção é uma pílula própria, alinhada à direita, em cascata com mola */}
      {isSheetOpen && (
        <View
          testID="fab-speed-dial-stack"
          style={[styles.speedDialStack, isLight && styles.speedDialStackLight]}
        >
          {MENU_ITEMS.map((item, idx) => {
            const a = menuAnims[idx];
            return (
              <Animated.View
                key={item.id}
                style={{
                  alignSelf: 'flex-end',
                  opacity: a,
                  transform: [
                    { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
                    { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  ],
                }}
              >
                <JellyPressable
                  testID={item.testID}
                  intensity="subtle"
                  accessibilityLabel={`${item.label}: ${item.sub}`}
                  style={[styles.speedDialBtn, isLight && styles.speedDialBtnLight]}
                  onPress={() => {
                    closeSheet();
                    optionHandlers[item.id]();
                  }}
                >
                  <Text style={[styles.speedDialLabel, isLight && styles.speedDialLabelLight]}>{item.label}</Text>
                  <MaterialIcons name={item.icon as any} size={20} color={tintColor(item.tint)} />
                </JellyPressable>
              </Animated.View>
            );
          })}
        </View>
      )}

      {/* Pílula de navegação: indicador elástico desliza entre as abas */}
      <View style={[styles.pillContainer, isLight && styles.pillContainerLight]}>
        <View style={styles.pillTrack} onLayout={onTrackLayout}>
          {trackW > 0 && (
            <>
              <Animated.View
                testID="dock-active-indicator"
                style={[
                  styles.pillIndicator,
                  isLight ? styles.pillIndicatorLight : styles.pillIndicatorDark,
                  { width: maxPillW },
                  {
                    transform: [
                      { translateX: pillX },
                      { scaleX: pillBaseScale },
                      { scaleX: pillScaleX },
                      { scaleY: pillScaleY },
                    ],
                  },
                ]}
              />
              {TABS.map((tab, i) => {
                const isActive = i === activeIndex;
                const iconColor = isActive
                  ? (isLight ? '#FFFFFF' : colors.voidFloor)
                  : (isLight ? '#6E6A63' : colors.parchmentPale);
                // O texto só aparece sobre a pílula: mantém a cor "ativa" também enquanto some, sem piscar.
                const labelColor = isLight ? '#FFFFFF' : colors.voidFloor;
                return (
                  <Animated.View
                    key={tab.id}
                    pointerEvents="none"
                    style={[
                      styles.tabContent,
                      { transform: [{ translateX: tabX[i] }, { scale: tabScale[i] }] },
                    ]}
                  >
                    <View style={styles.tabIconBox}>
                      <MaterialIcons name={tab.iconName} size={ICON} color={iconColor} />
                    </View>
                    <Animated.Text
                      testID={isActive ? 'dock-active-label' : undefined}
                      numberOfLines={1}
                      onLayout={(e) => {
                        const w = Math.ceil(e.nativeEvent.layout.width);
                        if (w > 0 && Math.abs(w - labelW[i]) > 1) {
                          setLabelW((prev) => prev.map((v, idx) => (idx === i ? w : v)));
                        }
                      }}
                      style={[
                        styles.tabLabel,
                        { color: labelColor, opacity: labelOpacity[i], transform: [{ translateX: labelShift[i] }] },
                      ]}
                    >
                      {tab.label}
                    </Animated.Text>
                  </Animated.View>
                );
              })}
              {TABS.map((tab, i) => (
                <TouchableOpacity
                  key={`hit-${tab.id}`}
                  testID={`dock-tab-${tab.id}`}
                  activeOpacity={1}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: i === activeIndex }}
                  onPress={() => handleTabPress(tab.id)}
                  onPressIn={() => pressTab(i, true)}
                  onPressOut={() => pressTab(i, false)}
                  style={[styles.tabHit, { left: lefts[i], width: i === activeIndex ? pillW[i] : SLOT_W }]}
                />
              ))}
            </>
          )}
        </View>
      </View>

      {/* Botão de ação circular (+) com feedback elástico */}
      <JellyPressable
        testID="floating-dock-action-button"
        intensity="strong"
        onPress={toggleSheet}
        style={styles.actionButton}
      >
        <View
          testID="dock-item-add-fab"
          style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <RotatingPlusIcon progress={rotateAnim} />
        </View>
      </JellyPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  pillTrack: {
    flex: 1,
    height: 60,
  },
  pillIndicator: {
    position: 'absolute',
    left: 0,
    top: (60 - PILL_H) / 2,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    overflow: 'hidden',
  },
  pillIndicatorDark: {
    backgroundColor: colors.tertiary,
  },
  pillIndicatorLight: {
    backgroundColor: colors.primary,
  },
  tabContent: {
    position: 'absolute',
    left: 0,
    top: (60 - PILL_H) / 2,
    height: PILL_H,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabIconBox: {
    width: 22,
    height: 22,
    marginLeft: PAD_X,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    marginLeft: 6,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  tabHit: {
    position: 'absolute',
    top: 0,
    height: 60,
  },
  backdrop: {
    position: 'absolute',
    top: -3000,
    bottom: -1000,
    left: -1000,
    right: -1000,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 90,
  },
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'transparent',
    zIndex: 99,
  },
  pillContainer: {
    flex: 1,
    height: 60,
    borderRadius: borders.radiusPill,
    backgroundColor: colors.neutral,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  pillContainerLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowOpacity: 0.12,
    elevation: 5,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  // Menu do +: pílulas separadas, alinhadas à direita (medidas em theme/tokens -> dock).
  speedDialStack: {
    position: 'absolute',
    bottom: 86,
    right: 16,
    alignItems: 'flex-end',
    gap: dock.menuPillGap,
    zIndex: 100,
  },
  speedDialStackLight: {},
  speedDialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-end',
    paddingVertical: dock.menuPillPaddingY,
    paddingHorizontal: dock.menuPillPaddingX,
    borderRadius: 9999,
    backgroundColor: '#1E2124',
    borderWidth: borders.hairline,
    borderColor: '#2D3135',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  speedDialBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowOpacity: 0.14,
  },
  speedDialLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#E6DECA',
  },
  speedDialLabelLight: {
    color: '#111315',
  },
  // Sheet Styles
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#191B1D',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    borderBottomWidth: 0,
  },
  sheetContainerLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#35383C',
    alignSelf: 'center',
    marginBottom: 16,
  },
  dragHandleLight: {
    backgroundColor: '#D8D4CA',
  },
  sheetTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  sheetTitleLight: {
    color: '#111315',
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141618',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: borders.hairline,
    borderColor: '#222528',
  },
  sheetOptionLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  sheetIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sheetTextCol: {
    flex: 1,
  },
  sheetOptionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  sheetOptionLabelLight: {
    color: '#111315',
  },
  sheetOptionSub: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  sheetOptionSubLight: {
    color: '#6E6A63',
  },
});

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const FloatingBottomDock = React.memo(FloatingBottomDockBase);

export default FloatingBottomDock;
