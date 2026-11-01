import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders, spacing } from '../../theme/tokens';

export type DockTab = 'home' | 'stats' | 'history' | 'wallets';

export interface FloatingBottomDockProps {
  activeTab?: DockTab;
  onTabChange?: (tab: DockTab) => void;
  onActionPress?: () => void;
  onNovoAportePress?: () => void;
  onNovaCarteiraPress?: () => void;
  onAdicionarAtivoPress?: () => void;
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
  { id: 'history', iconName: 'receipt-long', label: 'Extrato' },
  { id: 'wallets', iconName: 'account-balance-wallet', label: 'Carteiras' },
];

export const FloatingBottomDock: React.FC<FloatingBottomDockProps> = ({
  activeTab = 'home',
  onTabChange = () => {},
  onActionPress,
  onNovoAportePress,
  onNovaCarteiraPress,
  onAdicionarAtivoPress,
  style,
  testID = 'floating-bottom-dock',
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);
  const isLight = themeMode === 'light';

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const toggleSheet = () => {
    const nextState = !isSheetOpen;
    setIsSheetOpen(nextState);

    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: nextState ? 1 : 0,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.spring(slideAnim, {
        toValue: nextState ? 0 : 20,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.timing(fadeAnim, {
        toValue: nextState ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Se não houver callbacks específicos de opções, delega para onActionPress
    if (!onNovoAportePress && !onNovaCarteiraPress && !onAdicionarAtivoPress) {
      onActionPress?.();
    }
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.spring(slideAnim, {
        toValue: 20,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleTabPress = (tabId: DockTab) => {
    if (isSheetOpen) closeSheet();
    if (tabId === 'history') {
      Alert.alert('Funcionalidade em desenvolvimento');
      return;
    }
    onTabChange(tabId);
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View
      style={[styles.wrapper, { paddingBottom: bottomPadding }, style]}
      testID={testID}
      pointerEvents="box-none"
    >
      {/* Speed-Dial Stack flutuante inline diretamente acima do botão + (SEM Modal) */}
      {isSheetOpen && (
        <Animated.View
          testID="fab-speed-dial-stack"
          style={[
            styles.speedDialStack,
            isLight && styles.speedDialStackLight,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Opção 1: Nova Carteira */}
          <TouchableOpacity
            testID="fab-action-nova-carteira"
            activeOpacity={0.8}
            style={[styles.speedDialBtn, isLight && styles.speedDialBtnLight]}
            onPress={() => {
              closeSheet();
              onNovaCarteiraPress?.();
            }}
          >
            <MaterialIcons name="account-balance-wallet" size={20} color={colors.tertiary} />
            <Text style={[styles.speedDialLabel, isLight && styles.speedDialLabelLight]}>
              Nova Carteira
            </Text>
          </TouchableOpacity>

          {/* Opção 2: Adicionar Ativo */}
          <TouchableOpacity
            testID="fab-action-adicionar-ativo"
            activeOpacity={0.8}
            style={[styles.speedDialBtn, isLight && styles.speedDialBtnLight]}
            onPress={() => {
              closeSheet();
              onAdicionarAtivoPress?.();
            }}
          >
            <MaterialIcons name="playlist-add" size={20} color={colors.secondary} />
            <Text style={[styles.speedDialLabel, isLight && styles.speedDialLabelLight]}>
              Adicionar Ativo
            </Text>
          </TouchableOpacity>

          {/* Opção 3: Nova Movimentação */}
          <TouchableOpacity
            testID="fab-action-novo-aporte"
            activeOpacity={0.8}
            style={[styles.speedDialBtn, isLight && styles.speedDialBtnLight]}
            onPress={() => {
              closeSheet();
              (onNovoAportePress || onActionPress)?.();
            }}
          >
            <MaterialIcons name="north-east" size={20} color={colors.primary} />
            <Text style={[styles.speedDialLabel, isLight && styles.speedDialLabelLight]}>
              Nova Movimentação
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Pílula de Navegação Opaca Flutuante */}
      <View style={[styles.pillContainer, isLight && styles.pillContainerLight]}>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const iconColor = isActive
            ? (isLight ? '#FFFFFF' : colors.voidFloor)
            : (isLight ? '#6E6A63' : colors.parchmentPale);

          return (
            <TouchableOpacity
              key={tab.id}
              testID={`dock-tab-${tab.id}`}
              activeOpacity={0.8}
              onPress={() => handleTabPress(tab.id)}
              style={styles.tabButton}
            >
              <View
                style={[
                  styles.tabIconCircle,
                  isActive && (isLight ? styles.activeTabIconCircleLight : styles.activeTabIconCircle),
                ]}
              >
                <MaterialIcons name={tab.iconName} size={22} color={iconColor} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Botão de Ação Circular Separado (WalleZ Quick Action + Rotação 45°) */}
      <TouchableOpacity
        testID="floating-dock-action-button"
        activeOpacity={0.85}
        onPress={toggleSheet}
        style={styles.actionButton}
      >
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <MaterialIcons name="add" size={28} color="#FFFFFF" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
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
    paddingHorizontal: 8,
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
  tabButton: {
    padding: 6,
  },
  tabIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTabIconCircle: {
    backgroundColor: colors.tertiary,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  activeTabIconCircleLight: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
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
  speedDialStack: {
    position: 'absolute',
    bottom: 76,
    right: 16,
    alignItems: 'flex-end',
    gap: 10,
    zIndex: 100,
  },
  speedDialStackLight: {},
  speedDialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1E2124',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: borders.hairline,
    borderColor: '#2D3135',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  speedDialBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowOpacity: 0.12,
  },
  speedDialLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
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

export default FloatingBottomDock;
