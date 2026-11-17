import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AnimatedModalSheet, DotTrack, LedgerInput, TextField, XpMinimalHeader } from '../../components/ui';
import { FinListCard } from '../../components/ui/FinListCard';
import { parseMoneyInput } from '../../components/ui/GoalProgressTile';
import type { FinAccount, FinGoalSource, Portfolio } from '../../db/schema';
import { decimalReaisToCents, type FinGoalSourceType } from '../../domain/finance/goal';
import { formatCentsBRL } from '../../domain/financeFlow';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { finGoalsRepository } from '../../repositories/finGoalsRepository';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { finGoalsService, type EvaluatedGoalItem } from '../../services/finGoalsService';
import type { ThemeMode } from '../../theme/palettes';
import { bento, colors, typography } from '../../theme/tokens';
import { getFinUiColors, sharedStyles } from './finTheme';

export interface GoalsScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  onOpenPortfolioTransaction?: (portfolioId: string) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

const MASK = 'R$ ••••••';

const SOURCE_OPTIONS: Array<{ type: FinGoalSourceType; label: string }> = [
  { type: 'manual', label: 'Manual' },
  { type: 'account', label: 'Conta' },
  { type: 'portfolio', label: 'Carteira' },
  { type: 'net_worth', label: 'Patrimônio' },
];

