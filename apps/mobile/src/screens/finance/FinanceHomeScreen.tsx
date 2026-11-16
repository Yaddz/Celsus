import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoGrid, BentoRow, BentoTile, DotTrack, XpMinimalHeader } from '../../components/ui';
import type { FinAccount, FinCategory, FinEntry, FinRecurrence } from '../../db/schema';
import type { ReceiptDraft } from '../../domain/receipt';
import {
  addMonthsYearMonth,
  calculateMonthlySummary,
  detectOverdueAndDueSoonWithBills,
  formatCentsBRL,
  formatYearMonthPtBr,
  getTodayIsoLocal,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore, useFinStore, type FinFilters } from '../../stores/finStore';
import { bento, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { AccountsScreen } from './AccountsScreen';
import { CardBillScreen } from './CardBillScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CategoryRulesScreen } from './CategoryRulesScreen';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import { EntriesListScreen } from './EntriesListScreen';
import { EntryFormSheet } from './EntryFormSheet';
import { ReceiptScannerSheet, type ReceiptScannerMode } from './ReceiptScannerSheet';
import { RecurrencesScreen } from './RecurrencesScreen';
import { SubscriptionsScreen } from './SubscriptionsScreen';
import { FinanceDock, type FinanceTab } from './FinanceDock';
import { FinanceMoreScreen } from './FinanceMoreScreen';
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

export type FinanceRoute =
  | 'home'
  | 'entries'
  | 'recurrences'
  | 'subscriptions'
  | 'accounts'
  | 'cardBill'
  | 'categories'
  | 'categoryRules'
  | 'more';

export interface FinanceHomeScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  onNavigate?: (route: FinanceRoute) => void;
  referenceDateIso?: string;
  testID?: string;
}

const TOP_CATEGORIES_MAX = 4;

/** Aba da navbar que representa cada rota (rotas de "Mais" acendem a aba Mais). */
const TAB_OF_ROUTE: Record<FinanceRoute, FinanceTab> = {
  home: 'home',
  entries: 'entries',
  accounts: 'accounts',
  cardBill: 'accounts',
  more: 'more',
  subscriptions: 'more',
  recurrences: 'more',
  categories: 'more',
  categoryRules: 'more',
};

/** Para onde o voltar leva a partir de cada rota (home = sair do módulo). */
const PARENT_OF_ROUTE: Record<FinanceRoute, FinanceRoute | null> = {
  home: null,
  entries: 'home',
  accounts: 'home',
  cardBill: 'accounts',
  more: 'home',
  subscriptions: 'more',
  recurrences: 'more',
  categories: 'more',
  categoryRules: 'more',
};

