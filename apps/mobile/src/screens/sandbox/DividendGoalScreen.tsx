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
import {
  incomeCalendar,
  requiredCapital,
  snowball,
  suggestPositions,
} from '../../domain/sandbox/dividendGoal';
import {
  sandboxRepository,
  type SandboxScenarioRecord,
} from '../../repositories/sandboxRepository';
import {
  dividendGoalService,
  type DividendGoalScenarioSpec,
  type LoadedCandidatesResult,
} from '../../services/dividendGoalService';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export const R51_DISCLAIMER_TEXT =
  'Baseado nos proventos pagos nos últimos 12 meses. Não é promessa de renda futura.';

export interface DividendGoalScreenProps {
  onBack?: () => void;
  onOpenContributionSimulator?: (initialAmountBRL: number) => void;
  initialScenario?: SandboxScenarioRecord | null;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const CLASS_FILTERS = [
  { id: 'ALL', label: 'Todas' },
  { id: 'FII', label: 'FIIs' },
  { id: 'STOCK', label: 'Ações' },
];

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseAmountInput(text: string): number {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const DividendGoalScreen: React.FC<DividendGoalScreenProps> = ({
  onBack,
  onOpenContributionSimulator,
  initialScenario,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'dividend-goal-screen',
}) => {
  const isLight = themeMode === 'light';
  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  const parsedInitial: Partial<DividendGoalScenarioSpec> = useMemo(() => {
    if (!initialScenario?.spec_json) return {};
    try {
      return JSON.parse(initialScenario.spec_json);
    } catch {
      return {};
    }
  }, [initialScenario]);

  const [monthlyGoalText, setMonthlyGoalText] = useState(
    parsedInitial.monthlyGoalBRL ? String(parsedInitial.monthlyGoalBRL) : '3000'
  );
  const [fixedExpensesCents, setFixedExpensesCents] = useState<number | null>(null);
  const [currentMonthlyBRL, setCurrentMonthlyBRL] = useState<number>(0);
  const [ipca12mRate, setIpca12mRate] = useState<number | null>(null);
  const [adjustByIpca, setAdjustByIpca] = useState<boolean>(
    parsedInitial.adjustByIpca ?? false
  );
  const [mode, setMode] = useState<'follow_targets' | 'free'>(
    parsedInitial.mode ?? 'free'
  );
  const [max20Pct, setMax20Pct] = useState<boolean>(
    (parsedInitial.maxPerAssetPct ?? 20) <= 20
  );
  const [assetClassFilter, setAssetClassFilter] = useState<string>(
    parsedInitial.assetClassFilter ?? 'FII'
  );
  const [snowballMonthlyText, setSnowballMonthlyText] = useState<string>(
    parsedInitial.snowballMonthlyBRL ? String(parsedInitial.snowballMonthlyBRL) : '1500'
  );
  const [loadedData, setLoadedData] = useState<LoadedCandidatesResult>({
    candidates: [],
    shortHistoryTickers: [],
    dividendsByTicker: {},
    pricesByTicker: {},
  });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [fixedCents, curIncome, ipca] = await Promise.all([
        dividendGoalService.getFixedExpensesMonthlyCents().catch(() => null),
        dividendGoalService.getCurrentMonthlyIncomeBRL().catch(() => 0),
        dividendGoalService.getIpca12mRate().catch(() => null),
      ]);
      if (!active) return;
      setFixedExpensesCents(fixedCents);
      setCurrentMonthlyBRL(curIncome);
      setIpca12mRate(ipca);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await dividendGoalService
        .loadCandidates({
          mode,
          assetClass: assetClassFilter,
        })
        .catch(() => ({
          candidates: [],
          shortHistoryTickers: [],
          dividendsByTicker: {},
          pricesByTicker: {},
        }));
      if (active) setLoadedData(data);
    })();
    return () => {
      active = false;
    };
  }, [mode, assetClassFilter]);

  const baseMonthlyGoalBRL = parseAmountInput(monthlyGoalText);
  const effectiveMonthlyGoalBRL =
    adjustByIpca && ipca12mRate !== null
      ? baseMonthlyGoalBRL * (1 + ipca12mRate)
      : baseMonthlyGoalBRL;

  const suggestion = useMemo(() => {
    const gapBRL = Math.max(0, effectiveMonthlyGoalBRL - currentMonthlyBRL);
    // Estimativa inicial do capital necessário com yield médio dos candidatos elegíveis
    const eligible = loadedData.candidates.filter((c) => !c.shortHistory && c.yield > 0);
    const avgYield =
      eligible.length > 0
        ? eligible.reduce((acc, c) => acc + c.yield, 0) / eligible.length
        : 0.08;
    const estGapCapitalBRL = requiredCapital(gapBRL, avgYield) ?? 0;
    const gapCents = Math.round(estGapCapitalBRL * 100);

    return suggestPositions({
      mode,
      candidates: loadedData.candidates,
      maxPerAsset: max20Pct ? 0.2 : 1,
      minAssets: 4,
      gapCents,
      prices: loadedData.pricesByTicker,
    });
  }, [loadedData, mode, max20Pct, effectiveMonthlyGoalBRL, currentMonthlyBRL]);

  const effectiveYield = suggestion.weightedYield > 0 ? suggestion.weightedYield : 0.08;
  const totalCapitalNeededBRL = requiredCapital(effectiveMonthlyGoalBRL, effectiveYield);

  const calendar = useMemo(() => {
    const quantities: Record<string, number> = {};
    for (const item of suggestion.items) {
      quantities[item.ticker] = item.quantity;
    }
    return incomeCalendar(loadedData.dividendsByTicker, quantities);
  }, [suggestion.items, loadedData.dividendsByTicker]);

  const maxCalendarBRL = Math.max(1, ...calendar.map((m) => m.amountBRL));

  const snowballMonthlyBRL = parseAmountInput(snowballMonthlyText);
  const snowballResult = useMemo(() => {
    const startBRL = currentMonthlyBRL > 0 ? (requiredCapital(currentMonthlyBRL, effectiveYield) ?? 0) : 0;
    return snowball({
      startCents: Math.round(startBRL * 100),
      monthlyCents: Math.round(snowballMonthlyBRL * 100),
      yield: effectiveYield,
      monthlyGoalCents: Math.round(effectiveMonthlyGoalBRL * 100),
    });
  }, [currentMonthlyBRL, effectiveYield, snowballMonthlyBRL, effectiveMonthlyGoalBRL]);

  const handleSaveScenario = useCallback(async () => {
    const spec: DividendGoalScenarioSpec = {
      monthlyGoalBRL: baseMonthlyGoalBRL,
      useFixedExpenses: fixedExpensesCents !== null && baseMonthlyGoalBRL * 100 === fixedExpensesCents,
      adjustByIpca,
      mode,
      maxPerAssetPct: max20Pct ? 20 : 100,
      assetClassFilter,
      snowballMonthlyBRL,
    };
    await sandboxRepository.saveScenario({
      id: initialScenario?.id,
      name: `Meta ${formatBRL(baseMonthlyGoalBRL)}/mês`,
      kind: 'dividend_goal',
      spec: spec as unknown as Record<string, unknown>,
    });
    setSavedNotice('Cenário salvo no Simulador.');
  }, [
    baseMonthlyGoalBRL,
    fixedExpensesCents,
    adjustByIpca,
    mode,
    max20Pct,
    assetClassFilter,
    snowballMonthlyBRL,
    initialScenario?.id,
  ]);

  const maskValue = (formatted: string) => (isPrivacyMode ? '••••' : formatted);

  const fixedChipLabel =
    fixedExpensesCents !== null
      ? `= meus gastos fixos (${maskValue(formatBRL(fixedExpensesCents / 100))})`
      : '= meus gastos fixos (R$ —)';

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Meta de dividendos"
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
        {/* Campo Quero receber por mês */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <Text style={[styles.label, { color: mutedColor }]}>Quero receber por mês</Text>
          <TextInput
            testID="dg-monthly-goal-input"
            value={isPrivacyMode ? '••••' : monthlyGoalText}
            onChangeText={setMonthlyGoalText}
            keyboardType="numeric"
            editable={!isPrivacyMode}
            placeholder="3000"
            placeholderTextColor={mutedColor}
            style={[styles.input, { color: textColor, borderColor }]}
          />

          <View style={styles.chipsRow}>
            <TouchableOpacity
              testID="dg-fixed-expenses-chip"
              onPress={() => {
                if (fixedExpensesCents !== null) {
                  setMonthlyGoalText((fixedExpensesCents / 100).toFixed(2).replace('.', ','));
                }
              }}
              style={[styles.chip, { borderColor }]}
            >
              <Text testID="dg-fixed-expenses-chip-text" style={[styles.chipText, { color: textColor }]}>
                {fixedChipLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="dg-ipca-toggle"
              onPress={() => setAdjustByIpca((v) => !v)}
              style={[
                styles.chip,
                { borderColor: adjustByIpca ? colors.primary : borderColor },
                adjustByIpca && { backgroundColor: 'rgba(217, 102, 40, 0.14)' },
              ]}
            >
              <Text style={[styles.chipText, { color: adjustByIpca ? colors.primary : textColor }]}>
                Corrigir pelo IPCA
                {ipca12mRate !== null ? ` (${(ipca12mRate * 100).toFixed(1)}%)` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPIs: Capital necessário / Você já tem */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}>
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>Capital necessário</Text>
            <Text testID="dg-kpi-required-capital" style={[styles.kpiValue, { color: textColor }]}>
              {totalCapitalNeededBRL !== null ? maskValue(formatBRL(totalCapitalNeededBRL)) : '—'}
            </Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}>
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>Você já tem</Text>
            <Text testID="dg-kpi-current-income" style={[styles.kpiValue, { color: colors.tertiary }]}>
              {maskValue(`${formatBRL(currentMonthlyBRL)}/mês`)}
            </Text>
          </View>
        </View>

        {/* Lista Para fechar a meta */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Para fechar a meta</Text>

          <View style={styles.chipsRow}>
            <TouchableOpacity
              testID="dg-mode-follow-targets"
              onPress={() => setMode('follow_targets')}
              style={[
                styles.chip,
                { borderColor: mode === 'follow_targets' ? colors.primary : borderColor },
              ]}
            >
              <Text style={[styles.chipText, { color: textColor }]}>Seguir minhas metas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="dg-mode-free"
              onPress={() => setMode('free')}
              style={[
                styles.chip,
                { borderColor: mode === 'free' ? colors.primary : borderColor },
              ]}
            >
              <Text style={[styles.chipText, { color: textColor }]}>Livre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="dg-max-20-toggle"
              onPress={() => setMax20Pct((v) => !v)}
              style={[
                styles.chip,
                { borderColor: max20Pct ? colors.primary : borderColor },
              ]}
            >
              <Text style={[styles.chipText, { color: textColor }]}>Máx. 20% por ativo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chipsRow}>
            {CLASS_FILTERS.map((cf) => (
              <TouchableOpacity
                key={cf.id}
                testID={`dg-class-${cf.id}`}
                onPress={() => setAssetClassFilter(cf.id)}
                style={[
                  styles.chip,
                  { borderColor: assetClassFilter === cf.id ? colors.primary : borderColor },
                ]}
              >
                <Text style={[styles.chipText, { color: textColor }]}>{cf.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {suggestion.items.length === 0 ? (
            <Text style={[styles.mutedText, { color: mutedColor }]}>
              Sem candidatos elegíveis com histórico de 12 meses para os filtros atuais.
            </Text>
          ) : (
            <View style={styles.list}>
              {suggestion.items.map((item) => (
                <View key={item.ticker} style={[styles.itemRow, { borderColor }]}>
                  <View>
                    <Text style={[styles.itemTicker, { color: textColor }]}>{item.ticker}</Text>
                    <Text style={[styles.mutedText, { color: mutedColor }]}>
                      DY {(item.yield * 100).toFixed(1)}% · {(item.weight * 100).toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[styles.itemQty, { color: textColor }]}>
                      {isPrivacyMode ? '••••' : `${item.quantity} un.`}
                    </Text>
                    <Text style={[styles.mutedText, { color: mutedColor }]}>
                      {maskValue(formatBRL(item.investedCents / 100))}
                    </Text>
                  </View>
                </View>
              ))}
              <Text style={[styles.mutedText, { color: mutedColor }]}>
                Troco estimado: {maskValue(formatBRL(suggestion.changeCents / 100))}
              </Text>
            </View>
          )}

          {loadedData.shortHistoryTickers.length > 0 && (
            <Text style={[styles.mutedText, { color: mutedColor }]}>
              Fora da sugestão (histórico curto): {loadedData.shortHistoryTickers.join(', ')}
            </Text>
          )}
        </View>

        {/* Calendário mensal (barras) */}
        <View
          testID="dg-calendar-bars"
          style={[styles.card, { backgroundColor: surface, borderColor }]}
        >
          <Text style={[styles.sectionTitle, { color: textColor }]}>Calendário mensal</Text>
          <View style={styles.barsRow}>
            {calendar.map((m) => {
              const heightPct = Math.max(8, Math.round((m.amountBRL / maxCalendarBRL) * 64));
              return (
                <View key={m.month} style={styles.barCol}>
                  <View
                    style={[
                      styles.barFill,
                      { height: heightPct, backgroundColor: colors.primary },
                    ]}
                  />
                  <Text style={[styles.barLabel, { color: mutedColor }]}>{m.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Tile Bola de neve */}
        <View
          testID="dg-snowball-tile"
          style={[styles.card, { backgroundColor: surface, borderColor }]}
        >
          <Text style={[styles.sectionTitle, { color: textColor }]}>Bola de neve</Text>
          <Text style={[styles.mutedText, { color: mutedColor }]}>
            Aporte mensal + reinvestimento dos proventos; preço e yield constantes.
          </Text>
          <TextInput
            testID="dg-snowball-monthly-input"
            value={isPrivacyMode ? '••••' : snowballMonthlyText}
            onChangeText={setSnowballMonthlyText}
            keyboardType="numeric"
            editable={!isPrivacyMode}
            placeholder="1500"
            placeholderTextColor={mutedColor}
            style={[styles.input, { color: textColor, borderColor }]}
          />
          <Text style={[styles.kpiValue, { color: textColor }]}>
            {snowballResult.reached && snowballResult.monthsToGoal !== null
              ? `${snowballResult.monthsToGoal} meses até a meta`
              : 'Mais de 50 anos nesse ritmo'}
          </Text>
          <TouchableOpacity
            testID="dg-generate-plan-btn"
            onPress={() => onOpenContributionSimulator?.(snowballMonthlyBRL)}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons name="trending-up" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Gerar plano de aporte</Text>
          </TouchableOpacity>
        </View>

        {/* Salvar cenário */}
        <TouchableOpacity
          testID="dg-save-scenario-btn"
          onPress={handleSaveScenario}
          style={[styles.secondaryBtn, { borderColor }]}
        >
          <MaterialIcons name="bookmark-border" size={18} color={textColor} />
          <Text style={[styles.secondaryBtnText, { color: textColor }]}>Salvar como cenário</Text>
        </TouchableOpacity>
        {savedNotice ? (
          <Text style={[styles.mutedText, { color: colors.tertiary }]}>{savedNotice}</Text>
        ) : null}

        {/* Texto fixo obrigatório R51 */}
        <Text style={[styles.disclaimer, { color: mutedColor }]}>{R51_DISCLAIMER_TEXT}</Text>
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
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borders.radiusFull,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderRadius: borders.radiusLg,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  kpiLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  kpiValue: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  mutedText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  list: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemQty: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 88,
    paddingTop: 8,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  barFill: {
    width: 12,
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borders.radiusMd,
    paddingVertical: 12,
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
