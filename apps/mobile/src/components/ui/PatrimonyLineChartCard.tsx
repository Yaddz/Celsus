import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';
import {
  HistoricalPricePoint,
  PeriodFilter,
  PeriodSummary,
} from '../../domain/finance/portfolioHistory';

export const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '5D': '5 dias',
  '1M': 'Mês',
  '1Y': 'Ano',
  '5Y': '5 anos',
  ALL: 'Total',
};

export interface PatrimonyLineChartCardProps {
  curve?: HistoricalPricePoint[];
  selectedPeriod?: PeriodFilter;
  onPeriodChange?: (period: PeriodFilter) => void;
  summary?: PeriodSummary;
  isPrivacyMode?: boolean;
  testID?: string;
}

export const PatrimonyLineChartCard: React.FC<PatrimonyLineChartCardProps> = ({
  curve = [],
  selectedPeriod = 'ALL',
  onPeriodChange,
  summary,
  isPrivacyMode = false,
  testID = 'patrimony-line-chart-card',
}) => {
  const [activePeriod, setActivePeriod] = useState<PeriodFilter>(selectedPeriod);

  const handlePeriodChange = (p: PeriodFilter) => {
    setActivePeriod(p);
    if (onPeriodChange) {
      onPeriodChange(p);
    }
  };

  // Stub para Fase A
  return (
    <View style={styles.card} testID={testID}>
      {/* Stub de renderização */}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: borders.radiusLg,
    padding: spacing.md,
  },
});
