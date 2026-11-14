import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  AnimatedModalSheet,
  TextField,
  XpMinimalHeader,
} from '../../components/ui';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { FinCategory } from '../../db/schema';
import type { FinKind } from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import {
  FIN_CATEGORY_ICONS,
  FIN_COLOR_SWATCHES,
  FinEmptyState,
  FinErrorView,
  FinLoadingView,
  getFinUiColors,
  sharedStyles,
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
  const c = getFinUiColors(themeMode);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinCategory | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FinKind>('expense');
  const [icon, setIcon] = useState<string>('category');
  const [color, setColor] = useState<string>(FIN_COLOR_SWATCHES[0]);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await finRepository.listCategories(false);
      setCategories(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setKind('expense');
    setIcon('category');
    setColor(FIN_COLOR_SWATCHES[0]);
    setFormError(null);
    setIsSheetOpen(true);
  };

  const openEditModal = (cat: FinCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setKind((cat.kind as FinKind) || 'expense');
    setIcon(cat.icon || 'category');
    setColor(cat.color || FIN_COLOR_SWATCHES[0]);
    setFormError(null);
    setIsSheetOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setFormError('Informe o nome da categoria.');
      return;
    }
    if (editingCategory) {
      await finRepository.updateCategory(editingCategory.id, {
        name: name.trim(),
        kind,
        icon,
        color,
      });
    } else {
      await finRepository.createCategory({
        name: name.trim(),
        kind,
        icon,
        color,
      });
    }
    setIsSheetOpen(false);
    await loadData();
  };

  const handleArchive = async (catId: string) => {
    await finRepository.archiveCategory(catId);
    await loadData();
  };

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Categorias"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={sharedStyles.scrollContent}>
        <View style={styles.toolbarRow}>
          <Text style={[sharedStyles.sectionLabel, { color: c.muted }]}>Categorias ativas</Text>
          <TouchableOpacity
            testID="categories-add-btn"
            accessibilityRole="button"
            onPress={openCreateModal}
            style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
          >
            <MaterialIcons name="add" size={18} color="#1A0E08" />
            <Text style={sharedStyles.primaryBtnText}>Nova categoria</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <FinLoadingView themeMode={themeMode} />
        ) : error ? (
          <FinErrorView message={error} onRetry={loadData} themeMode={themeMode} />
        ) : categories.length === 0 ? (
          <FinEmptyState
            testID="categories-empty-state"
            icon="category"
            title="Nenhuma categoria cadastrada"
            subtitle="Crie categorias de receita ou despesa para classificar seus gastos."
            themeMode={themeMode}
          />
        ) : (
          categories.map((cat) => (
            <View
              key={cat.id}
              testID={`category-row-${cat.id}`}
              style={[sharedStyles.rowCard, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <View style={styles.rowHeader}>
                <View style={styles.rowIdentity}>
                  <View style={[styles.iconCircle, { backgroundColor: cat.color || c.primary }]}>
                    <MaterialIcons
                      name={(cat.icon as keyof typeof MaterialIcons.glyphMap) || 'category'}
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>
                  <View style={styles.rowTitleWrap}>
                    <Text style={[styles.rowTitle, { color: c.text }]}>{cat.name}</Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>
                      {cat.kind === 'income' ? 'Receita' : 'Despesa'}
                    </Text>
                  </View>
                </View>

                <View style={styles.rowActions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => openEditModal(cat)}
                    style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                  >
                    <MaterialIcons name="edit" size={18} color={c.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`category-archive-btn-${cat.id}`}
                    accessibilityRole="button"
                    onPress={() => void handleArchive(cat.id)}
                    style={[sharedStyles.iconBtn, { backgroundColor: c.surfaceContainer }]}
                  >
                    <MaterialIcons name="archive" size={18} color={c.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <AnimatedModalSheet
        visible={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        themeMode={themeMode}
        testID="category-form-sheet"
      >
        <Text style={[sharedStyles.modalTitle, { color: c.text }]}>
          {editingCategory ? 'Editar categoria' : 'Nova categoria'}
        </Text>

        <TextField
          label="Nome da categoria"
          value={name}
          onChangeText={(txt) => {
            setName(txt);
            setFormError(null);
          }}
          placeholder="Ex.: Educação, Mercado"
          error={formError}
          themeMode={themeMode}
        />

        <Text style={[sharedStyles.sectionLabel, { color: c.muted, marginBottom: space.xs }]}>
          Tipo
        </Text>
        <SegmentedControl<FinKind>
          value={kind}
          onChange={setKind}
          options={[
            { id: 'expense', label: 'Despesa' },
            { id: 'income', label: 'Receita' },
          ]}
          themeMode={themeMode}
        />

        <Text style={[sharedStyles.sectionLabel, { color: c.muted, marginTop: space.md, marginBottom: space.xs }]}>
          Ícone
        </Text>
        <View style={sharedStyles.chipRow}>
          {FIN_CATEGORY_ICONS.map((ic) => (
            <TouchableOpacity
              key={ic}
              accessibilityRole="button"
              onPress={() => setIcon(ic)}
              style={[
                sharedStyles.iconBtn,
                {
                  backgroundColor: icon === ic ? c.primary : c.surfaceContainer,
                },
              ]}
            >
              <MaterialIcons
                name={ic as keyof typeof MaterialIcons.glyphMap}
                size={20}
                color={icon === ic ? '#1A0E08' : c.text}
              />
            </TouchableOpacity>
          ))}
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
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  rowActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  swatchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
});
