import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../theme/tokens';

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
  const isLight = themeMode === 'light';
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: -12, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 70, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
      ]).start();
    }
  }, [error, shakeAnim]);

  const activeColor = error
    ? colors.primary
    : isLight
    ? '#111315'
    : '#E6DECA';

  const borderColor = error
    ? colors.primary
    : isLight
    ? '#C5BEB3'
    : '#4A4D52';

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="text"
      accessibilityValue={{ text: `${filled} de ${length} dígitos preenchidos` }}
      style={[
        styles.container,
        {
          transform: [{ translateX: shakeAnim }],
        },
      ]}
    >
      {Array.from({ length }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <View
            key={i}
            testID={`pin-dot-${i}`}
            style={[
              styles.dot,
              {
                borderColor: isFilled ? activeColor : borderColor,
                backgroundColor: isFilled ? activeColor : 'transparent',
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginVertical: 24,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
});
