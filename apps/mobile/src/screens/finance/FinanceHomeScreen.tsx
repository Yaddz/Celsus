import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoGrid,
  BentoRow,
  BentoTile,
  DotTrack,
  MonthBalanceCarousel,
  XpMinimalHeader,
  type MonthBalanceSummary,
} from '../../components/ui';
import {
  FloatingBottomDock,
  type DockActionItem,
  type DockTabItem,
} from '../../components/ui/FloatingBottomDock';
import { PriceAreaChart } from '../../components/ui/PriceAreaChart';
import type { FinAccount, FinBill, FinBudget, FinCategory, FinEntry, FinRecurrence, FinRecurrenceSkip } from '../../db/schema';
import type { ReceiptDraft } from '../../domain/receipt';
import {
  addMonthsYearMonth,
  calculateBudgetUsage,
  calculateMonthlySummary,
  computeAppPendingOutflowCents,
  detectOverdueAndDueSoonWithBills,
  formatCentsBRL,
  formatYearMonthPtBr,
  getMonthDateRange,
  getTodayIsoLocal,
  monthSummary,
  projectCashflow,
} from '../../domain/financeFlow';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { formatUpdatedAgo } from '../../domain/openFinance';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import { finService } from '../../services/finService';
import { patrimonyService } from '../../services/patrimonyService';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { finStore, useFinStore, type FinFilters } from '../../stores/finStore';
import { bento, dock, layout, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { AccountsScreen } from './AccountsScreen';
import { CardBillScreen } from './CardBillScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CategoryRulesScreen } from './CategoryRulesScreen';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import { ReclassifyAportesSheet } from './ReclassifyAportesSheet';
import { EntriesListScreen } from './EntriesListScreen';
import { EntryFormSheet } from './EntryFormSheet';
import { ReceiptScannerSheet, type ReceiptScannerMode } from './ReceiptScannerSheet';
import { RecurrencesScreen } from './RecurrencesScreen';
import { SubscriptionsScreen } from './SubscriptionsScreen';
import { FinanceMoreScreen } from './FinanceMoreScreen';
import { BudgetScreen } from './BudgetScreen';
import { GoalsScreen } from './GoalsScreen';
import { NetWorthScreen } from './NetWorthScreen';
import { MonthCloseScreen } from './MonthCloseScreen';
import { monthCloseService } from '../../services/monthCloseService';
import { finGoalsService } from '../../services/finGoalsService';
import {
  formatSignedCentsBRL,
  getFinUiColors,
  resolveCategoryVisual,
  sharedStyles,
} from './finTheme';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/ScreenStates';

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
  | 'monthClose'
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
  initialOpenStatementImport?: boolean;
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
  monthClose: 'home',
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
  monthClose: 'home',
};

export type FinanceTab = 'home' | 'entries' | 'accounts' | 'more';

const FINANCE_DOCK_TABS: DockTabItem<FinanceTab>[] = [
  { id: 'home', iconName: 'dashboard', label: 'Resumo' },
  { id: 'entries', iconName: 'receipt-long', label: 'Lançamentos' },
  { id: 'accounts', iconName: 'account-balance-wallet', label: 'Contas' },
  { id: 'more', iconName: 'more-horiz', label: 'Mais' },
];

