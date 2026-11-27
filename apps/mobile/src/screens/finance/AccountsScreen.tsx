import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AnimatedModalSheet,
  BentoGrid,
  BentoSection,
  BentoSheetHeader,
  FinListCard,
  FinListRow,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinBill, FinEntry, Portfolio } from '../../db/schema';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { centsToDecimal } from '../../domain/money';
import {
  billDueDate,
  calculateAccountBalance,
  formatCentsBRL,
  getTodayIsoLocal,
  monthlyAccountFlows,
  parseBRLToCents,
  resolveBillMonth,
  summarizeBill,
  summarizeCardAccountForScreen,
  type FinAccountType,
} from '../../domain/financeFlow';
import { summarizeOpenFinanceBill } from '../../domain/openFinance/cardBills';
import {
  computeBalanceDivergence,
  formatReportedBalanceDate,
} from '../../domain/openFinance';
import { finRepository } from '../../repositories/finRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import type { ThemeMode } from '../../theme/palettes';
import { space, typography } from '../../theme/tokens';
import {
  FIN_COLOR_SWATCHES,
  FinFloatingAddButton,
  formatSignedCentsBRL,
  getFinUiColors,
  sharedStyles,
  resolveApprovedColor,
} from './finTheme';
import { FinHeroTile } from '../../components/ui/FinHeroTile';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/ScreenStates';

export interface AccountsScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  onAvatarPress?: () => void;
  userName?: string;
  userInitials?: string;
  onOpenCardBill?: (accountId: string) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  hideFab?: boolean;
  testID?: string;
}

const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  checking: 'Conta corrente',
  cash: 'Carteira',
  card: 'Cartão',
  broker: 'Corretora',
};

function getAccountIcon(
  type: string
): 'account-balance' | 'account-balance-wallet' | 'credit-card' | 'trending-up' {
  if (type === 'cash') return 'account-balance-wallet';
  if (type === 'card') return 'credit-card';
  if (type === 'broker') return 'trending-up';
  return 'account-balance';
}

function getCurrentYearMonth(): string {
  return getTodayIsoLocal().slice(0, 7);
}

