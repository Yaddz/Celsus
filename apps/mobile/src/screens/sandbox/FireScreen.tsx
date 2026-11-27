import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { formatCentsBRL } from '../../domain/financeFlow';
import { fireNumber, projectToFire } from '../../domain/sandbox/fire';
import { fireService, type FireContextData } from '../../services/fireService';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface FireScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

function formatPct(decimalRate: number): string {
  return `${(decimalRate * 100).toFixed(1).replace('.', ',')}%`;
}

export const FireScreen: React.FC<FireScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'fire-screen',
}) => {
  const isLight = themeMode === 'light';
  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  const [ctx, setCtx] = useState<FireContextData | null>(null);
  const [expenseCents, setExpenseCents] = useState<number>(500_000);
  const [manualExpenseText, setManualExpenseText] = useState<string>('5000');
  const [realReturn, setRealReturn] = useState<number>(0.04);
  const [withdrawalRate, setWithdrawalRate] = useState<number>(0.04);
  const [goalFeedback, setGoalFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fireService.loadFireContext(referenceDateIso);
      setCtx(data);
      if (data.averageExpenseCents !== null && data.averageExpenseCents > 0) {
        setExpenseCents(data.averageExpenseCents);
        setManualExpenseText(String(Math.round(data.averageExpenseCents / 100)));
      }
    } catch {
      // Mantém defaults seguros
    }
  }, [referenceDateIso]);

  useEffect(() => {
    load();
  }, [load]);

  const targetCents = useMemo(
    () => fireNumber(expenseCents, withdrawalRate) ?? 0,
    [expenseCents, withdrawalRate]
  );

  const investedCents = ctx?.investedCents ?? 0;
  const monthlyCents = ctx?.averageContributionCents ?? 0;
  const startYm = (referenceDateIso ?? new Date().toISOString().slice(0, 10)).slice(0, 7);

  const projection = useMemo(
    () =>
      projectToFire({
        investedCents,
        monthlyCents,
        realReturn,
        target: targetCents,
        startYearMonth: startYm,
      }),
    [investedCents, monthlyCents, realReturn, targetCents, startYm]
  );

  const halfProjection = useMemo(
    () =>
      projectToFire({
        investedCents,
        monthlyCents: Math.round(monthlyCents / 2),
        realReturn,
        target: targetCents,
        startYearMonth: startYm,
      }),
    [investedCents, monthlyCents, realReturn, targetCents, startYm]
  );

  const progressPct =
    targetCents > 0 ? Math.min(100, Math.round((investedCents / targetCents) * 100)) : 0;

  const mask = (value: string) => (isPrivacyMode ? PRIVACY_CURRENCY_MASK : value);

  const handleCreateGoal = async () => {
    if (targetCents <= 0) return;
    try {
      await fireService.createFireGoal({
        name: 'Independência financeira',
        targetCents,
        monthlyContributionCents: monthlyCents > 0 ? monthlyCents : null,
        referenceDateIso,
      });
      setGoalFeedback('Meta criada em Finanças › Metas.');
    } catch {
      setGoalFeedback('Não foi possível criar a meta.');
    }
  };

  const chartMilestones = useMemo(() => {
    const indices = [0, 60, 120, 180, 240, 360].filter(
      (idx) => idx < projection.series.length
    );
    return indices.map((idx) => ({
      year: Math.round(idx / 12),
      main: projection.series[idx]?.balanceCents ?? 0,
      half: halfProjection.series[idx]?.balanceCents ?? 0,
    }));
  }, [projection, halfProjection]);

  const maxChartValue = Math.max(
    targetCents,
    ...chartMilestones.map((m) => m.main),
    1
  );

  const hasFinanceExpense = ctx?.averageExpenseCents !== null && ctx?.averageExpenseCents !== undefined;

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Independência"
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        rightAccessory={
          <View style={styles.sandboxBadge}>
            <Text style={styles.sandboxBadgeText}>SANDBOX</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tile Seu número */}
        <View
          testID="fire-number-tile"
          style={[styles.card, { backgroundColor: surface, borderColor }]}
        >
          <Text style={[styles.cardLabel, { color: mutedColor }]}>SEU NÚMERO</Text>
          <Text testID="fire-number-value" style={[styles.heroValue, { color: textColor }]}>
            {mask(formatCentsBRL(targetCents))}
          </Text>
          <Text testID="fire-expense-origin" style={[styles.originText, { color: mutedColor }]}>
            {hasFinanceExpense
              ? `Gasto médio de ${mask(formatCentsBRL(ctx!.averageExpenseCents!))}/mês vem de Finanças (últimos ${ctx!.monthsAvailable} meses fechados, sem transferências).`
              : 'Menos de 3 meses fechados em Finanças — informe seu gasto mensal manualmente abaixo.'}
          </Text>

          <View
            testID="fire-progress-bar"
            style={[styles.progressTrack, { backgroundColor: isLight ? '#E6E0D4' : '#25282C' }]}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <Text style={[styles.progressCaption, { color: mutedColor }]}>
            {isPrivacyMode
              ? 'Patrimônio investido oculto'
              : `${progressPct}% atingido (${formatCentsBRL(investedCents)} investidos)`}
          </Text>
        </View>

        {/* KPIs: Chega em, Poupança (R43), Reserva (R45) */}
        <View style={styles.kpiRow}>
          <View
            testID="fire-kpi-arrival"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>Chega em</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {projection.arrivalDate ?? 'Não chega em 60a'}
            </Text>
          </View>

          <View
            testID="fire-kpi-savings"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>Poupança</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {ctx?.latestSavingsRateLabel ?? '—'}
            </Text>
          </View>

          <View
            testID="fire-kpi-reserve"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>Reserva</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {ctx?.reserveMonths !== null && ctx?.reserveMonths !== undefined
                ? `${ctx.reserveMonths}m`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Gráfico de projeção + linha da meta + curva aporte pela metade */}
        <View
          testID="fire-projection-chart"
          style={[styles.card, { backgroundColor: surface, borderColor }]}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Projeção</Text>
            <Text style={[styles.legendText, { color: mutedColor }]}>
              Meta: {mask(formatCentsBRL(targetCents))}
            </Text>
          </View>

          <View style={styles.barsRow}>
            {chartMilestones.map((pt) => {
              const mainH = Math.max(4, Math.round((pt.main / maxChartValue) * 80));
              const halfH = Math.max(4, Math.round((pt.half / maxChartValue) * 80));
              return (
                <View key={pt.year} style={styles.barCol}>
                  <View style={styles.barPair}>
                    <View
                      style={[styles.barMain, { height: mainH, backgroundColor: colors.primary }]}
                    />
                    <View
                      style={[
                        styles.barHalf,
                        { height: halfH, backgroundColor: colors.tertiary },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: mutedColor }]}>{pt.year}a</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            <Text style={[styles.legendText, { color: colors.primary }]}>
              ● Aporte atual ({mask(formatCentsBRL(monthlyCents))}/mês)
            </Text>
            <Text style={[styles.legendText, { color: colors.tertiary }]}>
              ● Se aporte pela metade: {halfProjection.arrivalDate ?? '> 60 anos'}
            </Text>
          </View>
        </View>

        {/* Sliders / controles */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Parâmetros</Text>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: textColor }]}>
              Retorno real: {formatPct(realReturn)} a.a.
            </Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                testID="fire-return-minus"
                onPress={() => setRealReturn((v) => Math.max(0.01, Number((v - 0.005).toFixed(3))))}
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="fire-return-plus"
                onPress={() => setRealReturn((v) => Math.min(0.15, Number((v + 0.005).toFixed(3))))}
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: textColor }]}>
              Taxa de retirada: {formatPct(withdrawalRate)} a.a.
            </Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                testID="fire-withdrawal-minus"
                onPress={() =>
                  setWithdrawalRate((v) => Math.max(0.02, Number((v - 0.005).toFixed(3))))
                }
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="fire-withdrawal-plus"
                onPress={() =>
                  setWithdrawalRate((v) => Math.min(0.08, Number((v + 0.005).toFixed(3))))
                }
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: textColor }]}>
              Gasto na independência: {mask(formatCentsBRL(expenseCents))}
            </Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                testID="fire-expense-minus"
                onPress={() => {
                  const next = Math.max(50_000, expenseCents - 50_000);
                  setExpenseCents(next);
                  setManualExpenseText(String(Math.round(next / 100)));
                }}
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="fire-expense-plus"
                onPress={() => {
                  const next = expenseCents + 50_000;
                  setExpenseCents(next);
                  setManualExpenseText(String(Math.round(next / 100)));
                }}
                style={[styles.stepBtn, { borderColor }]}
              >
                <Text style={[styles.stepBtnText, { color: textColor }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            testID="fire-expense-input"
            value={manualExpenseText}
            onChangeText={(txt) => {
              setManualExpenseText(txt);
              const parsed = Number.parseFloat(txt.replace(',', '.'));
              if (Number.isFinite(parsed) && parsed >= 0) {
                setExpenseCents(Math.round(parsed * 100));
              }
            }}
            keyboardType="numeric"
            placeholder="Gasto mensal (R$)"
            placeholderTextColor={mutedColor}
            style={[styles.input, { color: textColor, borderColor }]}
          />
        </View>

        {/* Criar meta com esse número */}
        <TouchableOpacity
          testID="fire-create-goal-btn"
          onPress={handleCreateGoal}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialIcons name="flag" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Criar meta com esse número</Text>
        </TouchableOpacity>
        {goalFeedback ? (
          <Text testID="fire-goal-feedback" style={[styles.feedbackText, { color: colors.tertiary }]}>
            {goalFeedback}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sandboxBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borders.radiusFull,
    backgroundColor: 'rgba(217, 102, 40, 0.16)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  sandboxBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: 120,
    gap: 12,
  },
  card: {
    borderRadius: borders.radiusLg,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  cardLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 28,
    fontWeight: '700',
  },
  originText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressCaption: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: borders.radiusMd,
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  kpiLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  kpiValue: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 104,
    paddingTop: 12,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barMain: {
    width: 10,
    borderRadius: 3,
  },
  barHalf: {
    width: 10,
    borderRadius: 3,
  },
  barLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
  },
  legendRow: {
    gap: 4,
    marginTop: 4,
  },
  legendText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  controlLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  stepper: {
    flexDirection: 'row',
    gap: 6,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: typography.fontFamily,
    fontSize: 14,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borders.radiusLg,
    paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  feedbackText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default FireScreen;
