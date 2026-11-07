import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography, spacing, borders, layout, space } from '../../theme/tokens';
import {
  HistoricalPricePoint,
  PeriodFilter,
  PeriodSummary,
  calculatePeriodSummary,
} from '../../domain/finance/portfolioHistory';

export const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '5D': '5 dias',
  '1M': 'Mês',
  '1Y': 'Ano',
  '5Y': '5 anos',
  ALL: 'Total',
};

export type TimePeriod = PeriodFilter;

export const PERIOD_ORDER: PeriodFilter[] = ['5D', '1M', '1Y', '5Y', 'ALL'];

export interface PatrimonyLineChartCardProps {
  curve?: HistoricalPricePoint[];
  selectedPeriod?: PeriodFilter;
  onPeriodChange?: (period: PeriodFilter) => void;
  summary?: PeriodSummary;
  isPrivacyMode?: boolean;
  accentColor?: string;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

export const PatrimonyLineChartCard: React.FC<PatrimonyLineChartCardProps> = ({
  curve = [],
  selectedPeriod = 'ALL',
  onPeriodChange,
  summary,
  isPrivacyMode = false,
  accentColor = colors.primary,
  testID = 'patrimony-line-chart-card',
  themeMode = 'dark',
}) => {
  const isLight = themeMode === 'light';
  const [activePeriod, setActivePeriod] = useState<PeriodFilter>(selectedPeriod);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    curve.length > 0 ? curve.length - 1 : null
  );

  const handlePeriodChange = (p: PeriodFilter) => {
    setActivePeriod(p);
    if (onPeriodChange) {
      onPeriodChange(p);
    }
  };

  const activeSummary: PeriodSummary =
    summary ||
    (curve.length > 0
      ? calculatePeriodSummary(curve)
      : {
          initialPatrimony: '0.00',
          netContributions: '0.00',
          yieldAmount: '0.00',
          yieldPercentage: '0.00',
          finalPatrimony: '0.00',
        });

  // Normalização para o gráfico de linha suave com área sombreada
  const minVal =
    curve.length > 0
      ? Math.min(...curve.map((p) => parseFloat(p.marketValue) || 0))
      : 0;
  const maxVal =
    curve.length > 0
      ? Math.max(...curve.map((p) => parseFloat(p.marketValue) || 1), minVal + 1)
      : 100;
  const range = maxVal - minVal || 1;

  const formatBRL = (val: string | number) => {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const maskValue = (val: string | number) => {
    if (isPrivacyMode) {
      return '••••••';
    }
    return formatBRL(val);
  };

  const isPositiveYield = parseFloat(activeSummary.yieldAmount) >= 0;
  const yieldPrefix = isPositiveYield ? '+' : '';

  return (
    <View style={[styles.container, isLight && styles.containerLight]} testID={testID}>
      {/* 1. Header do Gráfico com Filtros de Período */}
      <View style={[styles.chartHeader, isLight && styles.chartHeaderLight]}>
        <View>
          <Text style={[styles.chartLabel, isLight && styles.chartLabelLight]}>PATRIMÔNIO HISTÓRICO</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.mainValue, isLight && styles.mainValueLight]}>
              {maskValue(activeSummary.finalPatrimony)}
            </Text>
            {/* Com privacidade ativa, a rentabilidade também é ocultada (revela desempenho) */}
            <View
              style={[
                styles.yieldBadge,
                isPositiveYield ? styles.yieldBadgeGreen : styles.yieldBadgeRed,
              ]}
            >
              <Text
                style={[
                  styles.yieldBadgeText,
                  isPositiveYield ? styles.yieldTextGreen : styles.yieldTextRed,
                ]}
              >
                {isPrivacyMode ? '••••' : `${yieldPrefix}${activeSummary.yieldPercentage}%`}
              </Text>
            </View>
          </View>
        </View>

