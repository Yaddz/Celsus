import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoSheetHeader,
  FinListCard,
  FinListRow,
  formatTxDate,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinCategory, FinEntry } from '../../db/schema';
import {
  classifyEntryDueStatus,
  formatYearMonthPtBr,
  getTodayIsoLocal,
  parseBRLToCents,
  type FinKind,
  type InstallmentScope,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore, useFinStore } from '../../stores/finStore';
import { bento, borders, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { EntryFormSheet } from './EntryFormSheet';
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

export interface EntriesListScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

type ScopePromptState =
  | { action: 'delete'; entry: FinEntry }
  | { action: 'edit'; entry: FinEntry };

function formatDayMonth(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  return m ? `${m[3]}/${m[2]}` : isoDate;
}

export const EntriesListScreen: React.FC<EntriesListScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'entries-list-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const isLight = themeMode === 'light';
  const { selectedMonth, filters } = useFinStore();
  const effectiveToday = referenceDateIso ?? getTodayIsoLocal();

  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllPaid, setShowAllPaid] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinEntry | null>(null);
  const [editingScope, setEditingScope] = useState<InstallmentScope | undefined>(undefined);

  const [actionEntry, setActionEntry] = useState<FinEntry | null>(null);
  const [payingEntry, setPayingEntry] = useState<FinEntry | null>(null);
  const [payAmountText, setPayAmountText] = useState('');
  const [payDateText, setPayDateText] = useState(effectiveToday);

  const [scopePrompt, setScopePrompt] = useState<ScopePromptState | null>(null);
  const [pickerFilter, setPickerFilter] = useState<'category' | 'account' | null>(null);
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [monthEntries, accs, cats] = await Promise.all([
        finRepository.listEntriesByMonth(selectedMonth),
        finRepository.listAccounts(true),
        finRepository.listCategories(true),
      ]);
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setEntries(monthEntries);
      setAccounts(accs);
      setCategories(cats);
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Erro ao carregar lançamentos.');
    } finally {
      if (mountedRef.current && seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [selectedMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) map.set(acc.id, acc.name);
    return map;
  }, [accounts]);

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filters.kind !== 'all' && entry.kind !== filters.kind) return false;
      if (filters.status !== 'all' && entry.status !== filters.status) return false;
      if (filters.categoryId && entry.category_id !== filters.categoryId) return false;
      if (filters.accountId && entry.account_id !== filters.accountId) return false;
      return true;
    });
  }, [entries, filters]);

  const pendingCount = useMemo(
    () => entries.filter((e) => e.status === 'pending').length,
    [entries]
  );

  const grouped = useMemo(() => {
    const overdueList: FinEntry[] = [];
    const upcomingList: FinEntry[] = [];
    const paidList: FinEntry[] = [];

    for (const entry of filteredEntries) {
      if (entry.status === 'paid') {
        paidList.push(entry);
        continue;
      }
      const dueStatus = classifyEntryDueStatus(entry, effectiveToday, 7);
      if (dueStatus === 'overdue') {
        overdueList.push(entry);
      } else {
        upcomingList.push(entry);
      }
    }
    return { overdueList, upcomingList, paidList };
  }, [filteredEntries, effectiveToday]);

  const handleOpenPayModal = (entry: FinEntry) => {
    setPayingEntry(entry);
    setPayAmountText((entry.amount_cents / 100).toFixed(2).replace('.', ','));
    setPayDateText(effectiveToday);
  };

  const handleConfirmPay = async () => {
    if (!payingEntry) return;
    const realCents = parseBRLToCents(payAmountText) || payingEntry.amount_cents;
    await finService.markEntryAsPaid(payingEntry.id, {
      paidDate: payDateText.trim() || effectiveToday,
      paidAmountCents: realCents,
    });
    setPayingEntry(null);
    await loadData();
  };

  const handleReopenPending = async (entryId: string) => {
    await finService.markEntryAsPending(entryId);
    await loadData();
  };

  const handleDeletePress = async (entry: FinEntry) => {
    if (entry.installment_group_id) {
      setScopePrompt({ action: 'delete', entry });
      return;
    }
    await finRepository.deleteEntry(entry.id);
    await loadData();
  };

  const handleEditPress = (entry: FinEntry) => {
    if (entry.installment_group_id) {
      setScopePrompt({ action: 'edit', entry });
      return;
    }
    setEditingEntry(entry);
    setEditingScope(undefined);
    setIsFormOpen(true);
  };

  const handleSelectScope = async (scope: InstallmentScope) => {
    if (!scopePrompt) return;
    const { action, entry } = scopePrompt;
    setScopePrompt(null);

    if (action === 'delete') {
      await finService.deleteInstallmentEntries(entry.id, scope);
      await loadData();
      return;
    }
    setEditingEntry(entry);
    setEditingScope(scope);
    setIsFormOpen(true);
  };

  const monthLabel = formatYearMonthPtBr(selectedMonth);
  const selectedCategoryName = filters.categoryId ? categoryById.get(filters.categoryId)?.name : null;
  const selectedAccountName = filters.accountId ? accountNameById.get(filters.accountId) : null;

  const renderEntryRow = (entry: FinEntry, index: number, total: number) => {
    const dueStatus = classifyEntryDueStatus(entry, effectiveToday, 7);
    const category = categoryById.get(entry.category_id);
    const visual = resolveCategoryVisual(category);
    const accountName = accountNameById.get(entry.account_id) ?? 'Conta';
    const displayCents =
      entry.status === 'paid'
        ? entry.paid_amount_cents ?? entry.amount_cents
        : entry.amount_cents;
    const isInstallment =
      Boolean(entry.installment_total && entry.installment_total > 1 && entry.installment_number);

    let subtitle = `${formatTxDate(entry.due_date)} • ${category?.name ?? accountName}`;
    if (dueStatus === 'overdue') {
      subtitle = `Venceu ${formatDayMonth(entry.due_date)} • ${category?.name ?? accountName}`;
    } else if (isInstallment) {
      subtitle = `${formatTxDate(entry.due_date)} • Parcela ${entry.installment_number}/${entry.installment_total}`;
    } else if (entry.status === 'paid') {
      subtitle = `${formatTxDate(entry.paid_date ?? entry.due_date)} • ${
        entry.kind === 'income' ? 'Recebido' : 'Pago'
      }`;
    } else if (entry.recurrence_id) {
      subtitle = `${formatTxDate(entry.due_date)} • Recorrente`;
    }

    const kind: FinKind = entry.kind === 'income' ? 'income' : 'expense';
    const amountColor = kind === 'income' ? c.income : c.expense;

    return (
      <FinListRow
        key={entry.id}
        testID={`entry-row-${entry.id}`}
        subtitleTestID={`entry-subtitle-${entry.id}`}
        icon={visual.icon}
        avatarColor={visual.color}
        iconColor={visual.iconColor}
        title={entry.description || category?.name || 'Lançamento'}
        subtitle={subtitle}
        subtitleColor={dueStatus === 'overdue' ? '#D96628' : c.muted}
        amountText={formatSignedCentsBRL(displayCents, kind, isPrivacyMode)}
        amountColor={amountColor}
        isLast={index === total - 1}
        themeMode={themeMode}
        onPress={() => setActionEntry(entry)}
      />
    );
  };

  const visiblePaid = showAllPaid ? grouped.paidList : grouped.paidList.slice(0, 5);

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Lançamentos"
        subtitle={monthLabel}
        subtitleTestID="entries-month-label"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        rightAccessory={
          <View style={styles.headerMonthArrows}>
            <TouchableOpacity
              testID="entries-month-prev"
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              onPress={() => finStore.prevMonth()}
              style={[
                styles.headerCircleBtn,
                {
                  backgroundColor: isLight ? '#FFFFFF' : '#191B1D',
                  borderColor: isLight ? '#EAE4D7' : '#26292C',
                },
              ]}
            >
              <MaterialIcons name="chevron-left" size={20} color={isLight ? '#111315' : '#D5CAA8'} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="entries-month-next"
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              onPress={() => finStore.nextMonth()}
              style={[
                styles.headerCircleBtn,
                {
                  backgroundColor: isLight ? '#FFFFFF' : '#191B1D',
                  borderColor: isLight ? '#EAE4D7' : '#26292C',
                },
              ]}
            >
              <MaterialIcons name="chevron-right" size={20} color={isLight ? '#111315' : '#D5CAA8'} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        <SegmentedControl<'all' | FinKind>
          testID="entries-kind-segmented"
          value={filters.kind}
          onChange={(kind) => finStore.setFilters({ kind })}
          options={[
            { id: 'all', label: 'Todos', testID: 'entries-filter-kind-all' },
            { id: 'income', label: 'Receitas', testID: 'entries-filter-kind-income' },
            { id: 'expense', label: 'Despesas', testID: 'entries-filter-kind-expense' },
          ]}
          themeMode={themeMode}
        />

        {/* Chips de filtro */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          <TouchableOpacity
            testID="entries-filter-status-pending"
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() =>
              finStore.setFilters({ status: filters.status === 'pending' ? 'all' : 'pending' })
            }
            style={[
              sharedStyles.chip,
              { backgroundColor: filters.status === 'pending' ? '#2E4A44' : c.surface },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: filters.status === 'pending' ? '#E6DECA' : c.text },
              ]}
            >
              Pendentes · {pendingCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="entries-filter-status-paid"
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() =>
              finStore.setFilters({ status: filters.status === 'paid' ? 'all' : 'paid' })
            }
            style={[
              sharedStyles.chip,
              { backgroundColor: filters.status === 'paid' ? '#2E4A44' : c.surface },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: filters.status === 'paid' ? '#E6DECA' : c.text },
              ]}
            >
              Pagos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="entries-filter-category-chip"
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() => setPickerFilter(pickerFilter === 'category' ? null : 'category')}
            style={[
              sharedStyles.chip,
              { backgroundColor: filters.categoryId ? '#2E4A44' : c.surface },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: filters.categoryId ? '#E6DECA' : c.muted },
              ]}
            >
              {selectedCategoryName ? `${selectedCategoryName} ▾` : 'Categoria ▾'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="entries-filter-account-chip"
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            onPress={() => setPickerFilter(pickerFilter === 'account' ? null : 'account')}
            style={[
              sharedStyles.chip,
              { backgroundColor: filters.accountId ? '#2E4A44' : c.surface },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: filters.accountId ? '#E6DECA' : c.muted },
              ]}
            >
              {selectedAccountName ? `${selectedAccountName} ▾` : 'Conta ▾'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {pickerFilter === 'category' ? (
          <View style={sharedStyles.chipRow}>
            <TouchableOpacity
              onPress={() => {
                finStore.setFilters({ categoryId: null });
                setPickerFilter(null);
              }}
              style={[sharedStyles.chip, { backgroundColor: !filters.categoryId ? '#2E4A44' : c.surface }]}
            >
              <Text style={[styles.chipLabel, { color: !filters.categoryId ? '#E6DECA' : c.text }]}>
                Todas
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => {
                  finStore.setFilters({ categoryId: cat.id });
                  setPickerFilter(null);
                }}
                style={[
                  sharedStyles.chip,
                  { backgroundColor: filters.categoryId === cat.id ? '#2E4A44' : c.surface },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: filters.categoryId === cat.id ? '#E6DECA' : c.text },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {pickerFilter === 'account' ? (
          <View style={sharedStyles.chipRow}>
            <TouchableOpacity
              onPress={() => {
                finStore.setFilters({ accountId: null });
                setPickerFilter(null);
              }}
              style={[sharedStyles.chip, { backgroundColor: !filters.accountId ? '#2E4A44' : c.surface }]}
            >
              <Text style={[styles.chipLabel, { color: !filters.accountId ? '#E6DECA' : c.text }]}>
                Todas
              </Text>
            </TouchableOpacity>
            {accounts.map((acc) => (
              <TouchableOpacity
                key={acc.id}
                onPress={() => {
                  finStore.setFilters({ accountId: acc.id });
                  setPickerFilter(null);
                }}
                style={[
                  sharedStyles.chip,
                  { backgroundColor: filters.accountId === acc.id ? '#2E4A44' : c.surface },
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: filters.accountId === acc.id ? '#E6DECA' : c.text },
                  ]}
                >
                  {acc.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : filteredEntries.length === 0 ? (
          <FinEmptyState
            testID="entries-empty-state"
            icon="receipt-long"
            title="Nenhum lançamento neste mês"
            subtitle="Adicione uma receita, despesa ou parcelamento para acompanhar suas contas."
            themeMode={themeMode}
          />
        ) : (
          <View style={{ gap: bento.gap + 6 }}>
            {grouped.overdueList.length > 0 ? (
              <FinListCard
                testID="entries-section-overdue"
                title="EM ATRASO"
                themeMode={themeMode}
              >
                {grouped.overdueList.map((entry, idx) =>
                  renderEntryRow(entry, idx, grouped.overdueList.length)
                )}
              </FinListCard>
            ) : null}

            {grouped.upcomingList.length > 0 ? (
              <FinListCard
                testID="entries-section-upcoming"
                title="PRÓXIMOS DIAS"
                themeMode={themeMode}
              >
                {grouped.upcomingList.map((entry, idx) =>
                  renderEntryRow(entry, idx, grouped.upcomingList.length)
                )}
              </FinListCard>
            ) : null}

            {grouped.paidList.length > 0 ? (
              <FinListCard
                testID="entries-section-paid"
                title="LIQUIDADOS"
                actionLabel={grouped.paidList.length > 5 && !showAllPaid ? 'Ver tudo ›' : undefined}
                onActionPress={() => setShowAllPaid(true)}
                themeMode={themeMode}
              >
                {visiblePaid.map((entry, idx) =>
                  renderEntryRow(entry, idx, visiblePaid.length)
                )}
              </FinListCard>
            ) : null}
          </View>
        )}
      </ScrollView>

      <FinFloatingAddButton
        testID="entries-add-btn"
        accessibilityLabel="Novo lançamento"
        onPress={() => {
          setEditingEntry(null);
          setEditingScope(undefined);
          setIsFormOpen(true);
        }}
      />

      <EntryFormSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => void loadData()}
        editingEntry={editingEntry}
        installmentScope={editingScope}
        defaultDueDate={effectiveToday}
        themeMode={themeMode}
      />

      {/* Folha de ações da linha: Pagar/Receber (ou Reabrir), Editar e Excluir */}
      <AnimatedModalSheet
        visible={Boolean(actionEntry)}
        onClose={() => setActionEntry(null)}
        themeMode={themeMode}
        testID="entry-actions-sheet"
      >
        <BentoSheetHeader
          title={actionEntry?.description || 'Lançamento'}
          subtitle={actionEntry ? formatTxDate(actionEntry.due_date) : undefined}
          onClose={() => setActionEntry(null)}
          themeMode={themeMode}
        />
        {actionEntry ? (
          <View style={styles.scopeList}>
            {actionEntry.status === 'pending' ? (
              <JellyPressable
                testID={`entry-action-pay-${actionEntry.id}`}
                accessibilityRole="button"
                onPress={() => {
                  const target = actionEntry;
                  setActionEntry(null);
                  handleOpenPayModal(target);
                }}
                style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
              >
                <Text style={[sharedStyles.secondaryBtnText, { color: c.income }]}>
                  {actionEntry.kind === 'income' ? 'Receber' : 'Pagar'}
                </Text>
              </JellyPressable>
            ) : (
              <JellyPressable
                testID={`entry-action-reopen-${actionEntry.id}`}
                accessibilityRole="button"
                onPress={() => {
                  const target = actionEntry;
                  setActionEntry(null);
                  void handleReopenPending(target.id);
                }}
                style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
              >
                <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>Reabrir</Text>
              </JellyPressable>
            )}
            <JellyPressable
              testID={`entry-action-edit-${actionEntry.id}`}
              accessibilityRole="button"
              onPress={() => {
                const target = actionEntry;
                setActionEntry(null);
                handleEditPress(target);
              }}
              style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
            >
              <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>Editar</Text>
            </JellyPressable>
            <JellyPressable
              testID={`entry-action-delete-${actionEntry.id}`}
              accessibilityRole="button"
              onPress={() => {
                const target = actionEntry;
                setActionEntry(null);
                void handleDeletePress(target);
              }}
              style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
            >
              <Text style={[sharedStyles.secondaryBtnText, { color: c.overdue }]}>Excluir</Text>
            </JellyPressable>
          </View>
        ) : null}
      </AnimatedModalSheet>

      {/* Modal: Baixa (Pagar / Receber com data e valor reais) */}
      <AnimatedModalSheet
        visible={Boolean(payingEntry)}
        onClose={() => setPayingEntry(null)}
        themeMode={themeMode}
        testID="pay-entry-modal"
      >
        <BentoSheetHeader
          title={payingEntry?.kind === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
          onClose={() => setPayingEntry(null)}
          themeMode={themeMode}
        />
        <View style={{ gap: space.md }}>
          <LedgerInput
            testID="pay-entry-amount-input"
            label="Valor pago (R$)"
            value={payAmountText}
            onChangeText={setPayAmountText}
            themeMode={themeMode}
          />
          <TextField
            testID="pay-entry-date-input"
            label="Data efetiva (AAAA-MM-DD)"
            value={payDateText}
            onChangeText={setPayDateText}
            themeMode={themeMode}
          />
        </View>
        <View style={sharedStyles.modalActions}>
          <JellyPressable
            accessibilityRole="button"
            onPress={() => setPayingEntry(null)}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
          </JellyPressable>
          <JellyPressable
            testID="pay-entry-confirm-btn"
            accessibilityRole="button"
            onPress={() => void handleConfirmPay()}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary, paddingHorizontal: 28 }]}
          >
            <Text style={sharedStyles.primaryBtnText}>Confirmar</Text>
          </JellyPressable>
        </View>
      </AnimatedModalSheet>

      {/* Diálogo: Escopo de edição/exclusão de parcelas */}
      <AnimatedModalSheet
        visible={Boolean(scopePrompt)}
        onClose={() => setScopePrompt(null)}
        themeMode={themeMode}
        testID="installment-scope-dialog"
      >
        <BentoSheetHeader
          title={scopePrompt?.action === 'delete' ? 'Excluir parcela' : 'Editar parcela'}
          subtitle="Aplicar alteração em quais parcelas desta compra?"
          onClose={() => setScopePrompt(null)}
          themeMode={themeMode}
        />
        <View style={styles.scopeList}>
          <JellyPressable
            testID="installment-scope-only_this"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('only_this')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>
              Só esta parcela
            </Text>
          </JellyPressable>
          <JellyPressable
            testID="installment-scope-this_and_next"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('this_and_next')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>
              Esta e as próximas
            </Text>
          </JellyPressable>
          <JellyPressable
            testID="installment-scope-all"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('all')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.overdue }]}>
              Todas as parcelas
            </Text>
          </JellyPressable>
        </View>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  headerMonthArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  chipLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  rowActionsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borders.radiusPill,
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniChipText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  scopeList: {
    gap: space.sm,
  },
});
