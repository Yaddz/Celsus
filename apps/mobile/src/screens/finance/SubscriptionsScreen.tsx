import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BentoGrid,
  ConfirmDialog,
  FinListCard,
  FinListRow,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import {
  calculateSubscriptionsSummary,
  formatCentsBRL,
  getTodayIsoLocal,
  nextOccurrenceIso,
  type FinFrequency,
} from '../../domain/financeFlow';
import type { FinCategory, FinEntry, FinRecurrence } from '../../db/schema';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import type { ThemeMode } from '../../theme/palettes';
import { space, typography } from '../../theme/tokens';
import {
  FinFloatingAddButton,
  formatSignedCentsBRL,
  getFinUiColors,
  sharedStyles,
  resolveCategoryVisual,
} from './finTheme';
import { FinHeroTile } from '../../components/ui/FinHeroTile';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/ScreenStates';
import { FREQUENCY_LABELS, RecurrenceFormSheet } from './RecurrencesScreen';

export interface SubscriptionsScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

type SubscriptionFilter = 'active' | 'paused' | 'canceled';

function formatDateBR(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function computeNextBillingIso(sub: FinRecurrence): string | null {
  if (sub.end_date) return null;
  const base = sub.generated_until ?? sub.start_date;
  if (!base) return null;
  const parts = base.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  if (sub.frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (sub.frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    const nextMonth = new Date(y, m, 1);
    const maxDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    date.setFullYear(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(sub.day_of_month || d, maxDay));
  }
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function daysUntilIso(iso: string | null, todayIso: string): number | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  const tParts = todayIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  if (tParts.length !== 3 || tParts.some((n) => Number.isNaN(n))) return null;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date(tParts[0], tParts[1] - 1, tParts[2]);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'subscriptions-screen',
}) => {
  const insets = useSafeAreaInsets();
  const ui = getFinUiColors(themeMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<FinRecurrence[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [recEntries, setRecEntries] = useState<FinEntry[]>([]);
  const [filter, setFilter] = useState<SubscriptionFilter>('active');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingSub, setEditingSub] = useState<FinRecurrence | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FinRecurrence | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, cats, entries] = await Promise.all([
        finRepository.listRecurrences({ onlySubscriptions: true }),
        finRepository.listCategories(true),
        finRepository.listEntriesWithRecurrence(),
      ]);
      setSubscriptions(recs.filter((r) => r.is_subscription === 1));
      setCategories(cats);
      setRecEntries(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assinaturas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const activeSubs = useMemo(
    () => subscriptions.filter((s) => s.active === 1 && !s.end_date),
    [subscriptions]
  );
  const pausedSubs = useMemo(
    () => subscriptions.filter((s) => s.active !== 1 && !s.end_date),
    [subscriptions]
  );
  const canceledSubs = useMemo(
    () => subscriptions.filter((s) => Boolean(s.end_date)),
    [subscriptions]
  );

  const summary = useMemo(() => calculateSubscriptionsSummary(subscriptions), [subscriptions]);

  const handleTogglePause = async (sub: FinRecurrence) => {
    if (sub.active === 1) {
      await finService.pauseSubscription(sub.id);
    } else {
      await finService.resumeSubscription(sub.id);
    }
    await loadData();
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    await finService.cancelSubscription(cancelTarget.id);
    setCancelTarget(null);
    await loadData();
  };

  const todayIso = referenceDateIso ?? getTodayIsoLocal();

  const renderSubscriptionRow = (sub: FinRecurrence, isLast: boolean, mode: SubscriptionFilter) => {
    const cat = catMap.get(sub.category_id);
    const visual = resolveCategoryVisual(cat);
    const freqLabel = FREQUENCY_LABELS[(sub.frequency as FinFrequency) || 'monthly'] ?? 'Mensal';
    const nextIso = mode === 'active' ? nextOccurrenceIso(sub, todayIso, recEntries) : null;
    const daysAway = daysUntilIso(nextIso, todayIso);
    const isSoon = daysAway !== null && daysAway <= 7 && daysAway >= 0;
    const isExpanded = expandedSubId === sub.id;

    let subtitle = freqLabel;
    if (mode === 'active') {
      if (isSoon && nextIso) {
        subtitle =
          daysAway === 0
            ? `Cobra hoje • ${formatDateBR(nextIso)}`
            : `Cobra em ${daysAway} ${daysAway === 1 ? 'dia' : 'dias'} • ${formatDateBR(nextIso)}`;
      } else {
        subtitle = nextIso ? `${freqLabel} • próx. ${formatDateBR(nextIso)}` : freqLabel;
      }
    } else if (mode === 'paused') {
      subtitle = 'Pausada • sem cobranças futuras';
    } else {
      subtitle = sub.end_date ? `Cancelada em ${formatDateBR(sub.end_date)}` : `Cancelada • ${freqLabel}`;
    }

    const actionBorder = ui.actionBorder;

    let bottomContent: React.ReactNode = null;
    if (mode === 'active' && isExpanded) {
      bottomContent = (
        <View style={styles.actionsRow}>
          <JellyPressable
            testID={`subscription-pause-btn-${sub.id}`}
            onPress={() => void handleTogglePause(sub)}
            containerStyle={[styles.actionBtn, { borderColor: actionBorder, backgroundColor: ui.surfaceElevated }]}
            accessibilityLabel={`Pausar ${sub.description}`}
          >
            <Text style={[styles.actionBtnText, { color: ui.text }]}>Pausar</Text>
          </JellyPressable>
          <JellyPressable
            testID={`subscription-cancel-btn-${sub.id}`}
            onPress={() => setCancelTarget(sub)}
            containerStyle={[styles.actionBtn, { borderColor: actionBorder, backgroundColor: ui.surfaceContainer }]}
            accessibilityLabel={`Cancelar ${sub.description}`}
          >
            <Text style={[styles.actionBtnText, { color: ui.expense }]}>Cancelar</Text>
          </JellyPressable>
        </View>
      );
    } else if (mode === 'paused') {
      bottomContent = (
        <View style={styles.actionsRow}>
          <JellyPressable
            testID={`subscription-resume-btn-${sub.id}`}
            onPress={() => void handleTogglePause(sub)}
            containerStyle={[styles.resumeBtn, { backgroundColor: ui.primary }]}
            accessibilityLabel={`Retomar ${sub.description}`}
          >
            <Text style={[styles.resumeBtnText, { color: ui.primaryFg }]}>Retomar</Text>
          </JellyPressable>
        </View>
      );
    }

    return (
      <FinListRow
        key={sub.id}
        testID={`subscription-row-${sub.id}`}
        subtitleTestID={`subscription-subtitle-${sub.id}`}
        icon={visual.icon}
        avatarColor={mode === 'paused' ? ui.inactiveAvatarBg : visual.color}
        iconColor={mode === 'paused' ? ui.avatarIconDark : visual.iconColor}
        title={sub.description}
        subtitle={subtitle}
        subtitleColor={isSoon ? ui.warning : ui.muted}
        amountText={formatSignedCentsBRL(
          sub.amount_cents,
          sub.kind === 'income' ? 'income' : 'expense',
          isPrivacyMode
        )}
        amountColor={sub.kind === 'income' ? ui.income : ui.expense}
        bottomContent={bottomContent}
        isLast={isLast}
        themeMode={themeMode}
        onPress={() => {
          if (mode === 'active') {
            setExpandedSubId((prev) => (prev === sub.id ? null : sub.id));
          } else {
            setEditingSub(sub);
            setFormVisible(true);
          }
        }}
      />
    );
  };

  const showEmpty =
    (filter === 'active' && activeSubs.length === 0 && pausedSubs.length === 0) ||
    (filter === 'paused' && pausedSubs.length === 0) ||
    (filter === 'canceled' && canceledSubs.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: ui.background }]} testID={testID}>
      <XpMinimalHeader
        module="finance"
        title="Assinaturas"
        subtitle="Cobranças recorrentes"
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      {loading ? (
        <LoadingState themeMode={themeMode} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} themeMode={themeMode} />
      ) : (
        <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: dockContentPaddingBottom(insets.bottom, { withFab: true }) }]} showsVerticalScrollIndicator={false}>
          <BentoGrid>
            <View
              testID="subscriptions-hero-tile"
              style={{ backgroundColor: ui.forestBg, borderRadius: 28 }}
            >
              <FinHeroTile
                variant="forest"
                label="GASTO COM ASSINATURAS"
                testID="subscriptions-summary-tile"
                value={formatCentsBRL(summary.monthlyTotalCents, false)}
                valueTestID="subscriptions-monthly-total"
                support="por mês"
                secondary={{
                  value: (
                    <Text testID="subscriptions-yearly-total">
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(summary.annualTotalCents, false)}
                    </Text>
                  ),
                  support: 'por ano',
                  valueTestID: 'subscriptions-annual-total',
                }}
                isPrivacyMode={isPrivacyMode}
                themeMode={themeMode}
              />
            </View>
          </BentoGrid>

          <SegmentedControl
            testID="subscriptions-status-segmented"
            themeMode={themeMode}
            options={[
              { id: 'active', label: `Ativas · ${activeSubs.length}` },
              { id: 'paused', label: `Pausadas · ${pausedSubs.length}` },
              { id: 'canceled', label: 'Canceladas' },
            ]}
            value={filter}
            onChange={(val) => setFilter(val as SubscriptionFilter)}
          />

          {showEmpty ? (
            <EmptyState
              testID="subscriptions-empty-state"
              icon="autorenew"
              title="Nenhuma assinatura"
              subtitle="Adicione streaming, academia ou serviços recorrentes para acompanhar o custo mensal."
              actionLabel="Nova assinatura"
              onAction={() => {
                setEditingSub(null);
                setFormVisible(true);
              }}
              themeMode={themeMode}
            />
          ) : (
            <>
              {filter === 'active' && activeSubs.length > 0 && (
                <FinListCard
                  title={`ATIVAS · ${activeSubs.length}`}
                  testID="subscriptions-active-list"
                  themeMode={themeMode}
                >
                  {activeSubs.map((sub, idx) =>
                    renderSubscriptionRow(sub, idx === activeSubs.length - 1, 'active')
                  )}
                </FinListCard>
              )}

              {(filter === 'paused' || (filter === 'active' && pausedSubs.length > 0)) &&
                pausedSubs.length > 0 && (
                  <FinListCard
                    title="PAUSADAS"
                    testID="subscriptions-paused-list"
                    themeMode={themeMode}
                  >
                    {pausedSubs.map((sub, idx) =>
                      renderSubscriptionRow(sub, idx === pausedSubs.length - 1, 'paused')
                    )}
                  </FinListCard>
                )}

              {filter === 'canceled' && canceledSubs.length > 0 && (
                <FinListCard
                  title={`CANCELADAS · ${canceledSubs.length}`}
                  testID="subscriptions-canceled-list"
                  themeMode={themeMode}
                  cardStyle={styles.canceledCard}
                >
                  {canceledSubs.map((sub, idx) =>
                    renderSubscriptionRow(sub, idx === canceledSubs.length - 1, 'canceled')
                  )}
                </FinListCard>
              )}
            </>
          )}
        </ScrollView>
      )}

      <FinFloatingAddButton
        testID="subscriptions-add-btn"
        accessibilityLabel="Nova assinatura"
        onPress={() => {
          setEditingSub(null);
          setFormVisible(true);
        }}
      />

      <RecurrenceFormSheet
        visible={formVisible}
        onClose={() => {
          setFormVisible(false);
          setEditingSub(null);
        }}
        onSaved={() => void loadData()}
        editingRecurrence={editingSub}
        defaultIsSubscription
        themeMode={themeMode}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar assinatura"
        message={
          cancelTarget
            ? `Deseja encerrar "${cancelTarget.description}"? O histórico já pago será mantido.`
            : ''
        }
        confirmLabel="Cancelar assinatura"
        cancelLabel="Manter"
        destructive
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelTarget(null)}
        themeMode={themeMode}
        testID="confirm-dialog"
        confirmTestID="confirm-dialog-confirm"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  actionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: typography.weights.bold,
  },
  resumeBtn: {
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  resumeBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: typography.weights.bold,
  },
  canceledCard: {
    opacity: 0.7,
  },
});
