import React from 'react';
import { View } from 'react-native';
import { PortfolioPalette, ThemeMode } from '../../theme/palettes';

export interface AmbientOrbProps {
  palette: PortfolioPalette;
  themeMode?: ThemeMode;
  testID?: string;
  size?: number;
}

export const AmbientOrb: React.FC<AmbientOrbProps> = () => {
  // Stub: to be implemented in Phase B
  return null;
};
