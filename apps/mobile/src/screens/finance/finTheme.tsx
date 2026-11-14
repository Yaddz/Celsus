import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Skeleton, SkeletonTile } from '../../components/ui';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { formatCentsBRL } from '../../domain/financeFlow';
import { bento, borders, colors, layout, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';

export function getFinUiColors(themeMode: ThemeMode = 'dark') {
  const isLight = themeMode === 'light';
  return {
    isLight,
    background: isLight ? '#F4F1EA' : '#111315',
    surface: isLight ? '#FFFFFF' : '#1C1E20',
    surfaceContainer: isLight ? '#F1ECE2' : '#141618',
    text: isLight ? '#111315' : '#E6DECA',
    muted: isLight ? '#6E6A63' : '#8A8A8E',
    border: isLight ? '#EAE4D7' : '#26292C',
    hairline: isLight ? '#F0EBE1' : '#26292C',
    primary: colors.primary,
    income: isLight ? '#1D6F5B' : '#AECDC5',
    expense: isLight ? '#C24D18' : '#D96628',
    overdue: '#D96628',
    warning: '#D4A83B',
  };
}

export const APPROVED_FIN_PALETTE = [
  '#D96628',
  '#D5CAA8',
  '#C49A45',
  '#AECDC5',
  '#2E4A44',
  '#B8B2A6',
  '#E6DECA',
] as const;

export const FIN_COLOR_SWATCHES = APPROVED_FIN_PALETTE;

export const FIN_CATEGORY_ICONS = [
  'home',
  'shopping-cart',
  'directions-car',
  'local-hospital',
  'movie',
  'autorenew',
  'payments',
  'category',
] as const;

const APPROVED_SET = new Set<string>([...APPROVED_FIN_PALETTE, '#8A8A8E']);

const DEFAULT_CATEGORY_VISUAL_BY_KEY: Record<
  string,
  { icon: keyof typeof MaterialIcons.glyphMap; color: string }
> = {
  'cat-moradia': { icon: 'home', color: '#D96628' },
  moradia: { icon: 'home', color: '#D96628' },
  'cat-mercado': { icon: 'shopping-cart', color: '#D5CAA8' },
  mercado: { icon: 'shopping-cart', color: '#D5CAA8' },
  'cat-transporte': { icon: 'directions-car', color: '#C49A45' },
  transporte: { icon: 'directions-car', color: '#C49A45' },
  'cat-saude': { icon: 'local-hospital', color: '#AECDC5' },
  saúde: { icon: 'local-hospital', color: '#AECDC5' },
  saude: { icon: 'local-hospital', color: '#AECDC5' },
  'cat-lazer': { icon: 'movie', color: '#B8B2A6' },
  lazer: { icon: 'movie', color: '#B8B2A6' },
  'cat-assinaturas': { icon: 'autorenew', color: '#E6DECA' },
  assinaturas: { icon: 'autorenew', color: '#E6DECA' },
  'cat-salario': { icon: 'payments', color: '#AECDC5' },
  salário: { icon: 'payments', color: '#AECDC5' },
  salario: { icon: 'payments', color: '#AECDC5' },
  'cat-outros-despesa': { icon: 'category', color: '#8A8A8E' },
  'cat-outros-receita': { icon: 'category', color: '#8A8A8E' },
  outros: { icon: 'category', color: '#8A8A8E' },
  'outros recebimentos': { icon: 'category', color: '#8A8A8E' },
};

export function resolveApprovedColor(color?: string | null, fallback = '#D96628'): string {
  const upper = (color ?? '').trim().toUpperCase();
  return APPROVED_SET.has(upper) ? upper : fallback;
}

export function resolveCategoryVisual(
  cat?: { id?: string; name?: string; icon?: string; color?: string } | null
): {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  iconColor: string;
} {
  const byId = cat?.id ? DEFAULT_CATEGORY_VISUAL_BY_KEY[cat.id.toLowerCase()] : undefined;
  const byName = cat?.name ? DEFAULT_CATEGORY_VISUAL_BY_KEY[cat.name.trim().toLowerCase()] : undefined;
  const preset = byId ?? byName;

  const icon = (preset?.icon ?? cat?.icon ?? 'category') as keyof typeof MaterialIcons.glyphMap;
  const rawUpper = (cat?.color ?? '').trim().toUpperCase();
  // Mercado: o verde-floresta era a cor antiga da semente; o modelo usa o creme.
  const isLegacyMercado = rawUpper === '#2E4A44' && preset?.color === '#D5CAA8';
  const color = isLegacyMercado
    ? '#D5CAA8'
    : APPROVED_SET.has(rawUpper)
    ? rawUpper
    : preset?.color ?? '#8A8A8E';
  const iconColor = color === '#2E4A44' ? '#E6DECA' : '#111315';

  return { icon, color, iconColor };
}

export function formatSignedCentsBRL(
  cents: number,
  kind: 'income' | 'expense',
  isPrivacyMode = false
): string {
  if (isPrivacyMode) return 'R$ ••••••';
  const prefix = kind === 'income' ? '+' : '-';
  return `${prefix}${formatCentsBRL(Math.abs(cents), false)}`;
}

export const FinFloatingAddButton: React.FC<{
  testID: string;
  onPress: () => void;
  accessibilityLabel?: string;
}> = ({ testID, onPress, accessibilityLabel = 'Adicionar' }) => (
  <JellyPressable
    testID={testID}
    intensity="medium"
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    containerStyle={sharedStyles.fabContainer}
    style={sharedStyles.fabInner}
  >
    <MaterialIcons name="add" size={28} color="#FFFFFF" />
  </JellyPressable>
);

export const FinLoadingView: React.FC<{ themeMode?: ThemeMode; testID?: string }> = ({
  themeMode = 'dark',
  testID = 'fin-loading-state',
}) => {
  const isLight = themeMode === 'light';
  const cardBg = isLight ? '#FFFFFF' : '#1C1E20';
  return (
    <View testID={testID} style={sharedStyles.stateContainer}>
      <SkeletonTile height={108} themeMode={themeMode} lines={2} />
      <View style={[sharedStyles.skeletonListCard, { backgroundColor: cardBg }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={sharedStyles.skeletonRow}>
            <Skeleton width={44} height={44} radius={22} themeMode={themeMode} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="48%" height={13} themeMode={themeMode} />
              <Skeleton width="32%" height={10} themeMode={themeMode} />
            </View>
            <Skeleton width={76} height={13} themeMode={themeMode} />
          </View>
        ))}
      </View>
    </View>
  );
};

