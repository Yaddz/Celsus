import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borders, layout, space } from '../../theme/tokens';
import { AttributeStatBar, AssetClass, ASSET_CLASS_ATTRIBUTE_MAP } from './AttributeStatBar';
import { BentoGrid, BentoRow, BentoTile } from './BentoGrid';
import { JellyPressable } from './JellyPressable';
import { SkeletonSwap, SkeletonTile } from './Skeleton';
import { bento, BentoVariant } from '../../theme/tokens';
import { calculateAllocationFill } from '../../domain/finance/allocationFill';

export interface CategoryAllocationData {
  assetClass: AssetClass;
  currentPercentage: number;
  targetPercentage: number;
  marketValue?: string;
}

export interface DotMatrixAllocationCardProps {
  totalBalance?: string;
  allocations?: CategoryAllocationData[];
  isPrivacyMode?: boolean;
  testID?: string;
  variant?: 'default' | 'v2' | 'bento';
  /** Mostra o esqueleto do mosaico (mesma estrutura e alturas) enquanto a carteira carrega. */
  loading?: boolean;
  fillDirection?: 'left-to-right' | 'right-to-left';
  onRebalancePress?: () => void;
  onClassPress?: (assetClass: AssetClass) => void;
  themeMode?: 'dark' | 'light';
}

/** Alturas dos tiles do mosaico (o conteúdo real e o esqueleto usam as mesmas). */
const ALLOC_SMALL_HEIGHT = 108;
const ALLOC_BIG_HEIGHT = ALLOC_SMALL_HEIGHT * 2 + bento.gap;

const BENTO_VARIANT: Record<AssetClass, BentoVariant> = {
  STOCK: 'primary',
  FIXED_INCOME: 'forest',
  FII: 'cream',
  CRYPTO: 'gold',
};

const formatMoneyParts = (marketValue: string | undefined, isPrivacyMode: boolean): string[] => {
  const raw = String(marketValue ?? '').replace('R$', '').trim();
  const isDecimal = /^\d+(\.\d+)?$/.test(raw);
  const numeric = isDecimal ? Number(raw) : Number(raw.replace(/\./g, '').replace(',', '.'));
  const isEmpty = !raw || !Number.isFinite(numeric) || numeric === 0;
  if (isPrivacyMode) return ['R$', '••••••'];
  if (isEmpty) return ['—'];
  return [
    'R$',
    isDecimal ? numeric.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : raw,
  ];
};

interface FillTileProps {
  item: CategoryAllocationData;
  height?: number;
  big?: boolean;
  wide?: boolean;
  isPrivacyMode: boolean;
  onPress?: (c: AssetClass) => void;
  flex: number;
}

/**
 * Tile que "enche" de cor de baixo para cima: altura preenchida = participação real da classe
 * (85% => 85% do card colorido). A meta fica só na tela de Metas, sem texto nem linha no bloco.
 * A cor é fixa por categoria. O texto é desenhado duas vezes e a
 * cópia sobre a cor fica recortada junto com ela, garantindo contraste nas duas metades.
 */
