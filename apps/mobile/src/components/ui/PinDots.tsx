import React from 'react';
import { View, StyleSheet } from 'react-native';

export interface PinDotsProps {
  length?: number;
  filled: number;
  error?: boolean;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

export const PinDots: React.FC<PinDotsProps> = ({
  length = 6,
  filled,
  error = false,
  testID = 'pin-dots',
  themeMode = 'dark',
}) => {
  // Stub Fase A
  return (
    <View testID={testID} style={styles.container}>
      {Array.from({ length }).map((_, i) => (
        <View key={i} testID={`pin-dot-${i}`} style={styles.dot} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginVertical: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
});
