import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
 * Preenchimento de baixo para cima na cor da categoria.
 */
export const DotMatrixGrid: React.FC<{
  currentPercentage: number;
  color: string;
  rows?: number;
  cols?: number;
}> = ({ currentPercentage, color, rows = 4, cols = 10 }) => {
  const totalDots = rows * cols;
  const safePercentage = Math.min(100, Math.max(0, currentPercentage));
  const activeDots = Math.round((safePercentage / 100) * totalDots);

  return (
    <View style={styles.matrixContainer}>
      {Array.from({ length: rows }).map((_, rIdx) => {
        const rowFromBottom = rows - 1 - rIdx;
        return (
          <View key={`row-${rIdx}`} style={styles.matrixRow}>
            {Array.from({ length: cols }).map((_, cIdx) => {
              const dotIndex = rowFromBottom * cols + cIdx;
              const isFilled = dotIndex < activeDots;
              return (
                <View
                  key={`dot-${rIdx}-${cIdx}`}
                  style={[
                    styles.dot,
                    isFilled
                      ? { backgroundColor: color, shadowColor: color, shadowOpacity: 0.4 }
                      : styles.emptyDot,
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
}) => {
  const config = ASSET_CLASS_ATTRIBUTE_MAP[assetClass];
  const safeCurrent = Math.max(0, currentPercentage);
  const safeTarget = Math.max(0, targetPercentage);

  return (
    <View testID={testID} style={styles.container}>
      {/* Header com Nome Real da Categoria e Percentuais */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.colorSquare, { backgroundColor: config.color }]} />
          <Text style={[styles.categoryName, { color: config.color }]}>
            {config.name.toUpperCase()}
          </Text>
          <Text style={styles.classLabel}> • {config.label}</Text>
        </View>

        <Text style={styles.metricsContainer}>
          {`${safeCurrent.toFixed(1)}% / META ${safeTarget.toFixed(1)}%`}
        </Text>
      </View>

      {showDotMatrix ? (
        <DotMatrixGrid currentPercentage={safeCurrent} color={config.color} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.neutral,
    padding: spacing.md,
    borderRadius: borders.radiusLg,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    marginVertical: spacing.xs,
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
    color: '#8A8A8E',
    flexShrink: 1,
  },
  metricsContainer: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginLeft: spacing.xs,
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
});

export default AttributeStatBar;
