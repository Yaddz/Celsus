import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoGrid, BentoRow, BentoTile, DotTrack, XpMinimalHeader } from '../../components/ui';
import { PriceAreaChart } from '../../components/ui/PriceAreaChart';
import type { FinAccount, FinBudget, FinCategory, FinEntry, FinRecurrence, FinRecurrenceSkip } from '../../db/schema';
import type { ReceiptDraft } from '../../domain/receipt';
import {
  addMonthsYearMonth,
  calculateBudgetUsage,
  calculateMonthlySummary,
  detectOverdueAndDueSoonWithBills,
  formatCentsBRL,
  formatYearMonthPtBr,
  getMonthDateRange,
  getTodayIsoLocal,
  projectCashflow,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { formatUpdatedAgo } from '../../domain/openFinance';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
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
import { BudgetScreen } from './BudgetScreen';
import { GoalsScreen } from './GoalsScreen';
import { NetWorthScreen } from './NetWorthScreen';
import { finGoalsService } from '../../services/finGoalsService';
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
  | 'budgets'
  | 'goals'
  | 'netWorth'
  | 'accounts'
  | 'cardBill'
  | 'categories'
  | 'categoryRules'
  | 'more';

export interface FinanceHomeScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  onAvatarPress?: () => void;
  userName?: string;
  userInitials?: string;
  onOpenPortfolioTransaction?: (portfolioId: string) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  onNavigate?: (route: FinanceRoute) => void;
  referenceDateIso?: string;
  initialRoute?: FinanceRoute;
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
  budgets: 'more',
  goals: 'more',
  netWorth: 'more',
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
  budgets: 'more',
  goals: 'more',
  netWorth: 'more',
  subscriptions: 'more',
  recurrences: 'more',
  categories: 'more',
  categoryRules: 'more',
};

