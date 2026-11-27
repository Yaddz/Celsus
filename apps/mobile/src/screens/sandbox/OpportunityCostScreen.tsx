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
import { snowball } from '../../domain/sandbox/dividendGoal';
import {
  futureValueOfLumpSum,
  futureValueOfSeries,
} from '../../domain/sandbox/opportunityCost';
import {
  fireService,
  type OpportunityCostContextData,
} from '../../services/fireService';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface OpportunityCostScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  onOpenSubscriptions?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

type OppTab = 'subscriptions' | 'categories' | 'purchase';

export const OpportunityCostScreen: React.FC<OpportunityCostScreenProps> = ({
  onBack,
  onSwitchModule,
  onOpenSubscriptions,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'opportunity-cost-screen',
}) => {
  const isLight = themeMode === 'light';
  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  const [ctx, setCtx] = useState<OpportunityCostContextData | null>(null);
  const [tab, setTab] = useState<OppTab>('subscriptions');
  const [selectedSubIds, setSelectedSubIds] = useState<Record<string, boolean>>({});
  const [selectedCatIds, setSelectedCatIds] = useState<Record<string, boolean>>({});
  const [purchaseAmountText, setPurchaseAmountText] = useState<string>('1200');
  const [installments, setInstallments] = useState<number>(1);
  const [showBrokerPicker, setShowBrokerPicker] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fireService.loadOpportunityCostContext(referenceDateIso);
      setCtx(data);
      if (data.subscriptions.length > 0) {
        setSelectedSubIds({ [data.subscriptions[0].id]: true });
      }
      if (data.categoryAverages.length > 0) {
        setSelectedCatIds({ [data.categoryAverages[0].categoryId]: true });
      }
    } catch {
      // Mantém defaults seguros
    }
  }, [referenceDateIso]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const monthlySelectedCents = useMemo(() => {
    if (!ctx) return 0;
    if (tab === 'subscriptions') {
      return ctx.subscriptions.reduce(
        (sum, s) => (selectedSubIds[s.id] ? sum + s.amount_cents : sum),
        0
      );
    }
    if (tab === 'categories') {
      return ctx.categoryAverages.reduce(
        (sum, c) => (selectedCatIds[c.categoryId] ? sum + c.monthlyAverageCents : sum),
        0
      );
    }
    const parsed = Number.parseFloat(purchaseAmountText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    const totalCents = Math.round(parsed * 100);
    return installments > 1 ? Math.round(totalCents / installments) : totalCents;
  }, [ctx, tab, selectedSubIds, selectedCatIds, purchaseAmountText, installments]);

  const annualRate = ctx?.annualCdiRate ?? 0.1;

  const computeHorizon = useCallback(
    (years: number) => {
      if (tab === 'purchase' && installments === 1) {
        return futureValueOfLumpSum(monthlySelectedCents, annualRate, years);
      }
      return futureValueOfSeries(monthlySelectedCents, annualRate, years);
    },
    [tab, installments, monthlySelectedCents, annualRate]
  );

  const fv5 = useMemo(() => computeHorizon(5), [computeHorizon]);
  const fv10 = useMemo(() => computeHorizon(10), [computeHorizon]);
  const fv20 = useMemo(() => computeHorizon(20), [computeHorizon]);

  const dividendMonthsSaved = useMemo(() => {
    if (!ctx?.savedDividendGoalMonthlyBRL || monthlySelectedCents <= 0) return null;
    const goalCents = Math.round(ctx.savedDividendGoalMonthlyBRL * 100);
    const yld = ctx.savedDividendGoalYield ?? 0.08;
    const base = snowball({
      startCents: 0,
      monthlyCents: 100_000,
      yield: yld,
      monthlyGoalCents: goalCents,
    });
    const boosted = snowball({
      startCents: 0,
      monthlyCents: 100_000 + monthlySelectedCents,
      yield: yld,
      monthlyGoalCents: goalCents,
    });
    if (base.monthsToGoal === null || boosted.monthsToGoal === null) return 0;
    return Math.max(0, base.monthsToGoal - boosted.monthsToGoal);
  }, [ctx, monthlySelectedCents]);

  const mask = (value: string) => (isPrivacyMode ? PRIVACY_CURRENCY_MASK : value);

  const createRecurrenceWithBroker = async (brokerAccountId: string) => {
    const sourceId = ctx?.defaultSourceAccountId;
    if (!sourceId) {
      setActionFeedback('Cadastre uma conta corrente ou carteira para origem da transferência.');
      return;
    }
    const amount = monthlySelectedCents > 0 ? monthlySelectedCents : 5_000;
    await fireService.createMonthlyContributionRecurrence({
      amountCents: amount,
      sourceAccountId: sourceId,
      brokerAccountId,
      description: 'Aporte mensal (Custo de oportunidade)',
      startDate: referenceDateIso,
    });
    setShowBrokerPicker(false);
    setActionFeedback('Recorrência de aporte mensal criada em Finanças.');
  };

  const handleTurnIntoContribution = async () => {
    if (ctx?.defaultBrokerAccountId) {
      await createRecurrenceWithBroker(ctx.defaultBrokerAccountId);
      return;
    }
    setShowBrokerPicker(true);
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Custo de oportunidade"
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
        {/* Abas: Assinaturas / Categorias / Uma compra */}
        <View style={[styles.tabsRow, { backgroundColor: surface, borderColor }]}>
          <TouchableOpacity
            testID="opp-tab-subscriptions"
            onPress={() => setTab('subscriptions')}
            style={[
              styles.tabBtn,
              tab === 'subscriptions' && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === 'subscriptions' ? '#FFFFFF' : mutedColor },
              ]}
            >
              Assinaturas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="opp-tab-categories"
            onPress={() => setTab('categories')}
            style={[
              styles.tabBtn,
              tab === 'categories' && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === 'categories' ? '#FFFFFF' : mutedColor },
              ]}
            >
              Categorias
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="opp-tab-purchase"
            onPress={() => setTab('purchase')}
            style={[
              styles.tabBtn,
              tab === 'purchase' && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === 'purchase' ? '#FFFFFF' : mutedColor },
              ]}
            >
              Uma compra
            </Text>
          </TouchableOpacity>
        </View>

        {/* Lista de seleção conforme aba */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          {tab === 'subscriptions' && (
            <>
              <View style={styles.listHeader}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  Assinaturas ativas
                </Text>
                <TouchableOpacity
                  testID="opp-view-subscriptions-btn"
                  onPress={() => onOpenSubscriptions?.()}
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>
                    Ver assinaturas
                  </Text>
                </TouchableOpacity>
              </View>
              {(ctx?.subscriptions ?? []).length === 0 ? (
                <Text style={[styles.emptyText, { color: mutedColor }]}>
                  Nenhuma assinatura ativa em Finanças.
                </Text>
              ) : (
                ctx!.subscriptions.map((sub) => {
                  const checked = Boolean(selectedSubIds[sub.id]);
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      testID={`opp-sub-${sub.id}`}
                      onPress={() =>
                        setSelectedSubIds((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))
                      }
                      style={[styles.checkRow, { borderColor }]}
                    >
                      <MaterialIcons
                        name={checked ? 'check-box' : 'check-box-outline-blank'}
                        size={20}
                        color={checked ? colors.primary : mutedColor}
                      />
                      <Text style={[styles.checkLabel, { color: textColor }]}>
                        {sub.description}
                      </Text>
                      <Text style={[styles.checkAmount, { color: mutedColor }]}>
                        {mask(formatCentsBRL(sub.amount_cents))}/mês
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {tab === 'categories' && (
            <>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Média mensal por categoria (6 meses)
              </Text>
              {(ctx?.categoryAverages ?? []).length === 0 ? (
                <Text style={[styles.emptyText, { color: mutedColor }]}>
                  Sem despesas nos últimos 6 meses.
                </Text>
              ) : (
                ctx!.categoryAverages.map((cat) => {
                  const checked = Boolean(selectedCatIds[cat.categoryId]);
                  return (
                    <TouchableOpacity
                      key={cat.categoryId}
                      testID={`opp-cat-${cat.categoryId}`}
                      onPress={() =>
                        setSelectedCatIds((prev) => ({
                          ...prev,
                          [cat.categoryId]: !prev[cat.categoryId],
                        }))
                      }
                      style={[styles.checkRow, { borderColor }]}
                    >
                      <MaterialIcons
                        name={checked ? 'check-box' : 'check-box-outline-blank'}
                        size={20}
                        color={checked ? colors.primary : mutedColor}
                      />
                      <Text style={[styles.checkLabel, { color: textColor }]}>
                        {cat.categoryName}
                      </Text>
                      <Text style={[styles.checkAmount, { color: mutedColor }]}>
                        {mask(formatCentsBRL(cat.monthlyAverageCents))}/mês
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {tab === 'purchase' && (
            <>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Valor da compra (R$)
              </Text>
              <TextInput
                testID="opp-purchase-amount-input"
                value={purchaseAmountText}
                onChangeText={setPurchaseAmountText}
                keyboardType="numeric"
                placeholder="1200"
                placeholderTextColor={mutedColor}
                style={[styles.input, { color: textColor, borderColor }]}
              />
              <View style={styles.installmentsRow}>
                {[1, 6, 12].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setInstallments(n)}
                    style={[
                      styles.chipBtn,
                      { borderColor },
                      installments === n && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={{
                        color: installments === n ? '#FFFFFF' : textColor,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {n === 1 ? 'À vista' : `${n}x`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Tile resultado */}
        <View
          testID="opp-result-tile"
          style={[styles.card, { backgroundColor: surface, borderColor }]}
        >
          <Text style={[styles.cardLabel, { color: mutedColor }]}>
            EM 20 ANOS A 100% CDI ({(annualRate * 100).toFixed(1).replace('.', ',')}% a.a.)
          </Text>
          <Text testID="opp-result-value" style={[styles.heroValue, { color: textColor }]}>
            {mask(formatCentsBRL(fv20.totalCents))}
          </Text>
          <Text style={[styles.originText, { color: mutedColor }]}>
            Aportado: {mask(formatCentsBRL(fv20.contributedCents))} · Juros:{' '}
            {mask(formatCentsBRL(fv20.interestCents))}
          </Text>
        </View>

        {/* KPIs 5 / 10 / 20 anos */}
        <View style={styles.kpiRow}>
          <View
            testID="opp-kpi-5y"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>5 anos</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {mask(formatCentsBRL(fv5.totalCents))}
            </Text>
          </View>
          <View
            testID="opp-kpi-10y"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>10 anos</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {mask(formatCentsBRL(fv10.totalCents))}
            </Text>
          </View>
          <View
            testID="opp-kpi-20y"
            style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.kpiLabel, { color: mutedColor }]}>20 anos</Text>
            <Text style={[styles.kpiValue, { color: textColor }]}>
              {mask(formatCentsBRL(fv20.totalCents))}
            </Text>
          </View>
        </View>

        {/* Tile condicional: Na meta de dividendos */}
        {ctx?.savedDividendGoalMonthlyBRL !== null &&
        ctx?.savedDividendGoalMonthlyBRL !== undefined ? (
          <View
            testID="opp-dividend-goal-tile"
            style={[styles.card, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.cardLabel, { color: mutedColor }]}>
              NA META DE DIVIDENDOS
            </Text>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              {dividendMonthsSaved !== null && dividendMonthsSaved > 0
                ? `Antecipa sua meta em ${dividendMonthsSaved} ${dividendMonthsSaved === 1 ? 'mês' : 'meses'}.`
                : 'Acelera a chegada na sua meta de dividendos.'}
            </Text>
          </View>
        ) : null}

        {/* Virar aporte mensal */}
        <TouchableOpacity
          testID="opp-turn-into-contribution-btn"
          onPress={handleTurnIntoContribution}
          activeOpacity={0.85}
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialIcons name="trending-up" size={18} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Virar aporte mensal</Text>
        </TouchableOpacity>

        {showBrokerPicker ? (
          <View
            testID="opp-broker-picker"
            style={[styles.card, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Escolha a conta corretora de destino
            </Text>
            {(ctx?.brokerAccounts ?? []).length === 0 ? (
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                Nenhuma conta do tipo corretora encontrada. Cadastre uma em Finanças › Contas.
              </Text>
            ) : (
              ctx!.brokerAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  testID={`opp-broker-option-${acc.id}`}
                  onPress={() => createRecurrenceWithBroker(acc.id)}
                  style={[styles.checkRow, { borderColor }]}
                >
                  <MaterialIcons name="account-balance" size={18} color={colors.primary} />
                  <Text style={[styles.checkLabel, { color: textColor }]}>{acc.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : null}

        {actionFeedback ? (
          <Text testID="opp-action-feedback" style={[styles.feedbackText, { color: colors.tertiary }]}>
            {actionFeedback}
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
  tabsRow: {
    flexDirection: 'row',
    borderRadius: borders.radiusLg,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borders.radiusMd,
    alignItems: 'center',
  },
  tabText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: borders.radiusLg,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  linkText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  checkLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  checkAmount: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: typography.fontFamily,
    fontSize: 14,
  },
  installmentsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borders.radiusFull,
    borderWidth: 1,
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
    fontSize: 14,
    fontWeight: '700',
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

export default OpportunityCostScreen;