export const GoalsScreen: React.FC<GoalsScreenProps> = ({
  onBack,
  onSwitchModule,
  onOpenPortfolioTransaction,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'goals-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const isLight = themeMode === 'light';
  const reducedMotion = useReducedMotion();

  const [items, setItems] = useState<EvaluatedGoalItem[]>([]);
  const [sources, setSources] = useState<FinGoalSource[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [portfoliosList, setPortfoliosList] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | undefined>(undefined);
  const [formName, setFormName] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formMonthly, setFormMonthly] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formSourceType, setFormSourceType] = useState<FinGoalSourceType>('manual');
  const [formRefId, setFormRefId] = useState<string>('');
  const [formAssetClass, setFormAssetClass] = useState<string>('');
  const [formSharePercent, setFormSharePercent] = useState('100');
  const [formError, setFormError] = useState<string | null>(null);

  const [contribGoalId, setContribGoalId] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [evaluated, allSources, accs, ports] = await Promise.all([
        finGoalsService.listEvaluatedGoals({ referenceDateIso }),
        finGoalsRepository.listGoalSources(),
        finRepository.listAccounts(false),
        portfolioRepository.listPortfolios(false),
      ]);
      setItems(evaluated);
      setSources(allSources);
      setAccounts(accs.filter((a) => a.type !== 'card'));
      setPortfoliosList(ports);
    } finally {
      setLoading(false);
    }
  }, [referenceDateIso]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showCents = (cents: number) => (isPrivacyMode ? MASK : formatCentsBRL(cents));

  const openCreateForm = () => {
    setEditingGoalId(undefined);
    setFormName('');
    setFormTarget('');
    setFormMonthly('');
    setFormTargetDate('');
    setFormSourceType('manual');
    setFormRefId('');
    setFormAssetClass('');
    setFormSharePercent('100');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveGoal = async () => {
    const parsedTarget = parseMoneyInput(formTarget);
    if (!formName.trim() || !parsedTarget || Number(parsedTarget) <= 0) {
      setFormError('Informe um nome e um valor alvo válido.');
      return;
    }
    const parsedMonthly = parseMoneyInput(formMonthly);
    const shareNum = Math.max(1, Math.min(100, Number(formSharePercent) || 100));

    const goalSources: Array<{
      ref_type: 'account' | 'portfolio';
      ref_id: string;
      asset_class?: string | null;
      share_percent: number;
    }> = [];

    if (formSourceType === 'account' && (formRefId || accounts[0]?.id)) {
      goalSources.push({
        ref_type: 'account',
        ref_id: formRefId || accounts[0].id,
        share_percent: shareNum,
      });
    } else if (formSourceType === 'portfolio' && (formRefId || portfoliosList[0]?.id)) {
      goalSources.push({
        ref_type: 'portfolio',
        ref_id: formRefId || portfoliosList[0].id,
        asset_class: formAssetClass || null,
        share_percent: shareNum,
      });
    }

    try {
      await finGoalsService.saveGoalWithSources({
        id: editingGoalId,
        name: formName.trim(),
        icon: 'flag',
        color: colors.primary,
        target_cents: decimalReaisToCents(parsedTarget),
        target_date: formTargetDate.trim() || null,
        source_type: formSourceType,
        monthly_contribution_cents: parsedMonthly ? decimalReaisToCents(parsedMonthly) : null,
        sources: goalSources,
      });
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar meta.');
    }
  };

  const handleContributePress = (item: EvaluatedGoalItem) => {
    if (item.goal.source_type === 'portfolio') {
      const portSrc = sources.find(
        (s) => s.goal_id === item.goal.id && s.ref_type === 'portfolio'
      );
      if (portSrc && onOpenPortfolioTransaction) {
        onOpenPortfolioTransaction(portSrc.ref_id);
      }
      return;
    }
    if (item.goal.source_type === 'manual') {
      setContribGoalId(item.goal.id);
      setContribAmount('');
    }
  };

  const handleSaveContribution = async () => {
    if (!contribGoalId) return;
    const parsed = parseMoneyInput(contribAmount);
    if (!parsed || Number(parsed) <= 0) return;
    await finGoalsService.addManualContribution({
      goalId: contribGoalId,
      amountCents: decimalReaisToCents(parsed),
      date: referenceDateIso,
    });
    setContribGoalId(null);
    await loadData();
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        module="finance"
        title="Metas"
        subtitle="Progresso e projeções"
        isGlobeActive={true}
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: 130 }]}>
        <TouchableOpacity
          testID="goals-add-btn"
          accessibilityRole="button"
          onPress={openCreateForm}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <MaterialIcons name="add" size={18} color="#1A0E08" />
          <Text style={styles.addBtnText}>Nova meta</Text>
        </TouchableOpacity>

        {!loading && items.length === 0 ? (
          <FinListCard themeMode={themeMode}>
            <Text style={[styles.emptyText, { color: c.muted }]}>
              Nenhuma meta cadastrada ainda. Crie sua primeira meta financeira.
            </Text>
          </FinListCard>
        ) : null}

        {items.map(({ goal, evaluation }) => (
          <FinListCard key={goal.id} themeMode={themeMode} style={{ marginTop: 12 }}>
            <View style={styles.cardHeader}>
              <View style={styles.titleWrap}>
                <Text style={[styles.goalName, { color: c.text }]}>{goal.name}</Text>
                <Text style={[styles.sourceText, { color: c.muted }]}>
                  {evaluation.sourceSummary}
                </Text>
              </View>
              <Text style={[styles.pctText, { color: goal.color || colors.primary }]}>
                {Math.round(evaluation.progressPercent)}%
              </Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <DotTrack
                testID={`goal-dot-track-${goal.id}`}
                percentage={evaluation.progressPercent}
                color={goal.color || colors.primary}
                trackColor={isLight ? '#E5E7EB' : '#2A2D30'}
              />
            </View>

            <View style={styles.valuesRow}>
              <Text style={[styles.valueMain, { color: c.text }]}>
                {showCents(evaluation.currentCents)}
              </Text>
              <Text style={[styles.valueTarget, { color: c.muted }]}>
                de {showCents(evaluation.targetCents)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              {evaluation.reached ? (
                <View
                  style={[
                    styles.reachedBadge,
                    {
                      backgroundColor: isLight ? '#E8F5E9' : 'rgba(79, 154, 101, 0.18)',
                      opacity: reducedMotion ? 1 : 1,
                    },
                  ]}
                >
                  <MaterialIcons name="check-circle" size={14} color="#4F9A65" />
                  <Text style={styles.reachedText}>
                    {evaluation.projectedLabel ?? 'Meta atingida'}
                  </Text>
                </View>
              ) : evaluation.unreachable ? (
                <Text style={[styles.etaText, { color: c.muted }]}>
                  Inalcançável no ritmo atual
                </Text>
              ) : (
                <Text style={[styles.etaText, { color: c.muted }]}>
                  {evaluation.projectedLabel}
                  {evaluation.isReturnEstimated ? ' (estimativa)' : ''}
                </Text>
              )}

              {!evaluation.reached && evaluation.requiredMonthlyCents !== null ? (
                <Text style={[styles.reqText, { color: c.muted }]}>
                  Aporte necessário: {showCents(evaluation.requiredMonthlyCents)}/mês
                </Text>
              ) : null}
            </View>

            {(goal.source_type === 'manual' || goal.source_type === 'portfolio') &&
            !evaluation.reached ? (
              <TouchableOpacity
                testID={`goal-contribute-btn-${goal.id}`}
                accessibilityRole="button"
                onPress={() => handleContributePress({ goal, evaluation })}
                style={[
                  styles.contributeBtn,
                  { borderColor: isLight ? '#D1D5DB' : '#32363A' },
                ]}
              >
                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={[styles.contributeBtnText, { color: colors.primary }]}>
                  Aportar
                </Text>
              </TouchableOpacity>
            ) : null}
          </FinListCard>
        ))}
      </ScrollView>

      <AnimatedModalSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        themeMode={themeMode}
        testID="goal-form-sheet"
      >
        <Text style={[styles.sheetTitle, { color: c.text }]}>
          {editingGoalId ? 'Editar meta' : 'Nova meta'}
        </Text>

        <TextField
          label="Nome da meta"
          value={formName}
          onChangeText={setFormName}
          placeholder="Ex.: Reserva de emergência"
          testID="goal-form-name"
          themeMode={themeMode}
        />

        <LedgerInput
          label="Valor alvo"
          prefix="R$"
          value={formTarget}
          onChangeText={setFormTarget}
          placeholder="10.000,00"
          testID="goal-form-target"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <LedgerInput
          label="Aporte mensal planejado (opcional)"
          prefix="R$"
          value={formMonthly}
          onChangeText={setFormMonthly}
          placeholder="0,00"
          testID="goal-form-monthly"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <TextField
          label="Data alvo (YYYY-MM-DD, opcional)"
          value={formTargetDate}
          onChangeText={setFormTargetDate}
          placeholder="2028-12-31"
          testID="goal-form-target-date"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <Text style={[styles.label, { color: c.muted, marginTop: 14 }]}>ORIGEM DO PROGRESSO</Text>
        <View style={styles.chipRow}>
          {SOURCE_OPTIONS.map((opt) => {
            const active = formSourceType === opt.type;
            return (
              <TouchableOpacity
                key={opt.type}
                testID={`goal-form-source-${opt.type}`}
                accessibilityRole="button"
                onPress={() => setFormSourceType(opt.type)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active
                      ? colors.primary
                      : isLight
                      ? '#F3F4F6'
                      : '#25282C',
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: typography.fontFamily,
                    fontSize: 12,
                    fontWeight: '600',
                    color: active ? '#1A0E08' : c.text,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {formSourceType === 'portfolio' && portfoliosList.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.label, { color: c.muted }]}>CARTEIRA & FATIA (%)</Text>
            <View style={styles.chipRow}>
              {portfoliosList.map((p) => {
                const active = (formRefId || portfoliosList[0].id) === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setFormRefId(p.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active
                          ? colors.primary
                          : isLight
                          ? '#F3F4F6'
                          : '#25282C',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 12, color: active ? '#1A0E08' : c.text }}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextField
              label="Fatia (%)"
              value={formSharePercent}
              onChangeText={setFormSharePercent}
              placeholder="100"
              testID="goal-form-share-percent"
              themeMode={themeMode}
              style={{ marginTop: 8 }}
            />
          </View>
        ) : null}

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <TouchableOpacity
          testID="goal-form-save"
          accessibilityRole="button"
          onPress={handleSaveGoal}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.saveBtnText}>Salvar meta</Text>
        </TouchableOpacity>
      </AnimatedModalSheet>

      <AnimatedModalSheet
        visible={contribGoalId !== null}
        onClose={() => setContribGoalId(null)}
        themeMode={themeMode}
        testID="goal-contrib-sheet"
      >
        <Text style={[styles.sheetTitle, { color: c.text }]}>Lançar aporte</Text>
        <LedgerInput
          label="Valor do aporte"
          prefix="R$"
          value={contribAmount}
          onChangeText={setContribAmount}
          placeholder="500,00"
          testID="goal-contrib-input"
          themeMode={themeMode}
        />
        <TouchableOpacity
          testID="goal-contrib-save"
          accessibilityRole="button"
          onPress={handleSaveContribution}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.saveBtnText}>Confirmar aporte</Text>
        </TouchableOpacity>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: bento.tileRadius,
    paddingVertical: 14,
  },
  addBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0E08',
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    padding: 16,
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  titleWrap: { flex: 1, marginRight: 8 },
  goalName: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  sourceText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 2,
  },
  pctText: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
  },
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  valueMain: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  valueTarget: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  metaRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: 6,
    gap: 4,
  },
  reachedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  reachedText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: '#4F9A65',
  },
  etaText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  reqText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
  contributeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  contributeBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  sheetTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#D96628',
    marginTop: 10,
  },
  saveBtn: {
    borderRadius: bento.tileRadius,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  saveBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0E08',
  },
});