export const FinanceHomeScreen: React.FC<FinanceHomeScreenProps> = ({
  onBack,
  onOpenPortfolioTransaction,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  onNavigate,
  referenceDateIso,
  initialRoute = 'home',
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

  const [activeRoute, setActiveRoute] = useState<FinanceRoute>(initialRoute);
  const [selectedCardAccountId, setSelectedCardAccountId] = useState<string | null>(null);
  const [selectedCardBillMonth, setSelectedCardBillMonth] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [recurrences, setRecurrences] = useState<FinRecurrence[]>([]);
  const [budgets, setBudgets] = useState<FinBudget[]>([]);
  const [skips, setSkips] = useState<FinRecurrenceSkip[]>([]);
  const [isCashflowModalOpen, setIsCashflowModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const didAutoSyncRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [hasOfItems, setHasOfItems] = useState(false);
  const [ofLastSyncedAt, setOfLastSyncedAt] = useState<string | null>(null);
  const [ofSyncError, setOfSyncError] = useState<string | null>(null);
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
      const [allEntries, allCategories, activeAccounts, allRecurrences, allBudgets, allSkips, ofItems] = await Promise.all([
        finRepository.listAllEntries(),
        finRepository.listCategories(false),
        finRepository.listAccounts(false),
        finRepository.listRecurrences(),
        finRepository.listBudgets(),
        finRepository.listAllRecurrenceSkips(),
        openFinanceRepository.listItems(),
      ]);
      setEntries(allEntries);
      setCategories(allCategories);
      setAccounts(activeAccounts);
      setRecurrences(allRecurrences);
      setBudgets(allBudgets);
      setSkips(allSkips);
      setHasOfItems(ofItems.length > 0);
      const latestSynced = ofItems
        .map((it) => it.last_synced_at)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop() ?? null;
      setOfLastSyncedAt(latestSynced);
      const firstError = ofItems.find((it) => Boolean(it.last_error))?.last_error ?? null;
      if (firstError) {
        setOfSyncError(firstError);
      }
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

  const runOpenFinanceSync = useCallback(
    async (forceAll = false) => {
      try {
        if (forceAll) {
          const items = await openFinanceRepository.listItems();
          for (const it of items) {
            await pluggySyncService.syncFinance(it.id);
          }
          setOfSyncError(null);
        } else {
          const res = await pluggySyncService.syncIfStale();
          if (res.errors.length > 0) {
            setOfSyncError(res.errors[0]);
          } else if (res.triggered) {
            setOfSyncError(null);
          }
        }
        await loadData();
      } catch (err) {
        setOfSyncError(
          err instanceof Error ? err.message : 'Falha de rede ao atualizar Open Finance.'
        );
      }
    },
    [loadData]
  );

  useEffect(() => {
    if (didAutoSyncRef.current) return;
    didAutoSyncRef.current = true;
    void runOpenFinanceSync(false);
  }, [runOpenFinanceSync]);

  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runOpenFinanceSync(true);
    } finally {
      setRefreshing(false);
    }
  }, [runOpenFinanceSync]);

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

  const budgetUsageByCategory = useMemo(() => {
    const items = calculateBudgetUsage(entries, budgets, effectiveMonth, {
      todayIso: effectiveToday,
    });
    return new Map(items.map((item) => [item.categoryId, item]));
  }, [entries, budgets, effectiveMonth, effectiveToday]);

  const cashflowProjection = useMemo(() => {
    const { start, end } = getMonthDateRange(effectiveMonth);
    const fromIso = effectiveToday > start && effectiveToday <= end ? effectiveToday : start;
    return projectCashflow(accounts, entries, fromIso, end, {
      recurrences,
      skips,
    });
  }, [accounts, entries, effectiveMonth, effectiveToday, recurrences, skips]);

  const cashflowChartPoints = useMemo(
    () =>
      cashflowProjection.days.map((d) => ({
        date: d.date,
        close: Math.round(d.balanceCents) / 100,
      })),
    [cashflowProjection.days]
  );

  const renderBody = (): React.ReactElement => {
    if (activeRoute === 'entries') {
      return (
        <EntriesListScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home')}
          onOpenCardBill={(accId, billMonth) => {
            setSelectedCardAccountId(accId);
            setSelectedCardBillMonth(billMonth);
            navigateTo('cardBill');
          }}
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
            } else if (route in TAB_OF_ROUTE) {
              navigateTo(route as FinanceRoute);
            }
          }}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'goals') {
      return (
        <GoalsScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'more')}
          onOpenPortfolioTransaction={onOpenPortfolioTransaction}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
          referenceDateIso={effectiveToday}
        />
      );
    }
    if (activeRoute === 'netWorth') {
      return (
        <NetWorthScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'more')}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
          referenceDateIso={effectiveToday}
        />
      );
    }
    if (activeRoute === 'budgets') {
      return (
        <BudgetScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'more')}
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
            setSelectedCardBillMonth(undefined);
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
          initialBillMonth={selectedCardBillMonth}
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'accounts')}
          onEditCardAccount={() => navigateTo('accounts')}
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handlePullRefresh()} />
          }
        >
          {hasOfItems ? (
            <View style={{ marginBottom: 8 }}>
              <Text
                testID="finance-of-updated-ago"
                style={{ fontSize: 12, color: c.muted, textAlign: 'right' }}
              >
                {formatUpdatedAgo(ofLastSyncedAt, Date.now())}
              </Text>
              {ofSyncError ? (
                <View
                  testID="finance-of-sync-error-banner"
                  style={{
                    marginTop: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: c.surfaceContainer,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <Text
                    style={{ flex: 1, fontSize: 12, color: c.muted }}
                    numberOfLines={2}
                  >
                    Não foi possível atualizar o Open Finance: {ofSyncError}
                  </Text>
                  <TouchableOpacity
                    testID="finance-of-sync-retry-btn"
                    accessibilityRole="button"
                    onPress={() => void runOpenFinanceSync(true)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: c.income }}>
                      Tentar de novo
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
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
                {(() => {
                  const endIso = getMonthDateRange(effectiveMonth).end;
                  const endDDMM = `${endIso.slice(8, 10)}/${endIso.slice(5, 7)}`;
                  const minDay = cashflowProjection.minBalanceDate.slice(8, 10);
                  return (
                    <TouchableOpacity
                      testID="finance-cashflow-forecast"
                      activeOpacity={0.75}
                      onPress={() => setIsCashflowModalOpen(true)}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={[styles.heroSub, { color: c.primaryFg, opacity: 0.92 }]}>
                        {`Previsão para ${endDDMM}: ${formatCentsBRL(cashflowProjection.endBalanceCents, isPrivacyMode)} · menor saldo dia ${minDay}: ${formatCentsBRL(cashflowProjection.minBalanceCents, isPrivacyMode)}`}
                      </Text>
                      {cashflowProjection.isNegativeAlert ? (
                        <Text
                          testID="finance-cashflow-negative-warning"
                          style={[styles.heroSub, { color: '#FFE0B2', fontWeight: '700', marginTop: 2 }]}
                        >
                          Aviso: menor saldo previsto negativo
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })()}
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
                    {topCategories.map((cat) => {
                      const budgetUsage = cat.isAggregatedOther
                        ? undefined
                        : budgetUsageByCategory.get(cat.categoryId);
                      const hasBudget = budgetUsage?.limitCents != null;
                      const budgetColor =
                        budgetUsage?.status === 'estourado'
                          ? '#D96628'
                          : budgetUsage?.status === 'atencao'
                          ? '#D4A83B'
                          : cat.color;
                      const textHighlight =
                        budgetUsage?.status === 'estourado'
                          ? '#D96628'
                          : budgetUsage?.status === 'atencao'
                          ? '#D4A83B'
                          : c.text;
                      return (
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
                          <Text style={[styles.dotCatName, { color: textHighlight }]} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <DotTrack
                            testID={`finance-category-dot-track-${cat.categoryId}`}
                            percentage={cat.percentage}
                            color={hasBudget ? budgetColor : cat.color}
                            trackColor={c.trackBg}
                          />
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text
                              testID={`finance-category-pct-${cat.categoryId}`}
                              style={[styles.dotPct, { color: textHighlight }]}
                            >
                              {cat.percentage}%
                            </Text>
                            {hasBudget && budgetUsage?.percentage !== null ? (
                              <Text
                                testID={`finance-category-budget-pct-${cat.categoryId}`}
                                style={{ fontSize: 10, fontWeight: '700', color: budgetColor }}
                              >
                                {Math.round(budgetUsage.percentage)}% do limite
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
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
      <Modal
        visible={isCashflowModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCashflowModalOpen(false)}
      >
        <Pressable
          testID="finance-cashflow-chart-modal"
          style={styles.addMenuBackdrop}
          onPress={() => setIsCashflowModalOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.addMenuCard,
              { backgroundColor: c.surface, borderColor: c.border, padding: 14, width: '100%' },
            ]}
          >
            <Text style={[styles.addMenuOptionText, { color: c.text, marginBottom: 8 }]}>
              Previsão de saldo · {formatYearMonthPtBr(effectiveMonth)}
            </Text>
            <PriceAreaChart
              points={cashflowChartPoints}
              activeRange="30D"
              themeMode={themeMode}
              accentColor={cashflowProjection.isNegativeAlert ? '#D96628' : '#2E7D5B'}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
