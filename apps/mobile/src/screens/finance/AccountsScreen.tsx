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
  calculateAccountBalance,
  formatCentsBRL,
  getTodayIsoLocal,
  parseBRLToCents,
  type FinAccountType,
} from '../../domain/financeFlow';
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

  const monthDeltaMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      map.set(acc.id, 0);
    }
    for (const entry of entries) {
      if (entry.status !== 'paid') continue;
      const dateStr = entry.paid_date ?? entry.due_date;
      if (!dateStr || !dateStr.startsWith(currentYm)) continue;
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
    setSelectedColor(FIN_COLOR_SWATCHES[0]);
    setFormOpen(true);
  };

  const openEditModal = (acc: FinAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setAccountType((acc.type as FinAccountType) || 'checking');
    const abs = Math.abs(acc.initial_balance_cents);
    setBalanceText((abs / 100).toFixed(2).replace('.', ','));
    setSelectedColor(resolveApprovedColor(acc.color, FIN_COLOR_SWATCHES[0]));
    setFormOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const initialCents = parseBRLToCents(balanceText);
      if (editingAccount) {
        await finRepository.updateAccount(editingAccount.id, {
          name: trimmed,
          type: accountType,
          initial_balance_cents: initialCents,
          color: selectedColor,
        });
      } else {
        await finRepository.createAccount({
          name: trimmed,
          type: accountType,
          initialBalanceCents: initialCents,
          color: selectedColor,
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
    const balance = balanceMap.get(acc.id) ?? 0;
    const monthDelta = monthDeltaMap.get(acc.id) ?? 0;
    const avatarColor = resolveApprovedColor(acc.color, '#D5CAA8');
    const iconColor = avatarColor === '#2E4A44' ? '#E6DECA' : '#111315';
    const typeLabel = ACCOUNT_TYPE_LABELS[(acc.type as FinAccountType) || 'checking'] ?? 'Conta';
    const actionBorder = ui.isLight ? '#E2DACB' : '#34383C';

    const deltaText = isPrivacyMode
      ? '•••• no mês'
      : `${formatSignedCentsBRL(Math.abs(monthDelta), monthDelta >= 0 ? 'income' : 'expense', false)} no mês`;

    return (
      <FinListRow
        key={acc.id}
        testID={`account-row-${acc.id}`}
        icon={getAccountIcon(acc.type)}
        avatarColor={avatarColor}
        iconColor={iconColor}
        title={acc.name}
        subtitle={typeLabel}
        amountText={formatCentsBRL(balance, isPrivacyMode)}
        amountColor={balance < 0 ? ui.expense : ui.text}
        rightSubtitle={deltaText}
        rightSubtitleColor={monthDelta >= 0 ? ui.income : ui.expense}
        isLast={isLast}
        themeMode={themeMode}
        onPress={() => openEditModal(acc)}
        bottomContent={
          <View style={styles.rowActions}>
            {isArchived ? (
              <TouchableOpacity
                testID={`account-restore-btn-${acc.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Restaurar ${acc.name}`}
                onPress={() => void handleRestore(acc)}
                style={[styles.actionBtn, { borderColor: actionBorder }]}
              >
                <Text style={[styles.actionBtnText, { color: '#D5CAA8' }]}>Restaurar</Text>
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
        title="Contas"
        subtitle="Onde está o seu dinheiro"
        onBack={onBack}
        isPrivacyMode={isPrivacyMode}
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
              variant="primary"
              title="SALDO TOTAL"
              testID="accounts-total-balance-tile"
              themeMode={themeMode}
            >
              <Text style={styles.totalValue} testID="accounts-total-balance-value">
                {formatCentsBRL(totalBalanceCents, isPrivacyMode)}
              </Text>
              <Text style={styles.totalCaption}>{totalCaption}</Text>
            </BentoTile>
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
              { key: 'checking', label: 'Conta' },
              { key: 'cash', label: 'Carteira' },
              { key: 'card', label: 'Cartão' },
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
              testID="account-form-balance-input"
            />
          </BentoSection>

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
    paddingBottom: 110,
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
