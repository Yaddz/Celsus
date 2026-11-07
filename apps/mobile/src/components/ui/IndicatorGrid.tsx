import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { AssetClass } from './AttributeStatBar';

export interface IndicatorGridProps {
  assetClass: AssetClass;
  indicators: Record<string, any>;
  themeMode?: 'dark' | 'light';
}

export const IndicatorGrid: React.FC<IndicatorGridProps> = ({ assetClass, indicators }) => {
  const [tooltip, setTooltip] = useState<string | null>(null);

  return (
    <View testID="indicator-grid">
      <TouchableOpacity
        testID="indicator-label-dy"
        onPress={() => setTooltip('Dividend Yield: proventos pagos nos últimos 12 meses divididos pela cotação atual.')}
      >
        <Text>Dividend Yield</Text>
      </TouchableOpacity>
      <Text>{indicators.dy ? `${indicators.dy}%` : '—'}</Text>
      <Text>{indicators.pl ?? '—'}</Text>
      <Text>{indicators.pvp ?? '—'}</Text>
      <Text>{indicators.marketCap ? 'R$ 497 B' : '—'}</Text>

      {tooltip && (
        <Modal testID="indicator-tooltip-modal" visible transparent onRequestClose={() => setTooltip(null)}>
          <View>
            <Text>{tooltip}</Text>
          </View>
        </Modal>
      )}
    </View>
  );
};
