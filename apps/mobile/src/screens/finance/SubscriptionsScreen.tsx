import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BentoGrid,
  BentoTile,
  ConfirmDialog,
  FinListCard,
  FinListRow,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { calculateSubscriptionsSummary, formatCentsBRL, type FinFrequency } from '../../domain/financeFlow';
import type { FinCategory, FinRecurrence } from '../../db/schema';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import type { ThemeMode } from '../../theme/palettes';
import { layout, typography } from '../../theme/tokens';
import {
  FinEmptyState,
  FinErrorView,
  FinFloatingAddButton,
  FinLoadingView,
  formatSignedCentsBRL,
  getFinUiColors,
  resolveCategoryVisual,
} from './finTheme';
import { FREQUENCY_LABELS, RecurrenceFormSheet } from './RecurrencesScreen';

export interface SubscriptionsScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
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

function daysUntilIso(iso: string | null): number | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'subscriptions-screen',
}) => {
  const ui = getFinUiColors(themeMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<FinRecurrence[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [filter, setFilter] = useState<SubscriptionFilter>('active');

  const [formVisible, setFormVisible] = useState(false);
  const [editingSub, setEditingSub] = useState<FinRecurrence | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FinRecurrence | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, cats] = await Promise.all([
        finRepository.listRecurrences({ onlySubscriptions: true }),
        finRepository.listCategories(true),
      ]);
      setSubscriptions(recs.filter((r) => r.is_subscription === 1));
      setCategories(cats);
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

  const renderSubscriptionRow = (sub: FinRecurrence, isLast: boolean, mode: SubscriptionFilter) => {
    const cat = catMap.get(sub.category_id);
    const visual = resolveCategoryVisual(cat);
    const freqLabel = FREQUENCY_LABELS[(sub.frequency as FinFrequency) || 'monthly'] ?? 'Mensal';
    const nextIso = mode === 'active' ? computeNextBillingIso(sub) : null;
    const daysAway = daysUntilIso(nextIso);
    const isSoon = daysAway !== null && daysAway <= 3 && daysAway >= 0;

    let subtitle = freqLabel;
    if (mode === 'active') {
      subtitle = nextIso ? `${freqLabel} • Próxima: ${formatDateBR(nextIso)}` : freqLabel;
    } else if (mode === 'paused') {
      subtitle = `Pausada • ${freqLabel}`;
    } else {
      subtitle = sub.end_date ? `Cancelada em ${formatDateBR(sub.end_date)}` : `Cancelada • ${freqLabel}`;
    }

    const actionBorder = ui.isLight ? '#E2DACB' : '#34383C';

    let bottomContent: React.ReactNode = null;
    if (mode === 'active') {
      bottomContent = (
        <View style={styles.actionsRow}>
          <JellyPressable
            testID={`subscription-pause-btn-${sub.id}`}
            onPress={() => void handleTogglePause(sub)}
            containerStyle={[styles.actionBtn, { borderColor: actionBorder }]}
            accessibilityLabel={`Pausar ${sub.description}`}
          >
            <Text style={[styles.actionBtnText, { color: ui.text }]}>Pausar</Text>
          </JellyPressable>
          <JellyPressable
            testID={`subscription-cancel-btn-${sub.id}`}
            onPress={() => setCancelTarget(sub)}
            containerStyle={[styles.actionBtn, { borderColor: actionBorder }]}
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
            containerStyle={styles.resumeBtn}
            accessibilityLabel={`Retomar ${sub.description}`}
          >
            <Text style={styles.resumeBtnText}>Retomar</Text>
          </JellyPressable>
        </View>
      );
    }

    return (
      <FinListRow
        key={sub.id}
        testID={`subscription-row-${sub.id}`}
        icon={visual.icon}
        avatarColor={visual.color}
        iconColor={visual.iconColor}
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
          setEditingSub(sub);
          setFormVisible(true);
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
        title="Assinaturas"
        subtitle="Cobranças recorrentes"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      {loading ? (
        <FinLoadingView themeMode={themeMode} />
      ) : error ? (
        <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <BentoGrid>
            <BentoTile
              variant="forest"
              title="GASTO COM ASSINATURAS"
              testID="subscriptions-summary-tile"
            >
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryValue} testID="subscriptions-monthly-total">
                    {formatCentsBRL(summary.monthlyTotalCents, isPrivacyMode)}
                  </Text>
                  <Text style={styles.summaryLabel}>por mês</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryValue} testID="subscriptions-annual-total">
                    {formatCentsBRL(summary.annualTotalCents, isPrivacyMode)}
                  </Text>
                  <Text style={styles.summaryLabel}>por ano</Text>
                </View>
              </View>
            </BentoTile>
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
            <FinEmptyState
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
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: 8,
    paddingBottom: 170,
    gap: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  summaryCol: {
    flex: 1,
    gap: 4,
  },
  summaryValue: {
    fontFamily: typography.fontFamily,
    fontSize: 24,
    fontWeight: '700',
    color: '#E6DECA',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#AECDC5',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  resumeBtn: {
    height: 36,
    borderRadius: 11,
    backgroundColor: '#D96628',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  resumeBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#1A0E08',
  },
  canceledCard: {
    opacity: 0.7,
  },
});
