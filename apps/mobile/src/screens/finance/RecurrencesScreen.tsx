import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoRow,
  BentoSheetHeader,
  BentoTile,
  FinListCard,
  FinListRow,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinCategory, FinRecurrence } from '../../db/schema';
import {
  addMonthsYearMonth,
  brToIso,
  formatCentsBRL,
  getMonthDateRange,
  getTodayIsoLocal,
  isoToBr,
  parseBRLToCents,
  type FinFrequency,
  type FinKind,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  FinEmptyState,
  FinErrorView,
  FinFloatingAddButton,
  FinLoadingView,
  formatSignedCentsBRL,
  getFinUiColors,
  resolveCategoryVisual,
  sharedStyles,
} from './finTheme';

export const FREQUENCY_LABELS: Record<FinFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

function formatMonthYearShort(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate || '');
  return m ? `${m[2]}/${m[1]}` : isoDate;
}

function monthlyNormalizedCents(rec: FinRecurrence): number {
  if (rec.frequency === 'weekly') return Math.round((rec.amount_cents * 52) / 12);
  if (rec.frequency === 'yearly') return Math.round(rec.amount_cents / 12);
  return rec.amount_cents;
}

export interface RecurrenceFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingRecurrence?: FinRecurrence | null;
  defaultIsSubscription?: boolean;
  themeMode?: ThemeMode;
  testID?: string;
}

