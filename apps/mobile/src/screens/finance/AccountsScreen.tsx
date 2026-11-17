import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AnimatedModalSheet,
  BentoGrid,
  BentoSection,
  BentoSheetHeader,
  BentoTile,
  FinListCard,
  FinListRow,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinEntry } from '../../db/schema';
import {
  availableLimit,
  billDueDate,
  calculateAccountBalance,
  formatCentsBRL,
  getTodayIsoLocal,
  parseBRLToCents,
  resolveBillMonth,
  summarizeBill,
  type FinAccountType,
} from '../../domain/financeFlow';
import {
  computeBalanceDivergence,
  formatReportedBalanceDate,
} from '../../domain/openFinance';
import { finRepository } from '../../repositories/finRepository';
import type { ThemeMode } from '../../theme/palettes';
import { layout, typography } from '../../theme/tokens';
import {
  FIN_COLOR_SWATCHES,
  FinEmptyState,
  FinErrorView,
  FinFloatingAddButton,
  FinLoadingView,
  formatSignedCentsBRL,
  getFinUiColors,
  resolveApprovedColor,
} from './finTheme';

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
  testID?: string;
}

const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  checking: 'Conta corrente',
  cash: 'Carteira',
  card: 'Cartão',
};

function getAccountIcon(type: string): 'account-balance' | 'account-balance-wallet' | 'credit-card' {
  if (type === 'cash') return 'account-balance-wallet';
  if (type === 'card') return 'credit-card';
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
  testID = 'accounts-screen',
}) => {
  const ui = getFinUiColors(themeMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinAccount | null>(null);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<FinAccountType>('checking');
  const [balanceText, setBalanceText] = useState('0,00');
  const [closingDayText, setClosingDayText] = useState('10');
  const [dueDayText, setDueDayText] = useState('17');
  const [creditLimitText, setCreditLimitText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accs, allEntries] = await Promise.all([
        finRepository.listAccounts(true),
        finRepository.listAllEntries(),
      ]);
      setAccounts(accs);
      setEntries(allEntries);
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
    setFormOpen(true);
  };

  const openEditModal = (acc: FinAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setAccountType((acc.type as FinAccountType) || 'checking');
    const absFormatted = (Math.abs(acc.initial_balance_cents) / 100).toFixed(2).replace('.', ',');
    setBalanceText(acc.initial_balance_cents < 0 ? `-${absFormatted}` : absFormatted);
    setClosingDayText(acc.closing_day != null ? String(acc.closing_day) : '10');
    setDueDayText(acc.due_day != null ? String(acc.due_day) : '17');
    setCreditLimitText(
      acc.credit_limit_cents != null
        ? (acc.credit_limit_cents / 100).toFixed(2).replace('.', ',')
        : ''
    );
    setSelectedColor(resolveApprovedColor(acc.color, FIN_COLOR_SWATCHES[0]));
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
      } else {
        await finRepository.createAccount({
          name: trimmed,
          type: accountType,
          initialBalanceCents: initialCents,
          color: selectedColor,
          closingDay,
          dueDay,
          creditLimitCents,
        });
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
    const cardEntries = isCard
      ? entries
          .filter((e) => e.account_id === acc.id)
          .map((e) =>
            e.bill_month
              ? e
              : { ...e, bill_month: resolveBillMonth(e.due_date, acc.closing_day ?? 1, acc.due_day) }
          )
      : [];
    const currentBillMonth = isCard
      ? resolveBillMonth(getTodayIsoLocal(), acc.closing_day ?? 1, acc.due_day)
      : currentYm;
    const currentBillSummary = isCard
      ? summarizeBill(cardEntries, currentBillMonth, {
          dueDate: billDueDate(currentBillMonth, acc.due_day ?? 10),
          todayIso: getTodayIsoLocal(),
          closingDay: acc.closing_day ?? undefined,
        })
      : null;
    const openBillsTotalCents = isCard
      ? Array.from(
          new Set(cardEntries.map((e) => e.bill_month).filter(Boolean) as string[])
        ).reduce((sum, bm) => sum + summarizeBill(cardEntries, bm).openCents, 0)
      : 0;
    const availLimitCents = isCard
      ? availableLimit(acc.credit_limit_cents, openBillsTotalCents)
      : null;

    const isOpenFinance = acc.source === 'OPEN_FINANCE';
    const calculatedBalance = isCard
      ? currentBillSummary?.openCents ?? cardMonthSpendMap.get(acc.id) ?? 0
      : balanceMap.get(acc.id) ?? 0;
    const hasReportedBalance = isOpenFinance && acc.reported_balance_cents != null;
    const balance = hasReportedBalance
      ? (acc.reported_balance_cents as number)
      : calculatedBalance;
    const divergence = hasReportedBalance
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

    const baseSubtitle = isArchived
      ? undefined
      : isCard
      ? `Fatura atual • Venc. dia ${acc.due_day ?? '—'} • Limite disp. ${
          availLimitCents !== null ? formatCentsBRL(availLimitCents, isPrivacyMode) : '—'
        }`
      : `${typeLabel} • ${entryCount} ${entryCount === 1 ? 'lançamento' : 'lançamentos'}`;

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
          <View style={styles.rowActions}>
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
        <FinLoadingView themeMode={themeMode} />
      ) : error ? (
        <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <BentoGrid>
            <View testID="accounts-total-tile">
              <BentoTile
                variant="primary"
                title="SALDO TOTAL"
                testID="accounts-total-balance-tile"
              >
                <Text
                  style={[styles.totalValue, { color: ui.primaryFg }]}
                  testID="accounts-total-balance-value"
                >
                  {formatCentsBRL(totalBalanceCents, isPrivacyMode)}
                </Text>
                <Text style={[styles.totalCaption, { color: ui.primaryMuted }]}>{totalCaption}</Text>
              </BentoTile>
            </View>
          </BentoGrid>

          {accounts.length === 0 ? (
            <FinEmptyState
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
              {activeNonCardAccounts.length > 0 && (
                <FinListCard
                  title="CONTAS"
                  testID="accounts-section-checking"
                  themeMode={themeMode}
                >
                  {activeNonCardAccounts.map((acc, idx) =>
                    renderAccountRow(acc, idx === activeNonCardAccounts.length - 1, false)
                  )}
                </FinListCard>
              )}

              {activeCardAccounts.length > 0 && (
                <FinListCard
                  title="CARTÕES"
                  testID="accounts-section-cards"
                  themeMode={themeMode}
                >
                  {activeCardAccounts.map((acc, idx) =>
                    renderAccountRow(acc, idx === activeCardAccounts.length - 1, false)
                  )}
                </FinListCard>
              )}

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

      <FinFloatingAddButton
        testID="accounts-add-btn"
        accessibilityLabel="Nova conta"
        onPress={openCreateModal}
      />

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
                      selected && { borderWidth: 2, borderColor: ui.isLight ? '#111315' : '#E6DECA' },
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
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: 8,
    paddingBottom: 170,
    gap: 14,
  },
  totalValue: {
    fontFamily: typography.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    color: '#1A0E08',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  totalCaption: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#1A0E08',
    opacity: 0.78,
    marginTop: 4,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  archivedCard: {
    opacity: 0.7,
  },
  sheetBody: {
    gap: 14,
    paddingBottom: 16,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
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
    backgroundColor: '#D96628',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0E08',
  },
});
