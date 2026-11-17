import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoSheetHeader,
  BentoTile,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinAccount, FinCategory, FinEntry } from '../../db/schema';
import {
  addMonthsYearMonth,
  brToIso,
  getMonthDateRange,
  getTodayIsoLocal,
  isoToBr,
  parseBRLToCents,
  resolveBillMonth,
  type FinKind,
  type InstallmentScope,
} from '../../domain/financeFlow';
import type { ReceiptDraft } from '../../domain/receipt';
import { finRepository } from '../../repositories/finRepository';
import { mergeUserEditedFields } from '../../domain/openFinance';
import { finService } from '../../services/finService';
import { bento, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  APPROVED_FIN_PALETTE,
  FinLoadingView,
  getFinUiColors,
  resolveCategoryVisual,
  sharedStyles,
} from './finTheme';

export interface EntryFormSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onRequestCreateAccount?: () => void;
  onEditCardAccount?: (accountId: string) => void;
  editingEntry?: FinEntry | null;
  receiptDraft?: ReceiptDraft | null;
  installmentScope?: InstallmentScope;
  defaultDueDate?: string;
  themeMode?: ThemeMode;
  testID?: string;
}

type RepeatMode = 'single' | 'monthly' | 'installment';
type EntryFormKind = FinKind | 'transfer';

function extractDayLabel(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  return m ? String(Number.parseInt(m[3], 10)) : '15';
}

