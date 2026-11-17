import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BentoTile, DotTrack, XpMinimalHeader } from '../../components/ui';
import type { FinBudget, FinCategory, FinEntry } from '../../db/schema';
import {
  calculateBudgetUsage,
  formatCentsBRL,
  formatYearMonthPtBr,
  getTodayIsoLocal,
  parseBRLToCents,
  suggestBudgetLimit,
  type BudgetUsageItem,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { finReminderService } from '../../services/finReminderService';
import { useFinStore } from '../../stores/finStore';
import type { ThemeMode } from '../../theme/palettes';
import { getFinUiColors, sharedStyles } from './finTheme';

export interface BudgetScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const BudgetScreen: React.FC<BudgetScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'budget-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const { selectedMonth } = useFinStore();
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [budgets, setBudgets] = useState<FinBudget[]>([]);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [onlyThisMonth, setOnlyThisMonth] = useState(false);

  const loadData = useCallback(async () => {
    const [cats, allEntries, allBudgets] = await Promise.all([
      finRepository.listCategories(false),
      finRepository.listAllEntries(),
      finRepository.listBudgets(),
    ]);
    setCategories(cats.filter((cat) => cat.kind === 'expense'));
    setEntries(allEntries);
    setBudgets(allBudgets);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, selectedMonth]);

  const todayIso = getTodayIsoLocal();

  const usageByCategory = useMemo(() => {
    const items = calculateBudgetUsage(entries, budgets, selectedMonth, { todayIso });
    return new Map<string, BudgetUsageItem>(items.map((i) => [i.categoryId, i]));
  }, [entries, budgets, selectedMonth, todayIso]);

  const handleStartEdit = (catId: string) => {
    const current = usageByCategory.get(catId);
    const suggested = suggestBudgetLimit(entries, catId, selectedMonth);
    const initialCents = current?.limitCents ?? (suggested > 0 ? suggested : 0);
    setEditingCatId(catId);
    setOnlyThisMonth(Boolean(current?.isMonthlySpecific));
    setLimitInput(initialCents > 0 ? (initialCents / 100).toFixed(2).replace('.', ',') : '');
  };

  const handleSaveLimit = async (catId: string) => {
    const cents = parseBRLToCents(limitInput);
    if (cents <= 0) {
      setEditingCatId(null);
      return;
    }
    await finRepository.upsertBudget({
      categoryId: catId,
      yearMonth: onlyThisMonth ? selectedMonth : null,
      limitCents: cents,
    });
    setEditingCatId(null);
    await loadData();
    await finReminderService.checkAndNotifyBudgetAlerts(selectedMonth, { isPrivacyMode, todayIso }).catch(() => {});
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        module="finance"
        title="Orçamento"
        subtitle={formatYearMonthPtBr(selectedMonth)}
        isGlobeActive={true}
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: 130 }]}>
        {categories.map((cat) => {
          const usage = usageByCategory.get(cat.id);
          const spentCents = usage?.spentCents ?? 0;
          const limitCents = usage?.limitCents ?? null;
          const percentage = usage?.percentage ?? 0;
          const status = usage?.status ?? null;
          const trackColor =
            status === 'estourado'
              ? c.overdue
              : status === 'atencao'
              ? '#D4A83B'
              : c.income;
          const suggestedCents = suggestBudgetLimit(entries, cat.id, selectedMonth);
          const isEditing = editingCatId === cat.id;

          return (
            <BentoTile
              key={cat.id}
              variant={themeMode === 'light' ? 'light' : 'dark'}
              testID={`budget-tile-${cat.id}`}
              style={styles.tile}
            >
              <View style={styles.headerRow}>
                <Text style={[styles.catName, { color: c.text }]}>{cat.name}</Text>
                <TouchableOpacity
                  testID={`budget-set-limit-${cat.id}`}
                  onPress={() => (isEditing ? setEditingCatId(null) : handleStartEdit(cat.id))}
                >
                  <Text style={[styles.editAction, { color: c.primary }]}>
                    {isEditing ? 'Cancelar' : limitCents !== null ? 'Editar limite' : 'Definir limite'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.amountsRow}>
                <Text style={[styles.amountsText, { color: c.text }]}>
                  {formatCentsBRL(spentCents, isPrivacyMode)}
                  {limitCents !== null ? ` / ${formatCentsBRL(limitCents, isPrivacyMode)}` : ' (sem limite)'}
                </Text>
                {limitCents !== null ? (
                  <Text style={[styles.pctText, { color: trackColor }]}>
                    {Math.round(percentage)}%
                  </Text>
                ) : null}
              </View>

              <DotTrack
                testID={`budget-dot-track-${cat.id}`}
                percentage={limitCents !== null ? Math.min(100, percentage) : 0}
                color={trackColor}
                trackColor={c.trackBg}
                style={styles.track}
              />

              {limitCents !== null && usage?.remainingPerDayCents != null ? (
                <Text style={[styles.metaText, { color: c.muted }]}>
                  Restam {formatCentsBRL(usage.remainingPerDayCents, isPrivacyMode)} por dia
                </Text>
              ) : null}

              {usage?.paceText && !isPrivacyMode ? (
                <Text style={[styles.metaText, { color: c.muted }]}>{usage.paceText}</Text>
              ) : null}

              {isEditing ? (
                <View style={[styles.editorBox, { borderTopColor: c.border }]}>
                  {suggestedCents > 0 ? (
                    <TouchableOpacity
                      onPress={() =>
                        setLimitInput((suggestedCents / 100).toFixed(2).replace('.', ','))
                      }
                    >
                      <Text style={[styles.suggestionText, { color: c.muted }]}>
                        Sugestão (média 3 meses): {formatCentsBRL(suggestedCents, isPrivacyMode)}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TextInput
                    testID={`budget-limit-input-${cat.id}`}
                    value={limitInput}
                    onChangeText={setLimitInput}
                    placeholder="Ex: 1000,00"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: c.text, borderColor: c.border }]}
                  />
                  <View style={styles.editorActions}>
                    <TouchableOpacity
                      onPress={() => setOnlyThisMonth((v) => !v)}
                      style={[
                        styles.scopeChip,
                        { borderColor: c.border, backgroundColor: onlyThisMonth ? c.primary : 'transparent' },
                      ]}
                    >
                      <Text style={{ color: onlyThisMonth ? '#FFFFFF' : c.text, fontSize: 12 }}>
                        {onlyThisMonth ? 'Só este mês' : 'Todo mês'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`budget-save-limit-${cat.id}`}
                      onPress={() => handleSaveLimit(cat.id)}
                      style={[styles.saveBtn, { backgroundColor: c.primary }]}
                    >
                      <Text style={styles.saveBtnText}>Salvar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </BentoTile>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catName: {
    fontSize: 15,
    fontWeight: '700',
  },
  editAction: {
    fontSize: 13,
    fontWeight: '600',
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amountsText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pctText: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    marginTop: 2,
  },
  editorBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  suggestionText: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scopeChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saveBtn: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
