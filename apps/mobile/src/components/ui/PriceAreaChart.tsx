import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PricePoint, periodReturn } from '../../domain/finance/assetProfile';
import { colors, typography, borders } from '../../theme/tokens';

export type ChartRange = '7D' | '30D' | '6M' | '1A' | '5A' | 'MAX';

export interface PriceAreaChartProps {
  points?: PricePoint[];
  activeRange?: ChartRange;
  onRangeChange?: (range: ChartRange) => void;
  accentColor?: string;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const RANGES: ChartRange[] = ['7D', '30D', '6M', '1A', '5A', 'MAX'];

export const PriceAreaChart: React.FC<PriceAreaChartProps> = ({
  points = [],
  activeRange = '1A',
  onRangeChange,
  accentColor = colors.primary,
  themeMode = 'dark',
  testID = 'price-area-chart-container',
}) => {
  const isLight = themeMode === 'light';
  const changePercent = periodReturn(points);
  const isPositive = changePercent >= 0;
  const changeColor = isPositive ? colors.tertiary : colors.deficit;
  const changeIcon = isPositive ? 'arrow-upward' : 'arrow-downward';
  const prefix = isPositive ? '+' : '';

  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const chipBg = isLight ? '#EAE5D9' : '#22252A';

  const minVal = points.length > 0 ? Math.min(...points.map((p) => p.close)) : 0;
  const maxVal = points.length > 0 ? Math.max(...points.map((p) => p.close), minVal + 1) : 100;
  const rangeVal = maxVal - minVal || 1;

  const rangeLabelMap: Record<ChartRange, string> = {
    '7D': '7 dias',
    '30D': '30 dias',
    '6M': '6 meses',
    '1A': '12 meses',
    '5A': '5 anos',
    'MAX': 'Histórico total',
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* Gráfico de Linha + Área Suave */}
      <View style={styles.chartArea}>
        {points.length > 0 ? (
          <View style={styles.curveContainer}>
            {points.map((pt, idx) => {
              const normalizedHeight = Math.max(10, ((pt.close - minVal) / rangeVal) * 90 + 10);
              return (
                <View key={`${pt.date}-${idx}`} style={styles.curveCol}>
                  <View
                    style={[
                      styles.curveBar,
                      {
                        height: normalizedHeight,
                        backgroundColor: 'rgba(217, 102, 40, 0.22)',
                        borderTopColor: accentColor,
                        borderTopWidth: 2,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={[styles.emptyChartText, { color: subtextColor }]}>
              Sem histórico de preços para o período
            </Text>
          </View>
        )}
      </View>

      {/* Chips Seletores de Período */}
      <View style={styles.chipsRow}>
        {RANGES.map((r) => {
          const isSelected = r === activeRange;
          return (
            <TouchableOpacity
              key={r}
              testID={`range-chip-${r}`}
              onPress={() => onRangeChange?.(r)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? colors.primary : chipBg },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: isSelected ? '#FFFFFF' : subtextColor, fontWeight: isSelected ? '700' : '500' },
                ]}
              >
                {r === 'MAX' ? 'Máx' : r}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rodapé: Variação do Período */}
      <View style={styles.footerRow}>
        <Text style={[styles.footerLabel, { color: subtextColor }]}>
          Variação {rangeLabelMap[activeRange] || '12 meses'}
        </Text>
        <View style={styles.footerChange}>
          <MaterialIcons name={changeIcon as any} size={14} color={changeColor} />
          <Text style={[styles.footerChangeText, { color: changeColor }]}>
            {prefix}{changePercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: 8,
  },
  chartArea: {
    height: 110,
    width: '100%',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  curveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    width: '100%',
    gap: 3,
  },
  curveCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  curveBar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  emptyChart: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borders.radiusFull,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  footerLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  footerChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  footerChangeText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
});
