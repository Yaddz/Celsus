import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  LedgerInput,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinEntry } from '../../db/schema';
import {
  calculateAccountBalance,
  formatCentsBRL,
  parseBRLToCents,
  type FinAccountType,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  FIN_COLOR_SWATCHES,
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  sharedStyles,
} from './finTheme';

export interface AccountsScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

const ACCOUNT_TYPE_LABELS: Record<FinAccountType, string> = {
  cash: 'Carteira',
  checking: 'Conta Corrente',
  card: 'Cartão',
};

export const AccountsScreen: React.FC<AccountsScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'accounts-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinAccount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinAccountType>('checking');
  const [balanceText, setBalanceText] = useState('0,00');
  const [color, setColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accs, allEntries] = await Promise.all([
        finRepository.listAccounts(false),
        finRepository.listAllEntries(),
      ]);
      setAccounts(accs);
      setEntries(allEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar contas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingAccount(null);
    setName('');
    setType('checking');
    setBalanceText('0,00');
    setColor(FIN_COLOR_SWATCHES[0]);
    setFormError(null);
    setIsSheetOpen(true);
  };

  const openEditModal = (acc: FinAccount) => {
    setEditingAccount(acc);
    setName(acc.name);
    setType((acc.type as FinAccountType) || 'checking');
    setBalanceText((acc.initial_balance_cents / 100).toFixed(2).replace('.', ','));
    setColor(acc.color || FIN_COLOR_SWATCHES[0]);
    setFormError(null);
    setIsSheetOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Informe o nome da conta.');
      return;
    }
    const cents = parseBRLToCents(balanceText);
    if (editingAccount) {
      await finRepository.updateAccount(editingAccount.id, {
        name: name.trim(),
        type,
        initial_balance_cents: cents,
        color,
      });
    } else {
      await finRepository.createAccount({
        name: name.trim(),
        type,
        initialBalanceCents: cents,
        color,
      });
    }
    setIsSheetOpen(false);
    await loadData();
  };

  const handleArchive = async (accId: string) => {
    await finRepository.archiveAccount(accId);
    await loadData();
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Contas"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        <View style={styles.toolbarRow}>
          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>Suas contas</Text>
          <TouchableOpacity
            testID="accounts-add-btn"
            accessibilityRole="button"
            onPress={openCreateModal}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Nova conta</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : accounts.length === 0 ? (
          <FinEmptyState
            testID="accounts-empty-state"
            icon="account-balance-wallet"
            title="Nenhuma conta cadastrada"
            subtitle="Crie sua carteira, conta corrente ou cartão para organizar seus lançamentos."
            themeMode={themeMode}
          />
        ) : (
          accounts.map((acc) => {
            const currentBalance = calculateAccountBalance(
              acc.initial_balance_cents,
              entries,
              acc.id
            );
            const typeLabel =
              ACCOUNT_TYPE_LABELS[acc.type as FinAccountType] ?? 'Conta';
            return (
              <View
                key={acc.id}
                testID={`account-row-${acc.id}`}
                style={[sharedStyles.rowCard, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <View style={styles.rowHeader}>
                  <View style={styles.rowIdentity}>
                    <View style={[styles.colorDot, { backgroundColor: acc.color || c.primary }]} />
                    <View style={styles.rowTitleWrap}>
                      <Text style={[styles.rowTitle, { color: c.text }]}>{acc.name}</Text>
                      <Text style={[styles.rowMeta, { color: c.muted }]}>{typeLabel}</Text>
                    </View>
                  </View>
                  <Text style={[styles.rowBalance, { color: currentBalance < 0 ? c.expense : c.text }]}>
                    {formatCentsBRL(currentBalance, isPrivacyMode)}
                  </Text>
                </View>

                <View style={styles.rowActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => openEditModal(acc)}
                    style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                  >
                    <MaterialIcons name="edit" size={18} color={c.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`account-archive-btn-${acc.id}`}
                    accessibilityRole="button"
                    onPress={() => void handleArchive(acc.id)}
                    style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                  >
                    <MaterialIcons name="archive" size={18} color={c.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <AnimatedModalSheet
        visible={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        themeMode={themeMode}
        testID="account-form-sheet"
      >
        <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
          {editingAccount ? 'Editar conta' : 'Nova conta'}
        </Text>

        <TextField
          label="Nome da conta"
          value={name}
          onChangeText={(txt) => {
            setName(txt);
            setFormError(null);
          }}
          placeholder="Ex.: Conta Corrente, Nubank"
          error={formError}
          themeMode={themeMode}
        />

        <Text style={[sharedStyles.sectionLabel, { color: c.muted, marginBottom: space.xs }]}>
          Tipo
        </Text>
        <SegmentedControl<FinAccountType>
          value={type}
          onChange={setType}
          options={[
            { id: 'checking', label: 'Conta' },
            { id: 'cash', label: 'Carteira' },
            { id: 'card', label: 'Cartão' },
          ]}
          themeMode={themeMode}
        />

        <View style={{ marginTop: space.md }}>
          <LedgerInput
            label="Saldo inicial (R$)"
            value={balanceText}
            onChangeText={setBalanceText}
            themeMode={themeMode}
          />
        </View>

        <Text style={[sharedStyles.sectionLabel, { color: c.muted, marginTop: space.md, marginBottom: space.xs }]}>
          Cor
        </Text>
        <View style={sharedStyles.chipRow}>
          {FIN_COLOR_SWATCHES.map((swatch) => (
            <TouchableOpacity
              key={swatch}
              accessibilityRole="button"
              onPress={() => setColor(swatch)}
              style={[
                styles.swatchBtn,
                { backgroundColor: swatch, borderColor: color === swatch ? c.text : 'transparent' },
              ]}
            />
          ))}
        </View>

        <View style={sharedStyles.modalActions}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setIsSheetOpen(false)}
            style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
          >
            <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void handleSave()}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <Text style={sharedStyles.primaryBtnText}>Salvar</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  rowIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rowTitleWrap: {
    flex: 1,
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
  rowBalance: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 15,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  swatchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
});
