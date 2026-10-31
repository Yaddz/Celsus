import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { PortfolioPalette, ThemeMode } from '../../theme/palettes';

export interface AmbientOrbProps {
  palette: PortfolioPalette;
  themeMode?: ThemeMode;
  testID?: string;
  size?: number;
  opacity?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * AmbientOrb: Esfera Luminosa difusa no topo da tela inspirada no app Pierre.
 * Reage dinamicamente às cores da paleta da carteira ativa.
 */
export const AmbientOrb: React.FC<AmbientOrbProps> = ({
  palette,
  themeMode = 'dark',
  testID = 'ambient-orb',
  size = 320,
  opacity = 0.5,
}) => {
  const isLight = themeMode === 'light';
  const effectiveOpacity = isLight ? opacity * 0.45 : opacity;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      style={[
        styles.container,
        {
          width: size,
          height: size,
          top: -size * 0.45,
          opacity: effectiveOpacity,
        },
      ]}
    >
      {/* Camada externa mais difusa (orbSecondary) */}
      <View
        style={[
          styles.layer,
          styles.outerLayer,
          {
            backgroundColor: palette.orbSecondary,
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />

      {/* Camada intermediária atmosférica (cardBg) */}
      <View
        style={[
          styles.layer,
          styles.middleLayer,
          {
            backgroundColor: palette.cardBg,
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: (size * 0.72) / 2,
          },
        ]}
      />

      {/* Núcleo de acento luminoso (accent) */}
      <View
        style={[
          styles.layer,
          styles.coreLayer,
          {
            backgroundColor: palette.accent,
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: (size * 0.4) / 2,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  layer: {
    position: 'absolute',
  },
  outerLayer: {
    opacity: 0.35,
    transform: [{ scale: 1.1 }],
  },
  middleLayer: {
    opacity: 0.45,
  },
  coreLayer: {
    opacity: 0.6,
  },
});
