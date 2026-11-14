import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
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
import { borders, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  sharedStyles,
} from './finTheme';

export const FREQUENCY_LABELS: Record<FinFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

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
      <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
        {editingRecurrence
          ? 'Editar recorrência'
          : defaultIsSubscription
          ? 'Nova assinatura'
          : 'Nova recorrência'}
      </Text>

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
        <TouchableOpacity
          accessibilityRole="button"
          onPress={onClose}
          style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
        >
          <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void handleSave()}
          style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
        >
          <Text style={sharedStyles.primaryBtnText}>Salvar</Text>
        </TouchableOpacity>
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
  const [recurrences, setRecurrences] = useState<FinRecurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRec, setEditingRec] = useState<FinRecurrence | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await finRepository.listRecurrences();
      setRecurrences(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recorrências.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleActive = async (rec: FinRecurrence) => {
    if (rec.active === 1) {
      await finService.pauseSubscription(rec.id);
    } else {
      await finService.resumeSubscription(rec.id);
    }
    await loadData();
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Recorrências"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        <View style={styles.toolbarRow}>
          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>
            Receitas e despesas fixas
          </Text>
          <TouchableOpacity
            testID="recurrences-add-btn"
            accessibilityRole="button"
            onPress={() => {
              setEditingRec(null);
              setIsFormOpen(true);
            }}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Nova recorrência</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : recurrences.length === 0 ? (
          <FinEmptyState
            testID="recurrences-empty-state"
            icon="repeat"
            title="Nenhuma recorrência cadastrada"
            subtitle="Cadastre aluguel, salário, internet e outras contas fixas para geração automática por janela."
            themeMode={themeMode}
          />
        ) : (
          recurrences.map((rec) => (
            <View
              key={rec.id}
              testID={`recurrence-row-${rec.id}`}
              style={[sharedStyles.rowCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.rowHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: c.text }]}>{rec.description}</Text>
                  <Text style={[styles.rowMeta, { color: c.muted }]}>
                    {FREQUENCY_LABELS[(rec.frequency as FinFrequency) || 'monthly'] ?? 'Mensal'} • Dia{' '}
                    {rec.day_of_month} • Início {rec.start_date}
                    {rec.end_date ? ` • Fim ${rec.end_date}` : ''}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, { color: rec.kind === 'income' ? c.income : c.text }]}>
                  {formatCentsBRL(rec.amount_cents, isPrivacyMode)}
                </Text>
              </View>

              <View style={styles.rowFooter}>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: rec.active === 1 ? 'rgba(42,144,76,0.16)' : c.surfaceContainer },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: rec.active === 1 ? c.income : c.muted },
                    ]}
                  >
                    {rec.active === 1 ? 'Ativa' : 'Pausada'}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => void handleToggleActive(rec)}
                    style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                  >
                    <Text style={[styles.chipText, { color: c.text }]}>
                      {rec.active === 1 ? 'Pausar' : 'Retomar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => {
                      setEditingRec(rec);
                      setIsFormOpen(true);
                    }}
                    style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                  >
                    <MaterialIcons name="edit" size={18} color={c.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

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
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  rowTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
    marginTop: 2,
  },
  rowAmount: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 15,
    fontWeight: '700',
  },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: borders.radiusPill,
  },
  statusText: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  chipText: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 12,
    fontWeight: '600',
  },
});
