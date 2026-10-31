import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';

export interface DossierCardProps {
  title?: string;
  variant?: 'hero' | 'default' | 'parchment' | 'slag';
  balance?: string;
  subtitle?: string;
  accountName?: string;
  accountCode?: string;
  profitText?: string;
  accentColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const DossierCard: React.FC<DossierCardProps> = ({
  title,
  variant = 'default',
  balance,
  subtitle = 'Patrimônio Total',
  accountName = 'CARTEIRA PRINCIPAL',
  accountCode = '•••• 001',
  profitText = '+12,4% no ano',
  accentColor = colors.primary,
  children,
  style,
  testID,
}) => {
  const isHero = variant === 'hero' || !!balance;

  if (isHero) {
    return (
      <View testID={testID} style={[styles.heroWrapper, style]}>
        {/* Camadas inferiores empilhadas (Stacked Depth Layers) */}
        <View style={styles.heroLayerTwo} />
        <View style={styles.heroLayerOne} />

        {/* Cartão Principal com Cantos Super Arredondados */}
        <View style={styles.heroCard}>
          {/* Recorte Superior em Destaque Bicolor */}
          <View style={[styles.heroTopCutout, { backgroundColor: accentColor }]}>
            {/* Círculos duplos translúcidos à esquerda */}
            <View style={styles.circlesContainer}>
              <View style={[styles.translucentCircle, { backgroundColor: 'rgba(213, 202, 168, 0.45)' }]} />
              <View style={[styles.translucentCircleOverlay, { backgroundColor: 'rgba(46, 74, 68, 0.55)' }]} />
            </View>

            {/* Saldo Total Alinhado à Direita */}
            <View style={styles.balanceCol}>
              <Text style={styles.balanceSubtitle}>{subtitle.toUpperCase()}</Text>
              <Text style={styles.balanceText}>{balance || 'R$ 32.468,00'}</Text>
            </View>
          </View>

          {/* Conteúdo Opcional Interno */}
          {children ? <View style={styles.heroChildren}>{children}</View> : null}

          {/* Rodapé Escuro com Titular e Código Curto */}
          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.accountNameText}>{accountName.toUpperCase()}</Text>
              <Text style={styles.profitBadgeText}>{profitText}</Text>
            </View>
            <View style={styles.codeBadge}>
              <Text style={styles.accountCodeText}>{accountCode}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Bento Card Padrão
  const isParchment = variant === 'parchment';
  const cardBg = isParchment ? colors.tertiary : colors.neutral;
  const textColor = isParchment ? colors.neutral : colors.parchmentPale;
  const borderColor = isParchment ? '#B8AC88' : '#26292C';

  return (
    <View
      testID={testID}
      style={[
        styles.bentoCard,
        { backgroundColor: cardBg, borderColor },
        style,
      ]}
    >
      {title ? (
        <View style={styles.bentoHeader}>
          <Text style={[styles.bentoTitle, { color: textColor }]}>
            {title.toUpperCase()}
          </Text>
        </View>
      ) : null}

      <View style={styles.bentoContent}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroWrapper: {
    marginVertical: spacing.md,
    position: 'relative',
    alignItems: 'center',
    width: '100%',
  },
  heroLayerTwo: {
    position: 'absolute',
    top: 18,
    width: '88%',
    height: 30,
    backgroundColor: '#151719',
    borderRadius: borders.radiusXl,
    opacity: 0.8,
  },
  heroLayerOne: {
    position: 'absolute',
    top: 9,
    width: '94%',
    height: 30,
    backgroundColor: '#1A1C1E',
    borderRadius: borders.radiusXl,
    opacity: 0.95,
  },
  heroCard: {
    width: '100%',
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusXl,
    overflow: 'hidden',
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  heroTopCutout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  circlesContainer: {
    flexDirection: 'row',
    position: 'relative',
    width: 52,
    height: 36,
    alignItems: 'center',
  },
  translucentCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    position: 'absolute',
    left: 0,
  },
  translucentCircleOverlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    position: 'absolute',
    left: 18,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.voidFloor,
    letterSpacing: 0.8,
    opacity: 0.8,
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineLg.fontSize - 2,
    fontWeight: '700',
    color: colors.voidFloor,
    letterSpacing: -0.5,
  },
  heroChildren: {
    padding: spacing.md,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.neutral,
  },
  accountNameText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  profitBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#AECDC5',
    marginTop: 2,
  },
  codeBadge: {
    backgroundColor: '#26292C',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borders.radiusSm,
  },
  accountCodeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.tertiary,
    fontWeight: '700',
  },
  bentoCard: {
    borderRadius: borders.radiusLg,
    borderWidth: borders.hairline,
    padding: spacing.md,
    marginVertical: spacing.xs + 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  bentoHeader: {
    marginBottom: spacing.xs + 2,
  },
  bentoTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bentoContent: {},
});

export default DossierCard;