export const FinErrorView: React.FC<{
  message: string;
  onRetry: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}> = ({ message, onRetry, themeMode = 'dark', testID = 'fin-error-state' }) => {
  const c = getFinUiColors(themeMode);
  return (
    <View
      testID={testID}
      style={[sharedStyles.emptyBox, { backgroundColor: c.surface }]}
    >
      <MaterialIcons name="error-outline" size={28} color={c.overdue} />
      <Text style={[sharedStyles.emptyTitle, { color: c.text }]}>Não foi possível carregar</Text>
      <Text style={[sharedStyles.emptySubtitle, { color: c.muted }]}>{message}</Text>
      <JellyPressable
        accessibilityRole="button"
        accessibilityLabel="Tentar novamente"
        onPress={onRetry}
        style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
      >
        <Text style={sharedStyles.primaryBtnText}>Tentar novamente</Text>
      </JellyPressable>
    </View>
  );
};

export const FinEmptyState: React.FC<{
  testID: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  themeMode?: ThemeMode;
}> = ({
  testID,
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  actionTestID,
  themeMode = 'dark',
}) => {
  const c = getFinUiColors(themeMode);
  return (
    <View
      testID={testID}
      style={[sharedStyles.emptyBox, { backgroundColor: c.surface }]}
    >
      <MaterialIcons name={icon} size={32} color={c.muted} />
      <Text style={[sharedStyles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[sharedStyles.emptySubtitle, { color: c.muted }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <JellyPressable
          testID={actionTestID}
          accessibilityRole="button"
          onPress={onAction}
          style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
        >
          <Text style={sharedStyles.primaryBtnText}>{actionLabel}</Text>
        </JellyPressable>
      ) : null}
    </View>
  );
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: layout.tabScreenPaddingTop,
    paddingBottom: 170,
    gap: bento.gap,
  },
  stateContainer: {
    gap: bento.gap,
  },
  skeletonListCard: {
    borderRadius: bento.tileRadius,
    paddingHorizontal: bento.tilePadding,
    paddingVertical: 6,
  },
  skeletonRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyBox: {
    borderRadius: bento.tileRadius,
    padding: bento.tilePadding + 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  primaryBtn: {
    height: 56,
    paddingHorizontal: space.lg,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0E08',
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: borders.radiusPill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  secondaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
  },
  iconBtn: {
    minWidth: 40,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: space.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
    justifyContent: 'flex-end',
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D96628',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
