import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import { springs, press as pressTokens, durations, PressToken } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface JellyPressableProps extends Omit<PressableProps, 'style'> {
  /** Intensidade do squash & stretch (tokens em theme/motion). */
  intensity?: PressToken;
  style?: StyleProp<ViewStyle>;
  /** Estilo aplicado ao Pressable externo (área de toque). */
  containerStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Pressable com feedback elástico: ao tocar, escala X e Y levemente opostas
 * (squash & stretch) e, ao soltar, volta com mola e leve overshoot. Usa apenas
 * transform com driver nativo (UI thread). Com "reduzir movimento" ativo vira uma
 * simples mudança de opacidade.
 */
export const JellyPressable: React.FC<JellyPressableProps> = ({
  intensity = 'medium',
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const reduced = useReducedMotion();
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const { scaleX: sx, scaleY: sy } = pressTokens[intensity];

  const animateIn = () => {
    if (reduced) {
      Animated.timing(opacity, { toValue: 0.7, duration: durations.reduced, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(scaleX, { toValue: sx, ...springs.snappy, useNativeDriver: true }),
      Animated.spring(scaleY, { toValue: sy, ...springs.snappy, useNativeDriver: true }),
    ]).start();
  };

  const animateOut = () => {
    if (reduced) {
      Animated.timing(opacity, { toValue: 1, duration: durations.reduced, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(scaleX, { toValue: 1, ...springs.jelly, useNativeDriver: true }),
      Animated.spring(scaleY, { toValue: 1, ...springs.jelly, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        animateIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateOut();
        onPressOut?.(e);
      }}
      style={containerStyle}
    >
      <Animated.View
        style={[style, { opacity, transform: [{ scaleX }, { scaleY }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default JellyPressable;