        {/* Seletores 5 dias, Mês, Ano, 5 anos, Total */}
        <View style={styles.periodRow}>
          {PERIOD_ORDER.map((p) => {
            const isSelected = p === activePeriod;
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.75}
                onPress={() => handlePeriodChange(p)}
                style={[styles.periodBtn, isLight && styles.periodBtnLight, isSelected && styles.periodBtnActive]}
              >
                <Text
                  style={[
                    styles.periodBtnText,
                    isLight && styles.periodBtnTextLight,
                    isSelected && styles.periodBtnTextActive,
                  ]}
                >
                  {PERIOD_LABELS[p]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. Área do Gráfico de Linha Suave com Sombra (estilo BTG / Pierre) */}
      <View style={[styles.chartArea, isLight && styles.chartAreaLight]} testID="patrimony-line-chart-area">
        {curve.length > 0 ? (
          <View style={{ width: '100%' }}>
            {/* Tooltip de Ponto Inspecionado */}
            {selectedPointIndex !== null && curve[selectedPointIndex] && (
              <View testID="chart-point-tooltip" style={[styles.tooltipContainer, isLight && styles.tooltipContainerLight]}>
                <Text style={[styles.tooltipDate, isLight && styles.tooltipDateLight]}>
                  {curve[selectedPointIndex].date}
                </Text>
                <Text style={[styles.tooltipValue, isLight && styles.tooltipValueLight]}>
                  {maskValue(curve[selectedPointIndex].marketValue)}
                </Text>
              </View>
            )}

            <View style={styles.chartMainRow}>
              {/* Eixo Y com Mínimo e Máximo de Referência */}
              <View style={styles.yAxisContainer}>
                <Text testID="chart-y-axis-max" style={[styles.yAxisText, isLight && styles.yAxisTextLight]}>
                  {maskValue(maxVal)}
                </Text>
                <Text testID="chart-y-axis-min" style={[styles.yAxisText, isLight && styles.yAxisTextLight]}>
                  {maskValue(minVal)}
                </Text>
              </View>

              {/* Colunas do Gráfico */}
              <View style={styles.curveContainer}>
                {curve.map((pt, idx) => {
                  const val = parseFloat(pt.marketValue) || 0;
                  const normalizedHeight = Math.max(12, ((val - minVal) / range) * 110 + 12);
                  const isSelected = idx === selectedPointIndex;

                  return (
                    <TouchableOpacity
                      key={`${pt.date}-${idx}`}
                      testID={`chart-bar-point-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => setSelectedPointIndex(idx)}
                      style={styles.curveColumnWrapper}
                    >
                      <View
                        style={[
                          styles.curveBar,
                          {
                            height: normalizedHeight,
                            backgroundColor: isSelected
                              ? `${accentColor}55`
                              : 'rgba(217, 102, 40, 0.18)',
                            borderTopColor: isSelected ? (isLight ? '#111315' : colors.parchmentPale) : accentColor,
                            borderTopWidth: isSelected ? 3 : 2,
                          },
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Legenda Comparativa: Valor de Mercado vs Capital Investido */}
            <View style={styles.legendRow}>
              <View testID="chart-legend-market-value" style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.legendText, isLight && styles.legendTextLight]}>Valor de Mercado</Text>
              </View>
              <View testID="chart-legend-invested-capital" style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#6E7681' }]} />
                <Text style={[styles.legendText, isLight && styles.legendTextLight]}>Capital Investido</Text>
              </View>
            </View>
          </View>
        ) : (
          <View testID="chart-empty-state" style={styles.emptyChart}>
            <Text style={[styles.emptyChartText, isLight && styles.emptyChartTextLight]}>
              Nenhum histórico registrado no período
            </Text>
          </View>
        )}
      </View>

      {/* 3. Card de Resumo do Período */}
      <View style={[styles.summaryCard, isLight && styles.summaryCardLight]} testID="period-summary-card">
        <Text style={[styles.summaryTitle, isLight && styles.summaryTitleLight]}>RESUMO DO PERÍODO</Text>
        <View style={styles.summaryGrid}>
          {/* Patrimônio Inicial */}
          <View style={[styles.summaryItem, isLight && styles.summaryItemLight]}>
            <Text style={[styles.summaryItemLabel, isLight && styles.summaryItemLabelLight]}>Patrimônio Inicial</Text>
            <Text style={[styles.summaryItemValue, isLight && styles.summaryItemValueLight]}>
              {maskValue(activeSummary.initialPatrimony)}
            </Text>
          </View>

          {/* Aportes Líquidos */}
          <View style={[styles.summaryItem, isLight && styles.summaryItemLight]}>
            <Text style={[styles.summaryItemLabel, isLight && styles.summaryItemLabelLight]}>Aportes</Text>
            <Text style={[styles.summaryItemValue, isLight && styles.summaryItemValueLight]}>
              {maskValue(activeSummary.netContributions)}
            </Text>
          </View>

          {/* Rendimentos */}
          <View style={[styles.summaryItem, isLight && styles.summaryItemLight]}>
            <Text style={[styles.summaryItemLabel, isLight && styles.summaryItemLabelLight]}>Rendimentos</Text>
            <View style={styles.yieldAmountRow}>
              <Text
                style={[
                  styles.summaryItemValue,
                  isLight && styles.summaryItemValueLight,
                  isPositiveYield ? styles.yieldTextGreen : styles.yieldTextRed,
                ]}
              >
                {maskValue(activeSummary.yieldAmount)}
              </Text>
              <Text
                style={[
                  styles.summaryYieldPct,
                  isPositiveYield ? styles.yieldTextGreen : styles.yieldTextRed,
                ]}
              >
                {isPrivacyMode ? ' (••••)' : ` (${yieldPrefix}${activeSummary.yieldPercentage}%)`}
              </Text>
            </View>
          </View>

          {/* Patrimônio Final */}
          <View style={[styles.summaryItem, isLight && styles.summaryItemLight]}>
            <Text style={[styles.summaryItemLabel, isLight && styles.summaryItemLabelLight]}>Patrimônio Final</Text>
            <Text style={[styles.summaryItemValue, isLight && styles.summaryItemValueLight]}>
              {maskValue(activeSummary.finalPatrimony)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Seção plana: sem superfície; separada das demais por linhas finas.
  container: {
    backgroundColor: 'transparent',
    marginBottom: layout.sectionGap,
  },
  chartHeader: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chartLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8A8E',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mainValue: {
    fontFamily: typography.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginRight: spacing.sm,
  },
  yieldBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusPill,
  },
  yieldBadgeGreen: {
    backgroundColor: 'rgba(174, 205, 197, 0.15)',
  },
  yieldBadgeRed: {
    backgroundColor: 'rgba(217, 102, 40, 0.15)',
  },
  yieldBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  yieldTextGreen: {
    color: '#AECDC5',
  },
  yieldTextRed: {
    color: colors.primary,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  periodBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borders.radiusPill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  periodBtnActive: {
    backgroundColor: colors.tertiary,
  },
  periodBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.parchmentMuted,
    fontWeight: '600',
  },
  periodBtnTextActive: {
    color: colors.voidFloor,
    fontWeight: '700',
  },
  chartArea: {
    minHeight: 140,
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
  },
  chartMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  yAxisContainer: {
    justifyContent: 'space-between',
    height: 120,
    paddingRight: 6,
    paddingVertical: 2,
  },
  yAxisText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: colors.parchmentMuted,
  },
  yAxisTextLight: {
    color: '#6E6A63',
  },
  curveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    justifyContent: 'space-between',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.parchmentMuted,
  },
  legendTextLight: {
    color: '#6E6A63',
  },
  tooltipContainer: {
    backgroundColor: '#272A2E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#3D4247',
  },
  tooltipContainerLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  tooltipDate: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: colors.parchmentMuted,
    textAlign: 'center',
  },
  tooltipDateLight: {
    color: '#6E6A63',
  },
  tooltipValue: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.parchmentPale,
    textAlign: 'center',
  },
  tooltipValueLight: {
    color: '#111315',
  },
  curveColumnWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    marginHorizontal: 1.5,
  },
  curveBar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  emptyChart: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChartText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentMuted,
  },
  summaryCard: {
    marginTop: layout.sectionGap - space.md,
    paddingTop: layout.sectionGap - space.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  summaryTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'column',
  },
  summaryItem: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  summaryItemLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: colors.parchmentMuted,
  },
  summaryItemValue: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  yieldAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  summaryYieldPct: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  // Light Theme Styles
  containerLight: {
    backgroundColor: 'transparent',
  },
  chartHeaderLight: {},
  chartLabelLight: {
    color: '#6E6A63',
  },
  mainValueLight: {
    color: '#111315',
  },
  periodBtnLight: {
    backgroundColor: '#F0EDE6',
  },
  periodBtnTextLight: {
    color: '#6E6A63',
  },
  chartAreaLight: {},
  emptyChartTextLight: {
    color: '#6E6A63',
  },
  summaryCardLight: {
    borderTopColor: '#EAE4D7',
  },
  summaryTitleLight: {
    color: '#6E6A63',
  },
  summaryItemLight: {
    borderTopColor: '#EAE4D7',
  },
  summaryItemLabelLight: {
    color: '#6E6A63',
  },
  summaryItemValueLight: {
    color: '#111315',
  },
});
