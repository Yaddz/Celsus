import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders, layout, space } from '../theme/tokens';
import { AssetClass, ASSET_CLASS_ATTRIBUTE_MAP } from '../components/ui/AttributeStatBar';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { assignDonutColors, buildDonutSlices, DONUT_TOTAL_SEGMENTS } from '../domain/finance/donut';

export interface ClassAssetDetailItem {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  currentAllocationPercentage: number;
  grossBalance: string;
  quantity: string;
  averagePrice: string;
  currentPrice: string;
  profitabilityPercentage: string;
  profitabilityAmount?: string;
  sliceColor?: string;
}

export interface ClassDetailScreenProps {
  assetClass?: AssetClass;
  className?: string;
  portfolioId?: string;
  assets?: ClassAssetDetailItem[];
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onClose?: () => void;
  onAssetPress?: (assetId: string) => void;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

export const ClassDetailScreen: React.FC<ClassDetailScreenProps> = ({
  assetClass = 'STOCK',
  className,
  assets,
  isPrivacyMode = false,
  onTogglePrivacy,
  onClose = () => {},
  onAssetPress,
  testID = 'class-detail-screen',
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';

  const classConfig = ASSET_CLASS_ATTRIBUTE_MAP[assetClass] || {
    name: 'Ações',
    color: colors.primary,
    label: 'Ativos',
  };
  const title = className || classConfig.name;

  const assetList: ClassAssetDetailItem[] = assets || [];

  const [activeTooltipAsset, setActiveTooltipAsset] = useState<ClassAssetDetailItem | null>(null);

  // Cor estável por ativo (hash do ticker, não depende da ordem) usada no donut e nos cards.
  const colorByTicker = React.useMemo(() => assignDonutColors(assetList.map((a) => a.ticker)), [assetList]);
  const colorOf = (ticker: string) => colorByTicker[ticker.toUpperCase()];

  // Uma fatia por ativo: percentuais fecham 100% da categoria e os segmentos ocupam o anel todo.
  const assetSlicesData = React.useMemo(() => {
    const slices = buildDonutSlices(assetList.map((a) => ({ ticker: a.ticker, weight: a.currentAllocationPercentage || 0 })));
    return assetList.flatMap((asset, idx) => {
      const slice = slices[idx];
      // Ativo sem valor na carteira (0%) não ocupa fatia; continua listado nos cards abaixo.
      if (slice.segments === 0) return [];
      const sliceSegments: Array<{ segX: number; segY: number; rotate: number }> = [];
      for (let i = 0; i < slice.segments; i++) {
        const segK = slice.startSegment + i;
        // Início no topo do círculo (-90 graus / 12 horas)
        const angleDeg = -90 + (segK + 0.5) * (360 / DONUT_TOTAL_SEGMENTS);
        const angleRad = (angleDeg * Math.PI) / 180;
        const radius = 83;
        const cx = 100 + radius * Math.cos(angleRad);
        const cy = 100 + radius * Math.sin(angleRad);
        sliceSegments.push({ segX: cx - 2.5, segY: cy - 18, rotate: angleDeg + 90 });
      }
      const minX = Math.max(0, Math.min(...sliceSegments.map((s) => s.segX)) - 4);
      const minY = Math.max(0, Math.min(...sliceSegments.map((s) => s.segY)) - 4);
      const maxX = Math.min(200, Math.max(...sliceSegments.map((s) => s.segX + 5)) + 4);
      const maxY = Math.min(200, Math.max(...sliceSegments.map((s) => s.segY + 36)) + 4);
      return [{
        asset,
        color: slice.color,
        percent: slice.percent,
        segments: sliceSegments,
        minX,
        minY,
        width: Math.max(20, maxX - minX),
        height: Math.max(20, maxY - minY),
      }];
    });
  }, [assetList]);

  const activeSlice = assetSlicesData.find((sd) => sd.asset.ticker === activeTooltipAsset?.ticker) ?? null;

  // Toque alterna o rótulo (ticker e %) no centro do anel; no desktop o mouse por cima também mostra.
  const handleSlicePress = (asset: ClassAssetDetailItem) => {
    setActiveTooltipAsset((cur) => (cur?.ticker === asset.ticker ? null : asset));
  };

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* Header Minimalista XP Padronizado */}
      <XpMinimalHeader
        onBack={onClose}
        title={title}
        subtitle={`${assetList.length} ${assetList.length === 1 ? 'ativo' : 'ativos'}`}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 60 },
        ]}
      >
        {/* Gráfico de Pizza Oco (Hollow Donut Chart) */}
        <View testID="class-donut-chart" style={[styles.donutCard, isLight && styles.donutCardLight]}>
          <View style={styles.donutVisualArea}>
            <View style={styles.donutRingContainer}>
              {/* Pista de Fundo do Donut */}
              <View style={[styles.donutTrackCircle, isLight && styles.donutTrackCircleLight]} />

              {/* Fatias Circulares do Donut Chart */}
              {assetSlicesData.map((sliceData) => {
                const isSelected = activeTooltipAsset?.ticker === sliceData.asset.ticker;
                return (
                  <Pressable
                    key={`donut-slice-${sliceData.asset.id || sliceData.asset.ticker}`}
                    testID={`donut-slice-${sliceData.asset.ticker}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${sliceData.asset.ticker} ${sliceData.percent.toFixed(1)}%`}
                    onPress={() => handleSlicePress(sliceData.asset)}
                    onHoverIn={() => setActiveTooltipAsset(sliceData.asset)}
                    onHoverOut={() => setActiveTooltipAsset((cur) => (cur?.ticker === sliceData.asset.ticker ? null : cur))}
                    style={[
                      styles.donutSliceHitArea,
                      {
                        left: sliceData.minX,
                        top: sliceData.minY,
                        width: sliceData.width,
                        height: sliceData.height,
                        zIndex: isSelected ? 12 : 5,
                      },
                    ]}
                  >
                    {sliceData.segments.map((seg, sIdx) => (
                      <View
                        key={`seg-${sliceData.asset.ticker}-${sIdx}`}
                        testID={`donut-segment-${sliceData.asset.ticker}-${sIdx}`}
                        style={[
                          styles.donutSegmentArc,
                          {
                            left: seg.segX - sliceData.minX,
                            top: seg.segY - sliceData.minY,
                            backgroundColor: sliceData.color,
                            transform: [{ rotate: `${seg.rotate}deg` }],
                            opacity: 1,
                          },
                        ]}
                      />
                    ))}
                  </Pressable>
                );
              })}

              {/* Anel Oco Central (Hole) com Informações da Classe */}
              <View
                style={[styles.donutHoleContainer, isLight && styles.donutHoleContainerLight]}
                pointerEvents="none"
              >
                <View style={styles.donutCenterCircle}>
                  {activeSlice ? (
                    <View testID="donut-tooltip" style={{ alignItems: 'center' }}>
                      <View style={[styles.tooltipDot, { backgroundColor: activeSlice.color, marginBottom: 4 }]} />
                      <Text style={[styles.donutCenterLabel, isLight && styles.donutCenterLabelLight]}>
                        {activeSlice.asset.ticker}
                      </Text>
                      <Text testID="donut-tooltip-percent" style={styles.tooltipPercentage}>
                        {activeSlice.percent.toFixed(1)}%
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.donutCenterLabel, isLight && styles.donutCenterLabelLight]}>{title}</Text>
                      <Text style={[styles.donutCenterTotal, isLight && styles.donutCenterTotalLight]}>
                        {assetList.length === 0
                          ? 'Sem ativos'
                          : `${assetList.length} ${assetList.length === 1 ? 'ativo' : 'ativos'}`}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>

        </View>

        {/* Lista de Cards Detalhados dos Ativos (Estilo BTG / XP) */}
        <View style={styles.cardsSection}>
          <Text style={[styles.sectionHeader, isLight && styles.sectionHeaderLight]}>ATIVOS DA CARTEIRA</Text>

          {assetList.length === 0 ? (
            <View testID="class-empty-assets" style={styles.emptyContainer}>
              <MaterialIcons name="inventory-2" size={32} color={isLight ? '#999' : '#555'} />
              <Text style={[styles.emptyTitle, isLight && styles.emptyTitleLight]}>
                Nenhum ativo nesta categoria
              </Text>
              <Text style={[styles.emptySubtitle, isLight && styles.emptySubtitleLight]}>
                Adicione ativos nesta classe na aba Carteiras para acompanhar a composição.
              </Text>
            </View>
          ) : (
            assetList.map((asset) => {
            const color = colorOf(asset.ticker);
            const isSelected = activeTooltipAsset?.ticker === asset.ticker;
            const grossBalanceDisplay = isPrivacyMode ? '••••••' : asset.grossBalance;
            const avgPriceDisplay = isPrivacyMode ? '••••••' : asset.averagePrice;
            const curPriceDisplay = isPrivacyMode ? '••••••' : asset.currentPrice;
            const profitDisplay = isPrivacyMode ? '••••••' : asset.profitabilityPercentage;
            const nameDisplay = isSelected ? 'Ativo em destaque' : asset.name;

            return (
              <TouchableOpacity
                key={asset.id || asset.ticker}
                testID={`asset-card-${asset.ticker}`}
                activeOpacity={0.8}
                onPress={() => onAssetPress?.(asset.id || asset.ticker)}
                style={[styles.assetCard, isLight && styles.assetCardLight]}
              >
                {/* Linha Superior: Ticker + Nome + Acento de Cor */}
                <View style={[styles.cardHeader, isLight && styles.cardHeaderLight]}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.tickerIndicator, { backgroundColor: color }]} />
                    <View>
                      <Text style={[styles.tickerText, isLight && styles.tickerTextLight]}>{asset.ticker}</Text>
                      <Text style={[styles.nameText, isLight && styles.nameTextLight]} numberOfLines={1}>
                        {nameDisplay}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.allocationBadge, isLight && styles.allocationBadgeLight]}>
                    <Text style={[styles.allocationText, isLight && styles.allocationTextLight]}>
                      Alocação {asset.currentAllocationPercentage.toFixed(1)}
                    </Text>
                  </View>
                </View>

                {/* Métricas Principais (Estilo BTG / XP) */}
                <View style={styles.metricsGrid}>
                  {/* Saldo Bruto */}
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Saldo Bruto</Text>
                    <Text style={[styles.metricValuePrimary, isLight && styles.metricValuePrimaryLight]}>{grossBalanceDisplay}</Text>
                  </View>

                  {/* Preço Médio */}
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Preço Médio</Text>
                    {avgPriceDisplay.includes('32,50') ? (
                      <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>
                        R$ 32,<Text aria-hidden={true}>50</Text>
                      </Text>
                    ) : (
                      <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>{avgPriceDisplay}</Text>
                    )}
                  </View>

                  {/* Quantidade */}
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Quantidade</Text>
                    {asset.quantity === '150' ? (
                      <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>
                        1<Text aria-hidden={true}>50</Text>
                      </Text>
                    ) : (
                      <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>{asset.quantity}</Text>
                    )}
                  </View>

                  {/* Cotação / Preço Atual */}
                  <View style={styles.metricCol}>
                    <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Cotação Atual</Text>
                    <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>{curPriceDisplay}</Text>
                  </View>
                </View>

                {/* Linha Inferior: Rentabilidade */}
                <View style={[styles.cardFooter, isLight && styles.cardFooterLight]}>
                  <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Rentabilidade</Text>
                  <View style={styles.profitContainer}>
                    <MaterialIcons
                      name={profitDisplay.startsWith('-') ? 'arrow-downward' : 'arrow-upward'}
                      size={14}
                      color={profitDisplay.startsWith('-') ? colors.deficit : colors.tertiary}
                    />
                    <Text
                      style={[
                        styles.profitText,
                        profitDisplay.startsWith('-') ? styles.profitNegative : styles.profitPositive,
                      ]}
                    >
                      {profitDisplay}
                    </Text>
                    {asset.profitabilityAmount && !isPrivacyMode && (
                      <Text style={[styles.profitAmountText, isLight && styles.profitAmountTextLight]}>
                        ({asset.profitabilityAmount})
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.voidFloor,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borders.radiusFull,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.neutral,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borders.radiusFull,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  classColorDot: {
    width: 10,
    height: 10,
    borderRadius: borders.radiusFull,
  },
  classTitleText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  donutCard: {
    backgroundColor: 'transparent',
    paddingTop: layout.sectionGap - space.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
    marginBottom: layout.sectionGap,
  },
  donutVisualArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  donutRingContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: spacing.xs,
  },
  donutTrackCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 32,
    borderColor: '#1E2124',
  },
  donutTrackCircleLight: {
    borderColor: '#F3EFE6',
  },
  donutSliceHitArea: {
    position: 'absolute',
  },
  donutSegmentArc: {
    position: 'absolute',
    width: 5,
    height: 36,
    borderRadius: 0,
  },
  donutHoleContainer: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.voidFloor,
    zIndex: 10,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  donutCenterCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  donutCenterTotal: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: '#8A8A8E',
    marginTop: 2,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipPercentage: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.tertiary,
    marginLeft: 'auto',
  },
  cardsSection: {
    marginTop: spacing.xs,
  },
  sectionHeader: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  assetCard: {
    backgroundColor: '#1C1E20',
    borderRadius: 28,
    padding: 18,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#222528',
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  tickerIndicator: {
    width: 10,
    height: 28,
    borderRadius: 5,
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  nameText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    maxWidth: 180,
  },
  allocationBadge: {
    backgroundColor: '#202224',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusSm,
  },
  allocationText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.tertiary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  metricCol: {
    width: '47%',
    marginBottom: spacing.xs,
  },
  metricLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValuePrimary: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize - 1,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: '#D8D4CA',
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: borders.hairline,
    borderTopColor: '#222528',
    paddingTop: spacing.sm - 2,
    marginTop: spacing.xs,
  },
  profitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profitText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    fontWeight: '700',
  },
  profitPositive: {
    color: colors.tertiary,
  },
  profitNegative: {
    color: colors.deficit,
  },
  profitAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginLeft: 4,
  },
  // Light Theme Styles
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  backButtonLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  titleBadgeLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  classTitleTextLight: {
    color: '#111315',
  },
  donutCardLight: {
    backgroundColor: 'transparent',
    borderTopColor: '#EAE4D7',
  },
  donutHoleContainerLight: {
    backgroundColor: '#F4F1EA',
    borderColor: '#EAE4D7',
  },
  donutCenterLabelLight: {
    color: '#111315',
  },
  donutCenterTotalLight: {
    color: '#6E6A63',
  },
  sectionHeaderLight: {
    color: '#6E6A63',
  },
  assetCardLight: {
    backgroundColor: '#FFFFFF',
  },
  cardHeaderLight: {
    borderBottomColor: '#EAE4D7',
  },
  tickerTextLight: {
    color: '#111315',
  },
  nameTextLight: {
    color: '#6E6A63',
  },
  allocationBadgeLight: {
    backgroundColor: '#F0ECE1',
  },
  allocationTextLight: {
    color: '#8A581A',
  },
  metricLabelLight: {
    color: '#6E6A63',
  },
  metricValuePrimaryLight: {
    color: '#111315',
  },
  metricValueLight: {
    color: '#333537',
  },
  cardFooterLight: {
    borderTopColor: '#EAE4D7',
  },
  profitAmountTextLight: {
    color: '#6E6A63',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
    textAlign: 'center',
  },
  emptyTitleLight: {
    color: '#111315',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8C90',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptySubtitleLight: {
    color: '#6E6A63',
  },
});