export const FinanceHomeScreen: React.FC<FinanceHomeScreenProps> = ({
  onBack,
  onSwitchModule,
  onAvatarPress,
  userName,
  userInitials,
  onOpenPortfolioTransaction,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  onNavigate,
  referenceDateIso,
  initialRoute = 'home',
  initialOpenStatementImport = false,
  testID = 'finance-home-screen',
}) => {
  const insets = useSafeAreaInsets();
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
  const [bills, setBills] = useState<FinBill[]>([]);
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
  const [entryFormInitialKind, setEntryFormInitialKind] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [scannerMode, setScannerMode] = useState<ReceiptScannerMode | null>(null);
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [isStatementImportOpen, setIsStatementImportOpen] = useState(Boolean(initialOpenStatementImport));
  const [isReclassifyAportesOpen, setIsReclassifyAportesOpen] = useState(false);
  const [accountsBalanceCents, setAccountsBalanceCents] = useState(0);
  const [cardsDebtCents, setCardsDebtCents] = useState(0);
  const [reserveMonths, setReserveMonths] = useState<number | null>(null);

  useEffect(() => {
    if (initialOpenStatementImport) {
      setIsStatementImportOpen(true);
    }
  }, [initialOpenStatementImport]);

  const loadData = useCallback(async () => {
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      await finService.initializeFinanceModule(effectiveToday);
      await finService.ensureMonthGenerated(effectiveMonth, effectiveToday);
      const [allEntries, allCategories, activeAccounts, allRecurrences, allBudgets, allSkips, allBills, ofItems, pat, monthCloseProposal] = await Promise.all([
        finRepository.listAllEntries(),
        finRepository.listCategories(false),
        finRepository.listAccounts(false),
        finRepository.listRecurrences(),
        finRepository.listBudgets(),
        finRepository.listAllRecurrenceSkips(),
        finRepository.listAllBills(),
        openFinanceRepository.listItems(),
        patrimonyService.getPatrimony(effectiveToday),
        monthCloseService.getProposal(effectiveMonth, { todayIso: effectiveToday }).catch(() => null),
      ]);
      setEntries(allEntries);
      setCategories(allCategories);
      setAccounts(activeAccounts);
      setRecurrences(allRecurrences);
      setBudgets(allBudgets);
      setSkips(allSkips);
      setBills(allBills);
      setAccountsBalanceCents(pat.accountsCents);
      setCardsDebtCents(pat.cardsCents);
      setReserveMonths(monthCloseProposal?.reserve.months ?? null);
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
    finStore.setSelectedMonth(effectiveMonth);
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

  const currentMonth = effectiveToday.slice(0, 7);
  const maxSelectableMonth = useMemo(() => addMonthsYearMonth(currentMonth, 24), [currentMonth]);

  const handleSelectMonth = useCallback(
    (nextMonth: string) => {
      if (nextMonth > maxSelectableMonth) return;
      setLocalMonth(nextMonth);
      finStore.setSelectedMonth(nextMonth);
    },
    [maxSelectableMonth]
  );

  const getMonthSummary = useCallback(
    (yearMonth: string): MonthBalanceSummary => {
      const summary = calculateMonthlySummary(entries, yearMonth, effectiveToday);
      const prev = addMonthsYearMonth(yearMonth, -1);
      const prevSum = calculateMonthlySummary(entries, prev, effectiveToday);
      const { start, end } = getMonthDateRange(yearMonth);
      const fromIso = effectiveToday > start && effectiveToday <= end ? effectiveToday : start;
      const projection = projectCashflow(accounts, entries, fromIso, end, {
        recurrences,
        skips,
        bills,
      });
      return {
        month: yearMonth,
        balanceCents: summary.balanceCents,
        balanceDeltaCents: summary.balanceCents - prevSum.balanceCents,
        prevMonthName: formatYearMonthPtBr(prev).split(' ')[0].toLowerCase(),
        endBalanceCents: projection.endBalanceCents,
        minBalanceCents: projection.minBalanceCents,
        minBalanceDate: projection.minBalanceDate,
        endDateDDMM: `${end.slice(8, 10)}/${end.slice(5, 7)}`,
        isNegativeAlert: projection.isNegativeAlert,
      };
    },
    [entries, accounts, recurrences, skips, effectiveToday]
  );

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const monthlySummary = useMemo(
    () => calculateMonthlySummary(entries, effectiveMonth, effectiveToday),
    [entries, effectiveMonth, effectiveToday]
  );

  const monthR43 = useMemo(
    () => monthSummary(entries, effectiveMonth, { todayIso: effectiveToday, accounts }),
    [entries, effectiveMonth, effectiveToday, accounts]
  );

  const prevMonth = useMemo(() => addMonthsYearMonth(effectiveMonth, -1), [effectiveMonth]);
  const prevSummary = useMemo(
    () => calculateMonthlySummary(entries, prevMonth, effectiveToday),
    [entries, prevMonth, effectiveToday]
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
    () => detectOverdueAndDueSoonWithBills(entries, accounts, effectiveToday, 7, { bills }),
    [entries, accounts, effectiveToday, bills]
  );
  const dueSoonExpensesCount = useMemo(
    () => dueAlerts.dueSoon.filter((e) => e.kind === 'expense').length + dueAlerts.dueSoonBills.length,
    [dueAlerts.dueSoon, dueAlerts.dueSoonBills]
  );
  const pendingOutflowCents = useMemo(
    () => computeAppPendingOutflowCents(entries),
    [entries]
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
      bills,
    });
  }, [accounts, entries, effectiveMonth, effectiveToday, recurrences, skips, bills]);

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
          onSwitchModule={onSwitchModule}
          onAvatarPress={onAvatarPress}
          userName={userName}
          userInitials={userInitials}
          onOpenCardBill={(accId, billMonth) => {
            setSelectedCardAccountId(accId);
            setSelectedCardBillMonth(billMonth);
            navigateTo('cardBill');
          }}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
          referenceDateIso={effectiveToday}
          hideFab
        />
      );
    }
    if (activeRoute === 'more') {
      return (
        <FinanceMoreScreen
          onBack={() => setActiveRoute('home')}
          onSwitchModule={onSwitchModule}
          onAvatarPress={onAvatarPress}
          userName={userName}
          userInitials={userInitials}
          onOpen={(route) => {
            if (route === 'statementImport') {
              setIsStatementImportOpen(true);
            } else if (route === 'reclassifyAportes') {
              setIsReclassifyAportesOpen(true);
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
          onSwitchModule={onSwitchModule}
          onOpenPortfolioTransaction={onOpenPortfolioTransaction}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
          referenceDateIso={effectiveToday}
        />
      );
    }
    if (activeRoute === 'monthClose') {
      return (
        <MonthCloseScreen
          yearMonth={effectiveMonth}
          referenceDateIso={effectiveToday}
          onBack={() => {
            setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'home');
            void loadData();
          }}
          onClosedAndContribute={() => {
            setActiveRoute('home');
            onSwitchModule?.();
          }}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
        />
      );
    }
    if (activeRoute === 'netWorth') {
      return (
        <NetWorthScreen
          onBack={() => setActiveRoute(PARENT_OF_ROUTE[activeRoute] ?? 'more')}
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
          onAvatarPress={onAvatarPress}
          userName={userName}
          userInitials={userInitials}
          onOpenCardBill={(accId) => {
            setSelectedCardAccountId(accId);
            setSelectedCardBillMonth(undefined);
            navigateTo('cardBill');
          }}
          hideFab
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
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
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
          onSwitchModule={onSwitchModule}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />
      );
    }

    return (
      <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
        <XpMinimalHeader
          module="finance"
          title="Finanças"
          subtitle="Controle pessoal"
          isGlobeActive={true}
          onBack={onAvatarPress ? undefined : onBack}
          onAvatarPress={onAvatarPress}
          userName={userName}
          userInitials={userInitials}
          onSwitchModule={onSwitchModule}
          isPrivacyModeEnabled={isPrivacyMode}
          onTogglePrivacy={onTogglePrivacy}
          themeMode={themeMode}
        />

        <ScrollView
          testID="finance-home-scroll"
          contentContainerStyle={[
            sharedStyles.scrollContent,
            { paddingBottom: dockContentPaddingBottom(insets.bottom) },
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handlePullRefresh()} />
          }
        >
          {hasOfItems ? (
            <View style={{ marginBottom: space.sm }}>
              <Text
                testID="finance-of-updated-ago"
                style={{ fontSize: typography.labelMd.fontSize, color: c.muted, textAlign: 'right' }}
              >
                {formatUpdatedAgo(ofLastSyncedAt, Date.now())}
              </Text>
              {ofSyncError ? (
                <View
                  testID="finance-of-sync-error-banner"
                  style={{
                    marginTop: space.sm,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                    borderRadius: 10,
                    backgroundColor: c.surfaceContainer,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: space.sm,
                  }}
                >
                  <Text
                    style={{ flex: 1, fontSize: typography.labelMd.fontSize, color: c.muted }}
                    numberOfLines={2}
                  >
                    Não foi possível atualizar o Open Finance: {ofSyncError}
                  </Text>
                  <TouchableOpacity
                    testID="finance-of-sync-retry-btn"
                    accessibilityRole="button"
                    onPress={() => void runOpenFinanceSync(true)}
                  >
                    <Text style={{ fontSize: typography.labelMd.fontSize, fontWeight: typography.weights.semibold, color: c.income }}>
                      Tentar de novo
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}
          {loading ? (
            <>
              <View
                testID="finance-home-month-rail"
                style={[styles.monthRail, { backgroundColor: c.surfaceContainer }]}
              >
                <TouchableOpacity
                  testID="finance-home-month-prev"
                  accessibilityRole="button"
                  accessibilityLabel="Mês anterior"
                  onPress={() => handleSelectMonth(addMonthsYearMonth(effectiveMonth, -1))}
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
                  onPress={() => handleSelectMonth(addMonthsYearMonth(effectiveMonth, 1))}
                  style={styles.monthArrowBtn}
                >
                  <MaterialIcons name="chevron-right" size={20} color={c.muted} />
                </TouchableOpacity>
              </View>
              <LoadingState themeMode={themeMode} />
            </>
          ) : error ? (
            <ErrorState message={error} onRetry={loadData} themeMode={themeMode} />
          ) : entries.length === 0 && accounts.length === 0 ? (
            <>
              <MonthBalanceCarousel
                month={effectiveMonth}
                currentMonth={currentMonth}
                maxMonth={maxSelectableMonth}
                getMonthSummary={getMonthSummary}
                onMonthChange={handleSelectMonth}
                isPrivacyMode={isPrivacyMode}
                themeMode={themeMode}
              />
              <EmptyState
                testID="finance-empty-state"
                icon="account-balance"
                title="Nenhum lançamento registrado"
                subtitle="Cadastre contas, receitas, despesas, assinaturas ou compras parceladas para ver o resumo do mês."
                themeMode={themeMode}
              />
            </>
          ) : (
            <BentoGrid>
              {/* Saldo em contas (artboard 7, R42) */}
              <BentoTile
                variant={tileVariant}
                title="SALDO EM CONTAS"
                testID="finance-accounts-balance-tile"
                onPress={() => navigateTo('accounts')}
              >
                <Text
                  testID="finance-accounts-net-balance"
                  style={[styles.pairValue, { color: c.text }]}
                  numberOfLines={1}
                >
                  {isPrivacyMode
                    ? PRIVACY_CURRENCY_MASK
                    : formatCentsBRL(accountsBalanceCents - cardsDebtCents)}
                </Text>
                <Text style={[styles.pairCaption, { color: c.muted }]}>
                  {isPrivacyMode
                    ? `Contas ${PRIVACY_CURRENCY_MASK} · Cartões ${PRIVACY_CURRENCY_MASK} · Poupança ${monthR43.savingsRateLabel}`
                    : `Contas ${formatCentsBRL(accountsBalanceCents)} · Cartões ${formatCentsBRL(cardsDebtCents)} · Poupança ${monthR43.savingsRateLabel}`}
                </Text>
              </BentoTile>

              {/* O mês em uma linha (artboard 7, R43) */}
              <BentoTile
                variant={tileVariant}
                title="O MÊS EM UMA LINHA"
                testID="finance-month-one-line-tile"
              >
                <View style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.pairCaption, { color: c.muted, marginTop: 0 }]}>Receitas</Text>
                    <Text style={[styles.pairCaption, { color: c.income, marginTop: 0 }]}>
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(monthR43.incomeCents)}
                    </Text>
                  </View>
                  {monthR43.dividendIncomeCents > 0 ? (
                    <Text style={[styles.pairCaption, { color: c.muted, marginTop: 0 }]}>
                      {isPrivacyMode
                        ? `dos quais proventos ${PRIVACY_CURRENCY_MASK}`
                        : `dos quais proventos ${formatCentsBRL(monthR43.dividendIncomeCents)}`}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.pairCaption, { color: c.muted, marginTop: 0 }]}>Despesas</Text>
                    <Text style={[styles.pairCaption, { color: c.expense, marginTop: 0 }]}>
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(monthR43.expenseCents)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.pairCaption, { color: c.muted, marginTop: 0 }]}>Enviado à corretora</Text>
                    <Text style={[styles.pairCaption, { color: c.text, marginTop: 0 }]}>
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(monthR43.contributionCents)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.pairCaption, { color: c.text, marginTop: 0 }]}>Sobra</Text>
                    <Text
                      style={[
                        styles.pairCaption,
                        { color: monthR43.netCents >= 0 ? c.income : c.expense, marginTop: 0 },
                      ]}
                    >
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(monthR43.netCents)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="finance-close-month-btn"
                    accessibilityRole="button"
                    onPress={() => setActiveRoute('monthClose')}
                    style={{ marginTop: space.xs }}
                  >
                    <Text style={[styles.pairCaption, { color: c.income, marginTop: 0 }]}>
                      Fechar o mês ›
                    </Text>
                  </TouchableOpacity>
                </View>
              </BentoTile>

              {/* Reserva (artboard 7, R45) */}
              <BentoTile
                variant={tileVariant}
                title="RESERVA"
                testID="finance-reserve-tile"
              >
                <Text style={[styles.pairValue, { color: c.text }]}>
                  {reserveMonths === null
                    ? '—'
                    : `${reserveMonths.toFixed(1).replace('.', ',')} meses`}
                </Text>
                <Text style={[styles.pairCaption, { color: c.muted }]}>Fundo de emergência</Text>
              </BentoTile>

              {/* Saldo do mês em carrossel + indicador em pílulas */}
              <MonthBalanceCarousel
                month={effectiveMonth}
                currentMonth={currentMonth}
                maxMonth={maxSelectableMonth}
                getMonthSummary={getMonthSummary}
                onMonthChange={handleSelectMonth}
                onCashflowPress={() => setIsCashflowModalOpen(true)}
                isPrivacyMode={isPrivacyMode}
                themeMode={themeMode}
              />

              {/* Receitas x Despesas */}
              <BentoRow>
                <BentoTile
                  variant={tileVariant}
                  title="RECEITAS"
                  testID="finance-month-income-tile"
                  accessibilityLabel={`Ver receitas de ${formatYearMonthPtBr(effectiveMonth).toLowerCase()}`}
                  onPress={() => openEntriesWith({ kind: 'income' })}
                >
                  <View style={styles.pairHeaderRow}>
                    <Text
                      testID="finance-month-income"
                      style={[styles.pairValue, { color: c.income, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {formatSignedCentsBRL(monthlySummary.totalIncomeCents, 'income', isPrivacyMode)}
                    </Text>
                    <MaterialIcons name="chevron-right" size={16} color={c.muted} />
                  </View>
                  <Text style={[styles.pairCaption, { color: c.muted }]}>
                    {pendingIncomeCount} a receber
                  </Text>
                </BentoTile>
                <BentoTile
                  variant={tileVariant}
                  title="DESPESAS"
                  testID="finance-month-expense-tile"
                  accessibilityLabel={`Ver despesas de ${formatYearMonthPtBr(effectiveMonth).toLowerCase()}`}
                  onPress={() => openEntriesWith({ kind: 'expense' })}
                >
                  <View style={styles.pairHeaderRow}>
                    <Text
                      testID="finance-month-expense"
                      style={[styles.pairValue, { color: c.expense, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {formatSignedCentsBRL(monthlySummary.totalExpenseCents, 'expense', isPrivacyMode)}
                    </Text>
                    <MaterialIcons name="chevron-right" size={16} color={c.muted} />
                  </View>
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
                    {pendingOutflowCents > 0 ? (
                      <Text
                        testID="finance-pending-outflow-line"
                        style={[styles.pairCaption, { color: c.goldMuted, marginTop: space.xs }]}
                      >
                        Despesas futuras {formatCentsBRL(pendingOutflowCents, isPrivacyMode)}
                      </Text>
                    ) : null}
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
                      style={[styles.pairCaption, { color: c.income, marginTop: space.xs }]}
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
                          ? c.overdue
                          : budgetUsage?.status === 'atencao'
                          ? c.warning
                          : cat.color;
                      const textHighlight =
                        budgetUsage?.status === 'estourado'
                          ? c.overdue
                          : budgetUsage?.status === 'atencao'
                          ? c.warning
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
                                style={{ fontSize: typography.sizes.caption, fontWeight: typography.weights.bold, color: budgetColor }}
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
      </View>
    );

  };

  const financeDockActions: DockActionItem[] = [
    {
      id: 'transfer',
      testID: 'add-menu-transfer',
      icon: 'swap-horiz',
      label: 'Transferir',
      sub: 'Mover entre contas',
      tint: 'tertiary',
      onPress: () => {
        setReceiptDraft(null);
        setEntryFormInitialKind('transfer');
        setIsAddEntryOpen(true);
      },
    },
    {
      id: 'qr',
      testID: 'add-menu-qr',
      icon: 'qr-code-scanner',
      label: 'Ler QR / código',
      sub: 'QR Code, barras ou chave',
      tint: 'stock',
      onPress: () => setScannerMode('qr'),
    },
    {
      id: 'ocr',
      testID: 'add-menu-ocr',
      icon: 'photo-camera',
      label: 'Ler cupom',
      sub: 'Foto ou texto do cupom',
      tint: 'tertiary',
      onPress: () => setScannerMode('ocr'),
    },
    {
      id: 'manual',
      testID: 'add-menu-manual',
      icon: 'edit',
      label: 'Novo lançamento',
      sub: 'Receita ou despesa',
      tint: 'primary',
      onPress: () => {
        setReceiptDraft(null);
        setEntryFormInitialKind('expense');
        setIsAddEntryOpen(true);
      },
    },
  ];

  return (
    <View style={styles.shell}>
      {renderBody()}
      <FloatingBottomDock<FinanceTab>
        testID="finance-dock"
        tabTestIdPrefix="finance-dock-tab-"
        actionButtonTestID="finance-add-entry-btn"
        activeTab={TAB_OF_ROUTE[activeRoute]}
        tabs={FINANCE_DOCK_TABS}
        actions={financeDockActions}
        onTabChange={(tab) => navigateTo(tab)}
        forceClose={isAddEntryOpen || scannerMode !== null || isStatementImportOpen}
        themeMode={themeMode}
      />
      <ReceiptScannerSheet
        visible={scannerMode !== null}
        mode={scannerMode ?? 'ocr'}
        onClose={() => setScannerMode(null)}
        onResult={(draft) => {
          setScannerMode(null);
          setReceiptDraft(draft);
          setEntryFormInitialKind('expense');
          setIsAddEntryOpen(true);
        }}
        onFallbackManual={() => {
          setScannerMode(null);
          setReceiptDraft(null);
          setEntryFormInitialKind('expense');
          setIsAddEntryOpen(true);
        }}
        themeMode={themeMode}
      />
      <EntryFormSheet
        visible={isAddEntryOpen}
        onClose={() => {
          setIsAddEntryOpen(false);
          setReceiptDraft(null);
          setEntryFormInitialKind('expense');
        }}
        onSaved={() => void loadData()}
        onRequestCreateAccount={() => navigateTo('accounts')}
        onEditCardAccount={() => {
          setIsAddEntryOpen(false);
          navigateTo('accounts');
        }}
        receiptDraft={receiptDraft}
        initialKind={entryFormInitialKind}
        defaultDueDate={effectiveToday}
        themeMode={themeMode}
      />
      <StatementImportSheet
        visible={isStatementImportOpen}
        onClose={() => setIsStatementImportOpen(false)}
        onCompleted={() => void loadData()}
        themeMode={themeMode}
      />
      <ReclassifyAportesSheet
        visible={isReclassifyAportesOpen}
        onClose={() => setIsReclassifyAportesOpen(false)}
        onReclassified={() => void loadData()}
        isPrivacyMode={isPrivacyMode}
        themeMode={themeMode}
      />
      <AnimatedModalSheet
        visible={isCashflowModalOpen}
        onClose={() => setIsCashflowModalOpen(false)}
        testID="finance-cashflow-chart-modal"
        themeMode={themeMode}
      >
        <Text style={[styles.addMenuOptionText, styles.cashflowSheetTitle, { color: c.text }]}>
          Previsão de saldo · {formatYearMonthPtBr(effectiveMonth)}
        </Text>
        <PriceAreaChart
          points={cashflowChartPoints}
          activeRange="30D"
          themeMode={themeMode}
          accentColor={cashflowProjection.isNegativeAlert ? c.negativeChart : c.positiveChart}
        />
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  cashflowSheetTitle: {
    marginBottom: space.sm,
  },
  addMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: layout.dockClearance,
  },
  addMenuCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: space.sm,
    overflow: 'hidden',
  },
  addMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  addMenuOptionText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  attentionCell: {
    flex: 1,
    paddingVertical: space.xs,
  },
  attentionDivider: {
    width: 1,
    marginHorizontal: space.lg,
  },
  attentionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    letterSpacing: 1.0,
    marginBottom: space.sm,
  },
  shell: {
    flex: 1,
  },
  pairHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  monthRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: space.xs,
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
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineLg.fontSize,
    fontWeight: typography.weights.bold,
  },
  heroSub: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    marginTop: space.xs,
  },
  pairValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.lead,
    fontWeight: typography.weights.bold,
  },
  pairCaption: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    marginTop: space.xs,
  },
  overdueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 14,
    marginBottom: space.md,
  },
  overdueTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dotList: {
    gap: space.md,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dotCatName: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    width: 82,
  },
  dotPct: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    width: 36,
    textAlign: 'right',
  },
  dotsTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  shortcutTile: {
    justifyContent: 'center',
    paddingVertical: space.md,
  },
  shortcutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  shortcutTexts: {
    flex: 1,
  },
  shortcutTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: typography.weights.bold,
  },
  shortcutSub: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    marginTop: 1, // fora da escala: alinhamento óptico de 1 px entre título e subtítulo do atalho
  },
  entriesShortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
