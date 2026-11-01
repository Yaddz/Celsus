import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';
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

export const PERIOD_ORDER: PeriodFilter[] = ['5D', '1M', '1Y', '5Y', 'ALL'];

export interface PatrimonyLineChartCardProps {
  curve?: HistoricalPricePoint[];
  selectedPeriod?: PeriodFilter;
  onPeriodChange?: (period: PeriodFilter) => void;
  summary?: PeriodSummary;
  isPrivacyMode?: boolean;
  accentColor?: string;
  testID?: string;
}

export const PatrimonyLineChartCard: React.FC<PatrimonyLineChartCardProps> = ({
  curve = [],
  selectedPeriod = 'ALL',
  onPeriodChange,
  summary,
  isPrivacyMode = false,
  accentColor = colors.primary,
  testID = 'patrimony-line-chart-card',
}) => {
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
    <View style={styles.container} testID={testID}>
      {/* 1. Header do Gráfico com Filtros de Período */}
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartLabel}>PATRIMÔNIO HISTÓRICO</Text>
          <View style={styles.valueRow}>
            <Text style={styles.mainValue}>
              {maskValue(activeSummary.finalPatrimony)}
            </Text>
            {/* Rentabilidade permanece visível sem censura conforme solicitação */}
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
                {`${yieldPrefix}${activeSummary.yieldPercentage}%`}
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
                style={[styles.periodBtn, isSelected && styles.periodBtnActive]}
              >
                <Text
                  style={[
                    styles.periodBtnText,
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
      <View style={styles.chartArea} testID="patrimony-line-chart-area">
        {curve.length > 0 ? (
          <View style={styles.curveContainer}>
            {curve.map((pt, idx) => {
              const val = parseFloat(pt.marketValue) || 0;
              const normalizedHeight = Math.max(12, ((val - minVal) / range) * 110 + 12);
              const isSelected = idx === selectedPointIndex;

              return (
                <TouchableOpacity
                  key={`${pt.date}-${idx}`}
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
                        borderTopColor: isSelected ? colors.parchmentPale : accentColor,
                        borderTopWidth: isSelected ? 3 : 2,
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyChartText}>Sem pontos no período selecionado</Text>
          </View>
        )}
      </View>

      {/* 3. Card de Resumo do Período */}
      <View style={styles.summaryCard} testID="period-summary-card">
        <Text style={styles.summaryTitle}>RESUMO DO PERÍODO</Text>
        <View style={styles.summaryGrid}>
          {/* Patrimônio Inicial */}
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Patrimônio Inicial</Text>
            <Text style={styles.summaryItemValue}>
              {maskValue(activeSummary.initialPatrimony)}
            </Text>
          </View>

          {/* Aportes Líquidos */}
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Aportes</Text>
            <Text style={styles.summaryItemValue}>
              {maskValue(activeSummary.netContributions)}
            </Text>
          </View>

          {/* Rendimentos */}
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Rendimentos</Text>
            <View style={styles.yieldAmountRow}>
              <Text
                style={[
                  styles.summaryItemValue,
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
                {` (${yieldPrefix}${activeSummary.yieldPercentage}%)`}
              </Text>
            </View>
          </View>

          {/* Patrimônio Final */}
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>Patrimônio Final</Text>
            <Text style={styles.summaryItemValue}>
              {maskValue(activeSummary.finalPatrimony)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  chartHeader: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  chartLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.parchmentMuted,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mainValue: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
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
    backgroundColor: colors.surfaceCard,
    height: 140,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  curveContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    width: '100%',
    justifyContent: 'space-between',
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
    backgroundColor: colors.surfaceCard,
    borderRadius: 24,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  summaryTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.parchmentMuted,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryItem: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: borders.radiusMd,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  summaryItemLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.parchmentMuted,
    marginBottom: 4,
  },
  summaryItemValue: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
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
    fontSize: 11,
    fontWeight: '700',
  },
});
