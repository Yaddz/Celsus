import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography } from '../../theme/tokens';
import { springs } from '../../theme/motion';
import type { ThemeMode } from '../../theme/palettes';

export type FinanceTab = 'home' | 'entries' | 'accounts' | 'more';

const TABS: { id: FinanceTab; icon: keyof typeof MaterialIcons.glyphMap; label: string }[] = [
  { id: 'home', icon: 'dashboard', label: 'Resumo' },
  { id: 'entries', icon: 'receipt-long', label: 'Lançamentos' },
  { id: 'accounts', icon: 'account-balance-wallet', label: 'Contas' },
  { id: 'more', icon: 'more-horiz', label: 'Mais' },
];

const PAD = 6;

export interface FinanceDockProps {
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  themeMode?: ThemeMode;
  testID?: string;
}

/** Navbar flutuante do módulo Finanças: pílula com indicador deslizante e 4 destinos. */
export const FinanceDock: React.FC<FinanceDockProps> = ({
  activeTab,
  onTabChange,
  themeMode = 'dark',
  testID = 'finance-dock',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const [width, setWidth] = useState(0);
  const slotW = width > 0 ? (width - PAD * 2) / TABS.length : 0;
  const index = Math.max(0, TABS.findIndex((t) => t.id === activeTab));
  const x = useRef(new Animated.Value(PAD + index * slotW)).current;

  useEffect(() => {
    if (slotW === 0) return;
    Animated.spring(x, { toValue: PAD + index * slotW, ...springs.jelly, useNativeDriver: true }).start();
  }, [index, slotW, x]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View
      testID={testID}
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        onLayout={onLayout}
        style={[styles.bar, { backgroundColor: isLight ? '#FFFFFF' : '#1C1E20' }, isLight && styles.barLight]}
      >
        {slotW > 0 ? (
          <Animated.View
            style={[
              styles.indicator,
              { width: slotW, backgroundColor: isLight ? colors.primary : colors.tertiary },
              { transform: [{ translateX: x }] },
            ]}
          />
        ) : null}
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const fg = active ? (isLight ? '#FFFFFF' : colors.voidFloor) : isLight ? '#6E6A63' : colors.parchmentPale;
          return (
            <TouchableOpacity
              key={tab.id}
              testID={`finance-dock-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              activeOpacity={0.8}
              onPress={() => tab.id !== activeTab && onTabChange(tab.id)}
              style={styles.tab}
            >
              <MaterialIcons name={tab.icon} size={20} color={fg} />
              <Text numberOfLines={1} style={[styles.label, { color: fg }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  bar: {
    height: 64,
    borderRadius: 32,
    padding: PAD,
    flexDirection: 'row',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  barLight: {
    borderWidth: 1,
    borderColor: '#ECE6DA',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: PAD,
    height: 64 - PAD * 2,
    borderRadius: (64 - PAD * 2) / 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '700',
  },
});
