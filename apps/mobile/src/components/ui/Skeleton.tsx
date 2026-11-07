import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import { bento } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export const SKELETON_FADE_MS = 220;

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  themeMode?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Pulso ÚNICO compartilhado por todos os skeletons visíveis (antes cada bloco rodava a própria
 * animação em loop: ~10 loops simultâneos). O loop só existe enquanto há algum skeleton montado.
 */
const sharedPulse = new Animated.Value(0.55);
let pulseUsers = 0;
let pulseLoop: Animated.CompositeAnimation | null = null;

function acquirePulse() {
  if (pulseUsers++ === 0) {
    pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sharedPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(sharedPulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
  }
}

function releasePulse() {
  if (--pulseUsers === 0) {
    pulseLoop?.stop();
    pulseLoop = null;
    sharedPulse.setValue(0.55);
  }
}

/** Bloco cinza pulsante que ocupa o lugar de um conteúdo ainda não carregado. */
export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 16, radius = 8, themeMode = 'dark', style, testID }) => {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    acquirePulse();
    return releasePulse;
  }, [reduced]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, opacity: reduced ? 0.7 : sharedPulse, backgroundColor: themeMode === 'light' ? '#E4DED1' : '#2A2D30' },
        style,
      ]}
    />
  );
};

/** Tile Bento em esqueleto: mesma casca (raio, cor e altura) do tile real, com linhas internas opcionais. */
export const SkeletonTile: React.FC<{
  height: number;
  themeMode?: 'dark' | 'light';
  lines?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}> = ({ height, themeMode = 'dark', lines = 2, style, testID }) => (
  <View
    testID={testID}
    style={[
      {
        height,
        borderRadius: bento.tileRadius,
        padding: bento.tilePadding,
        backgroundColor: themeMode === 'light' ? '#FFFFFF' : '#1C1E20',
        gap: 10,
      },
      style,
    ]}
  >
    <Skeleton width="38%" height={10} themeMode={themeMode} />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} width={i === 0 ? '70%' : '48%'} height={i === 0 ? 24 : 12} themeMode={themeMode} />
    ))}
  </View>
);

export interface SkeletonSwapProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mostra o esqueleto enquanto `loading` e troca para o conteúdo com fade (sem salto: o esqueleto
 * deve ter as mesmas dimensões do conteúdo final).
 */
export const SkeletonSwap: React.FC<SkeletonSwapProps> = ({ loading, skeleton, children, style }) => {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const wasLoading = useRef(loading);

  useEffect(() => {
    if (loading) {
      opacity.setValue(0);
    } else if (wasLoading.current) {
      if (reduced) opacity.setValue(1);
      else Animated.timing(opacity, { toValue: 1, duration: SKELETON_FADE_MS, useNativeDriver: true }).start();
    }
    wasLoading.current = loading;
  }, [loading, opacity, reduced]);

  if (loading) return <View style={style}>{skeleton}</View>;
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
};