/** Máscara dd/mm/aaaa enquanto digita (só dígitos, no máximo 8). */
function maskBrDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export const EntryFormSheet: React.FC<EntryFormSheetProps> = ({
  visible,
  onClose,
  onSaved,
  onRequestCreateAccount,
  editingEntry = null,
  receiptDraft = null,
  installmentScope,
  defaultDueDate,
  themeMode = 'dark',
  testID = 'entry-form-sheet',
}) => {
  const c = getFinUiColors(themeMode);
  const tileVariant = c.isLight ? 'light' : 'dark';
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);

  const [kind, setKind] = useState<FinKind>('expense');
  const [formKind, setFormKind] = useState<EntryFormKind>('expense');
  const [description, setDescription] = useState('');
  const [descFocused, setDescFocused] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [dueDate, setDueDate] = useState(isoToBr(defaultDueDate ?? getTodayIsoLocal()));
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('single');
  const [installmentsText, setInstallmentsText] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [quickCatOpen, setQuickCatOpen] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatColor, setQuickCatColor] = useState<string>(APPROVED_FIN_PALETTE[0]);
  const [savingQuickCat, setSavingQuickCat] = useState(false);

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
      setFormKind(initialKind);

      if (!editingEntry && receiptDraft) {
        setDescription(receiptDraft.description ?? '');
        setAmountText(
          receiptDraft.amountCents !== null && receiptDraft.amountCents > 0
            ? (receiptDraft.amountCents / 100).toFixed(2).replace('.', ',')
            : ''
        );
        setDueDate(receiptDraft.dateIso ? isoToBr(receiptDraft.dateIso) : '');
      } else {
        setDescription(editingEntry?.description ?? '');
        setAmountText(
          editingEntry ? (editingEntry.amount_cents / 100).toFixed(2).replace('.', ',') : ''
        );
        setDueDate(isoToBr(editingEntry?.due_date ?? defaultDueDate ?? getTodayIsoLocal()));
      }
      setAccountPickerOpen(false);
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
      const firstAccId = editingEntry?.account_id ?? accs[0]?.id ?? '';
      setAccountId(firstAccId);
      const secondAccId = accs.find((a) => a.id !== firstAccId)?.id ?? firstAccId;
      setToAccountId(secondAccId);

      const preferredCatId = editingEntry?.category_id ?? receiptDraft?.categoryId ?? null;
      const matchingCat =
        (preferredCatId ? cats.find((cat) => cat.id === preferredCatId) : undefined) ??
        cats.find((cat) => cat.kind === initialKind) ??
        cats[0];
      setCategoryId(matchingCat?.id ?? '');
      setOptionsLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [visible, editingEntry, receiptDraft, defaultDueDate]);

  const categoriesForKind = useMemo(() => {
    const matching = categories.filter((cat) => cat.kind === kind);
    return matching.length > 0 ? matching : categories;
  }, [categories, kind]);

  const handleKindChange = (nextKind: EntryFormKind) => {
    setFormKind(nextKind);
    if (nextKind === 'transfer') return;
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

  const handleSaveQuickCategory = async () => {
    const trimmed = quickCatName.trim();
    if (!trimmed || savingQuickCat) return;
    setSavingQuickCat(true);
    try {
      const created = await finRepository.createCategory({
        name: trimmed,
        kind,
        icon: 'category',
        color: quickCatColor,
      });
      const refreshed = await finRepository.listCategories(false);
      setCategories(refreshed);
      setCategoryId(created.id);
      setQuickCatOpen(false);
      setQuickCatName('');
    } finally {
      setSavingQuickCat(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const amountCents = parseBRLToCents(amountText);
    if (amountCents <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    const resolvedAccountId = accountId || accounts[0]?.id || '';
    if (!resolvedAccountId || !accounts.some((a) => a.id === resolvedAccountId)) {
      setFormError('Cadastre uma conta antes de lançar.');
      return;
    }
    const trimmedDate = dueDate.trim() ? brToIso(dueDate) : getTodayIsoLocal();
    if (!trimmedDate) {
      setFormError('Informe uma data válida (dd/mm/aaaa).');
      return;
    }

    if (formKind === 'transfer') {
      const resolvedToAccountId = toAccountId || accounts.find((a) => a.id !== resolvedAccountId)?.id || '';
      if (!resolvedToAccountId || resolvedToAccountId === resolvedAccountId) {
        setFormError('Escolha contas de origem e destino diferentes.');
        return;
      }
      setSaving(true);
      setFormError(null);
      try {
        await finService.createTransfer({
          fromAccountId: resolvedAccountId,
          toAccountId: resolvedToAccountId,
          amountCents,
          dateIso: trimmedDate,
          description: description.trim() || 'Transferência entre contas',
        });
        onSaved?.();
        onClose();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Erro ao registrar transferência.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const resolvedCategoryId =
      categoryId || categoriesForKind[0]?.id || categories[0]?.id || '';
    if (!resolvedCategoryId || !categories.some((cat) => cat.id === resolvedCategoryId)) {
      setFormError('Selecione uma categoria válida.');
      return;
    }
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
          const editedFields: string[] = [];
          if (editingEntry.source === 'OPEN_FINANCE') {
            if (patch.category_id !== editingEntry.category_id) editedFields.push('category_id');
            if (patch.description !== editingEntry.description) editedFields.push('description');
          }
          await finService.updateEntryRecalculatingBill(editingEntry.id, {
            ...patch,
            kind,
            ...(editedFields.length > 0
              ? {
                  user_edited_fields: mergeUserEditedFields(
                    editingEntry.user_edited_fields,
                    editedFields
                  ),
                }
              : {}),
          });
        }
      } else if (repeatMode === 'monthly') {
        const dayOfMonth = Number.parseInt(trimmedDate.slice(8, 10), 10) || 1;
        await finRepository.createRecurrence({
          kind,
          amount_cents: amountCents,
          description: description.trim() || 'Recorrência',
          account_id: resolvedAccountId,
          category_id: resolvedCategoryId,
          frequency: 'monthly',
          day_of_month: dayOfMonth,
          start_date: trimmedDate,
          end_date: null,
          is_subscription: 0,
          active: 1,
          generated_until: null,
        });
        const baseMonth = trimmedDate.slice(0, 7);
        const windowStart = getMonthDateRange(baseMonth).start;
        const windowEnd = getMonthDateRange(addMonthsYearMonth(baseMonth, 2)).end;
        await finService.generateRecurrenceWindow(windowStart, windowEnd);
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
        if (receiptDraft?.externalId) {
          const existing = await finRepository.findEntryByExternalId(receiptDraft.externalId);
          if (existing) {
            setFormError('Esta NFC-e já foi lançada anteriormente.');
            setSaving(false);
            return;
          }
        }
        const selectedAcc = accounts.find((a) => a.id === resolvedAccountId);
        const billMonth =
          selectedAcc?.type === 'card'
            ? resolveBillMonth(trimmedDate, selectedAcc.closing_day ?? 1, selectedAcc.due_day)
            : null;
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
          bill_month: billMonth,
          source: receiptDraft ? receiptDraft.source : 'MANUAL',
          external_id: receiptDraft?.externalId ?? null,
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

  const selectedAccount = accounts.find((acc) => acc.id === accountId);

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={themeMode}
      showHandle={true}
      fill={true}
      testID={testID}
    >
      <View style={styles.sheetFill}>
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
          <>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.formBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <SegmentedControl<EntryFormKind>
                testID="entry-form-kind-segmented"
                value={formKind}
                onChange={handleKindChange}
                options={
                  editingEntry
                    ? [
                        { id: 'expense', label: 'Despesa', icon: 'south-west' },
                        { id: 'income', label: 'Receita', icon: 'north-east' },
                      ]
                    : [
                        { id: 'expense', label: 'Despesa', icon: 'south-west' },
                        { id: 'income', label: 'Receita', icon: 'north-east' },
                        { id: 'transfer', label: 'Transferência', icon: 'swap-horiz' },
                      ]
                }
                themeMode={themeMode}
              />

              {receiptDraft ? (
                <View
                  testID="entry-form-ocr-review-banner"
                  style={[styles.ocrBanner, { borderColor: c.warning, backgroundColor: `${c.warning}18` }]}
                >
                  <MaterialIcons name="document-scanner" size={16} color={c.warning} />
                  <Text style={[styles.ocrBannerText, { color: c.text }]}>
                    Confira os dados lidos do cupom antes de salvar.
                  </Text>
                </View>
              ) : null}

              <BentoTile variant={tileVariant} title="VALOR" testID="entry-form-tile-valor">
                <View testID="entry-form-section-valor">
                  {receiptDraft?.lowConfidenceFields.includes('amount') ? (
                    <Text
                      testID="entry-form-low-confidence-amount"
                      style={[styles.lowConfBadge, { color: c.warning }]}
                    >
                      Baixa confiança — confira o valor
                    </Text>
                  ) : null}
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
                </View>
              </BentoTile>

              <BentoTile variant={tileVariant} title="DESCRIÇÃO" testID="entry-form-tile-descricao">
                <View testID="entry-form-section-descricao">
                  {receiptDraft?.lowConfidenceFields.includes('description') ? (
                    <Text
                      testID="entry-form-low-confidence-description"
                      style={[styles.lowConfBadge, { color: c.warning }]}
                    >
                      Baixa confiança — confira o estabelecimento
                    </Text>
                  ) : null}
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
                        borderBottomColor: descFocused ? c.primary : c.border,
                      },
                    ]}
                  />

                  <View testID="entry-form-meta-row" style={styles.metaRow}>
                    <View style={styles.metaField}>
                      <View style={styles.metaLabelRow}>
                        <MaterialIcons name="event" size={14} color={c.muted} />
                        <Text style={[styles.metaLabel, { color: c.muted }]}>Vencimento</Text>
                      </View>
                      <TextInput
                        testID="entry-form-due-date"
                        value={dueDate}
                        onChangeText={(txt) => {
                          setDueDate(maskBrDate(txt));
                          setFormError(null);
                        }}
                        keyboardType="number-pad"
                        maxLength={10}
                        placeholder="dd/mm/aaaa"
                        placeholderTextColor={c.muted}
                        style={[styles.metaValueInput, { color: c.text }]}
                      />
                      {receiptDraft?.lowConfidenceFields.includes('date') ? (
                        <Text
                          testID="entry-form-low-confidence-date"
                          style={[styles.lowConfBadge, { color: c.warning }]}
                        >
                          Baixa confiança
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.metaField}>
                      <View style={styles.metaLabelRow}>
                        <MaterialIcons name="account-balance-wallet" size={14} color={c.muted} />
                        <Text style={[styles.metaLabel, { color: c.muted }]}>Conta</Text>
                      </View>
                      <TouchableOpacity
                        testID="entry-form-account-select"
                        accessibilityRole="button"
                        accessibilityLabel="Escolher conta"
                        disabled={accounts.length === 0}
                        onPress={() => setAccountPickerOpen((open) => !open)}
                        style={styles.metaValueTouch}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.metaValueText,
                            { color: selectedAccount ? c.text : c.muted },
                          ]}
                        >
                          {selectedAccount ? selectedAccount.name : '—'}
                        </Text>
                        {accounts.length > 0 ? (
                          <MaterialIcons name="arrow-drop-down" size={18} color={c.muted} />
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {accounts.length === 0 ? (
                    <View style={{ gap: 6, marginTop: 6 }}>
                      <Text testID="entry-form-account-empty" style={[styles.helperText, { color: c.muted }]}>
                        Nenhuma conta cadastrada. Crie uma em Finanças › Contas para vincular o lançamento.
                      </Text>
                      {onRequestCreateAccount ? (
                        <TouchableOpacity
                          testID="entry-form-create-account-shortcut"
                          accessibilityRole="button"
                          onPress={() => {
                            onClose();
                            onRequestCreateAccount();
                          }}
                        >
                          <Text style={[styles.helperText, { color: c.primary, fontWeight: '700' }]}>
                            Criar conta agora ›
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}

                  {accountPickerOpen ? (
                    <View style={[sharedStyles.chipRow, { marginTop: 10 }]}>
                      {accounts.map((acc) => {
                        const selected = acc.id === accountId;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            testID={`entry-form-account-${acc.id}`}
                            accessibilityRole="button"
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                            onPress={() => {
                              setAccountId(acc.id);
                              setAccountPickerOpen(false);
                            }}
                            style={[
                              sharedStyles.chip,
                              {
                                backgroundColor: selected ? c.chipActiveBg : c.surfaceContainer,
                                borderWidth: 1,
                                borderColor: selected ? c.chipActiveBg : c.border,
                              },
                            ]}
                          >
                            <Text style={[styles.chipText, { color: selected ? c.chipActiveText : c.text }]}>
                              {acc.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </BentoTile>

              {formKind === 'transfer' ? (
                <BentoTile variant={tileVariant} title="TRANSFERÊNCIA" testID="entry-form-tile-transfer">
                  <View style={{ gap: 10 }}>
                    <Text style={[styles.metaLabel, { color: c.muted }]}>Conta de origem</Text>
                    <View testID="entry-transfer-from-picker" style={sharedStyles.chipRow}>
                      {accounts.map((acc) => {
                        const selected = acc.id === accountId;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            testID={`entry-transfer-from-${acc.id}`}
                            accessibilityRole="button"
                            onPress={() => setAccountId(acc.id)}
                            style={[
                              sharedStyles.chip,
                              {
                                backgroundColor: selected ? c.chipActiveBg : c.surfaceContainer,
                                borderWidth: 1,
                                borderColor: selected ? c.chipActiveBg : c.border,
                              },
                            ]}
                          >
                            <Text style={[styles.chipText, { color: selected ? c.chipActiveText : c.text }]}>
                              {acc.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.metaLabel, { color: c.muted }]}>Conta de destino</Text>
                    <View testID="entry-transfer-to-picker" style={sharedStyles.chipRow}>
                      {accounts.map((acc) => {
                        const selected = acc.id === toAccountId;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            testID={`entry-transfer-to-${acc.id}`}
                            accessibilityRole="button"
                            onPress={() => setToAccountId(acc.id)}
                            style={[
                              sharedStyles.chip,
                              {
                                backgroundColor: selected ? c.chipActiveBg : c.surfaceContainer,
                                borderWidth: 1,
                                borderColor: selected ? c.chipActiveBg : c.border,
                              },
                            ]}
                          >
                            <Text style={[styles.chipText, { color: selected ? c.chipActiveText : c.text }]}>
                              {acc.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </BentoTile>
              ) : null}

              {formKind !== 'transfer' ? (
              <>
              <BentoTile variant={tileVariant} title="CATEGORIA" testID="entry-form-tile-categoria">
                <View testID="entry-form-section-categoria">
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
                              backgroundColor: selected ? c.surfaceElevated : c.surfaceContainer,
                              borderWidth: 1,
                              borderColor: selected ? c.primary : c.border,
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
                    <TouchableOpacity
                      testID="entry-form-new-category-btn"
                      accessibilityRole="button"
                      accessibilityLabel="Nova categoria"
                      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                      onPress={() => {
                        setQuickCatName('');
                        setQuickCatColor(APPROVED_FIN_PALETTE[0]);
                        setQuickCatOpen((prev) => !prev);
                      }}
                      style={[
                        sharedStyles.chip,
                        {
                          backgroundColor: c.surfaceContainer,
                          borderWidth: 1,
                          borderColor: quickCatOpen ? c.primary : c.border,
                        },
                      ]}
                    >
                      <MaterialIcons name="add" size={16} color={c.primary} />
                      <Text style={[styles.chipText, { color: c.primary }]}>Nova</Text>
                    </TouchableOpacity>
                  </View>

                  {quickCatOpen ? (
                    <View
                      testID="quick-category-box"
                      style={[
                        styles.quickCatBox,
                        { backgroundColor: c.surfaceContainer, borderColor: c.border },
                      ]}
                    >
                      <TextInput
                        testID="quick-category-name-input"
                        value={quickCatName}
                        onChangeText={setQuickCatName}
                        placeholder="Nome da nova categoria"
                        placeholderTextColor={c.muted}
                        style={[
                          styles.descInput,
                          { color: c.text, borderBottomColor: c.primary, marginBottom: 8 },
                        ]}
                      />
                      <View style={styles.quickSwatchRow}>
                        {APPROVED_FIN_PALETTE.map((hex) => {
                          const active = quickCatColor === hex;
                          return (
                            <TouchableOpacity
                              key={hex}
                              accessibilityRole="button"
                              accessibilityLabel={`Cor ${hex}`}
                              onPress={() => setQuickCatColor(hex)}
                              style={[
                                styles.quickSwatch,
                                {
                                  backgroundColor: hex,
                                  borderWidth: active ? 2 : 0,
                                  borderColor: c.text,
                                },
                              ]}
                            />
                          );
                        })}
                      </View>
                      <View style={styles.quickCatActions}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => setQuickCatOpen(false)}
                          style={[styles.quickCatBtn, { borderColor: c.border, borderWidth: 1 }]}
                        >
                          <Text style={[styles.chipText, { color: c.muted }]}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID="quick-category-save-btn"
                          accessibilityRole="button"
                          disabled={savingQuickCat}
                          onPress={() => void handleSaveQuickCategory()}
                          style={[styles.quickCatBtn, { backgroundColor: c.primary }]}
                        >
                          <Text style={[styles.chipText, { color: c.primaryFg }]}>
                            {savingQuickCat ? 'Salvando...' : 'Criar categoria'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              </BentoTile>

              <BentoTile variant={tileVariant} title="REPETIÇÃO" testID="entry-form-tile-repeticao">
                <View testID="entry-form-section-repeticao">
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
                </View>
              </BentoTile>
              </>
              ) : null}
            </ScrollView>

            <View testID="entry-form-footer" style={styles.footer}>
              <JellyPressable
                testID="entry-form-save-btn"
                accessibilityRole="button"
                accessibilityLabel="Salvar lançamento"
                disabled={saving}
                onPress={() => void handleSave()}
                containerStyle={[styles.saveBtnContainer, { backgroundColor: c.primary }]}
                style={[styles.saveBtnInner, { backgroundColor: c.primary }]}
              >
                <Text style={sharedStyles.primaryBtnText}>
                  {saving ? 'Salvando...' : 'Salvar lançamento'}
                </Text>
              </JellyPressable>
            </View>
          </>
        )}
      </View>
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  ocrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
  ocrBannerText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    flex: 1,
  },
  lowConfBadge: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
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
  sheetFill: {
    flex: 1,
    minHeight: 0,
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  metaField: {
    flex: 1,
    gap: 2,
  },
  metaValueInput: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  metaValueTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  metaValueText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 13,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnInner: {
    height: 56,
    width: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCatBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  quickSwatchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  quickCatActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  quickCatBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