const FillTile: React.FC<FillTileProps> = ({ item, height, big, wide, isPrivacyMode, onPress, flex }) => {
  const [h, setH] = React.useState(height ?? 0);
  const c = item.assetClass;
  const col = bento.variants[BENTO_VARIANT[c]];
  const dark = bento.variants.dark;
  const ratio = calculateAllocationFill(item.currentPercentage) / 100;
  const pct = `${Math.round(item.currentPercentage)}%`;
  const name = ASSET_CLASS_ATTRIBUTE_MAP[c].name.toUpperCase();
  const parts = formatMoneyParts(item.marketValue, isPrivacyMode);

  const content = (fg: string, muted: string, hidden: boolean) => (
    <View
      style={{ flex: 1, padding: bento.tilePadding, justifyContent: 'space-between' }}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <Text style={{ fontFamily: typography.fontFamily, fontSize: 10, letterSpacing: 1.2, color: muted }}>{name}</Text>
      <View style={wide ? { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' } : undefined}>
        {wide ? (
          <>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {parts.map((p, i) => (
                <Text key={i} style={{ fontFamily: typography.fontFamily, fontSize: 12, color: fg }}>{p}</Text>
              ))}
            </View>
            <Text style={{ fontFamily: typography.fontFamily, fontWeight: '700', fontSize: 28, color: fg }}>{pct}</Text>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: typography.fontFamily, fontWeight: '700', fontSize: big ? 48 : 28, color: fg }}>{pct}</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {parts.map((p, i) => (
                <Text key={i} style={{ fontFamily: typography.fontFamily, fontSize: 12, color: fg }}>{p}</Text>
              ))}
            </View>
          </>
        )}
      </View>
    </View>
  );

  const body = (
    <View
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{
        flex: 1,
        height,
        minHeight: big ? ALLOC_BIG_HEIGHT : ALLOC_SMALL_HEIGHT,
        borderRadius: bento.tileRadius,
        overflow: 'hidden',
        backgroundColor: dark.background,
      }}
    >
      {content(dark.foreground, dark.muted, false)}
      <View
        pointerEvents="none"
        testID={`allocation-fill-${c.toLowerCase()}`}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: h * ratio,
          overflow: 'hidden',
          backgroundColor: col.background,
        }}
      >
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h }}>
          {content(col.foreground, col.muted, true)}
        </View>
      </View>
    </View>
  );

  return (
    <JellyPressable
      testID={`allocation-stat-${c.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityLabel={`${ASSET_CLASS_ATTRIBUTE_MAP[c].name} ${pct}`}
      onPress={onPress ? () => onPress(c) : undefined}
      containerStyle={{ flex, minWidth: 0 }}
      style={{ flexGrow: 1 }}
    >
      {body}
    </JellyPressable>
  );
};

/** Esqueleto do mosaico de 3 classes (o caso comum): 1 tile alto à esquerda e 2 empilhados à direita. */
const AllocationSkeleton: React.FC<{ themeMode: 'dark' | 'light' }> = ({ themeMode }) => (
  <BentoRow testID="allocation-skeleton">
    <SkeletonTile height={ALLOC_BIG_HEIGHT} themeMode={themeMode} lines={2} style={{ flex: 1 }} />
    <View style={{ flex: 1, gap: bento.gap }}>
      <SkeletonTile height={ALLOC_SMALL_HEIGHT} themeMode={themeMode} lines={1} />
      <SkeletonTile height={ALLOC_SMALL_HEIGHT} themeMode={themeMode} lines={1} />
    </View>
  </BentoRow>
);

/**
 * Mosaico dinâmico: só classes ativas (meta > 0), com tamanho proporcional à meta.
 * 1 classe: largura total; 2: lado a lado; 3+: a maior à esquerda, o restante empilhado à direita.
 */
const AllocationBento: React.FC<{
  allocations: CategoryAllocationData[];
  isPrivacyMode: boolean;
  onClassPress?: (c: AssetClass) => void;
  isLight: boolean;
}> = ({ allocations, isPrivacyMode, onClassPress }) => {
  const active = allocations
    .filter((a) => a.targetPercentage > 0)
    .sort((a, b) => b.targetPercentage - a.targetPercentage);
  const common = { isPrivacyMode, onPress: onClassPress };

  if (active.length === 0) {
    return (
      <BentoTile variant="dark" testID="allocation-empty" height={ALLOC_BIG_HEIGHT}>
        <Text style={{ fontFamily: typography.fontFamily, color: bento.variants.dark.muted, fontSize: 13 }}>
          Nenhuma categoria com meta definida.
        </Text>
      </BentoTile>
    );
  }
  if (active.length === 1) {
    return (
      <BentoGrid>
        <FillTile item={active[0]} height={120} wide flex={1} {...common} />
      </BentoGrid>
    );
  }
  if (active.length === 2) {
    return (
      <BentoRow>
        {active.map((a) => (
          <FillTile key={a.assetClass} item={a} big flex={a.targetPercentage} {...common} />
        ))}
      </BentoRow>
    );
  }
  const [first, ...rest] = active;
  const restMax = Math.max(...rest.map((r) => r.targetPercentage));
  return (
    <BentoRow>
      <FillTile item={first} big flex={first.targetPercentage} {...common} />
      <View style={{ flex: restMax, gap: bento.gap, minWidth: 0 }}>
        {rest.map((r) => (
          <FillTile key={r.assetClass} item={r} flex={r.targetPercentage} {...common} />
        ))}
      </View>
    </BentoRow>
  );
};

const DEFAULT_ALLOCATIONS: CategoryAllocationData[] = [
  { assetClass: 'FIXED_INCOME', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'FII', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'STOCK', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'CRYPTO', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
];

const DotMatrixAllocationCardBase: React.FC<DotMatrixAllocationCardProps> = ({
  totalBalance = 'R$ 0,00',
  allocations = DEFAULT_ALLOCATIONS,
  isPrivacyMode = false,
  testID = 'home-dot-matrix-card',
  variant = 'default',
  loading = false,
  fillDirection = 'left-to-right',
  onRebalancePress,
  onClassPress,
  themeMode = 'dark',
}) => {
  const isV2 = variant === 'v2';
  const isLight = themeMode === 'light';

  if (variant === 'bento') {
    return (
      <View style={{ marginTop: layout.sectionGap }} testID={testID}>
        <View style={[styles.header, { paddingHorizontal: 4 }]}>
          <Text style={[styles.title, isLight && styles.titleLight]}>ALOCAÇÃO POR CATEGORIA</Text>
        </View>
        <SkeletonSwap loading={loading} skeleton={<AllocationSkeleton themeMode={themeMode} />}>
          <AllocationBento
            allocations={allocations}
            isPrivacyMode={isPrivacyMode}
            onClassPress={onClassPress}
            isLight={isLight}
          />
        </SkeletonSwap>
      </View>
    );
  }

  return (
    <View style={[styles.card, isLight && styles.cardLight]} testID={testID}>
      {/* Topo do Card com Botão Rebalancear (v2) ou Saldo Consolidado (padrão) */}
      <View style={[styles.header, isLight && styles.headerLight]}>
        <View>
          <Text style={[styles.title, isLight && styles.titleLight]}>ALOCAÇÃO POR CATEGORIA</Text>
          {!isV2 && (
            <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>Matriz de Pontos • 4 Classes Reais</Text>
          )}
        </View>

        {isV2 ? (
          <TouchableOpacity
            testID="card-rebalance-button"
            style={styles.rebalanceButton}
            onPress={onRebalancePress}
            activeOpacity={0.8}
          >
            <Text style={styles.rebalanceButtonText}>Rebalancear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Grade de Matriz de Pontos para cada uma das 4 Classes */}
      <View style={styles.barsContainer}>
        {allocations.map((item) => (
          <AttributeStatBar
            key={item.assetClass}
            assetClass={item.assetClass}
            currentPercentage={item.currentPercentage}
            targetPercentage={item.targetPercentage}
            marketValue={item.marketValue}
            variant={variant}
            fillDirection={fillDirection}
            onPress={onClassPress}
            isPrivacyMode={isPrivacyMode}
            themeMode={themeMode}
            testID={`allocation-stat-${item.assetClass.toLowerCase()}`}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Seção plana: linha fina no topo em vez de card.
  card: {
    marginTop: layout.sectionGap,
    marginBottom: space.sm,
    paddingTop: layout.sectionGap - space.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  cardLight: {
    borderTopColor: '#EAE4D7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  headerLight: {},
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  titleLight: {
    color: '#6E6A63',
  },
  subtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  subtitleLight: {
    color: '#6F6A5A',
  },
  balanceBadge: {
    backgroundColor: '#111315',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  balanceBadgeLight: {
    backgroundColor: '#F4F1EA',
    borderColor: '#EAE4D7',
  },
  balanceText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  rebalanceButton: {
    backgroundColor: '#D5CAA8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rebalanceButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#111315',
    letterSpacing: 0.5,
  },
  barsContainer: {},
});

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const DotMatrixAllocationCard = React.memo(DotMatrixAllocationCardBase);

export default DotMatrixAllocationCard;
