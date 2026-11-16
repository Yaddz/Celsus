import React, { useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

export interface DotTrackProps {
  /** Percentual de preenchimento (0 a 100). */
  percentage: number;
  /** Cor dos pontos preenchidos. */
  color: string;
  /** Cor dos pontos de fundo da trilha. */
  trackColor?: string;
  /** Estilo opcional do contêiner. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DOT_SIZE = 4.8;
const DOT_STEP = 8;
const TRACK_HEIGHT = 8;

function webDotStyle(dotColor: string): ViewStyle {
  return {
    backgroundImage: `radial-gradient(circle, ${dotColor} ${DOT_SIZE / 2}px, transparent ${DOT_SIZE / 2 + 0.4}px)`,
    backgroundSize: `${DOT_STEP}px ${DOT_STEP}px`,
    backgroundPosition: 'left center',
  } as unknown as ViewStyle;
}

/**
 * Trilha contínua de pontos (4,8 px a cada 8 px) com preenchimento proporcional.
 * Na web usa gradiente radial CSS (zero Views extras por ponto); no nativo adapta ao width medido.
 */
export const DotTrack: React.FC<DotTrackProps> = ({
  percentage,
  color,
  trackColor = '#2A2D30',
  style,
  testID,
}) => {
  const [width, setWidth] = useState(0);
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));

  const handleLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  const dotCount =
    Platform.OS === 'web'
      ? 0
      : width > 0
      ? Math.max(1, Math.floor((width + (DOT_STEP - DOT_SIZE)) / DOT_STEP))
      : 20;

  return (
    <View
      testID={testID}
      onLayout={Platform.OS === 'web' ? undefined : handleLayout}
      style={[
        styles.track,
        Platform.OS === 'web' ? webDotStyle(trackColor) : null,
        style,
      ]}
    >
      {Platform.OS !== 'web' ? (
        <View style={styles.nativeRow} pointerEvents="none">
          {Array.from({ length: dotCount }).map((_, idx) => (
            <View key={idx} style={[styles.nativeDot, { backgroundColor: trackColor }]} />
          ))}
        </View>
      ) : null}

      <View
        testID={testID ? `${testID}-fill` : undefined}
        pointerEvents="none"
        style={[
          styles.fill,
          { width: `${clamped}%` },
          Platform.OS === 'web' ? webDotStyle(color) : null,
        ]}
      >
        {Platform.OS !== 'web' ? (
          <View style={styles.nativeRow}>
            {Array.from({ length: dotCount }).map((_, idx) => (
              <View key={idx} style={[styles.nativeDot, { backgroundColor: color }]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: TRACK_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  nativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOT_STEP - DOT_SIZE,
  },
  nativeDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
