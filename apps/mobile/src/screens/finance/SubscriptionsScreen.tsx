import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ConfirmDialog, XpMinimalHeader } from '../../components/ui';
import type { FinRecurrence } from '../../db/schema';
import {
  calculateSubscriptionsSummary,
  formatCentsBRL,
  type FinFrequency,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { bento, borders, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { FREQUENCY_LABELS, RecurrenceFormSheet } from './RecurrencesScreen';
import {
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  sharedStyles,
} from './finTheme';

export interface SubscriptionsScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'subscriptions-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const [subscriptions, setSubscriptions] = useState<FinRecurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await finRepository.listRecurrences({ onlySubscriptions: true });
      setSubscriptions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assinaturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => calculateSubscriptionsSummary(subscriptions), [subscriptions]);

  const handlePause = async (id: string) => {
    await finService.pauseSubscription(id);
    await loadData();
  };

  const handleResume = async (id: string) => {
    await finService.resumeSubscription(id);
    await loadData();
  };

  const handleConfirmCancel = async () => {
    if (!cancelingId) return;
    await finService.cancelSubscription(cancelingId);
    setCancelingId(null);
    await loadData();
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Assinaturas"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        {/* Totais Mensal e Anual */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.summaryLabel, { color: c.muted }]}>TOTAL MENSAL</Text>
            <Text testID="subscriptions-monthly-total" style={[styles.summaryValue, { color: c.text }]}>
              {formatCentsBRL(summary.monthlyTotalCents, isPrivacyMode)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.summaryLabel, { color: c.muted }]}>TOTAL ANUAL</Text>
            <Text testID="subscriptions-annual-total" style={[styles.summaryValue, { color: c.text }]}>
              {formatCentsBRL(summary.annualTotalCents, isPrivacyMode)}
            </Text>
          </View>
        </View>

        <View style={styles.toolbarRow}>
          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>
            {summary.activeCount} ativa(s) • {summary.pausedCount} pausada(s)
          </Text>
          <TouchableOpacity
            testID="subscriptions-add-btn"
            accessibilityRole="button"
            onPress={() => setIsFormOpen(true)}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Nova assinatura</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : subscriptions.length === 0 ? (
          <FinEmptyState
            testID="subscriptions-empty-state"
            icon="autorenew"
            title="Nenhuma assinatura cadastrada"
            subtitle="Acompanhe seus serviços recorrentes, pausando ou cancelando sem perder o histórico pago."
            themeMode={themeMode}
          />
        ) : (
          subscriptions.map((sub) => {
            const freqLabel = FREQUENCY_LABELS[(sub.frequency as FinFrequency) || 'monthly'] ?? 'Mensal';
            const isCanceled = sub.active === 0 && Boolean(sub.end_date);
            const statusLabel = isCanceled ? 'Cancelada' : sub.active === 1 ? 'Ativa' : 'Pausada';

            return (
              <View
                key={sub.id}
                testID={`subscription-row-${sub.id}`}
                style={[sharedStyles.rowCard, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <View style={styles.rowHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: c.text }]}>{sub.description}</Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>
                      {freqLabel} • Cobrança dia {sub.day_of_month} • {statusLabel}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, { color: c.text }]}>
                    {formatCentsBRL(sub.amount_cents, isPrivacyMode)}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  {sub.active === 1 ? (
                    <TouchableOpacity
                      testID={`subscription-pause-btn-${sub.id}`}
                      accessibilityRole="button"
                      onPress={() => void handlePause(sub.id)}
                      style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                    >
                      <Text style={[styles.actionText, { color: c.warning }]}>Pausar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      testID={`subscription-resume-btn-${sub.id}`}
                      accessibilityRole="button"
                      onPress={() => void handleResume(sub.id)}
                      style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                    >
                      <Text style={[styles.actionText, { color: c.income }]}>Retomar</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    testID={`subscription-cancel-btn-${sub.id}`}
                    accessibilityRole="button"
                    onPress={() => setCancelingId(sub.id)}
                    style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderColor: c.border }]}
                  >
                    <Text style={[styles.actionText, { color: c.expense }]}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <RecurrenceFormSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => void loadData()}
        defaultIsSubscription={true}
        themeMode={themeMode}
      />

      <ConfirmDialog
        visible={Boolean(cancelingId)}
        testID="confirm-dialog"
        confirmTestID="confirm-dialog-confirm"
        title="Cancelar assinatura"
        message="Deseja encerrar esta assinatura? O histórico de pagamentos efetuados será preservado."
        confirmLabel="Cancelar assinatura"
        destructive
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelingId(null)}
        themeMode={themeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    gap: bento.gap,
  },
  summaryCard: {
    flex: 1,
    borderRadius: bento.innerRadius,
    borderWidth: 1,
    padding: bento.tilePadding,
    gap: space.xs,
  },
  summaryLabel: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 17,
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.xs,
  },
  actionText: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 12,
    fontWeight: '600',
  },
});
