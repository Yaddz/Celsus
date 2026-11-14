import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  formatCentsBRL,
  getMonthDateRange,
  getTodayIsoLocal,
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
  const [startDate, setStartDate] = useState(getTodayIsoLocal());
  const [endDate, setEndDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isSubscription, setIsSubscription] = useState(defaultIsSubscription);
  const [formError, setFormError] = useState<string | null>(null);

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
      setStartDate(editingRecurrence?.start_date ?? getTodayIsoLocal());
      setEndDate(editingRecurrence?.end_date ?? '');
      setAccountId(editingRecurrence?.account_id ?? accs[0]?.id ?? '');
      const matchingCat =
        cats.find((cat) => cat.id === editingRecurrence?.category_id) ??
        cats.find((cat) => cat.kind === initKind) ??
        cats[0];
      setCategoryId(matchingCat?.id ?? '');
      setIsSubscription(
        editingRecurrence ? editingRecurrence.is_subscription === 1 : defaultIsSubscription
      );
      setFormError(null);
    };
    void load();
  }, [visible, editingRecurrence, defaultIsSubscription]);

  const handleSave = async () => {
    const amountCents = parseBRLToCents(amountText);
    if (amountCents <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    const day = Math.min(31, Math.max(1, Number.parseInt(dayText || '1', 10) || 1));
    const resolvedAccountId = accountId || accounts[0]?.id || 'default-account';
    const resolvedCategoryId =
      categoryId || categories.find((cat) => cat.kind === kind)?.id || categories[0]?.id || 'cat-outros-despesa';

    if (editingRecurrence) {
      await finRepository.updateRecurrence(editingRecurrence.id, {
        kind,
        amount_cents: amountCents,
        description: description.trim() || 'Recorrência',
        account_id: resolvedAccountId,
        category_id: resolvedCategoryId,
        frequency,
        day_of_month: day,
        start_date: startDate.trim() || getTodayIsoLocal(),
        end_date: endDate.trim() || null,
        is_subscription: isSubscription ? 1 : 0,
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
        start_date: startDate.trim() || getTodayIsoLocal(),
        end_date: endDate.trim() || null,
        is_subscription: isSubscription ? 1 : 0,
        active: 1,
        generated_until: null,
      });
    }

    const baseMonth = (startDate.trim() || getTodayIsoLocal()).slice(0, 7);
    const windowStart = getMonthDateRange(baseMonth).start;
    const windowEnd = getMonthDateRange(addMonthsYearMonth(baseMonth, 2)).end;
    await finService.generateRecurrenceWindow(windowStart, windowEnd);

    onSaved();
    onClose();
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
          label="Valor (R$)"
          value={amountText}
          onChangeText={(txt) => {
            setAmountText(txt);
            setFormError(null);
          }}
          error={formError}
          themeMode={themeMode}
        />

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
          label="Início (AAAA-MM-DD)"
          value={startDate}
          onChangeText={setStartDate}
          themeMode={themeMode}
        />

        <TextField
          label="Fim opcional (AAAA-MM-DD)"
          value={endDate}
          onChangeText={setEndDate}
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
          accessibilityRole="button"
          onPress={() => void handleSave()}
          style={[sharedStyles.primaryBtn, { backgroundColor: c.primary, paddingHorizontal: 28 }]}
        >
          <Text style={sharedStyles.primaryBtnText}>Salvar</Text>
        </JellyPressable>
      </View>
    </AnimatedModalSheet>
  );
};

export interface RecurrencesScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const RecurrencesScreen: React.FC<RecurrencesScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'recurrences-screen',
}) => {
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
        .reduce((acc, r) => acc + r.amount_cents, 0),
    [activeList]
  );
  const fixedIncomeCents = useMemo(
    () =>
      activeList
        .filter((r) => r.kind === 'income')
        .reduce((acc, r) => acc + r.amount_cents, 0),
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

  const renderRecurrenceRow = (rec: FinRecurrence, index: number, total: number) => {
    const cat = categoryById.get(rec.category_id);
    const visual = resolveCategoryVisual(cat);
    const freqLabel = FREQUENCY_LABELS[(rec.frequency as FinFrequency) || 'monthly'] ?? 'Mensal';
    const endLabel = rec.end_date ? ` • até ${formatMonthYearShort(rec.end_date)}` : '';
    const subtitle = `${freqLabel} • dia ${rec.day_of_month}${endLabel}`;
    const kind: FinKind = rec.kind === 'income' ? 'income' : 'expense';

    return (
      <FinListRow
        key={rec.id}
        testID={`recurrence-row-${rec.id}`}
        icon={visual.icon}
        avatarColor={visual.color}
        iconColor={visual.iconColor}
        title={rec.description}
        subtitle={subtitle}
        amountText={formatSignedCentsBRL(rec.amount_cents, kind, isPrivacyMode)}
        amountColor={kind === 'income' ? c.income : c.expense}
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
        title="Recorrências"
        subtitle="Lançamentos que se repetem"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
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
                <Text style={[styles.summaryValue, { color: c.expense }]}>
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
                <Text style={[styles.summaryValue, { color: c.income }]}>
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
              <View style={{ gap: 16 }}>
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
                  <FinListCard
                    testID="recurrences-ended-list"
                    title={`ENCERRADAS · ${endedList.length}`}
                    cardStyle={{ opacity: 0.7 }}
                    themeMode={themeMode}
                  >
                    {endedList.map((rec, idx) => renderRecurrenceRow(rec, idx, endedList.length))}
                  </FinListCard>
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
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  miniBtn: {
    height: 32,
    paddingHorizontal: 12,
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
});
