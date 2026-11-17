import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import type { FinAccount, FinCategory } from '../db/schema';
import { formatCentsBRL, type FinKind } from '../domain/financeFlow';
import {
  suggestRulePattern,
  type CsvColumnMapping,
  type ReconciledStatementRow,
} from '../domain/statementImport';
import { finRepository } from '../repositories/finRepository';
import { readPickedFileBytes } from '../services/pickedFileReader';
import {
  statementImportService,
  type StatementCommitResult,
  type StatementPreviewResult,
} from '../services/statementImportService';
import type { ThemeMode } from '../theme/palettes';
import { layout, space, typography } from '../theme/tokens';
import { AnimatedModalSheet, BentoSheetHeader } from './ui';
import { getFinUiColors } from '../screens/finance/finTheme';

export interface StatementImportSheetProps {
  visible: boolean;
  onClose: () => void;
  initialAccountId?: string;
  onCompleted?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

type ImportStep = 'pick' | 'manual_map' | 'preview' | 'result';

export const StatementImportSheet: React.FC<StatementImportSheetProps> = ({
  visible,
  onClose,
  initialAccountId,
  onCompleted,
  themeMode = 'dark',
  testID = 'statement-import-sheet',
}) => {
  const ui = getFinUiColors(themeMode);
  const [step, setStep] = useState<ImportStep>('pick');
  const [accounts, setAccounts] = useState<FinAccount[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId ?? ''
  );
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<StatementPreviewResult | null>(null);
  const [rows, setRows] = useState<ReconciledStatementRow[]>([]);
  const [commitResult, setCommitResult] =
    useState<StatementCommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [ruleSuggestion, setRuleSuggestion] = useState<{
    rowIdx: number;
    pattern: string;
    kind: FinKind;
    categoryId: string;
  } | null>(null);

  const [manualDateCol, setManualDateCol] = useState<number>(0);
  const [manualDescCol, setManualDescCol] = useState<number>(1);
  const [manualAmountCol, setManualAmountCol] = useState<number>(2);
  const [manualInvertSign, setManualInvertSign] = useState<boolean>(false);

  const resetState = useCallback(() => {
    setStep('pick');
    setFileBytes(null);
    setFileName('');
    setPreview(null);
    setRows([]);
    setCommitResult(null);
    setError(null);
    setEditingRowIdx(null);
    setRuleSuggestion(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    resetState();
    void (async () => {
      try {
        const [accs, cats] = await Promise.all([
          finRepository.listAccounts(false),
          finRepository.listCategories(false),
        ]);
        setAccounts(accs);
        setCategories(cats);
        if (initialAccountId) {
          setSelectedAccountId(initialAccountId);
        } else if (accs.length > 0) {
          setSelectedAccountId(accs[0].id);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar contas'
        );
      }
    })();
  }, [visible, initialAccountId, resetState]);

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const runPreview = useCallback(
    async (
      bytes: Uint8Array,
      name: string,
      accId: string,
      mapping?: CsvColumnMapping
    ) => {
      setBusy(true);
      setError(null);
      try {
        const res = await statementImportService.previewFile({
          fileBytes: bytes,
          fileName: name,
          accountId: accId,
          manualMapping: mapping,
        });
        setPreview(res);
        setRows(res.rows);
        setStep(res.needsManualMapping ? 'manual_map' : 'preview');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Erro ao ler o arquivo'
        );
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handlePickFile = useCallback(async () => {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets || picked.assets.length === 0) {
        return;
      }
      const asset = picked.assets[0];
      const bytes = await readPickedFileBytes(asset.uri);
      setFileBytes(bytes);
      setFileName(asset.name || 'extrato.csv');

      const targetAccountId = selectedAccountId || accounts[0]?.id || '';
      if (!targetAccountId) {
        setError('Crie uma conta antes de importar um arquivo.');
        return;
      }
      setSelectedAccountId(targetAccountId);
      await runPreview(bytes, asset.name || 'extrato.csv', targetAccountId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Não foi possível abrir o arquivo'
      );
    }
  }, [selectedAccountId, accounts, runPreview]);

  const handleSelectRowCategory = (rowIdx: number, categoryId: string) => {
    const targetRow = rows[rowIdx];
    if (!targetRow) return;
    setRows((prev) =>
      prev.map((r, idx) => (idx === rowIdx ? { ...r, categoryId } : r))
    );
    setEditingRowIdx(null);
    setRuleSuggestion({
      rowIdx,
      pattern: suggestRulePattern(targetRow.description),
      kind: targetRow.direction === 'in' ? 'income' : 'expense',
      categoryId,
    });
  };

  const handleSaveRuleSuggestion = async () => {
    if (!ruleSuggestion) return;
    await statementImportService.saveCategoryRule({
      pattern: ruleSuggestion.pattern,
      matchType: 'contains',
      kind: ruleSuggestion.kind,
      categoryId: ruleSuggestion.categoryId,
    });
    const normTarget = ruleSuggestion.pattern.toLowerCase();
    setRows((prev) =>
      prev.map((r) =>
        r.description.toLowerCase().includes(normTarget) &&
        (r.direction === 'in' ? 'income' : 'expense') === ruleSuggestion.kind
          ? { ...r, categoryId: ruleSuggestion.categoryId }
          : r
      )
    );
    setRuleSuggestion(null);
  };

  const handleConfirmImport = async () => {
    if (!selectedAccountId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await statementImportService.commitImport({
        accountId: selectedAccountId,
        rows,
      });
      setCommitResult(result);
      setStep('result');
      onCompleted?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao gravar importação'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUndoImport = async () => {
    if (!commitResult) return;
    setBusy(true);
    try {
      await statementImportService.undoImportBatch(commitResult.batchId);
      onCompleted?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    let newCount = 0;
    let duplicateCount = 0;
    let settlePendingCount = 0;
    for (const r of rows) {
      if (r.reconcileStatus === 'new') newCount++;
      else if (r.reconcileStatus === 'duplicate') duplicateCount++;
      else if (r.reconcileStatus === 'settle_pending') settlePendingCount++;
    }
    return { newCount, duplicateCount, settlePendingCount };
  }, [rows]);

  const isExpanded = step !== 'pick';

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={themeMode}
      expanded={isExpanded}
      collapsedHeight={0.62}
      expandedHeight={0.96}
      fill={isExpanded}
      scrollable={false}
    >
      <View testID={testID} style={styles.root}>
        <BentoSheetHeader
          title="Importar fatura ou extrato"
          subtitle={
            step === 'pick'
              ? 'Arquivos OFX ou CSV (Nubank, Inter, C6, Itaú)'
              : fileName
          }
          onClose={onClose}
          themeMode={themeMode}
        />

        {error ? (
          <View style={[styles.errorBox, { borderColor: ui.expense }]}>
            <Text style={[styles.errorText, { color: ui.expense }]}>{error}</Text>
          </View>
        ) : null}

        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator color={ui.primary} />
          </View>
        ) : null}

        {!busy && step === 'pick' ? (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.label, { color: ui.muted }]}>
              CONTA DE DESTINO
            </Text>
            <View style={styles.chipRow}>
              {accounts.map((acc) => {
                const active = acc.id === selectedAccountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    onPress={() => setSelectedAccountId(acc.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? ui.primary : ui.surface,
                        borderColor: active ? ui.primary : ui.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? ui.onAccentText : ui.text,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              testID="statement-pick-file-btn"
              onPress={handlePickFile}
              style={[styles.primaryBtn, { backgroundColor: ui.primary }]}
            >
              <MaterialIcons name="upload-file" size={20} color={ui.onAccentText} />
              <Text style={styles.primaryBtnText}>
                Escolher arquivo OFX ou CSV
              </Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {!busy && step === 'manual_map' && preview?.csvMeta ? (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.label, { color: ui.text }]}>
              Mapeamento manual de colunas
            </Text>
            <Text style={[styles.sublabel, { color: ui.muted }]}>
              Layout não reconhecido automaticamente. Escolha as colunas:
            </Text>

            <Text style={[styles.label, { color: ui.muted }]}>DATA</Text>
            <View style={styles.chipRow}>
              {preview.csvMeta.headers.map((h, idx) => (
                <TouchableOpacity
                  key={`d-${idx}`}
                  onPress={() => setManualDateCol(idx)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        manualDateCol === idx ? ui.primary : ui.surface,
                      borderColor: ui.border,
                    },
                  ]}
                >
                  <Text style={{ color: manualDateCol === idx ? ui.onAccentText : ui.text }}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: ui.muted }]}>DESCRIÇÃO</Text>
            <View style={styles.chipRow}>
              {preview.csvMeta.headers.map((h, idx) => (
                <TouchableOpacity
                  key={`desc-${idx}`}
                  onPress={() => setManualDescCol(idx)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        manualDescCol === idx ? ui.primary : ui.surface,
                      borderColor: ui.border,
                    },
                  ]}
                >
                  <Text style={{ color: manualDescCol === idx ? ui.onAccentText : ui.text }}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: ui.muted }]}>VALOR</Text>
            <View style={styles.chipRow}>
              {preview.csvMeta.headers.map((h, idx) => (
                <TouchableOpacity
                  key={`amt-${idx}`}
                  onPress={() => setManualAmountCol(idx)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        manualAmountCol === idx ? ui.primary : ui.surface,
                      borderColor: ui.border,
                    },
                  ]}
                >
                  <Text style={{ color: manualAmountCol === idx ? ui.onAccentText : ui.text }}>
                    {h}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setManualInvertSign((v) => !v)}
              style={[styles.chip, { backgroundColor: ui.surface, borderColor: ui.border }]}
            >
              <Text style={{ color: ui.text }}>
                {manualInvertSign
                  ? '✓ Inverter sinal (fatura de cartão)'
                  : 'Inverter sinal (fatura de cartão)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (fileBytes) {
                  void runPreview(fileBytes, fileName, selectedAccountId, {
                    dateCol: manualDateCol,
                    descriptionCol: manualDescCol,
                    amountCol: manualAmountCol,
                    invertSign: manualInvertSign,
                  });
                }
              }}
              style={[styles.primaryBtn, { backgroundColor: ui.primary }]}
            >
              <Text style={[styles.primaryBtnText, { color: ui.onAccentText }]}>Aplicar colunas</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {!busy && step === 'preview' ? (
          <View style={styles.flex1}>
            <View testID="statement-preview-counts" style={styles.countsBar}>
              <View style={[styles.countPill, { backgroundColor: ui.surface }]}>
                <Text testID="statement-count-new" style={[styles.countVal, { color: ui.text }]}>
                  {counts.newCount}
                </Text>
                <Text style={[styles.countLbl, { color: ui.muted }]}>Novos</Text>
              </View>
              <View style={[styles.countPill, { backgroundColor: ui.surface }]}>
                <Text testID="statement-count-duplicate" style={[styles.countVal, { color: ui.muted }]}>
                  {counts.duplicateCount}
                </Text>
                <Text style={[styles.countLbl, { color: ui.muted }]}>Duplicados</Text>
              </View>
              <View style={[styles.countPill, { backgroundColor: ui.surface }]}>
                <Text testID="statement-count-settle" style={[styles.countVal, { color: ui.primary }]}>
                  {counts.settlePendingCount}
                </Text>
                <Text style={[styles.countLbl, { color: ui.muted }]}>Baixas</Text>
              </View>
            </View>

            {ruleSuggestion ? (
              <TouchableOpacity
                onPress={handleSaveRuleSuggestion}
                style={[styles.ruleBanner, { backgroundColor: ui.surface, borderColor: ui.primary }]}
              >
                <MaterialIcons name="auto-fix-high" size={16} color={ui.primary} />
                <Text style={[styles.ruleBannerText, { color: ui.text }]}>
                  {`Sempre usar esta categoria para "${ruleSuggestion.pattern}"`}
                </Text>
              </TouchableOpacity>
            ) : null}

            <ScrollView style={styles.flex1} contentContainerStyle={styles.rowsList}>
              {rows.map((row, idx) => {
                const cat = categoryById.get(row.categoryId);
                const rowKind: FinKind = row.direction === 'in' ? 'income' : 'expense';
                const isEditing = editingRowIdx === idx;
                return (
                  <View
                    key={`${row.externalId}-${idx}`}
                    style={[styles.rowCard, { backgroundColor: ui.surface, borderColor: ui.border }]}
                  >
                    <View style={styles.rowTop}>
                      <View style={styles.flex1}>
                        <Text style={[styles.rowDesc, { color: ui.text }]} numberOfLines={2}>
                          {row.description}
                        </Text>
                        <Text style={[styles.rowMeta, { color: ui.muted }]}>
                          {row.date}
                          {row.installment
                            ? ` • ${row.installment.number}/${row.installment.total}`
                            : ''}
                          {row.reconcileStatus === 'duplicate'
                            ? ' • Duplicado'
                            : row.reconcileStatus === 'settle_pending'
                              ? ' • Baixa de pendente'
                              : ''}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.rowAmt,
                          { color: row.direction === 'in' ? ui.income : ui.text },
                        ]}
                      >
                        {row.direction === 'in' ? '+' : '-'}
                        {formatCentsBRL(row.amountCents)}
                      </Text>
                    </View>

                    <TouchableOpacity
                      testID={`statement-row-category-${idx}`}
                      onPress={() => setEditingRowIdx(isEditing ? null : idx)}
                      style={[styles.catPill, { borderColor: ui.border }]}
                    >
                      <Text style={{ color: ui.text, fontSize: 12 }}>
                        {cat?.name ?? 'Outros'}
                      </Text>
                    </TouchableOpacity>

                    {isEditing ? (
                      <View style={styles.catPickerGrid}>
                        {categories
                          .filter((c) => c.kind === rowKind)
                          .map((c) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => handleSelectRowCategory(idx, c.id)}
                              style={[
                                styles.chip,
                                {
                                  backgroundColor:
                                    c.id === row.categoryId ? ui.primary : ui.background,
                                  borderColor: ui.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: c.id === row.categoryId ? ui.onAccentText : ui.text,
                                  fontSize: 12,
                                }}
                              >
                                {c.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                testID="statement-confirm-import-btn"
                onPress={handleConfirmImport}
                style={[styles.primaryBtn, { backgroundColor: ui.primary }]}
              >
                <Text style={styles.primaryBtnText}>
                  {`Confirmar importação (${counts.newCount + counts.settlePendingCount})`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!busy && step === 'result' && commitResult ? (
          <View style={styles.resultBox}>
            <MaterialIcons name="check-circle" size={44} color={ui.income} />
            <Text style={[styles.resultTitle, { color: ui.text }]}>
              Importação concluída
            </Text>
            <Text style={[styles.sublabel, { color: ui.muted }]}>
              {`${commitResult.createdCount} criados • ${commitResult.settledCount} baixas • ${commitResult.skippedDuplicateCount} duplicados ignorados`}
            </Text>

            <TouchableOpacity
              onPress={handleUndoImport}
              style={[styles.secondaryBtn, { borderColor: ui.expense }]}
            >
              <Text style={{ color: ui.expense, fontWeight: '600' }}>
                Desfazer importação
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.primaryBtn, { backgroundColor: ui.primary, width: '100%' }]}
            >
              <Text style={[styles.primaryBtnText, { color: ui.onAccentText }]}>Concluir</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  flex1: { flex: 1 },
  body: { paddingVertical: space.md, gap: space.sm },
  center: { padding: space.xl, alignItems: 'center' },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    marginTop: space.xs,
  },
  sublabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    textAlign: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  primaryBtnText: { fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: layout.screenPadding,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  countsBar: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  countPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  countVal: { fontSize: 18, fontWeight: '700' },
  countLbl: { fontSize: 11 },
  ruleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: space.sm,
  },
  ruleBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
  rowsList: { gap: space.sm, paddingBottom: space.md },
  rowCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: space.md,
    gap: space.sm,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  rowDesc: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: space.xs },
  rowAmt: { fontSize: 14, fontWeight: '700' },
  catPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  catPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  footer: { paddingTop: space.xs },
  resultBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
  },
  resultTitle: { fontSize: 18, fontWeight: '700' },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: space.md,
    marginBottom: space.sm,
  },
  errorText: { fontSize: 13 },
});
