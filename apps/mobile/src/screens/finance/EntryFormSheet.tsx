import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoSection,
  BentoSheetHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
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
import { bento, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  FinLoadingView,
  getFinUiColors,
  resolveCategoryVisual,
  sharedStyles,
} from './finTheme';

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

type RepeatMode = 'single' | 'monthly' | 'installment';

function extractDayLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  return m ? String(Number.parseInt(m[3], 10)) : '15';
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
  const [descFocused, setDescFocused] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate ?? getTodayIsoLocal());
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('single');
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
      setRepeatMode(
        editingEntry?.installment_total && editingEntry.installment_total > 1
          ? 'installment'
          : editingEntry?.recurrence_id
          ? 'monthly'
          : 'single'
      );
      setInstallmentsText(
        editingEntry?.installment_total ? String(editingEntry.installment_total) : '1'
      );
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

  const handleRepeatChange = (mode: RepeatMode) => {
    setRepeatMode(mode);
    if (mode === 'single') {
      setInstallmentsText('1');
    } else if (mode === 'installment' && (Number.parseInt(installmentsText, 10) || 1) < 2) {
      setInstallmentsText('2');
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

  const dayNumber = extractDayLabel(dueDate);
  const repeatHelper =
    repeatMode === 'monthly'
      ? `Todo dia ${dayNumber} · sem data final`
      : repeatMode === 'installment'
      ? `${installmentsText || '2'} parcelas mensais a partir do dia ${dayNumber}`
      : 'Lançamento único neste vencimento';

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={themeMode}
      showHandle={true}
      testID={testID}
    >
      <BentoSheetHeader
        title={editingEntry ? 'Editar lançamento' : 'Novo lançamento'}
        subtitle={kind === 'income' ? 'Entrada financeira' : 'Saída financeira'}
        onClose={onClose}
        closeTestID="entry-form-cancel-btn"
        themeMode={themeMode}
      />

      {!optionsLoaded ? (
        <FinLoadingView themeMode={themeMode} />
      ) : (
        <View style={styles.formBody}>
          <SegmentedControl<FinKind>
            testID="entry-form-kind-segmented"
            value={kind}
            onChange={handleKindChange}
            options={[
              { id: 'expense', label: 'Despesa', icon: 'south-west' },
              { id: 'income', label: 'Receita', icon: 'north-east' },
            ]}
            themeMode={themeMode}
          />

          <BentoSection title="VALOR" themeMode={themeMode} testID="entry-form-section-valor">
            <View style={styles.amountRow}>
              <Text style={[styles.currencyPrefix, { color: c.muted }]}>R$</Text>
              <TextInput
                testID="entry-form-amount"
                value={amountText}
                onChangeText={(txt) => {
                  setAmountText(txt);
                  setFormError(null);
                }}
                placeholder="0,00"
                placeholderTextColor={c.muted}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: c.text }]}
              />
            </View>
            {formError ? <Text style={[styles.errorText, { color: c.overdue }]}>{formError}</Text> : null}
          </BentoSection>

          <BentoSection title="DESCRIÇÃO" themeMode={themeMode} testID="entry-form-section-descricao">
            <TextInput
              testID="entry-form-description"
              value={description}
              onChangeText={setDescription}
              onFocus={() => setDescFocused(true)}
              onBlur={() => setDescFocused(false)}
              placeholder="Ex.: Almoço, Salário, Mercado"
              placeholderTextColor={c.muted}
              style={[
                styles.descInput,
                {
                  color: c.text,
                  borderBottomColor: descFocused ? '#D96628' : c.border,
                },
              ]}
            />

            <View style={styles.metaRow}>
              <View style={styles.metaField}>
                <View style={styles.metaLabelRow}>
                  <MaterialIcons name="event" size={14} color={c.muted} />
                  <Text style={[styles.metaLabel, { color: c.muted }]}>Vencimento</Text>
                </View>
                <TextInput
                  testID="entry-form-due-date"
                  value={dueDate}
                  onChangeText={setDueDate}
                  placeholder="2026-11-13"
                  placeholderTextColor={c.muted}
                  style={[styles.dateInput, { color: c.text, borderColor: c.border }]}
                />
              </View>
            </View>

            <View style={styles.metaLabelRow}>
              <MaterialIcons name="account-balance-wallet" size={14} color={c.muted} />
              <Text style={[styles.metaLabel, { color: c.muted }]}>Conta</Text>
            </View>
            <View style={sharedStyles.chipRow}>
              {accounts.map((acc) => {
                const selected = acc.id === accountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    testID={`entry-form-account-${acc.id}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                    onPress={() => setAccountId(acc.id)}
                    style={[
                      sharedStyles.chip,
                      {
                        backgroundColor: selected ? '#2E4A44' : c.surfaceContainer,
                        borderWidth: 1,
                        borderColor: selected ? '#2E4A44' : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? '#E6DECA' : c.text },
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BentoSection>

          <BentoSection title="CATEGORIA" themeMode={themeMode} testID="entry-form-section-categoria">
            <View style={sharedStyles.chipRow}>
              {categoriesForKind.map((cat) => {
                const selected = cat.id === categoryId;
                const visual = resolveCategoryVisual(cat);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    testID={`entry-form-category-${cat.id}`}
                    accessibilityRole="button"
                    hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                    onPress={() => setCategoryId(cat.id)}
                    style={[
                      sharedStyles.chip,
                      {
                        backgroundColor: c.surfaceContainer,
                        borderWidth: 1,
                        borderColor: selected ? '#D96628' : c.border,
                        paddingLeft: 8,
                      },
                    ]}
                  >
                    <View style={[styles.miniAvatar, { backgroundColor: visual.color }]}>
                      <MaterialIcons name={visual.icon} size={12} color={visual.iconColor} />
                    </View>
                    <Text style={[styles.chipText, { color: c.text }]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={[sharedStyles.chip, { backgroundColor: c.surfaceContainer, borderWidth: 1, borderColor: c.border }]}>
                <Text style={[styles.chipText, { color: c.muted }]}>+ Nova</Text>
              </View>
            </View>
          </BentoSection>

          <BentoSection title="REPETIÇÃO" themeMode={themeMode} testID="entry-form-section-repeticao">
            <SegmentedControl<RepeatMode>
              testID="entry-form-repeat-segmented"
              value={repeatMode}
              onChange={handleRepeatChange}
              options={[
                { id: 'single', label: 'Única' },
                { id: 'monthly', label: 'Mensal' },
                { id: 'installment', label: 'Parcelada' },
              ]}
              themeMode={themeMode}
            />
            <Text testID="entry-form-repeat-helper" style={[styles.helperText, { color: c.muted }]}>
              {repeatHelper}
            </Text>
            {!editingEntry && repeatMode === 'installment' ? (
              <TextInput
                testID="entry-form-installments"
                value={installmentsText}
                onChangeText={setInstallmentsText}
                keyboardType="numeric"
                placeholder="Número de parcelas (ex.: 12)"
                placeholderTextColor={c.muted}
                style={[styles.dateInput, { color: c.text, borderColor: c.border, marginTop: 6 }]}
              />
            ) : null}
          </BentoSection>

          <JellyPressable
            testID="entry-form-save-btn"
            accessibilityRole="button"
            accessibilityLabel="Salvar lançamento"
            disabled={saving}
            onPress={() => void handleSave()}
            containerStyle={styles.saveBtnContainer}
            style={styles.saveBtnInner}
          >
            <Text style={sharedStyles.primaryBtnText}>
              {saving ? 'Salvando...' : 'Salvar lançamento'}
            </Text>
          </JellyPressable>
        </View>
      )}
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  formBody: {
    gap: bento.gap,
    paddingBottom: space.md,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  currencyPrefix: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  amountInput: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    paddingVertical: 2,
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 6,
  },
  descInput: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    borderBottomWidth: 2,
    paddingVertical: 8,
    marginBottom: 12,
  },
  metaRow: {
    marginBottom: 12,
  },
  metaField: {
    gap: 6,
  },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  dateInput: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    marginTop: 8,
  },
  saveBtnContainer: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D96628',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
