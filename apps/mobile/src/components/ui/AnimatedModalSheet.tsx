import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
  Keyboard,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { borders } from '../../theme/tokens';

export interface AnimatedModalSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
  themeMode?: 'dark' | 'light';
  /** Altura máxima do sheet como fração da tela (padrão 0.88). */
  maxHeight?: number;
  /** Quando true o sheet ocupa a altura máxima (para telas com ScrollView/flex:1). */
  fill?: boolean;
  /** Mostra a alça de arraste padrão (padrão true). */
  showHandle?: boolean;
  /** Padding interno do conteúdo (padrão: 20 horizontal, 32 inferior). */
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Envolve o conteúdo em ScrollView (padrão: true quando não é `fill`), para que
   * formulários longos nunca fiquem cortados e rolem quando o teclado abre.
   */
  scrollable?: boolean;
  /**
   * Mantém o conteúdo montado (invisível e fora da árvore de toque) enquanto o sheet
   * está fechado. Necessário para telas cujos testes/estado dependem dos campos
   * estarem presentes, como as metas por classe.
   */
  keepMountedWhenClosed?: boolean;
}

/**
 * Bottom sheet padrão do app. TODOS os modais de baixo para cima devem usar
 * este componente para manter o mesmo overlay, raio, alça, cores e animação.
 */
export const AnimatedModalSheet: React.FC<AnimatedModalSheetProps> = ({
  visible,
  onClose,
  children,
  testID = 'animated-modal-sheet',
  themeMode = 'dark',
  maxHeight = 0.88,
  fill = false,
  showHandle = true,
  contentStyle,
  scrollable,
  keepMountedWhenClosed = false,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  const offscreen = windowHeight;
  const isLight = themeMode === 'light';

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : offscreen)).current;
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const runCloseAnimation = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: offscreen,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Se reabriu durante a animação de saída, não desmonta.
      if (!visibleRef.current) setShouldRender(false);
    });
  };

  const handleBackdropPress = () => {
    onClose();
    runCloseAnimation();
  };

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateY.setValue(offscreen);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 160,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      runCloseAnimation();
    }
  }, [visible]);

  if (!visible && !shouldRender) {
    return keepMountedWhenClosed ? (
      <View pointerEvents="none" style={styles.hiddenHost}>
        {children}
      </View>
    ) : null;
  }

  // Com o teclado aberto o sheet sobe acima dele e encolhe para caber na tela.
  const available = windowHeight - keyboardHeight - 40;
  const targetHeight = Math.min(windowHeight * maxHeight, available);
  const sheetHeightStyle: ViewStyle = fill
    ? { height: targetHeight, marginBottom: keyboardHeight }
    : { maxHeight: targetHeight, marginBottom: keyboardHeight };
  const useScroll = scrollable ?? !fill;

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View testID={testID} style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity
            testID="animated-sheet-backdrop"
            activeOpacity={1}
            onPress={handleBackdropPress}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          testID="animated-sheet-container"
          style={[
            styles.sheetContainer,
            isLight && styles.sheetContainerLight,
            sheetHeightStyle,
            { transform: [{ translateY }] },
          ]}
        >
          {showHandle && (
            <View style={styles.handleContainer}>
              <View style={[styles.handle, isLight && styles.handleLight]} />
            </View>
          )}
          {useScroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, contentStyle]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Tocar em área vazia fecha o teclado */}
              <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View>{children}</View>
              </TouchableWithoutFeedback>
            </ScrollView>
          ) : (
            // Modo `fill`: o filho (ex.: Simulador) tem o próprio ScrollView. Sem o
            // TouchableWithoutFeedback aqui, que no Android disputava o gesto de arraste e impedia a
            // rolagem; `minHeight: 0` deixa o filho encolher até a altura do sheet em vez de vazar.
            <View style={[styles.content, { minHeight: 0 }, contentStyle]}>{children}</View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheetContainer: {
    width: '100%',
    // Mesma cor de fundo das telas do app (um único tom, sem faixa dupla).
    backgroundColor: '#111315',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: borders.hairline,
    borderColor: '#26292C',
    overflow: 'hidden',
  },
  sheetContainerLight: {
    backgroundColor: '#F4F1EA',
    borderColor: '#D6CFBF',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3D40',
  },
  handleLight: {
    backgroundColor: '#D6CFBF',
  },
  hiddenHost: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  content: {
    flexShrink: 1,
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
});
