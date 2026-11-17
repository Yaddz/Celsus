import React from 'react';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { JellyPressable } from '../../components/ui/JellyPressable';
import { formatCentsBRL } from '../../domain/financeFlow';
import { bento, borders, colors, dock, layout, space, typography } from '../../theme/tokens';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import type { ThemeMode } from '../../theme/palettes';

export function getFinUiColors(themeMode: ThemeMode = 'dark') {
  const isLight = themeMode === 'light';
  return {
    isLight,
    background: isLight ? '#F4F1EA' : '#111315',
    surface: isLight ? '#FFFFFF' : '#1C1E20',
    surfaceContainer: isLight ? '#F1ECE2' : '#141618',
    surfaceElevated: isLight ? '#EAE4D7' : '#2A2D30',
    text: isLight ? '#111315' : '#E6DECA',
    muted: isLight ? '#6E6A63' : '#8A8A8E',
    border: isLight ? '#EAE4D7' : '#26292C',
    actionBorder: isLight ? '#E2DACB' : '#34383C',
    hairline: isLight ? '#F0EBE1' : '#26292C',
    trackBg: isLight ? '#ECE6DA' : '#2A2D30',
    circleBtnBg: isLight ? '#FFFFFF' : '#191B1D',
    circleBtnIcon: isLight ? '#111315' : '#D5CAA8',
    chipActiveBg: '#2E4A44',
    chipActiveText: '#E6DECA',
    inactiveAvatarBg: isLight ? '#B8B2A6' : '#55585C',
    avatarIconDark: '#111315',
    primary: colors.primary,
    primaryFg: bento.variants.primary.foreground,
    primaryMuted: bento.variants.primary.muted,
    goldBg: bento.variants.gold.background,
    goldFg: bento.variants.gold.foreground,
    goldMuted: bento.variants.gold.muted,
    forestBg: bento.variants.forest.background,
    forestFg: bento.variants.forest.foreground,
    forestMuted: bento.variants.forest.muted,
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
  if (isPrivacyMode) return PRIVACY_CURRENCY_MASK;
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

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: layout.tabScreenPaddingTop,
    paddingBottom: dockContentPaddingBottom(),
    gap: bento.gap,
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
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
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
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
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
    paddingHorizontal: space.lg,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.lead,
    fontWeight: typography.weights.bold,
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
