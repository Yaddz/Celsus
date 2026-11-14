import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui';
import type { FinCategory, FinEntry } from '../../db/schema';
import { buildDonutSlices, DONUT_TOTAL_SEGMENTS } from '../../domain/finance/donut';
import {
  calculateMonthlySummary,
  detectOverdueAndDueSoon,
  formatCentsBRL,
  formatYearMonthPtBr,
  getTodayIsoLocal,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { useFinStore } from '../../stores/finStore';
import { bento, borders, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { AccountsScreen } from './AccountsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { EntriesListScreen } from './EntriesListScreen';
import { EntryFormSheet } from './EntryFormSheet';
import { RecurrencesScreen } from './RecurrencesScreen';
import { SubscriptionsScreen } from './SubscriptionsScreen';
import {
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  sharedStyles,
} from './finTheme';

export type FinanceRoute =
  | 'home'
  | 'entries'
  | 'recurrences'
  | 'subscriptions'
  | 'accounts'
  | 'categories';

export interface FinanceHomeScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  onNavigate?: (route: FinanceRoute) => void;
  referenceDateIso?: string;
  testID?: string;
}

const DONUT_DIAMETER = 128;
const DONUT_RADIUS = 50;

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
  const { selectedMonth } = useFinStore();
  const effectiveToday = referenceDateIso ?? getTodayIsoLocal();
  const effectiveMonth = referenceDateIso ? referenceDateIso.slice(0, 7) : selectedMonth;

  const [activeRoute, setActiveRoute] = useState<FinanceRoute>('home');
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await finService.initializeFinanceModule(effectiveToday);
      const [allEntries, allCategories] = await Promise.all([
        finRepository.listAllEntries(),
        finRepository.listCategories(true),
      ]);
      setEntries(allEntries);
      setCategories(allCategories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar módulo.');
    } finally {
      setLoading(false);
    }
  }, [effectiveToday]);

  useEffect(() => {
    if (activeRoute === 'home') {
      void loadData();
    }
  }, [activeRoute, loadData]);

  const navigateTo = (route: FinanceRoute) => {
    onNavigate?.(route);
    setActiveRoute(route);
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

  const dueAlerts = useMemo(
    () => detectOverdueAndDueSoon(entries, effectiveToday, 7),
    [entries, effectiveToday]
  );

  const categoryChartItems = useMemo(() => {
    const inputs = monthlySummary.expenseByCategory.map((item) => ({
      ticker: categoryById.get(item.categoryId)?.name ?? item.categoryId,
      weight: item.amountCents,
      categoryId: item.categoryId,
      percentage: item.percentage,
    }));
    const slices = buildDonutSlices(inputs);
    return slices.map((slice, idx) => ({
      ...slice,
      categoryId: inputs[idx].categoryId,
      amountCents: inputs[idx].weight,
      color: categoryById.get(inputs[idx].categoryId)?.color || slice.color,
    }));
  }, [monthlySummary.expenseByCategory, categoryById]);

  if (activeRoute === 'entries') {
    return (
      <EntriesListScreen
        onBack={() => setActiveRoute('home')}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        referenceDateIso={effectiveToday}
      />
    );
  }
  if (activeRoute === 'subscriptions') {
    return (
      <SubscriptionsScreen
        onBack={() => setActiveRoute('home')}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
    );
  }
  if (activeRoute === 'recurrences') {
    return (
      <RecurrencesScreen
        onBack={() => setActiveRoute('home')}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
    );
  }
  if (activeRoute === 'accounts') {
    return (
      <AccountsScreen
        onBack={() => setActiveRoute('home')}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
    );
  }
  if (activeRoute === 'categories') {
    return (
      <CategoriesScreen
        onBack={() => setActiveRoute('home')}
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
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        <View style={styles.topActionsRow}>
          <Text style={[styles.monthSubheading, { color: c.muted }]}>
            {formatYearMonthPtBr(effectiveMonth)}
          </Text>
          <TouchableOpacity
            testID="finance-add-entry-btn"
            accessibilityRole="button"
            onPress={() => setIsAddEntryOpen(true)}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Novo lançamento</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : entries.length === 0 ? (
          <FinEmptyState
            testID="finance-empty-state"
            icon="account-balance"
            title="Nenhum lançamento registrado"
            subtitle="Cadastre contas, receitas, despesas, assinaturas ou compras parceladas para ver o resumo do mês."
            themeMode={themeMode}
          />
        ) : (
          <View style={{ gap: bento.gap }}>
            {/* Saldo do mês */}
            <View style={[styles.heroCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardLabel, { color: c.muted }]}>SALDO DO MÊS (REALIZADO)</Text>
              <Text
                testID="finance-month-balance"
                style={[
                  styles.heroValue,
                  { color: monthlySummary.balanceCents < 0 ? c.expense : c.text },
                ]}
              >
                {formatCentsBRL(monthlySummary.balanceCents, isPrivacyMode)}
              </Text>
              <Text style={[styles.heroSub, { color: c.muted }]}>
                Previsto no mês: {formatCentsBRL(monthlySummary.projectedBalanceCents, isPrivacyMode)}
              </Text>
            </View>

            {/* Receitas x Despesas */}
            <View style={styles.bentoPair}>
              <View style={[styles.pairCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardLabel, { color: c.muted }]}>RECEITAS</Text>
                <Text testID="finance-month-income" style={[styles.pairValue, { color: c.income }]}>
                  {formatCentsBRL(monthlySummary.totalIncomeCents, isPrivacyMode)}
                </Text>
              </View>
              <View style={[styles.pairCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardLabel, { color: c.muted }]}>DESPESAS</Text>
                <Text testID="finance-month-expense" style={[styles.pairValue, { color: c.expense }]}>
                  {formatCentsBRL(monthlySummary.totalExpenseCents, isPrivacyMode)}
                </Text>
              </View>
            </View>

            {/* A vencer em 7 dias e atrasadas */}
            <View style={styles.bentoPair}>
              <View style={[styles.pairCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardLabel, { color: c.muted }]}>A PAGAR (7 DIAS)</Text>
                <Text testID="finance-upcoming-7d" style={[styles.pairValue, { color: c.warning }]}>
                  {formatCentsBRL(dueAlerts.dueSoonPayableCents, isPrivacyMode)}
                </Text>
              </View>
              <View
                testID="finance-overdue-tile"
                style={[
                  styles.pairCard,
                  {
                    backgroundColor: c.surface,
                    borderColor: dueAlerts.overdue.length > 0 ? c.expense : c.border,
                  },
                ]}
              >
                <Text style={[styles.cardLabel, { color: c.muted }]}>ATRASADAS</Text>
                <Text
                  style={[
                    styles.pairValue,
                    { color: dueAlerts.overdue.length > 0 ? c.expense : c.muted },
                  ]}
                >
                  {formatCentsBRL(dueAlerts.overduePayableCents, isPrivacyMode)}
                </Text>
              </View>
            </View>

            {/* Gasto por categoria (Rosca + Barras) */}
            {categoryChartItems.length > 0 ? (
              <View
                testID="finance-category-chart"
                style={[styles.chartCard, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <Text style={[styles.cardLabel, { color: c.muted, marginBottom: space.md }]}>
                  GASTOS POR CATEGORIA
                </Text>
                <View style={styles.chartBody}>
                  <View style={styles.donutWrapper}>
                    {categoryChartItems.map((slice) =>
                      Array.from({ length: slice.segments }).map((_, offset) => {
                        const segIndex = slice.startSegment + offset;
                        const angleDeg = (segIndex / DONUT_TOTAL_SEGMENTS) * 360 - 90;
                        const rad = (angleDeg * Math.PI) / 180;
                        const cx = DONUT_DIAMETER / 2 + Math.cos(rad) * DONUT_RADIUS - 2;
                        const cy = DONUT_DIAMETER / 2 + Math.sin(rad) * DONUT_RADIUS - 9;
                        return (
                          <View
                            key={`${slice.categoryId}-${segIndex}`}
                            style={[
                              styles.donutArc,
                              {
                                left: cx,
                                top: cy,
                                backgroundColor: slice.color,
                                transform: [{ rotate: `${angleDeg + 90}deg` }],
                              },
                            ]}
                          />
                        );
                      })
                    )}
                    <View style={[styles.donutCenter, { backgroundColor: c.surface }]}>
                      <Text style={[styles.donutCenterLabel, { color: c.muted }]}>Total</Text>
                      <Text style={[styles.donutCenterValue, { color: c.text }]}>
                        {formatCentsBRL(monthlySummary.totalExpenseCents, isPrivacyMode)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.legendList}>
                    {categoryChartItems.map((item) => (
                      <View key={item.categoryId} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <Text style={[styles.legendName, { color: c.text }]} numberOfLines={1}>
                          {item.ticker}
                        </Text>
                        <Text style={[styles.legendVal, { color: c.muted }]}>
                          {formatCentsBRL(item.amountCents, isPrivacyMode)} ({item.percent}%)
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* Atalhos do módulo */}
        <Text style={[sharedStyles.sectionLabel, { color: c.muted, marginTop: space.md }]}>
          Atalhos
        </Text>
        <View style={styles.shortcutsGrid}>
          {(
            [
              { route: 'entries', testId: 'finance-shortcut-entries', label: 'Lançamentos', icon: 'receipt-long' },
              { route: 'subscriptions', testId: 'finance-shortcut-subscriptions', label: 'Assinaturas', icon: 'autorenew' },
              { route: 'recurrences', testId: 'finance-shortcut-recurrences', label: 'Recorrências', icon: 'repeat' },
              { route: 'accounts', testId: 'finance-shortcut-accounts', label: 'Contas', icon: 'account-balance-wallet' },
              { route: 'categories', testId: 'finance-shortcut-categories', label: 'Categorias', icon: 'category' },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.route}
              testID={item.testId}
              accessibilityRole="button"
              onPress={() => navigateTo(item.route)}
              style={[styles.shortcutBtn, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <MaterialIcons
                name={item.icon as keyof typeof MaterialIcons.glyphMap}
                size={20}
                color={c.primary}
              />
              <Text style={[styles.shortcutLabel, { color: c.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <EntryFormSheet
        visible={isAddEntryOpen}
        onClose={() => setIsAddEntryOpen(false)}
        onSaved={() => void loadData()}
        defaultDueDate={effectiveToday}
        themeMode={themeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  monthSubheading: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 13,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: bento.tileRadius,
    borderWidth: 1,
    padding: bento.tilePadding,
    gap: space.xs,
  },
  cardLabel: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroValue: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 26,
    fontWeight: '700',
  },
  heroSub: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 12,
  },
  bentoPair: {
    flexDirection: 'row',
    gap: bento.gap,
  },
  pairCard: {
    flex: 1,
    borderRadius: bento.innerRadius,
    borderWidth: 1,
    padding: bento.tilePadding,
    gap: space.xs,
  },
  pairValue: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 16,
    fontWeight: '700',
  },
  chartCard: {
    borderRadius: bento.tileRadius,
    borderWidth: 1,
    padding: bento.tilePadding,
  },
  chartBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    flexWrap: 'wrap',
  },
  donutWrapper: {
    width: DONUT_DIAMETER,
    height: DONUT_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  donutArc: {
    position: 'absolute',
    width: 4,
    height: 18,
    borderRadius: 1,
  },
  donutCenter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  donutCenterLabel: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 10,
  },
  donutCenterValue: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  legendList: {
    flex: 1,
    minWidth: 150,
    gap: space.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  legendVal: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
  },
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: bento.gap,
  },
  shortcutBtn: {
    minWidth: '47%',
    flexGrow: 1,
    minHeight: 48,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  shortcutLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
});
