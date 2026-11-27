import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatCentsBRL,
  formatYearMonthPtBr,
} from '../../domain/financeFlow';
import {
  monthCloseService,
  type MonthCloseProposal,
} from '../../services/monthCloseService';
import { BentoTile } from '../../components/ui/BentoGrid';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { borders, colors, layout, space, typography } from '../../theme/tokens';
import { getFinUiColors } from './finTheme';

export interface MonthCloseScreenProps {
  yearMonth: string;
  referenceDateIso?: string;
  onBack: () => void;
  onClosedAndContribute: () => void;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

function parseBrlInputToCents(text: string): number {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function formatCentsToInput(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2).replace('.', ',');
}

export const MonthCloseScreen: React.FC<MonthCloseScreenProps> = ({
  yearMonth,
  referenceDateIso,
  onBack,
  onClosedAndContribute,
  isPrivacyMode = false,
  themeMode = 'light',
  testID = 'month-close-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const tileVariant = themeMode === 'light' ? 'light' : 'dark';
  let bottomInset = 0;
  try {
    bottomInset = useSafeAreaInsets().bottom;
  } catch {
    bottomInset = 0;
  }

  const [proposal, setProposal] = useState<MonthCloseProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [investCents, setInvestCents] = useState(0);
  const [amountText, setAmountText] = useState('0,00');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadProposal = useCallback(async () => {
    setLoading(true);
    try {
      const p = await monthCloseService.getProposal(yearMonth, {
        todayIso: referenceDateIso,
      });
      setProposal(p);
      const initialInvest = Math.min(p.suggestedToInvestCents, p.availableSurplus.availableCents);
      setInvestCents(initialInvest);
      setAmountText(formatCentsToInput(initialInvest));
      setSelectedAccountId(p.defaultSourceAccountId ?? '');
    } finally {
      setLoading(false);
    }
  }, [yearMonth, referenceDateIso]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const maxAvailableCents = proposal?.availableSurplus.availableCents ?? 0;
  const clampedInvestCents = Math.max(0, Math.min(investCents, maxAvailableCents));
  const remainingInAccountCents = Math.max(0, maxAvailableCents - clampedInvestCents);

  const handleAmountChange = (text: string) => {
    setAmountText(text);
    const parsed = parseBrlInputToCents(text);
    const clamped = Math.max(0, Math.min(parsed, maxAvailableCents));
    setInvestCents(clamped);
  };

  const handleSelectPercent = (pct: number) => {
    const next = Math.round((maxAvailableCents * pct) / 100);
    setInvestCents(next);
    setAmountText(formatCentsToInput(next));
  };

  const executeContribute = async () => {
    if (!proposal) return;
    if (clampedInvestCents <= 0) {
      setValidationError('Escolha um valor maior que zero para investir ou feche sem aportar.');
      return;
    }
    if (!selectedAccountId) {
      setValidationError('Selecione a conta de onde o aporte vai sair.');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await monthCloseService.closeAndContribute({
        yearMonth,
        amountCents: clampedInvestCents,
        sourceAccountId: selectedAccountId,
      });
      onClosedAndContribute();
    } finally {
      setSubmitting(false);
    }
  };

  const executeKeep = async () => {
    setValidationError(null);
    setSubmitting(true);
    try {
      await monthCloseService.closeWithoutContributing(yearMonth);
      onBack();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmIfAlreadyClosed = (action: () => Promise<void>) => {
    monthCloseService.confirmOrRun(Boolean(proposal?.isAlreadyClosed), () => {
      void action();
    });
  };

  const monthName = formatYearMonthPtBr(yearMonth).split(' ')[0].toLowerCase();

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          testID="month-close-back-btn"
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{`Fechar ${monthName}`}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading || !proposal ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: layout.screenPadding + Math.max(bottomInset, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Bloco do mês */}
          <BentoTile variant={tileVariant} title="RESUMO DO MÊS" testID="month-close-summary-tile">
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: c.muted }]}>Receitas</Text>
              <Text style={[styles.value, { color: c.income }]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(proposal.summary.incomeCents)}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: c.muted }]}>Despesas</Text>
              <Text style={[styles.value, { color: c.expense }]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(proposal.summary.expenseCents)}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: c.muted }]}>Sobra do mês</Text>
              <Text style={[styles.value, { color: c.text }]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(proposal.availableSurplus.surplusCents)}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: c.muted }]}>Contas pendentes (até dia 5)</Text>
              <Text style={[styles.value, { color: c.expense }]}>
                {isPrivacyMode
                  ? PRIVACY_CURRENCY_MASK
                  : `- ${formatCentsBRL(proposal.availableSurplus.pendingCents)}`}
              </Text>
            </View>
            <View style={[styles.rowBetween, styles.dividerTop, { borderTopColor: c.border }]}>
              <Text style={[styles.labelStrong, { color: c.text }]}>Sobra disponível</Text>
              <Text style={[styles.valueStrong, { color: c.income }]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatCentsBRL(maxAvailableCents)}
              </Text>
            </View>
          </BentoTile>

          {/* Tile da reserva */}
          <BentoTile variant={tileVariant} title="RESERVA DE EMERGÊNCIA" testID="month-close-reserve-tile">
            <View style={styles.rowBetween}>
              <Text style={[styles.label, { color: c.muted }]}>Cobertura atual</Text>
              <Text style={[styles.valueStrong, { color: c.text }]}>
                {proposal.reserve.months === null
                  ? '—'
                  : `${proposal.reserve.months.toFixed(1).replace('.', ',')} meses (${proposal.reserve.status})`}
              </Text>
            </View>
            {proposal.reserve.suggestedToReserveCents > 0 ? (
              <Text style={[styles.caption, { color: c.muted }]}>
                {isPrivacyMode
                  ? 'Sugestão: reforçar reserva antes de investir'
                  : `Sugestão: manter ${formatCentsBRL(proposal.reserve.suggestedToReserveCents)} para completar a reserva`}
              </Text>
            ) : null}
          </BentoTile>

          {/* Separar para investir */}
          <BentoTile variant={tileVariant} title="SEPARAR PARA INVESTIR" testID="month-close-split-tile">
            <View style={styles.inputRow}>
              <Text style={[styles.currencyPrefix, { color: c.muted }]}>R$</Text>
              <TextInput
                testID="month-close-amount-input"
                value={amountText}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: c.text, borderColor: c.border }]}
              />
            </View>

            <View style={styles.percentRow}>
              {[0, 25, 50, 75, 100].map((pct) => (
                <TouchableOpacity
                  key={pct}
                  testID={`month-close-pct-${pct}`}
                  onPress={() => handleSelectPercent(pct)}
                  style={[styles.pctChip, { borderColor: c.border, backgroundColor: c.surface }]}
                >
                  <Text style={[styles.pctText, { color: c.text }]}>{`${pct}%`}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text testID="month-close-remaining-text" style={[styles.caption, { color: c.muted }]}>
              {isPrivacyMode
                ? `fica na conta ${PRIVACY_CURRENCY_MASK}`
                : `${formatCentsBRL(remainingInAccountCents)} fica na conta`}
            </Text>
          </BentoTile>

          {/* Chips "Sai de" */}
          <BentoTile variant={tileVariant} title="SAI DE" testID="month-close-source-tile">
            <View style={styles.chipsWrap}>
              {proposal.sourceAccounts.map((acc) => {
                const selected = acc.id === selectedAccountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    testID={`month-close-source-${acc.id}`}
                    onPress={() => setSelectedAccountId(acc.id)}
                    style={[
                      styles.accountChip,
                      {
                        borderColor: selected ? colors.primary : c.border,
                        backgroundColor: selected ? colors.primary : c.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.accountChipText,
                        { color: selected ? '#FFFFFF' : c.text },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BentoTile>

          {/* Próximo passo em Investimentos */}
          <BentoTile variant={tileVariant} title="PRÓXIMO PASSO EM INVESTIMENTOS">
            <Text style={[styles.caption, { color: c.muted }]}>
              O Simulador de aporte será aberto em Investimentos com este valor e conta pré-preenchidos. Nada é lançado até você confirmar lá.
            </Text>
          </BentoTile>

          {/* Ações */}
          {validationError ? (
            <Text style={[styles.caption, { color: c.expense }]}>{validationError}</Text>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity
              testID="month-close-contribute-btn"
              disabled={submitting}
              onPress={() => confirmIfAlreadyClosed(executeContribute)}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryBtnText}>Fechar e aportar em Investimentos ›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="month-close-keep-btn"
              disabled={submitting}
              onPress={() => confirmIfAlreadyClosed(executeKeep)}
              style={[styles.secondaryBtn, { borderColor: c.border }]}
            >
              <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                Fechar o mês sem aportar
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space.md,
    borderBottomWidth: borders.hairline,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.lead,
    fontWeight: typography.weights.bold,
    textTransform: 'capitalize',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: layout.screenPadding,
    gap: space.md,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  dividerTop: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: borders.hairline,
  },
  label: { fontFamily: typography.fontFamily, fontSize: typography.sizes.body },
  labelStrong: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  value: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  valueStrong: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  caption: { fontFamily: typography.fontFamily, fontSize: typography.sizes.caption, marginTop: space.xs },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.xs,
  },
  currencyPrefix: { fontFamily: typography.fontFamily, fontSize: typography.sizes.lead },
  amountInput: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.display,
    borderBottomWidth: borders.hairline,
    paddingVertical: space.xs,
  },
  percentRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  pctChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: borders.radiusPill,
    borderWidth: borders.hairline,
  },
  pctText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  accountChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: borders.radiusPill,
    borderWidth: borders.hairline,
  },
  accountChipText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  actions: {
    gap: space.sm,
    marginTop: space.sm,
  },
  primaryBtn: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: borders.radiusMd,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
    color: colors.parchmentPale,
  },
  secondaryBtn: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
});
