import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { JellyPressable } from './JellyPressable';
import { Skeleton, SkeletonTile } from './Skeleton';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';

/** Cores dos estados nos dois temas (mesmas superfícies dos tiles do bento). */
function stateColors(themeMode: ThemeMode) {
  const isLight = themeMode === 'light';
  return {
    surface: isLight ? bento.variants.light.background : bento.variants.dark.background,
    text: isLight ? bento.variants.light.foreground : bento.variants.dark.foreground,
    muted: isLight ? bento.variants.light.muted : bento.variants.dark.muted,
    primary: colors.primary,
    onPrimary: bento.variants.primary.foreground,
  };
}

/** Carregando: esqueleto com a forma do conteúdo (herói + lista). */
export const LoadingState: React.FC<{ themeMode?: ThemeMode; testID?: string }> = ({
  themeMode = 'dark',
  testID = 'fin-loading-state',
}) => {
  const c = stateColors(themeMode);
  return (
    <View testID={testID} style={styles.container}>
      <SkeletonTile height={108} themeMode={themeMode} lines={2} />
      <View style={[styles.listCard, { backgroundColor: c.surface }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.row}>
            <Skeleton width={44} height={44} radius={22} themeMode={themeMode} />
            <View style={styles.rowText}>
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

/** Erro: mensagem + "Tentar novamente". */
export const ErrorState: React.FC<{
  message: string;
  onRetry: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}> = ({ message, onRetry, themeMode = 'dark', testID = 'fin-error-state' }) => {
  const c = stateColors(themeMode);
  return (
    <View testID={testID} style={[styles.box, { backgroundColor: c.surface }]}>
      <MaterialIcons name="error-outline" size={24} color={c.primary} />
      <Text style={[styles.title, { color: c.text }]}>Não foi possível carregar</Text>
      <Text style={[styles.subtitle, { color: c.muted }]}>{message}</Text>
      <JellyPressable
        accessibilityRole="button"
        accessibilityLabel="Tentar novamente"
        onPress={onRetry}
        style={[styles.button, { backgroundColor: c.primary }]}
      >
        <Text style={[styles.buttonText, { color: c.onPrimary }]}>Tentar novamente</Text>
      </JellyPressable>
    </View>
  );
};

/** Vazio: ícone, título, frase e ação opcional. */
export const EmptyState: React.FC<{
  testID: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  themeMode?: ThemeMode;
}> = ({ testID, icon, title, subtitle, actionLabel, onAction, actionTestID, themeMode = 'dark' }) => {
  const c = stateColors(themeMode);
  return (
    <View testID={testID} style={[styles.box, { backgroundColor: c.surface }]}>
      <MaterialIcons name={icon} size={24} color={c.muted} />
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: c.muted }]}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <JellyPressable
          testID={actionTestID}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={[styles.button, { backgroundColor: c.primary }]}
        >
          <Text style={[styles.buttonText, { color: c.onPrimary }]}>{actionLabel}</Text>
        </JellyPressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: bento.gap,
  },
  listCard: {
    borderRadius: bento.tileRadius,
    paddingHorizontal: bento.tilePadding,
    paddingVertical: space.sm,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowText: {
    flex: 1,
    gap: space.sm,
  },
  box: {
    borderRadius: bento.tileRadius,
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.subtitle,
    lineHeight: typography.labelMd.lineHeight,
    textAlign: 'center',
  },
  button: {
    height: 56,
    paddingHorizontal: space.lg,
    borderRadius: borders.radiusXl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  buttonText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
});
