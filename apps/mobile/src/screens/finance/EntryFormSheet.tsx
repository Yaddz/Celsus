import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  AnimatedModalSheet,
  LedgerInput,
  TextField,
} from '../../components/ui';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinCategory, FinEntry } from '../../db/schema';
import {
  getTodayIsoLocal,
  parseBRLToCents,
  type FinKind,
  type InstallmentScope,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { FinLoadingView, getFinUiColors, sharedStyles } from './finTheme';

export interface EntryFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  editingEntry?: FinEntry | null;
  installmentScope?: InstallmentScope;
  defaultDueDate?: string;
  themeMode?: ThemeMode;
  testID?: string;
}

export const EntryFormSheet: React.FC<EntryFormSheetProps> = ({
  visible,
  onClose,
  onSaved,
  editingEntry = null,
  installmentScope,
  defaultDueDate,
  themeMode = 'dark',
  testID = 'entry-form-sheet',
}) => {
  const c = getFinUiColors(themeMode);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);

  const [kind, setKind] = useState<FinKind>('expense');
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate ?? getTodayIsoLocal());
  const [installmentsText, setInstallmentsText] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setOptionsLoaded(false);
      return;
    }

    let cancelled = false;
    setOptionsLoaded(false);
    setFormError(null);

    const load = async () => {
      const [accs, cats] = await Promise.all([
        finRepository.listAccounts(false),
        finRepository.listCategories(false),
      ]);
      if (cancelled) return;

      setAccounts(accs);
      setCategories(cats);

      const initialKind: FinKind =
        editingEntry?.kind === 'income' ? 'income' : 'expense';
      setKind(initialKind);
      setDescription(editingEntry?.description ?? '');
      setAmountText(
        editingEntry ? (editingEntry.amount_cents / 100).toFixed(2).replace('.', ',') : ''
      );
      setDueDate(editingEntry?.due_date ?? defaultDueDate ?? getTodayIsoLocal());
      setInstallmentsText('1');
      setAccountId(editingEntry?.account_id ?? accs[0]?.id ?? '');

      const matchingCat =
        cats.find((cat) => cat.id === editingEntry?.category_id) ??
        cats.find((cat) => cat.kind === initialKind) ??
        cats[0];
      setCategoryId(matchingCat?.id ?? '');
      setOptionsLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, editingEntry, defaultDueDate]);

  const categoriesForKind = useMemo(() => {
    const matching = categories.filter((cat) => cat.kind === kind);
    return matching.length > 0 ? matching : categories;
  }, [categories, kind]);

  const handleKindChange = (nextKind: FinKind) => {
    setKind(nextKind);
    const matching = categories.filter((cat) => cat.kind === nextKind);
    if (matching.length > 0 && !matching.some((cat) => cat.id === categoryId)) {
      setCategoryId(matching[0].id);
    }
  };

  const handleSave = async () => {
    const amountCents = parseBRLToCents(amountText);
    if (amountCents <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    const resolvedAccountId = accountId || accounts[0]?.id || 'default-account';
    const resolvedCategoryId =
      categoryId || categoriesForKind[0]?.id || categories[0]?.id || 'cat-outros-despesa';
    const trimmedDate = dueDate.trim() || getTodayIsoLocal();
    const installmentsCount = Math.max(
      1,
      Number.parseInt(installmentsText.trim() || '1', 10) || 1
    );

    setSaving(true);
    setFormError(null);
    try {
      if (editingEntry) {
        const patch = {
          description: description.trim() || 'Lançamento',
          amount_cents: amountCents,
          due_date: trimmedDate,
          account_id: resolvedAccountId,
          category_id: resolvedCategoryId,
        };
        if (editingEntry.installment_group_id && installmentScope) {
          await finService.updateInstallmentEntries(
            editingEntry.id,
            installmentScope,
            patch
          );
        } else {
          await finRepository.updateEntry(editingEntry.id, {
            ...patch,
            kind,
          });
        }
      } else if (installmentsCount > 1) {
        await finService.createInstallmentPurchase({
          kind,
          totalAmountCents: amountCents,
          installmentTotal: installmentsCount,
          firstDueDate: trimmedDate,
          accountId: resolvedAccountId,
          categoryId: resolvedCategoryId,
          description: description.trim() || 'Parcelamento',
        });
      } else {
        await finRepository.createEntry({
          kind,
          amount_cents: amountCents,
          due_date: trimmedDate,
          paid_date: null,
          paid_amount_cents: null,
          status: 'pending',
          account_id: resolvedAccountId,
          category_id: resolvedCategoryId,
          description: description.trim() || 'Lançamento',
          recurrence_id: null,
          installment_group_id: null,
          installment_number: null,
          installment_total: null,
        });
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={themeMode}
      testID={testID}
    >
      <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
        {editingEntry ? 'Editar lançamento' : 'Novo lançamento'}
      </Text>

      {!optionsLoaded ? (
        <FinLoadingView themeMode={themeMode} />
      ) : (
        <View style={styles.formBody}>
          <SegmentedControl<FinKind>
            value={kind}
            onChange={handleKindChange}
            options={[
              { id: 'expense', label: 'Despesa' },
              { id: 'income', label: 'Receita' },
            ]}
            themeMode={themeMode}
          />

          <TextField
            testID="entry-form-description"
            label="Descrição"
            value={description}
            onChangeText={setDescription}
            placeholder="Ex.: Almoço, Salário, Mercado"
            themeMode={themeMode}
          />

          <LedgerInput
            testID="entry-form-amount"
            label="Valor (R$)"
            value={amountText}
            onChangeText={(txt) => {
              setAmountText(txt);
              setFormError(null);
            }}
            error={formError}
            themeMode={themeMode}
          />

          <TextField
            testID="entry-form-due-date"
            label="Vencimento (AAAA-MM-DD)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2026-11-13"
            themeMode={themeMode}
          />

          {!editingEntry ? (
            <TextField
              testID="entry-form-installments"
              label="Parcelas"
              value={installmentsText}
              onChangeText={setInstallmentsText}
              keyboardType="numeric"
              placeholder="1"
              themeMode={themeMode}
            />
          ) : null}

          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>Conta</Text>
          <View style={sharedStyles.chipRow}>
            {accounts.map((acc) => {
              const selected = acc.id === accountId;
              return (
                <TouchableOpacity
                  key={acc.id}
                  testID={`entry-form-account-${acc.id}`}
                  accessibilityRole="button"
                  onPress={() => setAccountId(acc.id)}
                  style={[
                    sharedStyles.chip,
                    {
                      backgroundColor: selected ? c.primary : c.surfaceContainer,
                      borderColor: selected ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? '#1A0E08' : c.text },
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>Categoria</Text>
          <View style={sharedStyles.chipRow}>
            {categoriesForKind.map((cat) => {
              const selected = cat.id === categoryId;
              return (
                <TouchableOpacity
                  key={cat.id}
                  testID={`entry-form-category-${cat.id}`}
                  accessibilityRole="button"
                  onPress={() => setCategoryId(cat.id)}
                  style={[
                    sharedStyles.chip,
                    {
                      backgroundColor: selected ? c.primary : c.surfaceContainer,
                      borderColor: selected ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? '#1A0E08' : c.text },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={sharedStyles.modalActions}>
            <TouchableOpacity
              testID="entry-form-cancel-btn"
              accessibilityRole="button"
              onPress={onClose}
              style={[sharedStyles.secondaryBtn, { borderColor: c.border }]}
            >
              <Text style={[sharedStyles.secondaryBtnText, { color: c.muted }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="entry-form-save-btn"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void handleSave()}
              style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
            >
              <Text style={sharedStyles.primaryBtnText}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  formBody: {
    gap: space.md,
  },
  chipText: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 12,
    fontWeight: '600',
  },
});
