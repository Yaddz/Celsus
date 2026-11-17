import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoGrid,
  BentoRow,
  BentoSection,
  BentoSheetHeader,
  BentoTile,
  FinListCard,
  FinListRow,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import type { FinAccount, FinCategory, FinEntry } from '../../db/schema';
import {
  addMonthsYearMonth,
  availableLimit,
  billDueDate,
  brToIso,
  DEFAULT_CARD_CLOSING_DAY,
  DEFAULT_CARD_DUE_DAY,
  formatCentsBRL,
  formatYearMonthPtBr,
  getBillPeriod,
  getTodayIsoLocal,
  groupBillEntriesByDay,
  hasEstimatedBillDates,
  isoToBr,
  parseBRLToCents,
  resolveBillMonth,
  summarizeBill,
  type BillStatus,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import type { ThemeMode } from '../../theme/palettes';
import { layout, space, typography } from '../../theme/tokens';
import {
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  resolveCategoryVisual,
  sharedStyles,
} from './finTheme';

export interface CardBillScreenProps {
  accountId: string;
  initialBillMonth?: string;
  onBack: () => void;
  onEditCardAccount?: (accountId: string) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

const STATUS_LABELS: Record<BillStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
  atrasada: 'Atrasada',
};

export const CardBillScreen: React.FC<CardBillScreenProps> = ({
  accountId,
  initialBillMonth,
  onBack,
  onEditCardAccount,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'card-bill-screen',
}) => {
  const ui = getFinUiColors(themeMode);
  const tileVariant = ui.isLight ? 'light' : 'dark';
  const todayIso = useMemo(() => getTodayIsoLocal(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<FinAccount | null>(null);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [billMonth, setBillMonth] = useState(
    initialBillMonth ?? todayIso.slice(0, 7)
  );
  const [hasUserSelectedMonth, setHasUserSelectedMonth] = useState(Boolean(initialBillMonth));

  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payFromAccountId, setPayFromAccountId] = useState('');
  const [payAmountText, setPayAmountText] = useState('');
  const [payDateText, setPayDateText] = useState(isoToBr(todayIso));
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allAccounts, allCategories, allEntries] = await Promise.all([
        finRepository.listAccounts(false),
        finRepository.listCategories(true),
        finRepository.listAllEntries(),
      ]);
      const targetCard = allAccounts.find((a) => a.id === accountId) ?? null;
      setCard(targetCard);
      setAccounts(allAccounts.filter((a) => a.type !== 'card'));
      setCategories(allCategories);
      setEntries(allEntries.filter((e) => e.account_id === accountId));

      if (!payFromAccountId) {
        const firstNonCard = allAccounts.find((a) => a.type !== 'card');
        if (firstNonCard) setPayFromAccountId(firstNonCard.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fatura');
    } finally {
      setLoading(false);
    }
  }, [accountId, payFromAccountId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const closingDay = card?.closing_day ?? DEFAULT_CARD_CLOSING_DAY;
  const dueDay = card?.due_day ?? DEFAULT_CARD_DUE_DAY;
  const isEstimatedDates = hasEstimatedBillDates(card);

  const currentBillMonth = useMemo(
    () => resolveBillMonth(todayIso, closingDay, dueDay),
    [todayIso, closingDay, dueDay]
  );

  useEffect(() => {
    if (!hasUserSelectedMonth && card) {
      setBillMonth(currentBillMonth);
    }
  }, [hasUserSelectedMonth, card, currentBillMonth]);

  const normalizedEntries = useMemo(() => {
    return entries.map((e) =>
      e.bill_month ? e : { ...e, bill_month: resolveBillMonth(e.due_date, closingDay, dueDay) }
    );
  }, [entries, closingDay, dueDay]);

  const availableBillMonths = useMemo(() => {
    const months = new Set<string>([currentBillMonth, billMonth]);
    for (const e of normalizedEntries) {
      if (e.bill_month) months.add(e.bill_month);
    }
    return Array.from(months).sort((a, b) => a.localeCompare(b));
  }, [normalizedEntries, currentBillMonth, billMonth]);

  const period = useMemo(
    () => getBillPeriod(billMonth, closingDay, dueDay),
    [billMonth, closingDay, dueDay]
  );

  const dueDate = useMemo(
    () => billDueDate(billMonth, dueDay),
    [billMonth, dueDay]
  );

  const summary = useMemo(
    () =>
      summarizeBill(normalizedEntries, billMonth, {
        dueDate,
        todayIso,
        closingDay: card?.closing_day ?? undefined,
      }),
    [normalizedEntries, billMonth, dueDate, todayIso, card]
  );

  const openBillsTotalCents = useMemo(() => {
    const months = new Set(normalizedEntries.map((e) => e.bill_month).filter(Boolean) as string[]);
    let total = 0;
    for (const ym of months) {
      const s = summarizeBill(normalizedEntries, ym);
      total += s.openCents;
    }
    return total;
  }, [normalizedEntries]);

  const limitAvailableCents = useMemo(
    () => availableLimit(card?.credit_limit_cents, openBillsTotalCents),
    [card, openBillsTotalCents]
  );

  const billEntries = useMemo(
    () =>
      normalizedEntries
        .filter((e) => e.bill_month === billMonth && (e.kind === 'expense' || e.kind === 'income'))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [normalizedEntries, billMonth]
  );

  const billEntryDayGroups = useMemo(
    () => groupBillEntriesByDay(billEntries),
    [billEntries]
  );

  const currentBillSummary = useMemo(
    () =>
      summarizeBill(normalizedEntries, currentBillMonth, {
        dueDate: billDueDate(currentBillMonth, dueDay),
        todayIso,
        closingDay,
      }),
    [normalizedEntries, currentBillMonth, dueDay, todayIso, closingDay]
  );

  const billPayments = useMemo(
    () =>
      normalizedEntries
        .filter((e) => e.bill_month === billMonth && e.kind === 'transfer_in')
        .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [normalizedEntries, billMonth]
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const openPaySheet = () => {
    setPayError(null);
    const defaultCents = summary.openCents > 0 ? summary.openCents : summary.totalCents;
    setPayAmountText((defaultCents / 100).toFixed(2).replace('.', ','));
    setPayDateText(isoToBr(todayIso));
    if (!payFromAccountId && accounts[0]) {
      setPayFromAccountId(accounts[0].id);
    }
    setPaySheetOpen(true);
  };

  const handlePayBill = async () => {
    if (paying) return;
    const amountCents = parseBRLToCents(payAmountText);
    const paidDateIso = brToIso(payDateText);
    if (!payFromAccountId) {
      setPayError('Cadastre uma conta corrente ou carteira para pagar a fatura.');
      return;
    }
    if (amountCents <= 0) {
      setPayError('Informe um valor maior que zero.');
      return;
    }
    if (!paidDateIso) {
      setPayError('Data inválida. Use dd/mm/aaaa.');
      return;
    }

    setPaying(true);
    setPayError(null);
    try {
      await finService.payCardBill({
        cardAccountId: accountId,
        fromAccountId: payFromAccountId,
        billMonth,
        amountCents,
        paidDateIso,
      });
      setPaySheetOpen(false);
      await loadData();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Erro ao pagar fatura');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <FinLoadingView themeMode={themeMode} />;
  }
  if (error) {
    return <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />;
  }

  const statusTone =
    summary.status === 'atrasada'
      ? ui.expense
      : summary.status === 'paga'
      ? ui.income
      : summary.status === 'fechada'
      ? ui.warning
      : ui.primary;

  return (
    <View style={[sharedStyles.screen, { backgroundColor: ui.background }]} testID={testID}>
      <XpMinimalHeader
        title={card?.name ?? 'Fatura do cartão'}
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.tabScreenPaddingX }]}
      >
        <View style={styles.monthRail}>
          <TouchableOpacity
            testID="card-bill-prev-month"
            onPress={() => {
              setHasUserSelectedMonth(true);
              setBillMonth((m) => addMonthsYearMonth(m, -1));
            }}
            style={styles.monthArrow}
          >
            <MaterialIcons name="chevron-left" size={22} color={ui.text} />
          </TouchableOpacity>
          <Text testID="card-bill-month-label" style={[styles.monthLabel, { color: ui.text }]}>
            {formatYearMonthPtBr(billMonth)}
          </Text>
          <TouchableOpacity
            testID="card-bill-next-month"
            onPress={() => {
              setHasUserSelectedMonth(true);
              setBillMonth((m) => addMonthsYearMonth(m, 1));
            }}
            style={styles.monthArrow}
          >
            <MaterialIcons name="chevron-right" size={22} color={ui.text} />
          </TouchableOpacity>
        </View>

        <BentoGrid>
          <BentoTile variant={tileVariant} title="RESUMO DO CARTÃO">
            <View style={{ gap: 4 }}>
              <Text style={[styles.subText, { color: ui.muted }]}>
                Limite total:{' '}
                {card?.credit_limit_cents != null
                  ? formatCentsBRL(card.credit_limit_cents, isPrivacyMode)
                  : '—'}
                {' • '}Disponível:{' '}
                {limitAvailableCents !== null
                  ? formatCentsBRL(limitAvailableCents, isPrivacyMode)
                  : '—'}
              </Text>
              <Text style={[styles.subText, { color: ui.muted }]}>
                Fatura atual ({formatYearMonthPtBr(currentBillMonth)}):{' '}
                {formatCentsBRL(currentBillSummary.totalCents, isPrivacyMode)}
              </Text>
            </View>
            {isEstimatedDates && card ? (
              <View
                testID="card-statement-estimated-warning"
                style={{ marginTop: 8, gap: 4 }}
              >
                <Text style={[styles.subText, { color: ui.warning }]}>
                  Datas estimadas (fecha dia 1, vence dia 10). Configure as datas reais do cartão.
                </Text>
                {onEditCardAccount ? (
                  <TouchableOpacity
                    testID="card-statement-edit-card-shortcut"
                    accessibilityRole="button"
                    onPress={() => onEditCardAccount(card.id)}
                  >
                    <Text style={[styles.subText, { color: ui.primary, fontWeight: '700' }]}>
                      Editar cartão em Contas ›
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </BentoTile>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="card-statement-bill-selector"
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
          >
            {availableBillMonths.map((ym) => {
              const active = ym === billMonth;
              return (
                <TouchableOpacity
                  key={ym}
                  testID={`card-statement-bill-pill-${ym}`}
                  onPress={() => {
                    setHasUserSelectedMonth(true);
                    setBillMonth(ym);
                  }}
                  style={[
                    sharedStyles.chip,
                    {
                      backgroundColor: active ? ui.primary : ui.surface,
                      borderWidth: 1,
                      borderColor: active ? ui.primary : ui.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? ui.primaryFg : ui.text,
                      fontWeight: active ? '700' : '600',
                      fontSize: 12,
                    }}
                  >
                    {formatYearMonthPtBr(ym)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <BentoTile variant={tileVariant} title="FATURA DO MÊS">
            <View style={styles.heroHeader}>
              <Text testID="card-bill-total" style={[styles.heroValue, { color: ui.text }]}>
                {formatCentsBRL(summary.totalCents, isPrivacyMode)}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusTone}22` }]}>
                <Text testID="card-bill-status" style={[styles.statusText, { color: statusTone }]}>
                  {STATUS_LABELS[summary.status]}
                </Text>
              </View>
            </View>
            <Text testID="card-statement-period" style={[styles.subText, { color: ui.muted }]}>
              Período de compras: {isoToBr(period.startIso).slice(0, 5)} a{' '}
              {isoToBr(period.endIso).slice(0, 5)} • Fecha {isoToBr(period.closingIso).slice(0, 5)} • Vence{' '}
              {isoToBr(period.dueIso).slice(0, 5)}
              {isEstimatedDates ? ' (datas estimadas)' : ''}
            </Text>
            <Text style={[styles.subText, { color: ui.muted }]}>
              Vencimento: {isoToBr(dueDate)} • Em aberto: {formatCentsBRL(summary.openCents, isPrivacyMode)}
            </Text>
          </BentoTile>

          <BentoRow>
            <View style={{ flex: 1 }}>
              <BentoTile variant={tileVariant} title="PAGO">
                <Text style={[styles.metricValue, { color: ui.income }]}>
                  {formatCentsBRL(summary.paidCents, isPrivacyMode)}
                </Text>
              </BentoTile>
            </View>
            <View style={{ flex: 1 }}>
              <BentoTile variant={tileVariant} title="EM ABERTO">
                <Text style={[styles.metricValue, { color: ui.text }]}>
                  {formatCentsBRL(summary.openCents, isPrivacyMode)}
                </Text>
              </BentoTile>
            </View>
          </BentoRow>

          <JellyPressable
            testID="card-bill-pay-btn"
            onPress={openPaySheet}
            containerStyle={[styles.payButton, { backgroundColor: ui.primary }]}
          >
            <Text style={[styles.payButtonText, { color: ui.primaryFg }]}>Pagar fatura</Text>
          </JellyPressable>

          <JellyPressable
            testID="card-bill-import-btn"
            onPress={() => setImportSheetOpen(true)}
            containerStyle={[
              styles.payButton,
              { backgroundColor: ui.surface, borderWidth: 1, borderColor: ui.border },
            ]}
          >
            <Text style={[styles.payButtonText, { color: ui.text }]}>
              Importar fatura ou extrato
            </Text>
          </JellyPressable>

          <BentoSection title={`COMPRAS DA FATURA (${billEntries.length})`} themeMode={themeMode}>
            {billEntries.length === 0 ? (
              <FinEmptyState
                testID="card-bill-empty-state"
                icon="credit-card"
                title="Sem compras nesta fatura"
                subtitle="Lançamentos feitos neste cartão aparecerão aqui."
                themeMode={themeMode}
              />
            ) : (
              <View style={{ gap: space.sm }}>
                {billEntryDayGroups.map((group) => (
                  <View
                    key={group.dateIso}
                    testID={`card-statement-day-${group.dateIso}`}
                    style={{ gap: 6 }}
                  >
                    <Text style={[styles.subText, { color: ui.muted, fontWeight: '700' }]}>
                      {isoToBr(group.dateIso)}
                    </Text>
                    <FinListCard themeMode={themeMode}>
                      {group.entries.map((entry, idx) => {
                        const cat = categoryMap.get(entry.category_id);
                        const visual = resolveCategoryVisual(cat);
                        const subtitleParts = [cat?.name ?? 'Sem categoria'];
                        if (entry.installment_number && entry.installment_total) {
                          subtitleParts.push(`Parcela ${entry.installment_number}/${entry.installment_total}`);
                        }
                        if (entry.kind === 'income') {
                          subtitleParts.push('Estorno');
                        }
                        const amountStr =
                          entry.kind === 'income'
                            ? `+${formatCentsBRL(entry.amount_cents, isPrivacyMode)}`
                            : `-${formatCentsBRL(entry.amount_cents, isPrivacyMode)}`;

                        return (
                          <FinListRow
                            key={entry.id}
                            testID={`card-bill-entry-${entry.id}`}
                            themeMode={themeMode}
                            isLast={idx === group.entries.length - 1}
                            icon={visual.icon as any}
                            avatarColor={visual.color}
                            iconColor={visual.iconColor}
                            title={entry.description || cat?.name || 'Compra'}
                            subtitle={subtitleParts.join(' • ')}
                            amountText={amountStr}
                            amountColor={entry.kind === 'income' ? ui.income : ui.text}
                          />
                        );
                      })}
                    </FinListCard>
                  </View>
                ))}
              </View>
            )}
          </BentoSection>

          {billPayments.length > 0 ? (
            <BentoSection title={`PAGAMENTOS (${billPayments.length})`} themeMode={themeMode}>
              <FinListCard themeMode={themeMode}>
                {billPayments.map((p, idx) => (
                  <FinListRow
                    key={p.id}
                    themeMode={themeMode}
                    isLast={idx === billPayments.length - 1}
                    icon="check-circle"
                    avatarColor={ui.income}
                    iconColor={ui.avatarIconDark}
                    title={p.description}
                    subtitle={isoToBr(p.paid_date ?? p.due_date)}
                    amountText={`+${formatCentsBRL(p.paid_amount_cents ?? p.amount_cents, isPrivacyMode)}`}
                    amountColor={ui.income}
                  />
                ))}
              </FinListCard>
            </BentoSection>
          ) : null}
        </BentoGrid>
      </ScrollView>

      <AnimatedModalSheet
        visible={paySheetOpen}
        onClose={() => setPaySheetOpen(false)}
        themeMode={themeMode}
      >
        <View style={styles.sheetBody}>
          <BentoSheetHeader
            title="Pagar fatura"
            subtitle={`${card?.name ?? 'Cartão'} • ${formatYearMonthPtBr(billMonth)}`}
            onClose={() => setPaySheetOpen(false)}
            themeMode={themeMode}
          />

          <Text style={[styles.fieldLabel, { color: ui.muted }]}>CONTA PAGADORA</Text>
          <View style={styles.chipsRow}>
            {accounts.map((acc) => {
              const selected = acc.id === payFromAccountId;
              return (
                <TouchableOpacity
                  key={acc.id}
                  testID={`bill-pay-account-${acc.id}`}
                  onPress={() => setPayFromAccountId(acc.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? ui.primary : ui.surfaceElevated,
                      borderColor: selected ? ui.primary : ui.border,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? ui.primaryFg : ui.text, fontFamily: typography.fontFamily, fontSize: 12 }}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextField
            testID="bill-pay-amount-input"
            label="Valor do pagamento (R$)"
            value={payAmountText}
            onChangeText={setPayAmountText}
            keyboardType="decimal-pad"
            themeMode={themeMode}
          />

          <TextField
            testID="bill-pay-date-input"
            label="Data do pagamento (dd/mm/aaaa)"
            value={payDateText}
            onChangeText={setPayDateText}
            themeMode={themeMode}
          />

          {payError ? (
            <Text style={[styles.errorText, { color: ui.expense }]}>{payError}</Text>
          ) : null}

          <JellyPressable
            testID="bill-pay-confirm-btn"
            onPress={() => {
              void handlePayBill();
            }}
            containerStyle={[styles.payButton, { backgroundColor: ui.primary, opacity: paying ? 0.6 : 1 }]}
          >
            <Text style={[styles.payButtonText, { color: ui.primaryFg }]}>
              {paying ? 'Registrando...' : 'Confirmar pagamento'}
            </Text>
          </JellyPressable>
        </View>
      </AnimatedModalSheet>

      <StatementImportSheet
        visible={importSheetOpen}
        onClose={() => setImportSheetOpen(false)}
        initialAccountId={accountId}
        onCompleted={() => {
          void loadData();
        }}
        themeMode={themeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 120,
    gap: 12,
  },
  monthRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  monthArrow: {
    padding: 8,
  },
  monthLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 28,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  subText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 2,
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
  },
  payButton: {
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  payButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetBody: {
    padding: space.lg,
    gap: 12,
  },
  fieldLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
});
