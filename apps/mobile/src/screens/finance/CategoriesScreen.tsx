import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  BentoSection,
  BentoSheetHeader,
  BentoTile,
  FinListCard,
  FinListRow,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinCategory, FinEntry } from '../../db/schema';
import type { FinKind } from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import type { ThemeMode } from '../../theme/palettes';
import { layout, typography } from '../../theme/tokens';
import {
  FIN_CATEGORY_ICONS,
  FIN_COLOR_SWATCHES,
  FinEmptyState,
  FinErrorView,
  FinFloatingAddButton,
  FinLoadingView,
  getFinUiColors,
  resolveApprovedColor,
  resolveCategoryVisual,
} from './finTheme';

export interface CategoriesScreenProps {
  onBack: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const CategoriesScreen: React.FC<CategoriesScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'categories-screen',
}) => {
  const ui = getFinUiColors(themeMode);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [entries, setEntries] = useState<FinEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<FinKind>('expense');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<FinKind>('expense');
  const [newIcon, setNewIcon] = useState<string>(FIN_CATEGORY_ICONS[0]);
  const [newColor, setNewColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [savingNew, setSavingNew] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, allEntries] = await Promise.all([
        finRepository.listCategories(false),
        finRepository.listAllEntries(),
      ]);
      setCategories(cats);
      setEntries(allEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const entryCountByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(entry.category_id, (map.get(entry.category_id) ?? 0) + 1);
    }
    return map;
  }, [entries]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.kind === kindFilter),
    [categories, kindFilter]
  );

  const selectedCategory = useMemo(() => {
    if (filteredCategories.length === 0) return null;
    return filteredCategories.find((c) => c.id === selectedId) ?? filteredCategories[0];
  }, [filteredCategories, selectedId]);

  useEffect(() => {
    if (selectedCategory) {
      setEditName(selectedCategory.name);
      setEditColor(resolveApprovedColor(selectedCategory.color, FIN_COLOR_SWATCHES[0]));
    }
  }, [selectedCategory?.id]);

  const handleSaveEdit = async () => {
    if (!selectedCategory || savingEdit) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSavingEdit(true);
    try {
      await finRepository.updateCategory(selectedCategory.id, {
        name: trimmed,
        color: editColor,
      });
      await loadData();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleArchive = async (cat: FinCategory) => {
    await finRepository.archiveCategory(cat.id);
    if (selectedId === cat.id) {
      setSelectedId(null);
    }
    await loadData();
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || savingNew) return;
    setSavingNew(true);
    try {
      await finRepository.createCategory({
        name: trimmed,
        kind: newKind,
        icon: newIcon,
        color: newColor,
      });
      setCreateOpen(false);
      setKindFilter(newKind);
      await loadData();
    } finally {
      setSavingNew(false);
    }
  };

  const openCreateModal = () => {
    setNewName('');
    setNewKind(kindFilter);
    setNewIcon(FIN_CATEGORY_ICONS[0]);
    setNewColor(FIN_COLOR_SWATCHES[0]);
    setCreateOpen(true);
  };

  const actionBorder = ui.isLight ? '#E2DACB' : '#34383C';

  return (
    <View style={[styles.container, { backgroundColor: ui.background }]} testID={testID}>
      <XpMinimalHeader
        title="Categorias"
        subtitle="Organize seus lançamentos"
        onBack={onBack}
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
          <SegmentedControl
            testID="categories-kind-segmented"
            themeMode={themeMode}
            options={[
              { id: 'expense', label: 'Despesas' },
              { id: 'income', label: 'Receitas' },
            ]}
            value={kindFilter}
            onChange={(val) => {
              setKindFilter(val as FinKind);
              setSelectedId(null);
            }}
          />

          {filteredCategories.length === 0 ? (
            <FinEmptyState
              testID="categories-empty-state"
              icon="category"
              title="Nenhuma categoria"
              subtitle="Crie categorias personalizadas para classificar seus gastos e ganhos."
              actionLabel="Nova categoria"
              onAction={openCreateModal}
              themeMode={themeMode}
            />
          ) : (
            <>
              <FinListCard
                testID="categories-list-card"
                themeMode={themeMode}
              >
                {filteredCategories.map((cat, idx) => {
                  const visual = resolveCategoryVisual(cat);
                  const isSelected = selectedCategory?.id === cat.id;
                  const count = entryCountByCategory.get(cat.id) ?? 0;

                  return (
                    <FinListRow
                      key={cat.id}
                      testID={`category-row-${cat.id}`}
                      avatarTestID={`category-avatar-${cat.id}`}
                      avatarSize={40}
                      avatarRingColor={isSelected ? '#E6DECA' : undefined}
                      icon={visual.icon}
                      avatarColor={visual.color}
                      iconColor={visual.iconColor}
                      title={cat.name}
                      subtitle={`${count} lançamentos`}
                      isLast={idx === filteredCategories.length - 1}
                      themeMode={themeMode}
                      onPress={() => setSelectedId(cat.id)}
                      rightAccessory={
                        <View style={styles.rowRight}>
                          <MaterialIcons
                            name={isSelected ? 'edit' : 'chevron-right'}
                            size={18}
                            color={isSelected ? '#D96628' : ui.muted}
                          />
                        </View>
                      }
                    />
                  );
                })}
              </FinListCard>

              {selectedCategory && (
                <BentoTile
                  variant={ui.isLight ? 'light' : 'dark'}
                  title={`EDITAR · ${selectedCategory.name.toUpperCase()}`}
                  testID="categories-edit-tile"
                >
                  <View style={styles.editBody}>
                    <TextInput
                      testID="category-edit-name-input"
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Nome da categoria"
                      placeholderTextColor={ui.muted}
                      style={[
                        styles.editInput,
                        { color: ui.text },
                      ]}
                    />

                    <View style={styles.swatchRow} testID="category-edit-color-row">
                      {FIN_COLOR_SWATCHES.map((swatch) => {
                        const active = editColor === swatch;
                        return (
                          <TouchableOpacity
                            key={swatch}
                            testID={`category-edit-color-${swatch}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Selecionar cor ${swatch}`}
                            onPress={() => setEditColor(swatch)}
                            style={[
                              styles.swatch,
                              { backgroundColor: swatch },
                              active && {
                                borderWidth: 2,
                                borderColor: ui.isLight ? '#111315' : '#E6DECA',
                              },
                            ]}
                          />
                        );
                      })}
                    </View>

                    <View style={styles.editActions}>
                      <JellyPressable
                        testID="category-edit-archive-btn"
                        onPress={() => void handleArchive(selectedCategory)}
                        containerStyle={[styles.editArchiveBtn, { borderColor: actionBorder }]}
                        accessibilityLabel={`Arquivar ${selectedCategory.name}`}
                      >
                        <Text style={[styles.editArchiveText, { color: ui.expense }]}>Arquivar</Text>
                      </JellyPressable>

                      <JellyPressable
                        testID="category-edit-save-btn"
                        onPress={() => void handleSaveEdit()}
                        containerStyle={styles.editSaveBtn}
                        accessibilityLabel="Salvar alterações"
                      >
                        <Text style={styles.editSaveText}>
                          {savingEdit ? 'Salvando...' : 'Salvar'}
                        </Text>
                      </JellyPressable>
                    </View>
                  </View>
                </BentoTile>
              )}
            </>
          )}
        </ScrollView>
      )}

      <FinFloatingAddButton
        testID="categories-add-btn"
        accessibilityLabel="Nova categoria"
        onPress={openCreateModal}
      />

      <AnimatedModalSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        themeMode={themeMode}
      >
        <BentoSheetHeader
          title="Nova categoria"
          onClose={() => setCreateOpen(false)}
          themeMode={themeMode}
        />

        <View style={styles.sheetBody}>
          <SegmentedControl
            themeMode={themeMode}
            options={[
              { id: 'expense', label: 'Despesa' },
              { id: 'income', label: 'Receita' },
            ]}
            value={newKind}
            onChange={(val) => setNewKind(val as FinKind)}
          />

          <BentoSection title="NOME" themeMode={themeMode}>
            <TextField
              value={newName}
              onChangeText={setNewName}
              placeholder="Ex: Educação, Pets"
              themeMode={themeMode}
              testID="category-form-name-input"
            />
          </BentoSection>

          <BentoSection title="ÍCONE" themeMode={themeMode}>
            <View style={styles.iconRow}>
              {FIN_CATEGORY_ICONS.map((ic) => {
                const selected = newIcon === ic;
                return (
                  <TouchableOpacity
                    key={ic}
                    accessibilityRole="button"
                    accessibilityLabel={`Selecionar ícone ${ic}`}
                    onPress={() => setNewIcon(ic)}
                    style={[
                      styles.iconChip,
                      {
                        backgroundColor: selected ? '#2E4A44' : ui.surfaceContainer,
                        borderColor: selected ? '#AECDC5' : actionBorder,
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={ic as keyof typeof MaterialIcons.glyphMap}
                      size={18}
                      color={selected ? '#E6DECA' : ui.text}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </BentoSection>

          <BentoSection title="COR" themeMode={themeMode}>
            <View style={styles.swatchRow}>
              {FIN_COLOR_SWATCHES.map((swatch) => {
                const selected = newColor === swatch;
                return (
                  <TouchableOpacity
                    key={swatch}
                    accessibilityRole="button"
                    accessibilityLabel={`Selecionar cor ${swatch}`}
                    onPress={() => setNewColor(swatch)}
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch },
                      selected && {
                        borderWidth: 2,
                        borderColor: ui.isLight ? '#111315' : '#E6DECA',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </BentoSection>

          <JellyPressable
            testID="category-form-save-btn"
            onPress={() => void handleCreate()}
            containerStyle={styles.saveBtn}
            accessibilityLabel="Criar categoria"
          >
            <Text style={styles.saveBtnText}>
              {savingNew ? 'Salvando...' : 'Criar categoria'}
            </Text>
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
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowArchiveTouch: {
    padding: 4,
  },
  editBody: {
    gap: 12,
    marginTop: 8,
  },
  editInput: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D96628',
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
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editArchiveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editArchiveText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  editSaveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D96628',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0E08',
  },
  sheetBody: {
    gap: 14,
    paddingBottom: 16,
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