export const AccountsScreen: React.FC<AccountsScreenProps> = ({
  onBack,
  onSwitchModule,
  onAvatarPress,
  userName,
  userInitials,
  onOpenCardBill,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  hideFab = false,
  testID = 'accounts-screen',
}) => {
  const insets = useSafeAreaInsets();
  const ui = getFinUiColors(themeMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [bills, setBills] = useState<FinBill[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinAccount | null>(null);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<FinAccountType>('checking');
  const [balanceText, setBalanceText] = useState('0,00');
  const [closingDayText, setClosingDayText] = useState('10');
  const [dueDayText, setDueDayText] = useState('17');
  const [creditLimitText, setCreditLimitText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [linkedPortfolioIds, setLinkedPortfolioIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accs, allEntries, allBills, allPortfolios] = await Promise.all([
        finRepository.listAccounts(true),
        finRepository.listAllEntries(),
        finRepository.listAllBills(),
        portfolioRepository.listPortfolios(false),
      ]);
      setAccounts(accs);
      setEntries(allEntries);
      setBills(allBills);
      setPortfolios(allPortfolios);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar contas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentYm = useMemo(() => getCurrentYearMonth(), []);

  const balanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, calculateAccountBalance(acc.initial_balance_cents, entries, acc.id));
    }
    return map;
  }, [accounts, entries]);

  const entryCountByAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(entry.account_id, (map.get(entry.account_id) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const cardMonthSpendMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.of_removed_at) continue;
      if (entry.kind !== 'expense') continue;
      if (!entry.due_date || !entry.due_date.startsWith(currentYm)) continue;
      const cents =
        entry.status === 'paid'
          ? entry.paid_amount_cents ?? entry.amount_cents
          : entry.amount_cents;
      map.set(entry.account_id, (map.get(entry.account_id) ?? 0) + cents);
    }
    return map;
  }, [entries, currentYm]);

  const monthDeltaMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, 0);
    }
    for (const entry of entries) {
      if (entry.of_removed_at) continue;
      if (entry.status !== 'paid') continue;
      if (!entry.due_date || !entry.due_date.startsWith(currentYm)) continue;
      const cents = entry.paid_amount_cents ?? entry.amount_cents;
      const signed = entry.kind === 'income' ? cents : -cents;
      map.set(entry.account_id, (map.get(entry.account_id) ?? 0) + signed);
    }
    return map;
  }, [accounts, entries, currentYm]);

  const activeNonCardAccounts = useMemo(
    () => accounts.filter((a) => a.archived === 0 && a.type !== 'card'),
    [accounts]
  );
  const activeBankAndCashAccounts = useMemo(
    () => activeNonCardAccounts.filter((a) => a.type !== 'broker'),
    [activeNonCardAccounts]
  );
  const activeBrokerAccounts = useMemo(
    () => activeNonCardAccounts.filter((a) => a.type === 'broker'),
    [activeNonCardAccounts]
  );
  const linkedPortfoliosByAccountId = useMemo(() => {
    const map = new Map<string, Portfolio[]>();
    for (const p of portfolios) {
      if (!p.fin_account_id) continue;
      const arr = map.get(p.fin_account_id) ?? [];
      arr.push(p);
      map.set(p.fin_account_id, arr);
    }
    return map;
  }, [portfolios]);
  const activeCardAccounts = useMemo(
    () => accounts.filter((a) => a.archived === 0 && a.type === 'card'),
    [accounts]
  );
  const archivedAccounts = useMemo(
    () => accounts.filter((a) => a.archived === 1),
    [accounts]
  );

  const totalBalanceCents = useMemo(
    () => activeNonCardAccounts.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0),
    [activeNonCardAccounts, balanceMap]
  );

  const openCreateModal = () => {
    setEditingAccount(null);
    setName('');
    setAccountType('checking');
    setBalanceText('0,00');
    setClosingDayText('10');
    setDueDayText('17');
    setCreditLimitText('');
    setSelectedColor(FIN_COLOR_SWATCHES[0]);
    setLinkedPortfolioIds([]);
    setFormOpen(true);
  };

  const openEditModal = (acc: FinAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setAccountType((acc.type as FinAccountType) || 'checking');
    const absFormatted = centsToDecimal(Math.abs(acc.initial_balance_cents)).toFixed(2).replace('.', ',');
    setBalanceText(acc.initial_balance_cents < 0 ? `-${absFormatted}` : absFormatted);
    setClosingDayText(acc.closing_day != null ? String(acc.closing_day) : '10');
    setDueDayText(acc.due_day != null ? String(acc.due_day) : '17');
    setCreditLimitText(
      acc.credit_limit_cents != null
        ? centsToDecimal(acc.credit_limit_cents).toFixed(2).replace('.', ',')
        : ''
    );
    setSelectedColor(resolveApprovedColor(acc.color, FIN_COLOR_SWATCHES[0]));
    setLinkedPortfolioIds(
      portfolios.filter((p) => p.fin_account_id === acc.id).map((p) => p.id)
    );
    setFormOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const initialCents = parseBRLToCents(balanceText);
      const isCard = accountType === 'card';
      const parsedClosing = Number.parseInt(closingDayText, 10);
      const parsedDue = Number.parseInt(dueDayText, 10);
      const closingDay = isCard
        ? Math.max(1, Math.min(31, Number.isFinite(parsedClosing) ? parsedClosing : 10))
        : null;
      const dueDay = isCard
        ? Math.max(1, Math.min(31, Number.isFinite(parsedDue) ? parsedDue : 17))
        : null;
      const creditLimitCents =
        isCard && creditLimitText.trim().length > 0 ? parseBRLToCents(creditLimitText) : null;

      let savedAccountId: string;
      if (editingAccount) {
        const isOpenFinance = editingAccount.source === 'OPEN_FINANCE';
        await finRepository.updateAccount(editingAccount.id, {
          name: trimmed,
          type: accountType,
          initial_balance_cents: isOpenFinance
            ? editingAccount.initial_balance_cents
            : initialCents,
          color: selectedColor,
          closing_day: closingDay,
          due_day: dueDay,
          credit_limit_cents: creditLimitCents,
        });
        savedAccountId = editingAccount.id;
      } else {
        const created = await finRepository.createAccount({
          name: trimmed,
          type: accountType,
          initialBalanceCents: initialCents,
          color: selectedColor,
          closingDay,
          dueDay,
          creditLimitCents,
        });
        savedAccountId = created.id;
      }

      if (accountType === 'broker' || accountType === 'checking' || accountType === 'cash') {
        const selectedSet = new Set(linkedPortfolioIds);
        for (const p of portfolios) {
          const isSelected = selectedSet.has(p.id);
          if (isSelected && p.fin_account_id !== savedAccountId) {
            await portfolioRepository.linkFinAccount(p.id, savedAccountId);
            await appMetaRepository.set(`broker-link:manual:${p.id}`, '1');
          } else if (!isSelected && p.fin_account_id === savedAccountId) {
            await portfolioRepository.linkFinAccount(p.id, null);
          }
        }
      } else if (editingAccount) {
        for (const p of portfolios) {
          if (p.fin_account_id === savedAccountId) {
            await portfolioRepository.linkFinAccount(p.id, null);
          }
        }
      }

      setFormOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (acc: FinAccount) => {
    await finRepository.archiveAccount(acc.id);
    await loadData();
  };

  const handleRestore = async (acc: FinAccount) => {
    await finRepository.updateAccount(acc.id, { archived: 0 });
    await loadData();
  };

  const renderAccountRow = (acc: FinAccount, isLast: boolean, isArchived: boolean) => {
    const isCard = acc.type === 'card';
    const isOpenFinance = acc.source === 'OPEN_FINANCE';
    const todayIso = getTodayIsoLocal();

    let currentBillSummary: ReturnType<typeof summarizeBill> | null = null;
    let availLimitCents: number | null = null;
    let futureBillsCents = 0;
    let closedUnpaidCents = 0;

    if (isCard && isOpenFinance) {
      const cardEntries = entries
        .filter((e) => e.account_id === acc.id && !e.of_removed_at)
        .map((e) =>
          e.bill_month
            ? e
            : { ...e, bill_month: resolveBillMonth(e.due_date, acc.closing_day ?? 1, acc.due_day) }
        );
      const cardBills = bills
        .filter((b) => b.account_id === acc.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      const closedMonths = new Set(cardBills.map((b) => b.bill_month));
      const currentBillMonth = resolveBillMonth(todayIso, acc.closing_day ?? 1, acc.due_day);
      currentBillSummary = summarizeBill(cardEntries, currentBillMonth, {
        dueDate: billDueDate(currentBillMonth, acc.due_day ?? 10),
        todayIso,
        closingDay: acc.closing_day ?? undefined,
      });
      availLimitCents = acc.of_available_limit_cents ?? null;

      for (let i = 0; i < cardBills.length; i += 1) {
        const b = cardBills[i];
        const nextB = i + 1 < cardBills.length ? cardBills[i + 1] : null;
        const ofSum = summarizeOpenFinanceBill(b, nextB, cardEntries, todayIso, {
          firstSyncIso: acc.of_linked_at,
        });
        if (ofSum.status === 'fechada' || ofSum.status === 'parcial' || ofSum.status === 'atrasada') {
          closedUnpaidCents += Math.max(0, ofSum.totalCents - ofSum.paidCents);
        }
      }

      const entryMonths = new Set(cardEntries.map((e) => e.bill_month).filter(Boolean) as string[]);
      for (const bm of entryMonths) {
        if (bm > currentBillMonth && !closedMonths.has(bm)) {
          futureBillsCents += summarizeBill(cardEntries, bm).totalCents;
        }
      }
    } else if (isCard) {
      const cardScreenSummary = summarizeCardAccountForScreen(acc, entries, todayIso);
      currentBillSummary = cardScreenSummary.currentBillSummary;
      availLimitCents = cardScreenSummary.availLimitCents;
    }

    const calculatedBalance = isCard
      ? currentBillSummary?.openCents ?? cardMonthSpendMap.get(acc.id) ?? 0
      : balanceMap.get(acc.id) ?? 0;
    const hasReportedBalance = isOpenFinance && acc.reported_balance_cents != null;
    const balance = hasReportedBalance
      ? (acc.reported_balance_cents as number)
      : calculatedBalance;
    const divergence =
      hasReportedBalance && !isCard
        ? computeBalanceDivergence(acc.reported_balance_cents, calculatedBalance)
        : { hasDivergence: false, diffCents: 0 };
    const monthDelta = monthDeltaMap.get(acc.id) ?? 0;
    const entryCount = entryCountByAccount.get(acc.id) ?? 0;
    const avatarColor = isArchived
      ? ui.inactiveAvatarBg
      : resolveApprovedColor(acc.color, ui.circleBtnIcon);
    const iconColor = isArchived
      ? ui.avatarIconDark
      : avatarColor === ui.chipActiveBg
      ? ui.chipActiveText
      : ui.avatarIconDark;
    const typeLabel = ACCOUNT_TYPE_LABELS[(acc.type as FinAccountType) || 'checking'] ?? 'Conta';
    const actionBorder = ui.actionBorder;

    const reportedDateLabel =
      !isCard && hasReportedBalance && acc.reported_balance_at
        ? formatReportedBalanceDate(acc.reported_balance_at)
        : null;

    const creditUsedCents = isCard ? acc.credit_used_cents ?? acc.reported_balance_cents ?? null : null;
    const openBillCents = isCard ? currentBillSummary?.totalCents ?? 0 : 0;

    let checkingExtraParts: string[] = [];
    if (!isCard && isOpenFinance && !isArchived) {
      const accEntries = entries.filter((e) => e.account_id === acc.id && !e.of_removed_at);
      let processingCents = 0;
      let scheduledPayCents = 0;
      let scheduledReceiveCents = 0;
      for (const e of accEntries) {
        if (e.status !== 'pending') continue;
        if (e.of_class_reason === 'PROCESSING') {
          processingCents += e.amount_cents;
        } else if (e.of_class_reason === 'SCHEDULED') {
          if (e.kind === 'expense' || e.kind === 'transfer_out') {
            scheduledPayCents += e.amount_cents;
          } else {
            scheduledReceiveCents += e.amount_cents;
          }
        }
      }
      if (processingCents > 0) {
        checkingExtraParts.push(`Em processamento ${formatCentsBRL(processingCents, isPrivacyMode)}`);
      }
      if (scheduledPayCents > 0 || scheduledReceiveCents > 0) {
        const schedParts: string[] = [];
        if (scheduledPayCents > 0) {
          schedParts.push(`−${formatCentsBRL(scheduledPayCents, isPrivacyMode)} a pagar`);
        }
        if (scheduledReceiveCents > 0) {
          schedParts.push(`+${formatCentsBRL(scheduledReceiveCents, isPrivacyMode)} a receber`);
        }
        checkingExtraParts.push(`Agendado: ${schedParts.join(' · ')}`);
      }
      if (acc.of_overdraft_used_cents != null && acc.of_overdraft_used_cents > 0) {
        checkingExtraParts.push(
          `Cheque especial usado ${formatCentsBRL(acc.of_overdraft_used_cents, isPrivacyMode)}`
        );
      }
      if (acc.of_reserved_cents != null && acc.of_reserved_cents > 0) {
        checkingExtraParts.push(
          `Reservado (caixinhas) ${formatCentsBRL(acc.of_reserved_cents, isPrivacyMode)}`
        );
      }
      if (acc.closing_balance_cents != null && acc.closing_balance_cents !== balance) {
        checkingExtraParts.push(
          `Saldo contábil ${formatCentsBRL(acc.closing_balance_cents, isPrivacyMode)}`
        );
      }
      const flowMonth = todayIso.slice(0, 7);
      const flows = monthlyAccountFlows(entries, acc.id, flowMonth);
      if (flows.count > 0) {
        checkingExtraParts.push(
          `Entradas ${formatCentsBRL(flows.inflowCents, isPrivacyMode)} · Saídas ${formatCentsBRL(
            flows.outflowCents,
            isPrivacyMode
          )} em ${flowMonth}`
        );
      }
    }

    const linkedForBroker =
      acc.type === 'broker' ? linkedPortfoliosByAccountId.get(acc.id) ?? [] : [];
    const brokerPortfoliosLabel =
      acc.type === 'broker'
        ? linkedForBroker.length > 0
          ? `Carteiras: ${linkedForBroker.map((p) => p.name).join(', ')}`
          : 'Nenhuma carteira vinculada'
        : null;

    const baseSubtitle = isArchived
      ? undefined
      : isCard && isOpenFinance
      ? [
          creditUsedCents !== null
            ? `Limite usado ${formatCentsBRL(creditUsedCents, isPrivacyMode)}`
            : null,
          `Disponível ${
            availLimitCents !== null ? formatCentsBRL(availLimitCents, isPrivacyMode) : '—'
          }`,
          `Fatura atual ${formatCentsBRL(openBillCents, isPrivacyMode)}`,
          futureBillsCents > 0
            ? `Próximas ${formatCentsBRL(futureBillsCents, isPrivacyMode)}`
            : null,
          closedUnpaidCents > 0
            ? `Fechada a pagar ${formatCentsBRL(closedUnpaidCents, isPrivacyMode)}`
            : null,
          `Venc. dia ${acc.due_day ?? '—'}`,
        ]
          .filter(Boolean)
          .join(' • ')
      : isCard
      ? `Fatura atual • Venc. dia ${acc.due_day ?? '—'} • Limite disp. ${
          availLimitCents !== null ? formatCentsBRL(availLimitCents, isPrivacyMode) : '—'
        }`
      : [
          `${typeLabel} • ${entryCount} ${entryCount === 1 ? 'lançamento' : 'lançamentos'}`,
          brokerPortfoliosLabel,
          ...checkingExtraParts,
        ]
          .filter(Boolean)
          .join(' • ');

    const subtitle =
      baseSubtitle && reportedDateLabel
        ? `${baseSubtitle} • ${reportedDateLabel}`
        : baseSubtitle;

    const deltaText =
      isCard || isArchived
        ? undefined
        : isPrivacyMode
        ? '•••• no mês'
        : monthDelta === 0
        ? 'sem variação'
        : `${formatSignedCentsBRL(Math.abs(monthDelta), monthDelta >= 0 ? 'income' : 'expense', false)} no mês`;

    const deltaColor =
      monthDelta === 0 ? ui.muted : monthDelta > 0 ? ui.income : ui.expense;

    return (
      <FinListRow
        key={acc.id}
        testID={`account-row-${acc.id}`}
        icon={getAccountIcon(acc.type)}
        avatarColor={avatarColor}
        iconColor={iconColor}
        title={acc.name}
        subtitle={subtitle}
        amountText={isArchived ? undefined : formatCentsBRL(balance, isPrivacyMode)}
        amountColor={isCard || balance < 0 ? ui.expense : ui.text}
        rightSubtitle={deltaText}
        rightSubtitleColor={deltaColor}
        isLast={isLast}
        themeMode={themeMode}
        onPress={() => {
          if (isCard && !isArchived && onOpenCardBill) {
            onOpenCardBill(acc.id);
          } else {
            openEditModal(acc);
          }
        }}
        bottomContent={
          <View style={styles.rowActions} testID={`account-actions-${acc.id}`}>
            {isOpenFinance ? (
              <View
                testID={`account-of-badge-${acc.id}`}
                style={[styles.actionBtn, { borderColor: ui.income }]}
              >
                <Text style={[styles.actionBtnText, { color: ui.income }]}>Open Finance</Text>
              </View>
            ) : null}
            {divergence.hasDivergence ? (
              <View
                testID={`account-balance-diff-${acc.id}`}
                style={[styles.actionBtn, { borderColor: actionBorder }]}
              >
                <Text style={[styles.actionBtnText, { color: ui.muted }]}>
                  Dif. calculado: {formatCentsBRL(Math.abs(divergence.diffCents), isPrivacyMode)}
                </Text>
              </View>
            ) : null}
            {isOpenFinance && isCard && acc.closing_day == null ? (
              <TouchableOpacity
                testID={`account-missing-closing-day-${acc.id}`}
                accessibilityRole="button"
                onPress={() => openEditModal(acc)}
                style={[styles.actionBtn, { borderColor: ui.expense }]}
              >
                <Text style={[styles.actionBtnText, { color: ui.expense }]}>
                  Informar fechamento
                </Text>
              </TouchableOpacity>
            ) : null}
            {isArchived ? (
              <TouchableOpacity
                testID={`account-restore-btn-${acc.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Restaurar ${acc.name}`}
                onPress={() => void handleRestore(acc)}
                style={[styles.actionBtn, { borderColor: actionBorder }]}
              >
                <Text style={[styles.actionBtnText, { color: ui.circleBtnIcon }]}>Restaurar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                testID={`account-archive-btn-${acc.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Arquivar ${acc.name}`}
                onPress={() => void handleArchive(acc)}
                style={[styles.actionBtn, { borderColor: actionBorder }]}
              >
                <Text style={[styles.actionBtnText, { color: ui.muted }]}>Arquivar</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    );
  };

  const nonCardCount = activeNonCardAccounts.length;
  const totalCaption = `${nonCardCount} ${nonCardCount === 1 ? 'conta ativa' : 'contas ativas'} • cartões ficam fora do saldo`;

  return (
    <View style={[styles.container, { backgroundColor: ui.background }]} testID={testID}>
      <XpMinimalHeader
        module="finance"
        title="Contas"
        subtitle="Onde está o seu dinheiro"
        onBack={onAvatarPress ? undefined : onBack}
        onAvatarPress={onAvatarPress}
        userName={userName}
        userInitials={userInitials}
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
        <ScrollView testID="accounts-scroll" contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: dockContentPaddingBottom(insets.bottom, { withFab: true }) }]} showsVerticalScrollIndicator={false}>
          <BentoGrid>
            <View testID="accounts-total-tile">
              <FinHeroTile
                variant="primary"
                label="SALDO TOTAL"
                testID="accounts-total-balance-tile"
                value={formatCentsBRL(totalBalanceCents, false)}
                valueTestID="accounts-total-balance-value"
                support={totalCaption}
                isPrivacyMode={isPrivacyMode}
                themeMode={themeMode}
              />
            </View>
          </BentoGrid>

          {accounts.length === 0 ? (
            <EmptyState
              testID="accounts-empty-state"
              icon="account-balance-wallet"
              title="Nenhuma conta cadastrada"
              subtitle="Adicione sua conta corrente, carteira ou cartão para acompanhar os saldos."
              actionLabel="Nova conta"
              onAction={openCreateModal}
              themeMode={themeMode}
            />
          ) : (
            <>
              {activeBankAndCashAccounts.length > 0 && (
                <FinListCard
                  title="CONTAS"
                  testID="accounts-section-checking"
                  themeMode={themeMode}
                >
                  {activeBankAndCashAccounts.map((acc, idx) =>
                    renderAccountRow(acc, idx === activeBankAndCashAccounts.length - 1, false)
                  )}
                </FinListCard>
              )}

              {activeBrokerAccounts.length > 0 && (
                <FinListCard
                  title="CORRETORAS"
                  testID="accounts-section-brokers"
                  themeMode={themeMode}
                >
                  {activeBrokerAccounts.map((acc, idx) =>
                    renderAccountRow(acc, idx === activeBrokerAccounts.length - 1, false)
                  )}
                </FinListCard>
              )}

              {activeCardAccounts.length > 0 && (() => {
                const ofCards = activeCardAccounts.filter((a) => a.source === 'OPEN_FINANCE');
                const cardsDebtCents = ofCards.reduce(
                  (sum, a) => sum + (a.credit_used_cents ?? a.reported_balance_cents ?? 0),
                  0
                );
                const cardsLimitCents = ofCards.reduce(
                  (sum, a) => sum + (a.credit_limit_cents ?? 0),
                  0
                );
                const cardsUsagePct =
                  cardsLimitCents > 0 ? Math.round((cardsDebtCents / cardsLimitCents) * 100) : 0;
                return (
                  <FinListCard
                    title="CARTÕES"
                    testID="accounts-section-cards"
                    themeMode={themeMode}
                  >
                    {ofCards.length > 0 && cardsLimitCents > 0 ? (
                      <Text
                        testID="accounts-cards-total-summary"
                        style={[
                          {
                            color: ui.muted,
                            fontSize: typography.labelMd.fontSize,
                            paddingHorizontal: space.md,
                            paddingTop: space.xs,
                            paddingBottom: space.sm,
                          },
                        ]}
                      >
                        Total nos cartões {formatCentsBRL(cardsDebtCents, isPrivacyMode)} · {cardsUsagePct}% do limite de {formatCentsBRL(cardsLimitCents, isPrivacyMode)}
                      </Text>
                    ) : null}
                    {activeCardAccounts.map((acc, idx) =>
                      renderAccountRow(acc, idx === activeCardAccounts.length - 1, false)
                    )}
                  </FinListCard>
                );
              })()}

              {archivedAccounts.length > 0 && (
                <FinListCard
                  title={`ARQUIVADAS · ${archivedAccounts.length}`}
                  testID="accounts-section-archived"
                  cardStyle={styles.archivedCard}
                  themeMode={themeMode}
                >
                  {archivedAccounts.map((acc, idx) =>
                    renderAccountRow(acc, idx === archivedAccounts.length - 1, true)
                  )}
                </FinListCard>
              )}
            </>
          )}
        </ScrollView>
      )}

      {!hideFab ? (
        <FinFloatingAddButton
          testID="accounts-add-btn"
          accessibilityLabel="Nova conta"
          onPress={openCreateModal}
        />
      ) : null}

      <AnimatedModalSheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        themeMode={themeMode}
      >
        <BentoSheetHeader
          title={editingAccount ? 'Editar conta' : 'Nova conta'}
          onClose={() => setFormOpen(false)}
          themeMode={themeMode}
        />

        <View style={styles.sheetBody}>
          <SegmentedControl
            themeMode={themeMode}
            options={[
              { id: 'checking', label: 'Conta' },
              { id: 'cash', label: 'Carteira' },
              { id: 'card', label: 'Cartão' },
              { id: 'broker', label: 'Corretora' },
            ]}
            value={accountType}
            onChange={(v) => setAccountType(v as FinAccountType)}
          />

          <BentoSection title="NOME DA CONTA" themeMode={themeMode}>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Ex: Nubank, Carteira"
              themeMode={themeMode}
              testID="account-form-name-input"
            />
          </BentoSection>

          <BentoSection title="SALDO INICIAL" themeMode={themeMode}>
            <LedgerInput
              value={balanceText}
              onChangeText={setBalanceText}
              prefix="R$"
              themeMode={themeMode}
              disabled={Boolean(editingAccount && editingAccount.source === 'OPEN_FINANCE')}
              helper={
                editingAccount && editingAccount.source === 'OPEN_FINANCE'
                  ? 'Conta sincronizada via Open Finance não permite editar o saldo inicial.'
                  : undefined
              }
              testID="account-form-balance-input"
            />
          </BentoSection>

          {accountType === 'broker' || accountType === 'checking' || accountType === 'cash' ? (
            <BentoSection title="CARTEIRAS VINCULADAS" themeMode={themeMode}>
              {portfolios.length === 0 ? (
                <Text style={{ color: ui.muted, fontSize: typography.sizes.body }}>
                  Nenhuma carteira cadastrada.
                </Text>
              ) : (
                portfolios.map((p) => {
                  const selected = linkedPortfolioIds.includes(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      testID={`account-form-portfolio-${p.id}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setLinkedPortfolioIds((prev) =>
                          prev.includes(p.id)
                            ? prev.filter((id) => id !== p.id)
                            : [...prev, p.id]
                        );
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.sm,
                        paddingVertical: space.xs,
                      }}
                    >
                      <MaterialIcons
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={20}
                        color={selected ? ui.primary : ui.muted}
                      />
                      <Text style={{ color: ui.text, fontSize: typography.sizes.body }}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </BentoSection>
          ) : null}

          {accountType === 'card' ? (
            <>
              <BentoSection title="DIA DE FECHAMENTO (1–31)" themeMode={themeMode}>
                <TextField
                  value={closingDayText}
                  onChangeText={setClosingDayText}
                  keyboardType="number-pad"
                  placeholder="10"
                  themeMode={themeMode}
                  testID="account-closing-day-input"
                />
              </BentoSection>

              <BentoSection title="DIA DE VENCIMENTO (1–31)" themeMode={themeMode}>
                <TextField
                  value={dueDayText}
                  onChangeText={setDueDayText}
                  keyboardType="number-pad"
                  placeholder="17"
                  themeMode={themeMode}
                  testID="account-due-day-input"
                />
              </BentoSection>

              <BentoSection title="LIMITE DO CARTÃO (OPCIONAL)" themeMode={themeMode}>
                <LedgerInput
                  value={creditLimitText}
                  onChangeText={setCreditLimitText}
                  prefix="R$"
                  themeMode={themeMode}
                  testID="account-credit-limit-input"
                />
              </BentoSection>
            </>
          ) : null}

          <BentoSection title="COR" themeMode={themeMode}>
            <View style={styles.swatchRow}>
              {FIN_COLOR_SWATCHES.map((swatch) => {
                const selected = selectedColor === swatch;
                return (
                  <TouchableOpacity
                    key={swatch}
                    accessibilityRole="button"
                    accessibilityLabel={`Selecionar cor ${swatch}`}
                    onPress={() => setSelectedColor(swatch)}
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch },
                      selected && { borderWidth: 2, borderColor: ui.selectionBorder },
                    ]}
                  />
                );
              })}
            </View>
          </BentoSection>

          <JellyPressable
            testID="account-form-save-btn"
            onPress={() => void handleSave()}
            containerStyle={styles.saveBtn}
            accessibilityLabel="Salvar conta"
          >
            <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar conta'}</Text>
          </JellyPressable>
        </View>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.sm,
    rowGap: space.sm,
  },
  actionBtn: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.bold,
  },
  archivedCard: {
    opacity: 0.7,
  },
  sheetBody: {
    gap: space.lg,
    paddingBottom: space.lg,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  saveBtn: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  saveBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelLg.fontSize,
    fontWeight: typography.weights.bold,
  },
});
