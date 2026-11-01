import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, borders } from '../../theme/tokens';

export type DockTab = 'home' | 'stats' | 'history' | 'wallets';

export interface FloatingBottomDockProps {
  activeTab?: DockTab;
  onTabChange?: (tab: DockTab) => void;
  onActionPress?: () => void;
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
  onActionPress = () => {},
  style,
  testID = 'floating-bottom-dock',
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 16);
  const isLight = themeMode === 'light';

  return (
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

      {/* Botão de Ação Circular Separado (WalleZ Quick Action) */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onActionPress}
        style={styles.actionButton}
      >
        <MaterialIcons name="add" size={28} color="#FFFFFF" />
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
});

export default FloatingBottomDock;
