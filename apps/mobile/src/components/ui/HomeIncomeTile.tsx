import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { BentoTile } from './BentoGrid';
import { colors, typography, bento } from '../../theme/tokens';
import { GOAL_TILE_HEIGHT } from './GoalProgressTile';
import { SkeletonSwap, SkeletonTile } from './Skeleton';

export interface HomeIncomeTileProps {
  loading?: boolean;
  totalAmount?: string | number;
  isPrivacyMode?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

export const HomeIncomeTile: React.FC<HomeIncomeTileProps> = ({
  loading = false,
  totalAmount = '0.00',
  isPrivacyMode = false,
  onPress,
  style,
  testID = 'home-income-tile',
  themeMode = 'dark',
}) => {
  const val = typeof totalAmount === 'number' ? totalAmount : parseFloat(totalAmount || '0') || 0;
  const formatted = val > 0 ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const display = isPrivacyMode ? 'R$ ••••••' : formatted;
  const v = bento.variants.gold;

  return (
    <SkeletonSwap
      loading={loading}
      skeleton={<SkeletonTile height={GOAL_TILE_HEIGHT} style={style} testID={`${testID}-skeleton`} themeMode={themeMode} />}
    >
      <View style={[{ flex: 1 }, style]}>
        <BentoTile
          variant="gold"
          title="PROVENTOS"
          onPress={onPress}
          testID={testID}
          height={GOAL_TILE_HEIGHT}
        >
          <Text
            testID={`${testID}-value`}
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 20,
              fontWeight: '700',
              color: v.foreground,
              marginTop: 4,
            }}
          >
            {display}
          </Text>
          <Text
            style={{
              fontFamily: typography.fontFamily,
              fontSize: 12,
              color: v.muted,
              marginTop: 6,
            }}
          >
            Ver histórico →
          </Text>
        </BentoTile>
      </View>
    </SkeletonSwap>
  );
};
