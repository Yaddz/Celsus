import React from 'react';
import { View } from 'react-native';
import type { NetWorthSnapshot } from '../../db/schema';
import type { NetWorthResult } from '../../domain/finance/goal';
import type { ThemeMode } from '../../theme/palettes';

export interface NetWorthTileProps {
  netWorth: NetWorthResult;
  snapshots?: NetWorthSnapshot[];
  isPrivacyMode?: boolean;
  loading?: boolean;
  onPress?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const NetWorthTile: React.FC<NetWorthTileProps> = ({
  testID = 'home-net-worth-tile',
}) => {
  return <View testID={testID} />;
};
