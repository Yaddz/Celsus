import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography } from '../../theme/tokens';

export interface SegmentOption<T extends string | number> {
  id: T;
  label: string;
  testID?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export interface SegmentedControlProps<T extends string | number> {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (id: T) => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

/** Seletor segmentado do app: trilho rebaixado e a opção ativa elevada, com texto em laranja. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  themeMode = 'dark',
  testID,
}: SegmentedControlProps<T>) {
  const isLight = themeMode === 'light';
  const track = isLight ? '#F1ECE2' : '#141618';
  const active = isLight ? '#FFFFFF' : '#2A2D30';
  const activeBorder = isLight ? '#E2DACB' : '#34383C';
  const fg = isLight ? '#111315' : '#E6DECA';
  const muted = isLight ? '#6E6A63' : '#8A8A8E';

  return (
    <View testID={testID} style={[styles.track, { backgroundColor: track }]}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <TouchableOpacity
            key={String(o.id)}
            testID={o.testID}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            activeOpacity={0.8}
            onPress={() => onChange(o.id)}
            style={[
              styles.segment,
              selected && { backgroundColor: active, borderColor: activeBorder },
            ]}
          >
            {o.icon ? <MaterialIcons name={o.icon} size={16} color={selected ? colors.primary : muted} /> : null}
            <Text style={[styles.label, { color: selected ? fg : muted }]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
});
