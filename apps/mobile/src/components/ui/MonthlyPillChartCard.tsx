import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';
import { MonthlyPillPoint } from '../../domain/finance/portfolioHistory';

export type TimePeriod = 'W' | 'M' | 'Y';

export interface MonthlyPillChartCardProps {
  pills?: MonthlyPillPoint[];
  selectedPeriod?: TimePeriod;
  onPeriodChange?: (period: TimePeriod) => void;
  isPrivacyMode?: boolean;
  testID?: string;
}

const DEFAULT_SAMPLE_PILLS: MonthlyPillPoint[] = [
  { monthKey: '2026-01', label: 'Jan', investedCapital: '10000.00', marketValue: '10500.00', netContributions: '10000.00' },
  { monthKey: '2026-02', label: 'Fev', investedCapital: '15000.00', marketValue: '16200.00', netContributions: '5000.00' },
  { monthKey: '2026-03', label: 'Mar', investedCapital: '20000.00', marketValue: '22000.00', netContributions: '5000.00' },
  { monthKey: '2026-04', label: 'Abr', investedCapital: '25000.00', marketValue: '27800.00', netContributions: '5000.00' },
  { monthKey: '2026-05', label: 'Mai', investedCapital: '30000.00', marketValue: '31500.00', netContributions: '5000.00' },
  { monthKey: '2026-06', label: 'Jun', investedCapital: '32000.00', marketValue: '34468.00', netContributions: '2000.00' },
];

export const MonthlyPillChartCard: React.FC<MonthlyPillChartCardProps> = ({
  pills = DEFAULT_SAMPLE_PILLS,
  selectedPeriod = 'M',
  onPeriodChange,
  isPrivacyMode = false,
  testID,
}) => {
  const [activePeriod, setActivePeriod] = useState<TimePeriod>(selectedPeriod);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(pills.length - 1);

  const handlePeriodPress = (p: TimePeriod) => {
    setActivePeriod(p);
    if (onPeriodChange) {
      onPeriodChange(p);
    }
  };

  const selectedPill = selectedMonthIndex !== null && pills[selectedMonthIndex] ? pills[selectedMonthIndex] : null;

  // Encontra valor máximo para normalizar altura das colunas
  const maxVal = Math.max(
    ...pills.map((p) => Math.max(parseFloat(p.marketValue) || 1, parseFloat(p.investedCapital) || 1)),
    1000
  );

  return (
    <View style={styles.card} testID={testID}>
      {/* Header do Card com Seletor W | M | Y */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>EVOLUÇÃO PATRIMONIAL</Text>
          <Text style={styles.subtitle}>Cápsulas Empilhadas • Aportes vs Patrimônio</Text>
        </View>

        <View style={styles.periodSelector}>
          {(['W', 'M', 'Y'] as const).map((p) => {
            const isSelected = p === activePeriod;
            return (
              <TouchableOpacity
                key={p}
                activeOpacity={0.7}
                onPress={() => handlePeriodPress(p)}
                style={[styles.periodButton, isSelected && styles.periodButtonActive]}
              >
                <Text style={[styles.periodText, isSelected && styles.periodTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Tooltip Flutuante Escuro com Detalhes ao Tocar */}
      {selectedPill ? (
        <View style={styles.tooltipContainer}>
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipMonth}>{selectedPill.label} ({selectedPill.monthKey})</Text>
            <Text style={styles.tooltipHighlight}>
              {isPrivacyMode
                ? '•••••'
                : `+${(
                    ((parseFloat(selectedPill.marketValue) - parseFloat(selectedPill.investedCapital)) /
                      (parseFloat(selectedPill.investedCapital) || 1)) *
                    100
                  ).toFixed(1)}%`}
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View style={styles.tooltipItem}>
              <View style={[styles.tooltipDot, { backgroundColor: '#AECDC5' }]} />
              <Text style={styles.tooltipLabel}>Patrimônio: </Text>
              <Text style={styles.tooltipValue}>
                {isPrivacyMode ? '••••••' : `R$ ${parseFloat(selectedPill.marketValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
            <View style={styles.tooltipItem}>
              <View style={[styles.tooltipDot, { backgroundColor: '#FFB694' }]} />
              <Text style={styles.tooltipLabel}>Investido: </Text>
              <Text style={styles.tooltipValue}>
                {isPrivacyMode ? '••••••' : `R$ ${parseFloat(selectedPill.investedCapital).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Gráfico de Colunas em Cápsulas Empilhadas */}
      <View style={styles.chartContainer}>
        {pills.map((p, idx) => {
          const isSelected = idx === selectedMonthIndex;
          const mvVal = parseFloat(p.marketValue) || 0;
          const invVal = parseFloat(p.investedCapital) || 0;

          // Alturas proporcionais (máximo 120px)
          const totalHeight = Math.max(28, Math.min(120, (Math.max(mvVal, invVal) / maxVal) * 120));
          const topFraction = mvVal >= invVal ? 0.6 : 0.4;
          const bottomFraction = 1 - topFraction;

          return (
            <TouchableOpacity
              key={p.monthKey}
              activeOpacity={0.8}
              onPress={() => setSelectedMonthIndex(idx)}
              style={styles.columnWrapper}
            >
              <View style={[styles.pillColumn, isSelected && styles.pillColumnSelected, { height: totalHeight }]}>
                {/* Cápsula Superior (Patrimônio / Superávit em #2E4A44 / #AECDC5) */}
                <View
                  style={[
                    styles.capsuleTop,
                    {
                      flex: topFraction,
                      backgroundColor: isSelected ? '#AECDC5' : colors.secondary,
                    },
                  ]}
                />
                <View style={styles.capsuleDivider} />
                {/* Cápsula Inferior (Custo / Aporte Base em #D96628 / #FFB694) */}
                <View
                  style={[
                    styles.capsuleBottom,
                    {
                      flex: bottomFraction,
                      backgroundColor: isSelected ? '#FFB694' : colors.primary,
                    },
                  ]}
                />
              </View>

              <Text style={[styles.columnLabel, isSelected && styles.columnLabelSelected]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legenda de Cores das Cápsulas */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: colors.secondary }]} />
          <Text style={styles.legendText}>Patrimônio Total (MKT)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>Custo Aportado</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    padding: spacing.md,
    marginVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 1.1,
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#111315',
    borderRadius: borders.radiusPill,
    padding: 3,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  periodButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
  },
  periodTextActive: {
    color: colors.voidFloor,
  },
  tooltipContainer: {
    backgroundColor: '#111315',
    borderRadius: 16,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: '#303438',
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tooltipMonth: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  tooltipHighlight: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#AECDC5',
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  tooltipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
  },
  tooltipValue: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 150,
    paddingTop: 16,
    paddingBottom: 8,
  },
  columnWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
  },
  pillColumn: {
    width: 22,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#202326',
    borderWidth: borders.hairline,
    borderColor: '#2D3034',
  },
  pillColumnSelected: {
    borderColor: colors.tertiary,
    borderWidth: 1.5,
    transform: [{ scaleY: 1.05 }],
  },
  capsuleTop: {
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  capsuleDivider: {
    height: 1.5,
    backgroundColor: '#111315',
  },
  capsuleBottom: {
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
  },
  columnLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 8,
  },
  columnLabelSelected: {
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: spacing.xs,
    paddingTop: 8,
    borderTopWidth: borders.hairline,
    borderTopColor: '#25282B',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
  },
});

export default MonthlyPillChartCard;
