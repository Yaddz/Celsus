import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import type { FinAccount, FinCategory, FinEntry } from '../../db/schema';
import {
  classifyEntryDueStatus,
  formatCentsBRL,
  formatYearMonthPtBr,
  getTodayIsoLocal,
  parseBRLToCents,
  type FinEntryStatus,
  type FinKind,
  type InstallmentScope,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore, useFinStore } from '../../stores/finStore';
import { borders, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { EntryFormSheet } from './EntryFormSheet';
import {
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
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

export const EntriesListScreen: React.FC<EntriesListScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'entries-list-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const { selectedMonth, filters } = useFinStore();
  const effectiveToday = referenceDateIso ?? getTodayIsoLocal();

  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinEntry | null>(null);
  const [editingScope, setEditingScope] = useState<InstallmentScope | undefined>(undefined);

  const [payingEntry, setPayingEntry] = useState<FinEntry | null>(null);
  const [payAmountText, setPayAmountText] = useState('');
  const [payDateText, setPayDateText] = useState(effectiveToday);

  const [scopePrompt, setScopePrompt] = useState<ScopePromptState | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [monthEntries, accs, cats] = await Promise.all([
        finRepository.listEntriesByMonth(selectedMonth),
        finRepository.listAccounts(true),
        finRepository.listCategories(true),
      ]);
      setEntries(monthEntries);
      setAccounts(accs);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar lançamentos.');
    } finally {
      setLoading(false);
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

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Lançamentos"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        {/* Navegação entre meses */}
        <View style={[styles.monthBar, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity
            testID="entries-month-prev"
            accessibilityRole="button"
            onPress={() => finStore.prevMonth()}
            style={sharedStyles.iconBtn}
          >
            <MaterialIcons name="chevron-left" size={24} color={c.text} />
          </TouchableOpacity>
          <Text testID="entries-month-label" style={[styles.monthLabel, { color: c.text }]}>
            {monthLabel}
          </Text>
          <TouchableOpacity
            testID="entries-month-next"
            accessibilityRole="button"
            onPress={() => finStore.nextMonth()}
            style={sharedStyles.iconBtn}
          >
            <MaterialIcons name="chevron-right" size={24} color={c.text} />
          </TouchableOpacity>
        </View>

        {/* Filtros e botão adicionar */}
        <View style={styles.filtersBlock}>
          <View style={sharedStyles.chipRow}>
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'expense', label: 'Despesas' },
                { id: 'income', label: 'Receitas' },
              ] as Array<{ id: 'all' | FinKind; label: string }>
            ).map((opt) => {
              const active = filters.kind === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  testID={`entries-filter-kind-${opt.id}`}
                  accessibilityRole="button"
                  onPress={() => finStore.setFilters({ kind: opt.id })}
                  style={[
                    sharedStyles.chip,
                    {
                      backgroundColor: active ? c.primary : c.surface,
                      borderColor: active ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipLabel, { color: active ? '#1A0E08' : c.text }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={sharedStyles.chipRow}>
            {(
              [
                { id: 'all', label: 'Qualquer status' },
                { id: 'pending', label: 'Pendentes' },
                { id: 'paid', label: 'Pagos' },
              ] as Array<{ id: 'all' | FinEntryStatus; label: string }>
            ).map((opt) => {
              const active = filters.status === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  testID={`entries-filter-status-${opt.id}`}
                  accessibilityRole="button"
                  onPress={() => finStore.setFilters({ status: opt.id })}
                  style={[
                    sharedStyles.chip,
                    {
                      backgroundColor: active ? c.surfaceContainer : c.surface,
                      borderColor: active ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipLabel, { color: active ? c.primary : c.muted }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            testID="entries-add-btn"
            accessibilityRole="button"
            onPress={() => {
              setEditingEntry(null);
              setEditingScope(undefined);
              setIsFormOpen(true);
            }}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary, alignSelf: 'flex-start' }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Novo lançamento</Text>
          </TouchableOpacity>
        </View>

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
          filteredEntries.map((entry) => {
            const dueStatus = classifyEntryDueStatus(entry, effectiveToday, 7);
            const category = categoryById.get(entry.category_id);
            const accountName = accountNameById.get(entry.account_id) ?? 'Conta';
            const displayCents =
              entry.status === 'paid'
                ? entry.paid_amount_cents ?? entry.amount_cents
                : entry.amount_cents;
            const installmentLabel =
              entry.installment_total && entry.installment_total > 1 && entry.installment_number
                ? `${entry.installment_number}/${entry.installment_total}`
                : null;

            return (
              <View
                key={entry.id}
                testID={`entry-row-${entry.id}`}
                style={[
                  sharedStyles.rowCard,
                  {
                    backgroundColor: c.surface,
                    borderColor: dueStatus === 'overdue' ? c.expense : dueStatus === 'due_soon' ? c.warning : c.border,
                  },
                ]}
              >
                <View style={styles.rowTop}>
                  <View style={styles.rowInfo}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.rowDesc, { color: c.text }]}>
                        {entry.description || category?.name || 'Lançamento'}
                      </Text>
                      {installmentLabel ? (
                        <View style={[styles.badge, { backgroundColor: c.surfaceContainer }]}>
                          <Text style={[styles.badgeText, { color: c.text }]}>
                            {installmentLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.rowSub, { color: c.muted }]}>
                      {category?.name ?? 'Categoria'} • {accountName} • Venc. {entry.due_date}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.rowAmount,
                      { color: entry.kind === 'income' ? c.income : c.text },
                    ]}
                  >
                    {entry.kind === 'income' ? '+' : '-'}
                    {formatCentsBRL(displayCents, isPrivacyMode)}
                  </Text>
                </View>

                <View style={styles.rowBottom}>
                  <View style={styles.badgesRow}>
                    {dueStatus === 'overdue' ? (
                      <View
                        testID={`entry-overdue-badge-${entry.id}`}
                        style={[styles.badge, { backgroundColor: 'rgba(184,74,28,0.18)' }]}
                      >
                        <Text style={[styles.badgeText, { color: c.expense }]}>Atrasada</Text>
                      </View>
                    ) : dueStatus === 'due_soon' ? (
                      <View
                        testID={`entry-duesoon-badge-${entry.id}`}
                        style={[styles.badge, { backgroundColor: 'rgba(212,168,59,0.2)' }]}
                      >
                        <Text style={[styles.badgeText, { color: c.warning }]}>Vence em breve</Text>
                      </View>
                    ) : entry.status === 'paid' ? (
                      <View style={[styles.badge, { backgroundColor: 'rgba(42,144,76,0.18)' }]}>
                        <Text style={[styles.badgeText, { color: c.income }]}>
                          {entry.kind === 'income' ? 'Recebido' : 'Pago'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.actionsRow}>
                    {entry.status === 'pending' ? (
                      <TouchableOpacity
                        testID={`entry-pay-btn-${entry.id}`}
                        accessibilityRole="button"
                        onPress={() => handleOpenPayModal(entry)}
                        style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                      >
                        <Text style={[styles.chipLabel, { color: c.income }]}>
                          {entry.kind === 'income' ? 'Receber' : 'Pagar'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => void handleReopenPending(entry.id)}
                        style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                      >
                        <Text style={[styles.chipLabel, { color: c.muted }]}>Reabrir</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => handleEditPress(entry)}
                      style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                    >
                      <MaterialIcons name="edit" size={18} color={c.text} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      testID={`entry-delete-btn-${entry.id}`}
                      accessibilityRole="button"
                      onPress={() => void handleDeletePress(entry)}
                      style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={c.expense} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <EntryFormSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => void loadData()}
        editingEntry={editingEntry}
        installmentScope={editingScope}
        defaultDueDate={effectiveToday}
        themeMode={themeMode}
      />

      {/* Modal: Baixa (Pagar / Receber com data e valor reais) */}
      <AnimatedModalSheet
        visible={Boolean(payingEntry)}
        onClose={() => setPayingEntry(null)}
        themeMode={themeMode}
        testID="pay-entry-modal"
      >
        <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
          {payingEntry?.kind === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
        </Text>
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
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setPayingEntry(null)}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="pay-entry-confirm-btn"
            accessibilityRole="button"
            onPress={() => void handleConfirmPay()}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <Text style={sharedStyles.primaryBtnText}>Confirmar</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModalSheet>

      {/* Diálogo: Escopo de edição/exclusão de parcelas */}
      <AnimatedModalSheet
        visible={Boolean(scopePrompt)}
        onClose={() => setScopePrompt(null)}
        themeMode={themeMode}
        testID="installment-scope-dialog"
      >
        <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
          {scopePrompt?.action === 'delete' ? 'Excluir parcela' : 'Editar parcela'}
        </Text>
        <Text style={[styles.scopeSubtitle, { color: c.muted }]}>
          Aplicar alteração em quais parcelas desta compra?
        </Text>
        <View style={styles.scopeList}>
          <TouchableOpacity
            testID="installment-scope-only_this"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('only_this')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>
              Só esta parcela
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="installment-scope-this_and_next"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('this_and_next')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.text }]}>
              Esta e as próximas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="installment-scope-all"
            accessibilityRole="button"
            onPress={() => void handleSelectScope('all')}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border, justifyContent: 'flex-start' }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.expense }]}>
              Todas as parcelas
            </Text>
          </TouchableOpacity>
        </View>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  monthLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  filtersBlock: {
    gap: space.sm,
  },
  chipLabel: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 12,
    fontWeight: '600',
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  rowDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
  },
  rowAmount: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 15,
    fontWeight: '700',
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
    flexWrap: 'wrap',
    gap: space.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: borders.radiusPill,
  },
  badgeText: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  scopeSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    marginBottom: space.md,
  },
  scopeList: {
    gap: space.sm,
  },
});
