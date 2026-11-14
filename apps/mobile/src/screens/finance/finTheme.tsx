import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Skeleton, SkeletonTile } from '../../components/ui';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { getThemeColors, type ThemeMode } from '../../theme/palettes';

export function getFinUiColors(themeMode: ThemeMode = 'dark') {
  const isLight = themeMode === 'light';
  const modeColors = getThemeColors(themeMode);
  return {
    isLight,
    background: modeColors.background,
    surface: modeColors.surface,
    surfaceContainer: modeColors.surfaceContainer,
    text: modeColors.onSurface,
    muted: modeColors.muted,
    border: isLight ? 'rgba(17,19,21,0.1)' : 'rgba(255,255,255,0.08)',
    primary: colors.primary,
    income: '#2A904C',
    expense: colors.deficit,
    warning: '#D4A83B',
  };
}

export const FIN_COLOR_SWATCHES = [
  '#D96628',
  '#2E4A44',
  '#3386B0',
  '#2A904C',
  '#A958E4',
  '#D4A83B',
  '#CD528F',
  '#8A8A8E',
] as const;

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

export const FinLoadingView: React.FC<{ themeMode?: ThemeMode; testID?: string }> = ({
  themeMode = 'dark',
  testID = 'fin-loading-state',
}) => (
  <View testID={testID} style={sharedStyles.stateContainer}>
    <SkeletonTile height={100} themeMode={themeMode} style={sharedStyles.skeletonItem} />
    <Skeleton height={56} radius={16} themeMode={themeMode} style={sharedStyles.skeletonItem} />
    <Skeleton height={56} radius={16} themeMode={themeMode} style={sharedStyles.skeletonItem} />
  </View>
);

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
      style={[sharedStyles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <MaterialIcons name="error-outline" size={28} color={c.expense} />
      <Text style={[sharedStyles.emptyTitle, { color: c.text }]}>Não foi possível carregar</Text>
      <Text style={[sharedStyles.emptySubtitle, { color: c.muted }]}>{message}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={onRetry}
        style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
      >
        <Text style={sharedStyles.primaryBtnText}>Tentar novamente</Text>
      </TouchableOpacity>
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
      style={[sharedStyles.emptyBox, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <MaterialIcons name={icon} size={32} color={c.muted} />
      <Text style={[sharedStyles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[sharedStyles.emptySubtitle, { color: c.muted }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          testID={actionTestID}
          accessibilityRole="button"
          onPress={onAction}
          style={[sharedStyles.primaryBtn, { backgroundColor: c.primary }]}
        >
          <Text style={sharedStyles.primaryBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl * 2,
    gap: bento.gap,
  },
  stateContainer: {
    padding: space.lg,
    gap: space.md,
  },
  skeletonItem: {
    marginBottom: space.sm,
  },
  emptyBox: {
    borderRadius: bento.tileRadius,
    borderWidth: 1,
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  rowCard: {
    borderRadius: bento.innerRadius,
    borderWidth: 1,
    padding: space.lg,
    gap: space.sm,
  },
  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: borders.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  primaryBtnText: {
    fontFamily: typography.fontFamilyMono,
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
    fontFamily: typography.fontFamilyMono,
    fontSize: 13,
    fontWeight: '600',
  },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: borders.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: borders.radiusPill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  sectionLabel: {
    fontFamily: typography.fontFamilyMono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: space.sm,
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: space.md,
  },
  modalActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.lg,
    justifyContent: 'flex-end',
  },
});
