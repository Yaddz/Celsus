import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
  Modal,
  TouchableWithoutFeedback,
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

  const toggleSheet = () => {
    const nextState = !isSheetOpen;
    setIsSheetOpen(nextState);

    Animated.spring(rotateAnim, {
      toValue: nextState ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
    }).start();

    // Se não houver callbacks específicos de opções, delega para onActionPress
    if (!onNovoAportePress && !onNovaCarteiraPress && !onAdicionarAtivoPress) {
      onActionPress?.();
    }
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    Animated.spring(rotateAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <>
      <View
        style={[styles.wrapper, { paddingBottom: bottomPadding }, style]}
        testID={testID}
        pointerEvents="box-none"
      >
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
                onPress={() => onTabChange(tab.id)}
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

      {/* Action Sheet Fluido com as 3 Opções (Sprint 13/14) */}
      <Modal
        visible={isSheetOpen && (!!onNovoAportePress || !!onNovaCarteiraPress || !!onAdicionarAtivoPress)}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <TouchableWithoutFeedback onPress={closeSheet}>
          <View style={styles.sheetBackdrop}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.sheetContainer,
                  isLight && styles.sheetContainerLight,
                  { paddingBottom: bottomPadding + 80 },
                ]}
              >
                {/* Drag handle sutil */}
                <View style={[styles.dragHandle, isLight && styles.dragHandleLight]} />

                <Text style={[styles.sheetTitle, isLight && styles.sheetTitleLight]}>
                  Ações Rápidas
                </Text>

                {/* Opção 1: Nova Movimentação */}
                <TouchableOpacity
                  testID="dock-sheet-nova-movimentacao"
                  activeOpacity={0.75}
                  style={[styles.sheetOption, isLight && styles.sheetOptionLight]}
                  onPress={() => {
                    closeSheet();
                    (onNovoAportePress || onActionPress)?.();
                  }}
                >
                  <View style={[styles.sheetIconCircle, { backgroundColor: colors.primary }]}>
                    <MaterialIcons name="north-east" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.sheetTextCol}>
                    <Text style={[styles.sheetOptionLabel, isLight && styles.sheetOptionLabelLight]}>
                      Nova Movimentação
                    </Text>
                    <Text style={[styles.sheetOptionSub, isLight && styles.sheetOptionSubLight]}>
                      Registrar compra ou venda de ativos
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={isLight ? '#8A8A8E' : '#55585C'} />
                </TouchableOpacity>

                {/* Opção 2: Nova Carteira */}
                <TouchableOpacity
                  testID="dock-sheet-nova-carteira"
                  activeOpacity={0.75}
                  style={[styles.sheetOption, isLight && styles.sheetOptionLight]}
                  onPress={() => {
                    closeSheet();
                    onNovaCarteiraPress?.();
                  }}
                >
                  <View style={[styles.sheetIconCircle, { backgroundColor: colors.tertiary }]}>
                    <MaterialIcons name="account-balance-wallet" size={20} color="#111315" />
                  </View>
                  <View style={styles.sheetTextCol}>
                    <Text style={[styles.sheetOptionLabel, isLight && styles.sheetOptionLabelLight]}>
                      Nova Carteira
                    </Text>
                    <Text style={[styles.sheetOptionSub, isLight && styles.sheetOptionSubLight]}>
                      Criar nova carteira com paleta dedicada
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={isLight ? '#8A8A8E' : '#55585C'} />
                </TouchableOpacity>

                {/* Opção 3: Adicionar Ativo */}
                <TouchableOpacity
                  testID="dock-sheet-adicionar-ativo"
                  activeOpacity={0.75}
                  style={[styles.sheetOption, isLight && styles.sheetOptionLight]}
                  onPress={() => {
                    closeSheet();
                    onAdicionarAtivoPress?.();
                  }}
                >
                  <View style={[styles.sheetIconCircle, { backgroundColor: colors.secondary }]}>
                    <MaterialIcons name="add-chart" size={20} color={colors.parchmentPale} />
                  </View>
                  <View style={styles.sheetTextCol}>
                    <Text style={[styles.sheetOptionLabel, isLight && styles.sheetOptionLabelLight]}>
                      Adicionar Ativo
                    </Text>
                    <Text style={[styles.sheetOptionSub, isLight && styles.sheetOptionSubLight]}>
                      Vincular novo ativo ou ticker à carteira
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={isLight ? '#8A8A8E' : '#55585C'} />
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
