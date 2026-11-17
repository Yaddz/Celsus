import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TextField, XpMinimalHeader } from '../../components/ui';
import { FinListCard } from '../../components/ui/FinListCard';
import type { FinCategory, FinCategoryRule } from '../../db/schema';
import type { CategoryRuleMatchType } from '../../domain/statementImport';
import { finRepository } from '../../repositories/finRepository';
import { statementImportService } from '../../services/statementImportService';
import type { ThemeMode } from '../../theme/palettes';
import { space, typography } from '../../theme/tokens';
import { getFinUiColors, sharedStyles } from './finTheme';
import { EmptyState } from '../../components/ui/ScreenStates';

export interface CategoryRulesScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

const MATCH_TYPE_LABELS: Record<CategoryRuleMatchType, string> = {
  contains: 'Contém',
  starts_with: 'Começa com',
  exact: 'Exato',
};

export const CategoryRulesScreen: React.FC<CategoryRulesScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'category-rules-screen',
}) => {
  const insets = useSafeAreaInsets();
  const c = getFinUiColors(themeMode);
  const [rules, setRules] = useState<FinCategoryRule[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [editingRule, setEditingRule] = useState<FinCategoryRule | null>(null);
  const [patternInput, setPatternInput] = useState('');
  const [matchTypeInput, setMatchTypeInput] =
    useState<CategoryRuleMatchType>('contains');
  const [categoryIdInput, setCategoryIdInput] = useState('');

  const loadData = useCallback(async () => {
    const [loadedRules, loadedCats] = await Promise.all([
      statementImportService.listCategoryRules(),
      finRepository.listCategories(false),
    ]);
    setRules(loadedRules);
    setCategories(loadedCats);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const categoryById = useMemo(() => {
    const map = new Map<string, FinCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const startEdit = (rule: FinCategoryRule) => {
    setEditingRule(rule);
    setPatternInput(rule.pattern);
    setMatchTypeInput(rule.match_type as CategoryRuleMatchType);
    setCategoryIdInput(rule.category_id);
  };

  const handleSaveEdit = async () => {
    if (!editingRule || !patternInput.trim()) return;
    await statementImportService.updateCategoryRule(editingRule.id, {
      pattern: patternInput,
      match_type: matchTypeInput,
      category_id: categoryIdInput,
    });
    setEditingRule(null);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await statementImportService.deleteCategoryRule(id);
    if (editingRule?.id === id) setEditingRule(null);
    await loadData();
  };

  return (
    <View
      testID={testID}
      style={[sharedStyles.screen, { backgroundColor: c.background }]}
    >
      <XpMinimalHeader
        module="finance"
        title="Regras de categoria"
        subtitle="Categorização automática"
        isGlobeActive={true}
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        contentContainerStyle={[
          sharedStyles.scrollContent,
          { paddingBottom: dockContentPaddingBottom(insets.bottom) },
        ]}
      >
        {editingRule ? (
          <View
            style={[
              styles.editCard,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text style={[styles.editTitle, { color: c.text }]}>
              Editar regra
            </Text>
            <TextField
              testID="rule-pattern-input"
              label="Trecho"
              value={patternInput}
              onChangeText={setPatternInput}
              themeMode={themeMode}
            />

            <View style={styles.chipRow}>
              {(['contains', 'starts_with', 'exact'] as const).map((mt) => (
                <TouchableOpacity
                  key={mt}
                  onPress={() => setMatchTypeInput(mt)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        matchTypeInput === mt ? c.primary : c.background,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: matchTypeInput === mt ? c.onAccentText : c.text,
                      fontSize: typography.labelMd.fontSize,
                    }}
                  >
                    {MATCH_TYPE_LABELS[mt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.chipRow}>
              {categories
                .filter((cat) => cat.kind === editingRule.kind)
                .map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setCategoryIdInput(cat.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          categoryIdInput === cat.id ? c.primary : c.background,
                        borderColor: c.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: categoryIdInput === cat.id ? c.onAccentText : c.text,
                        fontSize: typography.labelMd.fontSize,
                      }}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                onPress={() => setEditingRule(null)}
                style={[styles.btn, { borderColor: c.border, borderWidth: 1 }]}
              >
                <Text style={{ color: c.muted }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="rule-save-btn"
                onPress={handleSaveEdit}
                style={[styles.btn, { backgroundColor: c.primary }]}
              >
                <Text style={{ color: c.onAccentText, fontWeight: typography.weights.bold }}>
                  Salvar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {rules.length === 0 ? (
          <EmptyState
            testID="category-rules-empty-state"
            icon="rule"
            title="Nenhuma regra salva"
            subtitle="Corrija a categoria de um lançamento durante a importação para criar uma regra automática."
            themeMode={themeMode}
          />
        ) : (
          <FinListCard themeMode={themeMode}>
            {rules.map((rule, idx) => {
              const cat = categoryById.get(rule.category_id);
              const mtLabel =
                MATCH_TYPE_LABELS[rule.match_type as CategoryRuleMatchType] ??
                rule.match_type;
              return (
                <View
                  key={rule.id}
                  style={[
                    styles.ruleRow,
                    idx < rules.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                    },
                  ]}
                >
                  <View style={styles.flex1}>
                    <Text style={[styles.patternText, { color: c.text }]}>
                      {rule.pattern}
                    </Text>
                    <Text style={[styles.metaText, { color: c.muted }]}>
                      {`${mtLabel} → ${cat?.name ?? rule.category_id} • ${rule.hits} usos`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`rule-edit-${idx}`}
                    onPress={() => startEdit(rule)}
                    style={styles.iconBtn}
                  >
                    <MaterialIcons name="edit" size={20} color={c.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`rule-delete-${idx}`}
                    onPress={() => handleDelete(rule.id)}
                    style={styles.iconBtn}
                  >
                    <MaterialIcons name="delete" size={20} color={c.expense} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </FinListCard>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  editCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: space.md,
    marginBottom: space.md,
    gap: space.sm,
  },
  editTitle: { fontFamily: typography.fontFamily, fontSize: typography.sizes.lead, fontWeight: typography.weights.bold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  patternText: { fontSize: typography.labelLg.fontSize, fontWeight: typography.weights.semibold },
  metaText: { fontSize: typography.labelMd.fontSize, marginTop: space.xs },
  iconBtn: { padding: space.sm },
});
