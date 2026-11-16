import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

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

/** Stub de Fase A para a trilha contínua de pontos (4,8 px a cada 8 px). */
export const DotTrack: React.FC<DotTrackProps> = ({ testID, style }) => {
  return <View testID={testID} style={[{ flex: 1, height: 8 }, style]} />;
};