export const RecurrenceFormSheet: React.FC<RecurrenceFormSheetProps> = ({
  visible,
  onClose,
  onSaved,
  editingRecurrence = null,
  defaultIsSubscription = false,
  themeMode = 'dark',
  testID = 'recurrence-form-sheet',
}) => {
  const c = getFinUiColors(themeMode);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [kind, setKind] = useState<FinKind>('expense');
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [frequency, setFrequency] = useState<FinFrequency>('monthly');
  const [dayText, setDayText] = useState('10');
  const [startDate, setStartDate] = useState(isoToBr(getTodayIsoLocal()));
  const [endDate, setEndDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isSubscription, setIsSubscription] = useState(defaultIsSubscription);
  const [variableAmount, setVariableAmount] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      const [accs, cats] = await Promise.all([
        finRepository.listAccounts(false),
        finRepository.listCategories(false),
      ]);
      setAccounts(accs);
      setCategories(cats);

      const initKind: FinKind = editingRecurrence?.kind === 'income' ? 'income' : 'expense';
      setKind(initKind);
      setDescription(editingRecurrence?.description ?? '');
      setAmountText(
        editingRecurrence ? (editingRecurrence.amount_cents / 100).toFixed(2).replace('.', ',') : ''
      );
      setFrequency((editingRecurrence?.frequency as FinFrequency) || 'monthly');
      setDayText(String(editingRecurrence?.day_of_month ?? 10));
      setStartDate(isoToBr(editingRecurrence?.start_date ?? getTodayIsoLocal()));
      setEndDate(editingRecurrence?.end_date ? isoToBr(editingRecurrence.end_date) : '');
      setAccountId(editingRecurrence?.account_id ?? accs[0]?.id ?? '');
      const matchingCat =
        cats.find((cat) => cat.id === editingRecurrence?.category_id) ??
        cats.find((cat) => cat.kind === initKind) ??
        cats[0];
      setCategoryId(matchingCat?.id ?? '');
      setIsSubscription(
        editingRecurrence ? editingRecurrence.is_subscription === 1 : defaultIsSubscription
      );
      setVariableAmount(editingRecurrence ? editingRecurrence.variable_amount === 1 : false);
      setFormError(null);
      setSaving(false);
    };
    void load();
  }, [visible, editingRecurrence, defaultIsSubscription]);

  const handleSave = async () => {
    if (saving) return;
    const amountCents = parseBRLToCents(amountText);
    if (amountCents <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    const resolvedStart = startDate.trim() ? brToIso(startDate) : getTodayIsoLocal();
    if (!resolvedStart) {
      setFormError('Informe uma data válida (dd/mm/aaaa).');
      return;
    }
    let resolvedEnd: string | null = null;
    if (endDate.trim()) {
      resolvedEnd = brToIso(endDate);
      if (!resolvedEnd) {
        setFormError('Informe uma data final válida (dd/mm/aaaa).');
        return;
      }
      if (resolvedEnd < resolvedStart) {
        setFormError('A data de fim deve ser posterior ou igual ao início.');
        return;
      }
    }
    const resolvedAccountId = accountId || accounts[0]?.id || '';
    if (!resolvedAccountId || !accounts.some((a) => a.id === resolvedAccountId)) {
      setFormError('Cadastre uma conta antes de lançar.');
      return;
    }
    const resolvedCategoryId =
      categoryId || categories.find((cat) => cat.kind === kind)?.id || categories[0]?.id || '';
    if (!resolvedCategoryId || !categories.some((cat) => cat.id === resolvedCategoryId)) {
      setFormError('Selecione uma categoria válida.');
      return;
    }

    const day = Math.min(31, Math.max(1, Number.parseInt(dayText || '1', 10) || 1));

    setSaving(true);
    setFormError(null);
    try {
      if (editingRecurrence) {
        await finService.updateRecurrence(editingRecurrence.id, {
          kind,
          amount_cents: amountCents,
          description: description.trim() || 'Recorrência',
          account_id: resolvedAccountId,
          category_id: resolvedCategoryId,
          frequency,
          day_of_month: day,
          start_date: resolvedStart,
          end_date: resolvedEnd,
          is_subscription: isSubscription ? 1 : 0,
          variable_amount: variableAmount ? 1 : 0,
        });
      } else {
        await finRepository.createRecurrence({
          kind,
          amount_cents: amountCents,
          description: description.trim() || (isSubscription ? 'Assinatura' : 'Recorrência'),
          account_id: resolvedAccountId,
          category_id: resolvedCategoryId,
          frequency,
          day_of_month: day,
          start_date: resolvedStart,
          end_date: resolvedEnd,
          is_subscription: isSubscription ? 1 : 0,
          variable_amount: variableAmount ? 1 : 0,
          active: 1,
          generated_until: null,
        });
      }

      const baseMonth = resolvedStart.slice(0, 7);
      const windowStart = getMonthDateRange(baseMonth).start;
      const windowEnd = getMonthDateRange(addMonthsYearMonth(baseMonth, 2)).end;
      await finService.generateRecurrenceWindow(windowStart, windowEnd);

      onSaved();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar recorrência.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <AnimatedModalSheet visible={visible} onClose={onClose} themeMode={themeMode} testID={testID}>
      <BentoSheetHeader
        title={
          editingRecurrence
            ? 'Editar recorrência'
            : defaultIsSubscription
            ? 'Nova assinatura'
            : 'Nova recorrência'
        }
        onClose={onClose}
        themeMode={themeMode}
      />

      <View style={{ gap: space.md }}>
        <SegmentedControl<FinKind>
          value={kind}
          onChange={setKind}
          options={[
            { id: 'expense', label: 'Despesa' },
            { id: 'income', label: 'Receita' },
          ]}
          themeMode={themeMode}
        />

        <TextField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder={isSubscription ? 'Ex.: Streaming, Academia' : 'Ex.: Aluguel, Salário'}
          themeMode={themeMode}
        />

        <LedgerInput
          testID="recurrence-form-amount-input"
          label={variableAmount ? 'Estimativa (R$)' : 'Valor (R$)'}
          value={amountText}
          onChangeText={(txt) => {
            setAmountText(txt);
            setFormError(null);
          }}
          error={formError}
          themeMode={themeMode}
        />

        <TouchableOpacity
          testID="recurrence-form-variable-toggle"
          accessibilityRole="switch"
          accessibilityState={{ checked: variableAmount }}
          onPress={() => setVariableAmount((prev) => !prev)}
          style={[
            styles.variableToggle,
            {
              backgroundColor: variableAmount ? c.surfaceElevated : c.surfaceContainer,
              borderColor: variableAmount ? c.warning : c.border,
            },
          ]}
        >
          <Text style={[styles.variableToggleLabel, { color: c.text }]}>
            Valor variável (estimativa)
          </Text>
          <Text style={[styles.variableToggleState, { color: variableAmount ? c.warning : c.muted }]}>
            {variableAmount ? 'Sim' : 'Não'}
          </Text>
        </TouchableOpacity>

        <SegmentedControl<FinFrequency>
          value={frequency}
          onChange={setFrequency}
          options={[
            { id: 'monthly', label: 'Mensal' },
            { id: 'weekly', label: 'Semanal' },
            { id: 'yearly', label: 'Anual' },
          ]}
          themeMode={themeMode}
        />

        <TextField
          label="Dia fixo"
          value={dayText}
          onChangeText={setDayText}
          keyboardType="numeric"
          themeMode={themeMode}
        />

        <TextField
          testID="recurrence-form-start-date"
          label="Início (dd/mm/aaaa)"
          value={startDate}
          onChangeText={(txt) => {
            setStartDate(txt);
            setFormError(null);
          }}
          themeMode={themeMode}
        />

        <TextField
          testID="recurrence-form-end-date"
          label="Fim opcional (dd/mm/aaaa)"
          value={endDate}
          onChangeText={(txt) => {
            setEndDate(txt);
            setFormError(null);
          }}
          placeholder="Opcional"
          themeMode={themeMode}
        />
      </View>

      <View style={sharedStyles.modalActions}>
        <JellyPressable
          accessibilityRole="button"
          onPress={onClose}
          style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
        >
          <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
        </JellyPressable>
        <JellyPressable
          testID="recurrence-form-save-btn"
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void handleSave()}
          style={[
            sharedStyles.primaryBtn,
            { backgroundColor: c.primary, paddingHorizontal: space.xxl, opacity: saving ? 0.6 : 1 },
          ]}
        >
          <Text style={sharedStyles.primaryBtnText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
        </JellyPressable>
      </View>
    </AnimatedModalSheet>
  );
};

export interface RecurrencesScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const RecurrencesScreen: React.FC<RecurrencesScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'recurrences-screen',
}) => {
  const insets = useSafeAreaInsets();
  const c = getFinUiColors(themeMode);
  const tileVariant = themeMode === 'light' ? 'light' : 'dark';
  const [recurrences, setRecurrences] = useState<FinRecurrence[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<FinRecurrence | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        finRepository.listRecurrences(),
        finRepository.listCategories(true),
      ]);
      setRecurrences(list);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recorrências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const activeList = useMemo(
    () => recurrences.filter((r) => r.active === 1),
    [recurrences]
  );
  const endedList = useMemo(
    () => recurrences.filter((r) => r.active === 0),
    [recurrences]
  );

  const fixedExpenseCents = useMemo(
    () =>
      activeList
        .filter((r) => r.kind === 'expense')
        .reduce((acc, r) => acc + monthlyNormalizedCents(r), 0),
    [activeList]
  );
  const fixedIncomeCents = useMemo(
    () =>
      activeList
        .filter((r) => r.kind === 'income')
        .reduce((acc, r) => acc + monthlyNormalizedCents(r), 0),
    [activeList]
  );

  const handleToggleActive = async (rec: FinRecurrence) => {
    if (rec.active === 1) {
      await finService.pauseSubscription(rec.id);
    } else {
      await finService.resumeSubscription(rec.id);
    }
    await loadData();
  };

  const renderRecurrenceRow = (
    rec: FinRecurrence,
    index: number,
    total: number,
    isEnded = false
  ) => {
    const cat = categoryById.get(rec.category_id);
    const visual = resolveCategoryVisual(cat);
    const freqLabel = FREQUENCY_LABELS[(rec.frequency as FinFrequency) || 'monthly'] ?? 'Mensal';
    const isVariable = rec.variable_amount === 1;
    const endLabel = rec.end_date ? ` • até ${formatMonthYearShort(rec.end_date)}` : '';

    let subtitle = `${freqLabel} • dia ${rec.day_of_month}${endLabel}`;
    let subtitleColor = c.muted;
    if (isEnded) {
      subtitle = rec.end_date ? `Encerrada em ${isoToBr(rec.end_date)}` : 'Encerrada';
    } else if (isVariable) {
      subtitle = `${freqLabel} • dia ${rec.day_of_month} • valor variável`;
      subtitleColor = c.warning;
    }

    const kind: FinKind = rec.kind === 'income' ? 'income' : 'expense';
    const amountText = isPrivacyMode
      ? 'R$ ••••••'
      : isVariable
      ? `${kind === 'income' ? '+' : '-'}~${formatCentsBRL(rec.amount_cents, false)}`
      : formatSignedCentsBRL(rec.amount_cents, kind, false);

    return (
      <FinListRow
        key={rec.id}
        testID={`recurrence-row-${rec.id}`}
        subtitleTestID={`recurrence-subtitle-${rec.id}`}
        amountTestID={`recurrence-amount-${rec.id}`}
        icon={visual.icon}
        avatarColor={isEnded ? c.inactiveAvatarBg : visual.color}
        iconColor={isEnded ? c.avatarIconDark : visual.iconColor}
        title={rec.description}
        subtitle={subtitle}
        subtitleColor={subtitleColor}
        amountText={amountText}
        amountColor={isEnded ? c.muted : kind === 'income' ? c.income : c.expense}
        isLast={index === total - 1}
        themeMode={themeMode}
        onPress={() => {
          setEditingRec(rec);
          setIsFormOpen(true);
        }}
        bottomContent={
          <View style={styles.actionsRow}>
            <TouchableOpacity
              accessibilityRole="button"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              onPress={() => void handleToggleActive(rec)}
              style={[styles.miniBtn, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
            >
              <Text style={[styles.miniBtnText, { color: c.text }]}>
                {rec.active === 1 ? 'Pausar' : 'Retomar'}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    );
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        module="finance"
        title="Recorrências"
        subtitle="Lançamentos que se repetem"
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: dockContentPaddingBottom(insets.bottom, { withFab: true }) }]}>
        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : (
          <>
            <BentoRow>
              <BentoTile
                variant={tileVariant}
                title="FIXO · SAÍDAS"
                testID="recurrences-fixed-expense-tile"
              >
                <Text
                  testID="recurrences-monthly-expense"
                  style={[styles.summaryValue, { color: c.expense }]}
                >
                  {isPrivacyMode
                    ? 'R$ ••••••'
                    : formatCentsBRL(fixedExpenseCents, false)}
                </Text>
                <Text style={[styles.summarySub, { color: c.muted }]}>por mês</Text>
              </BentoTile>

              <BentoTile
                variant={tileVariant}
                title="FIXO · ENTRADAS"
                testID="recurrences-fixed-income-tile"
              >
                <Text
                  testID="recurrences-monthly-income"
                  style={[styles.summaryValue, { color: c.income }]}
                >
                  {isPrivacyMode
                    ? 'R$ ••••••'
                    : formatCentsBRL(fixedIncomeCents, false)}
                </Text>
                <Text style={[styles.summarySub, { color: c.muted }]}>por mês</Text>
              </BentoTile>
            </BentoRow>

            {recurrences.length === 0 ? (
              <FinEmptyState
                testID="recurrences-empty-state"
                icon="repeat"
                title="Nenhuma recorrência cadastrada"
                subtitle="Cadastre aluguel, salário, internet e outras contas fixas para geração automática por janela."
                themeMode={themeMode}
              />
            ) : (
              <View style={{ gap: space.lg }}>
                {activeList.length > 0 ? (
                  <FinListCard
                    testID="recurrences-active-list"
                    title={`ATIVAS · ${activeList.length}`}
                    themeMode={themeMode}
                  >
                    {activeList.map((rec, idx) => renderRecurrenceRow(rec, idx, activeList.length))}
                  </FinListCard>
                ) : null}

                {endedList.length > 0 ? (
                  <View testID="recurrences-section-ended" style={{ opacity: 0.7 }}>
                    <FinListCard
                      testID="recurrences-ended-list"
                      title={`ENCERRADAS · ${endedList.length}`}
                      cardStyle={{ opacity: 0.7 }}
                      themeMode={themeMode}
                    >
                      {endedList.map((rec, idx) => renderRecurrenceRow(rec, idx, endedList.length, true))}
                    </FinListCard>
                  </View>
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <FinFloatingAddButton
        testID="recurrences-add-btn"
        accessibilityLabel="Nova recorrência"
        onPress={() => {
          setEditingRec(null);
          setIsFormOpen(true);
        }}
      />

      <RecurrenceFormSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => void loadData()}
        editingRecurrence={editingRec}
        themeMode={themeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  summaryValue: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  summarySub: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: space.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  miniBtn: {
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  variableToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: 14,
    borderWidth: 1,
  },
  variableToggleLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  variableToggleState: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
});