export const FinanceHomeScreen: React.FC<FinanceHomeScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  onNavigate,
  referenceDateIso,
  testID = 'finance-home-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const isLight = themeMode === 'light';
  const tileVariant = isLight ? 'light' : 'dark';
  const { selectedMonth } = useFinStore();
  const effectiveToday = referenceDateIso ?? getTodayIsoLocal();
  const [localMonth, setLocalMonth] = useState<string | null>(
    referenceDateIso ? referenceDateIso.slice(0, 7) : null
  );
  const effectiveMonth = localMonth ?? selectedMonth;

  const [activeRoute, setActiveRoute] = useState<FinanceRoute>('home');
  const [selectedCardAccountId, setSelectedCardAccountId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [recurrences, setRecurrences] = useState<FinRecurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<ReceiptScannerMode | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      await finService.initializeFinanceModule(effectiveToday);
      await finService.ensureMonthGenerated(effectiveMonth, effectiveToday);
      const [allEntries, allCategories, activeAccounts, allRecurrences] = await Promise.all([
        finRepository.listAllEntries(),
        finRepository.listCategories(false),
        finRepository.listAccounts(false),
        finRepository.listRecurrences(),
      ]);
      setEntries(allEntries);
      setCategories(allCategories);
      setAccounts(activeAccounts);
      setRecurrences(allRecurrences);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar módulo.');
    } finally {
      setLoading(false);
    }
  }, [effectiveToday, effectiveMonth]);

  useEffect(() => {
    if (activeRoute === 'home') {
      void loadData();
    }
  }, [activeRoute, loadData]);

  const openEntriesWith = (filters: Partial<FinFilters>) => {
    finStore.resetFilters();
    finStore.setFilters(filters);
    navigateTo('entries');
  };

  const navigateTo = (route: FinanceRoute) => {
    onNavigate?.(route);
    setActiveRoute(route);
  };

  // Voltar do Android: sobe um nível dentro do módulo; só do Resumo o App fecha as Finanças.
  // Registrado depois do handler do App, então roda primeiro.
  useEffect(() => {
    const parent = PARENT_OF_ROUTE[activeRoute];
    if (!parent) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setActiveRoute(parent);
      return true;
    });
    return () => sub.remove();
  }, [activeRoute]);

  const handleStepMonth = (delta: number) => {
    const next = addMonthsYearMonth(effectiveMonth, delta);
    setLocalMonth(next);
    finStore.setSelectedMonth(next);
  };

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const monthlySummary = useMemo(
    () => calculateMonthlySummary(entries, effectiveMonth),
    [entries, effectiveMonth]
  );

  const prevMonth = useMemo(() => addMonthsYearMonth(effectiveMonth, -1), [effectiveMonth]);
  const prevSummary = useMemo(
    () => calculateMonthlySummary(entries, prevMonth),
    [entries, prevMonth]
  );

  const balanceDelta = monthlySummary.balanceCents - prevSummary.balanceCents;
  const prevMonthName = formatYearMonthPtBr(prevMonth).split(' ')[0].toLowerCase();

  const monthEntries = useMemo(
    () => entries.filter((e) => e.due_date.startsWith(effectiveMonth)),
    [entries, effectiveMonth]
  );
  const pendingIncomeCount = useMemo(
    () => monthEntries.filter((e) => e.kind === 'income' && e.status === 'pending').length,
    [monthEntries]
  );
  const pendingExpenseCount = useMemo(
    () => monthEntries.filter((e) => e.kind === 'expense' && e.status === 'pending').length,
    [monthEntries]
  );

  const dueAlerts = useMemo(
    () => detectOverdueAndDueSoonWithBills(entries, accounts, effectiveToday, 7),
    [entries, accounts, effectiveToday]
  );
  const dueSoonExpensesCount = useMemo(
    () => dueAlerts.dueSoon.filter((e) => e.kind === 'expense').length + dueAlerts.dueSoonBills.length,
    [dueAlerts.dueSoon, dueAlerts.dueSoonBills]
  );
  const overdueExpensesCount = useMemo(
    () => dueAlerts.overdue.filter((e) => e.kind === 'expense').length + dueAlerts.overdueBills.length,
    [dueAlerts.overdue, dueAlerts.overdueBills]
  );
  const overdueIncomeCount = useMemo(
    () => dueAlerts.overdue.filter((e) => e.kind === 'income').length,
    [dueAlerts.overdue]
  );

  const topCategories = useMemo(() => {
    const list = monthlySummary.expenseByCategory;
    if (list.length === 0) return [];

    const mapItem = (item: (typeof list)[number]) => {
      const cat = categoryById.get(item.categoryId);
      const visual = resolveCategoryVisual(cat);
      return {
        categoryId: item.categoryId,
        name: cat?.name ?? 'Outros',
        amountCents: item.amountCents,
        percentage: Math.round(item.percentage),
        color: visual.color,
        isAggregatedOther: false,
      };
    };

    if (list.length <= TOP_CATEGORIES_MAX + 1) {
      return list.map(mapItem);
    }

    const head = list.slice(0, TOP_CATEGORIES_MAX).map(mapItem);
    const tail = list.slice(TOP_CATEGORIES_MAX);
    const tailCents = tail.reduce((s, item) => s + item.amountCents, 0);
    const headPctSum = head.reduce((s, item) => s + item.percentage, 0);
    const tailPct = Math.max(0, 100 - headPctSum);
    return [
      ...head,
      {
        categoryId: 'outros',
        name: 'Outros',
        amountCents: tailCents,
        percentage: tailPct,
        color: c.inactiveAvatarBg,
        isAggregatedOther: true,
      },
    ];
  }, [monthlySummary.expenseByCategory, categoryById, c.inactiveAvatarBg]);

  const renderBody = (): React.ReactElement => {
    if (activeRoute === 'entries') {
      return (
        <EntriesListScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
          referenceDateIso={effectiveToday}
        />
      );
    }
    if (activeRoute === 'more') {
      return (
        <FinanceMoreScreen
          onBack={() => setActiveRoute('home')}
          onOpen={(route) => {
            if (route === 'statementImport') {
              setIsStatementImportOpen(true);
            } else {
              navigateTo(route);
            }
          }}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'subscriptions') {
      return (
        <SubscriptionsScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'recurrences') {
      return (
        <RecurrencesScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'accounts') {
      return (
        <AccountsScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          onOpenCardBill={(accId) => {
            setSelectedCardAccountId(accId);
            navigateTo('cardBill');
          }}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'cardBill' && selectedCardAccountId) {
      return (
        <CardBillScreen
          accountId={selectedCardAccountId}
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'accounts')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'categories') {
      return (
        <CategoriesScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'categoryRules') {
      return (
        <CategoryRulesScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'more')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }

    return (
      <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
        <XpMinimalHeader
          title="Finanças"
          subtitle="Controle pessoal"
          isGlobeActive={true}
          onBack={onBack}
          isPrivacyModeEnabled={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />

        <ScrollView
          testID="finance-home-scroll"
          contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: 130 }]}
        >
          {/* Seletor de mês */}
          <View
            testID="finance-home-month-rail"
            style={[styles.monthRail, { backgroundColor: c.surfaceContainer }]}
          >
            <TouchableOpacity
              testID="finance-home-month-prev"
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
              onPress={() => handleStepMonth(-1)}
              style={styles.monthArrowBtn}
            >
              <MaterialIcons name="chevron-left" size={20} color={c.muted} />
            </TouchableOpacity>
            <Text testID="finance-home-month-label" style={[styles.monthLabel, { color: c.text }]}>
              {formatYearMonthPtBr(effectiveMonth)}
            </Text>
            <TouchableOpacity
              testID="finance-home-month-next"
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
              onPress={() => handleStepMonth(1)}
              style={styles.monthArrowBtn}
            >
              <MaterialIcons name="chevron-right" size={20} color={c.muted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <FinLoadingView themeMode={themeMode} />
          ) : error ? (
            <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
          ) : entries.length === 0 && accounts.length === 0 ? (
            <FinEmptyState
              testID="finance-empty-state"
              icon="account-balance"
              title="Nenhum lançamento registrado"
              subtitle="Cadastre contas, receitas, despesas, assinaturas ou compras parceladas para ver o resumo do mês."
              themeMode={themeMode}
            />
          ) : (
            <BentoGrid>
              {/* Saldo do mês */}
              <BentoTile variant="primary" title="SALDO DO MÊS">
                <Text testID="finance-month-balance" style={[styles.heroValue, { color: c.primaryFg }]}>
                  {formatCentsBRL(monthlySummary.balanceCents, isPrivacyMode)}
                </Text>
                <Text testID="finance-month-comparison" style={[styles.heroSub, { color: c.primaryMuted }]}>
                  {isPrivacyMode
                    ? 'R$ •••••• em relação a ' + prevMonthName
                    : `${formatSignedCentsBRL(balanceDelta, balanceDelta >= 0 ? 'income' : 'expense', false)} em relação a ${prevMonthName}`}
                </Text>
              </BentoTile>

              {/* Receitas x Despesas */}
              <BentoRow>
                <BentoTile variant={tileVariant} title="RECEITAS">
                  <Text
                    testID="finance-month-income"
                    style={[styles.pairValue, { color: c.income }]}
                    numberOfLines={1}
                  >
                    {formatSignedCentsBRL(monthlySummary.totalIncomeCents, 'income', isPrivacyMode)}
                  </Text>
                  <Text style={[styles.pairCaption, { color: c.muted }]}>
                    {pendingIncomeCount} a receber
                  </Text>
                </BentoTile>
                <BentoTile variant={tileVariant} title="DESPESAS">
                  <Text
                    testID="finance-month-expense"
                    style={[styles.pairValue, { color: c.expense }]}
                    numberOfLines={1}
                  >
                    {formatSignedCentsBRL(monthlySummary.totalExpenseCents, 'expense', isPrivacyMode)}
                  </Text>
                  <Text style={[styles.pairCaption, { color: c.muted }]}>
                    {pendingExpenseCount} pendentes
                  </Text>
                </BentoTile>
              </BentoRow>

              {/* A vencer (7 dias) em ouro + Atrasadas escuro com ícone warning */}
              <BentoRow>
                <BentoTile
                  variant="gold"
                  testID="finance-upcoming-tile"
                  title="A VENCER · 7 DIAS"
                >
                  <TouchableOpacity
                    testID="finance-upcoming-7d-btn"
                    accessibilityRole="button"
                    accessibilityLabel="A vencer em 7 dias"
                    activeOpacity={0.7}
                    onPress={() => openEntriesWith({ status: 'pending', due: 'soon' })}
                  >
                    <Text
                      testID="finance-upcoming-7d"
                      style={[styles.pairValue, { color: c.goldFg }]}
                      numberOfLines={1}
                    >
                      {formatCentsBRL(dueAlerts.dueSoonPayableCents, isPrivacyMode)}
                    </Text>
                    <Text style={[styles.pairCaption, { color: c.goldMuted }]}>
                      {dueSoonExpensesCount} {dueSoonExpensesCount === 1 ? 'conta' : 'contas'}
                    </Text>
                  </TouchableOpacity>
                </BentoTile>

                <BentoTile
                  variant={tileVariant}
                  testID="finance-overdue-tile"
                  accessibilityLabel="Atrasadas"
                  onPress={() => openEntriesWith({ status: 'pending', due: 'overdue' })}
                >
                  <View style={styles.overdueHeader}>
                    <Text style={[styles.overdueTitle, { color: c.muted }]}>ATRASADAS</Text>
                    <MaterialIcons
                      testID="finance-overdue-warning-icon"
                      name="warning"
                      size={16}
                      color={c.overdue}
                    />
                  </View>
                  <Text style={[styles.pairValue, { color: c.overdue }]} numberOfLines={1}>
                    {formatCentsBRL(dueAlerts.overduePayableCents, isPrivacyMode)}
                  </Text>
                  <Text style={[styles.pairCaption, { color: c.muted }]}>
                    {overdueExpensesCount} {overdueExpensesCount === 1 ? 'conta' : 'contas'} · ver
                  </Text>
                  {overdueIncomeCount > 0 ? (
                    <Text
                      testID="finance-overdue-income-line"
                      style={[styles.pairCaption, { color: c.income, marginTop: 4 }]}
                    >
                      {overdueIncomeCount} a receber em atraso
                    </Text>
                  ) : null}
                </BentoTile>
              </BentoRow>

              {/* Gasto por categoria — Trilha de pontos (4 maiores + Outros) */}
              {topCategories.length > 0 ? (
                <BentoTile
                  variant={tileVariant}
                  testID="finance-category-chart"
                  title="GASTO POR CATEGORIA"
                  action="Ver tudo"
                  onActionPress={() => openEntriesWith({ kind: 'expense' })}
                >
                  <View style={styles.dotList}>
                    {topCategories.map((cat) => (
                      <TouchableOpacity
                        key={cat.categoryId}
                        testID={`finance-category-dot-row-${cat.categoryId}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${cat.name}, ${cat.percentage}% dos gastos. Ver lançamentos`}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                        onPress={() =>
                          openEntriesWith(
                            cat.isAggregatedOther
                              ? { kind: 'expense' }
                              : { kind: 'expense', categoryId: cat.categoryId }
                          )
                        }
                        style={styles.dotRow}
                      >
                        <Text style={[styles.dotCatName, { color: c.text }]} numberOfLines={1}>
                          {cat.name}
                        </Text>
                        <DotTrack
                          testID={`finance-category-dot-track-${cat.categoryId}`}
                          percentage={cat.percentage}
                          color={cat.color}
                          trackColor={c.trackBg}
                        />
                        <Text
                          testID={`finance-category-pct-${cat.categoryId}`}
                          style={[styles.dotPct, { color: c.text }]}
                        >
                          {cat.percentage}%
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </BentoTile>
              ) : null}
            </BentoGrid>
          )}

        </ScrollView>

        <FinFloatingAddButton
          testID="finance-add-entry-btn"
          accessibilityLabel="Novo lançamento"
          onPress={() => setIsAddMenuOpen(true)}
        />

        <Modal
          visible={isAddMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsAddMenuOpen(false)}
        >
          <Pressable
            style={styles.addMenuBackdrop}
            onPress={() => setIsAddMenuOpen(false)}
          >
            <View
              testID="finance-add-menu"
              style={[
                styles.addMenuCard,
                { backgroundColor: c.surface, borderColor: c.border },
              ]}
            >
              <TouchableOpacity
                testID="add-menu-manual"
                style={styles.addMenuOption}
                onPress={() => {
                  setIsAddMenuOpen(false);
                  setReceiptDraft(null);
                  setIsAddEntryOpen(true);
                }}
              >
                <MaterialIcons name="edit" size={20} color={c.text} />
                <Text style={[styles.addMenuOptionText, { color: c.text }]}>
                  Lançar manualmente
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="add-menu-ocr"
                style={styles.addMenuOption}
                onPress={() => {
                  setIsAddMenuOpen(false);
                  setScannerMode('ocr');
                }}
              >
                <MaterialIcons name="photo-camera" size={20} color={c.primary} />
                <Text style={[styles.addMenuOptionText, { color: c.text }]}>
                  Fotografar cupom
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="add-menu-qr"
                style={styles.addMenuOption}
                onPress={() => {
                  setIsAddMenuOpen(false);
                  setScannerMode('qr');
                }}
              >
                <MaterialIcons name="qr-code-scanner" size={20} color={c.primary} />
                <Text style={[styles.addMenuOptionText, { color: c.text }]}>
                  Ler QR da nota
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        <ReceiptScannerSheet
          visible={scannerMode !== null}
          mode={scannerMode ?? 'ocr'}
          onClose={() => setScannerMode(null)}
          onResult={(draft) => {
            setScannerMode(null);
            setReceiptDraft(draft);
            setIsAddEntryOpen(true);
          }}
          onFallbackManual={() => {
            setScannerMode(null);
            setReceiptDraft(null);
            setIsAddEntryOpen(true);
          }}
          themeMode={themeMode}
        />

        <EntryFormSheet
          visible={isAddEntryOpen}
          onClose={() => {
            setIsAddEntryOpen(false);
            setReceiptDraft(null);
          }}
          onSaved={() => void loadData()}
          onRequestCreateAccount={() => navigateTo('accounts')}
          receiptDraft={receiptDraft}
          defaultDueDate={effectiveToday}
          themeMode={themeMode}
        />
      </View>
    );

  };

  return (
    <View style={styles.shell}>
      {renderBody()}
      <FinanceDock
        activeTab={TAB_OF_ROUTE[activeRoute]}
        onTabChange={(tab) => navigateTo(tab)}
        themeMode={themeMode}
      />
      <StatementImportSheet
        visible={isStatementImportOpen}
        onClose={() => setIsStatementImportOpen(false)}
        onCompleted={() => void loadData()}
        themeMode={themeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  addMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  addMenuCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  addMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addMenuOptionText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '600',
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  attentionCell: {
    flex: 1,
    paddingVertical: 2,
  },
  attentionDivider: {
    width: 1,
    marginHorizontal: 14,
  },
  attentionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  shell: {
    flex: 1,
  },
  monthRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 4,
  },
  monthArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    color: '#1A0E08',
  },
  heroSub: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#1A0E08',
    marginTop: 4,
  },
  pairValue: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  pairCaption: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 4,
  },
  overdueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 14,
    marginBottom: 10,
  },
  overdueTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dotList: {
    gap: 12,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dotCatName: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    width: 82,
  },
  dotPct: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    width: 36,
    textAlign: 'right',
  },
  dotsTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  shortcutTile: {
    justifyContent: 'center',
    paddingVertical: 12,
  },
  shortcutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shortcutTexts: {
    flex: 1,
  },
  shortcutTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  shortcutSub: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    marginTop: 1,
  },
  entriesShortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
