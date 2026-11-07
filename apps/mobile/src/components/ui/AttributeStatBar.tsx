import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { JellyPressable } from './JellyPressable';
import { colors, typography, spacing, borders } from '../../theme/tokens';

export type AssetClass = 'FIXED_INCOME' | 'FII' | 'STOCK' | 'CRYPTO';
export type CategoryName = 'Renda Fixa' | 'FIIs' | 'Ações' | 'Criptomoedas';

export interface CategoryConfig {
  name: CategoryName;
  color: string;
  label: string;
}

export interface AttributeStatBarProps {
  assetClass: AssetClass;
  currentPercentage: number;
  targetPercentage: number;
  testID?: string;
  showDotMatrix?: boolean;
  variant?: 'default' | 'v2';
  marketValue?: string;
  fillDirection?: 'left-to-right' | 'right-to-left';
  onPress?: (assetClass: AssetClass) => void;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
}

export const ASSET_CLASS_ATTRIBUTE_MAP: Record<AssetClass, CategoryConfig> = {
  FIXED_INCOME: {
    name: 'Renda Fixa',
    color: '#2E4A44',
    label: 'Tesouro, CDB e Isentos',
  },
  FII: {
    name: 'FIIs',
    color: '#D5CAA8',
    label: 'Fundos Imobiliários',
  },
  STOCK: {
    name: 'Ações',
    color: '#D96628',
    label: 'Empresas B3',
  },
  CRYPTO: {
    name: 'Criptomoedas',
    color: '#C49A45',
    label: 'Ativos Digitais',
  },
};

/**
 * Dot-Matrix Grid de 4 linhas x 10 colunas (40 pontos).
 * Suporta preenchimento da direita para a esquerda em colunas (v2) ou linhas (padrão).
 */
export const DotMatrixGrid: React.FC<{
  currentPercentage: number;
  color: string;
  rows?: number;
  cols?: number;
  fillDirection?: 'left-to-right' | 'right-to-left';
  testID?: string;
  themeMode?: 'dark' | 'light';
}> = ({ currentPercentage, color, rows = 4, cols = 10, fillDirection = 'left-to-right', testID, themeMode = 'dark' }) => {
  const totalDots = rows * cols;
  const safePercentage = Math.min(100, Math.max(0, currentPercentage));
  const activeDots = Math.round((safePercentage / 100) * totalDots);
  const isLight = themeMode === 'light';

  return (
    <View testID={testID} style={styles.matrixContainer}>
      {Array.from({ length: rows }).map((_, rIdx) => {
        const rowFromBottom = rows - 1 - rIdx;
        return (
          <View key={`row-${rIdx}`} style={styles.matrixRow}>
            {Array.from({ length: cols }).map((_, cIdx) => {
              let isFilled = false;
              if (fillDirection === 'right-to-left') {
                const colFromRight = (cols - 1) - cIdx;
                const dotSeq = colFromRight * rows + rowFromBottom;
                isFilled = dotSeq < activeDots;
              } else {
                const dotSeq = cIdx * rows + rowFromBottom;
                isFilled = dotSeq < activeDots;
              }

              return (
                <View
                  key={`dot-${rIdx}-${cIdx}`}
                  testID={`dot-${rIdx}-${cIdx}`}
                  style={[
                    styles.dot,
                    isFilled
                      ? { backgroundColor: color, shadowColor: color, shadowOpacity: 0.4 }
                      : (isLight ? styles.emptyDotLight : styles.emptyDot),
                  ]}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

export const AttributeStatBar: React.FC<AttributeStatBarProps> = ({
  assetClass,
  currentPercentage,
  targetPercentage,
  testID,
  showDotMatrix = true,
  variant = 'default',
  marketValue,
  fillDirection = 'left-to-right',
  onPress,
  isPrivacyMode = false,
  themeMode = 'dark',
}) => {
  const config = ASSET_CLASS_ATTRIBUTE_MAP[assetClass];
  const safeCurrent = Math.max(0, currentPercentage);
  const safeTarget = Math.max(0, targetPercentage);
  const isLight = themeMode === 'light';

  const resolvedFillDirection = fillDirection || 'left-to-right';

  const formattedMarketValue = marketValue
    ? marketValue.startsWith('R$') ? marketValue : `R$ ${marketValue}`
    : 'R$ 0,00';

  const metricsText = variant === 'v2'
    ? (isPrivacyMode ? 'R$ ••••••' : `${formattedMarketValue} • ${safeCurrent.toFixed(1)}%`)
    : (isPrivacyMode ? '••••••' : `${safeCurrent.toFixed(1)}% / META ${safeTarget.toFixed(1)}%`);

  const content = (
    <View style={[styles.container, isLight && styles.containerLight]}>
      {/* Header com Nome Real da Categoria e Percentuais */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.colorSquare, { backgroundColor: config.color }]} />
          <Text style={[styles.categoryName, { color: config.color }]}>
            {config.name.toUpperCase()}
          </Text>
        </View>

        <Text style={[styles.metricsContainer, isLight && styles.metricsContainerLight]}>
          {metricsText}
        </Text>
      </View>

      {showDotMatrix ? (
        <DotMatrixGrid
          currentPercentage={safeCurrent}
          color={config.color}
          fillDirection={resolvedFillDirection}
          themeMode={themeMode}
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <JellyPressable
        testID={testID}
        intensity="subtle"
        onPress={() => onPress(assetClass)}
      >
        {content}
      </JellyPressable>
    );
  }

  return (
    <View testID={testID}>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  // Linha plana (sem card aninhado), separada das demais por hairline.
  container: {
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  containerLight: {
    borderBottomColor: '#EAE4D7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  colorSquare: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: spacing.xs + 2,
  },
  categoryName: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelLg.fontSize,
    fontWeight: '700',
    letterSpacing: typography.labelLg.letterSpacing,
  },
  classLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.secondaryText || '#9CA3AF',
    flexShrink: 1,
  },
  classLabelLight: {
    color: '#6F6A5A',
  },
  metricsContainer: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginLeft: spacing.xs,
  },
  metricsContainerLight: {
    color: '#111315',
  },
  matrixContainer: {
    gap: 5,
    paddingVertical: 4,
    alignItems: 'center',
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    width: '100%',
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  emptyDot: {
    backgroundColor: '#26292C',
  },
  emptyDotLight: {
    backgroundColor: '#EAE4D7',
  },
});

export default AttributeStatBar;
