import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { AssetClass, ASSET_CLASS_ATTRIBUTE_MAP } from '../components/ui/AttributeStatBar';

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
  onClose?: () => void;
  onAssetPress?: (assetId: string) => void;
  testID?: string;
}

export const DONUT_SLICE_COLORS = [
  '#DB5A42',
  '#F1CA78',
  '#EDE8B8',
  '#72743D',
  '#D1DDF7',
  '#EF9F43',
  '#4A525D',
  '#AC4B25',
];

const DEFAULT_ASSETS_MAP: Record<AssetClass, ClassAssetDetailItem[]> = {
  STOCK: [
    {
      id: 'stock-1',
      ticker: 'PETR4',
      name: 'Petróleo Brasileiro S.A.',
      assetClass: 'STOCK',
      currentAllocationPercentage: 50.0,
      grossBalance: 'R$ 5.400,00',
      quantity: '150',
      averagePrice: 'R$ 32,50',
      currentPrice: 'R$ 36,00',
      profitabilityPercentage: '+10,77%',
      profitabilityAmount: 'R$ +525,00',
      sliceColor: '#DB5A42',
    },
    {
      id: 'stock-2',
      ticker: 'VALE3',
      name: 'Vale S.A.',
      assetClass: 'STOCK',
      currentAllocationPercentage: 30.0,
      grossBalance: 'R$ 3.240,00',
      quantity: '45',
      averagePrice: 'R$ 68,00',
      currentPrice: 'R$ 72,00',
      profitabilityPercentage: '+5,88%',
      profitabilityAmount: 'R$ +180,00',
      sliceColor: '#F1CA78',
    },
    {
      id: 'stock-3',
      ticker: 'ITUB4',
      name: 'Itaú Unibanco Holding S.A.',
      assetClass: 'STOCK',
      currentAllocationPercentage: 20.0,
      grossBalance: 'R$ 2.160,00',
      quantity: '60',
      averagePrice: 'R$ 34,00',
      currentPrice: 'R$ 36,00',
      profitabilityPercentage: '+5,88%',
      profitabilityAmount: 'R$ +120,00',
      sliceColor: '#72743D',
    },
  ],
  FII: [
    {
      id: 'fii-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística FII',
      assetClass: 'FII',
      currentAllocationPercentage: 60.0,
      grossBalance: 'R$ 4.772,80',
      quantity: '30',
      averagePrice: 'R$ 152,00',
      currentPrice: 'R$ 159,10',
      profitabilityPercentage: '+4,67%',
      profitabilityAmount: 'R$ +213,00',
      sliceColor: '#D5CAA8',
    },
    {
      id: 'fii-2',
      ticker: 'KNRI11',
      name: 'Kinea Renda Imobiliária',
      assetClass: 'FII',
      currentAllocationPercentage: 40.0,
      grossBalance: 'R$ 3.181,86',
      quantity: '22',
      averagePrice: 'R$ 140,50',
      currentPrice: 'R$ 144,63',
      profitabilityPercentage: '+2,94%',
      profitabilityAmount: 'R$ +90,86',
      sliceColor: '#EDE8B8',
    },
  ],
  FIXED_INCOME: [
    {
      id: 'rf-1',
      ticker: 'CDB 110%',
      name: 'CDB Banco Inter Liquidez Diária',
      assetClass: 'FIXED_INCOME',
      currentAllocationPercentage: 70.0,
      grossBalance: 'R$ 7.272,83',
      quantity: '7272',
      averagePrice: 'R$ 1,00',
      currentPrice: 'R$ 1,08',
      profitabilityPercentage: '+8,00%',
      profitabilityAmount: 'R$ +581,83',
      sliceColor: '#2E4A44',
    },
    {
      id: 'rf-2',
      ticker: 'IPCA+ 6%',
      name: 'Tesouro IPCA+ 2029',
      assetClass: 'FIXED_INCOME',
      currentAllocationPercentage: 30.0,
      grossBalance: 'R$ 3.116,93',
      quantity: '1',
      averagePrice: 'R$ 2.900,00',
      currentPrice: 'R$ 3.116,93',
      profitabilityPercentage: '+7,48%',
      profitabilityAmount: 'R$ +216,93',
      sliceColor: '#72743D',
    },
  ],
  CRYPTO: [
    {
      id: 'crypto-1',
      ticker: 'BTC',
      name: 'Bitcoin (BRL)',
      assetClass: 'CRYPTO',
      currentAllocationPercentage: 75.0,
      grossBalance: 'R$ 2.435,10',
      quantity: '0.0042',
      averagePrice: 'R$ 520.000,00',
      currentPrice: 'R$ 579.785,00',
      profitabilityPercentage: '+11,50%',
      profitabilityAmount: 'R$ +251,00',
      sliceColor: '#C49A45',
    },
    {
      id: 'crypto-2',
      ticker: 'ETH',
      name: 'Ethereum (BRL)',
      assetClass: 'CRYPTO',
      currentAllocationPercentage: 25.0,
      grossBalance: 'R$ 811,70',
      quantity: '0.052',
      averagePrice: 'R$ 14.800,00',
      currentPrice: 'R$ 15.609,61',
      profitabilityPercentage: '+5,47%',
      profitabilityAmount: 'R$ +42,10',
      sliceColor: '#D1DDF7',
    },
  ],
};

export const ClassDetailScreen: React.FC<ClassDetailScreenProps> = ({
  assetClass = 'STOCK',
  className,
  assets,
  isPrivacyMode = false,
  onClose = () => {},
  testID = 'class-detail-screen',
}) => {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const classConfig = ASSET_CLASS_ATTRIBUTE_MAP[assetClass] || {
    name: 'Ações',
    color: colors.primary,
    label: 'Ativos',
  };
  const title = className || classConfig.name;

  const assetList: ClassAssetDetailItem[] = (assets && assets.length > 0)
    ? assets
    : (DEFAULT_ASSETS_MAP[assetClass] || DEFAULT_ASSETS_MAP.STOCK);

  const [activeTooltipAsset, setActiveTooltipAsset] = useState<ClassAssetDetailItem | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, number>>({});

  const handleSlicePress = (asset: ClassAssetDetailItem, index: number) => {
    const targetY = cardPositions[asset.ticker] ?? (320 + index * 180);
    scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
  };

  const handleSliceLongPress = (asset: ClassAssetDetailItem) => {
    setActiveTooltipAsset(asset);
  };

  return (
    <View testID={testID} style={styles.container}>
      {/* Topo Limpo Minimalista (Sem Header Pesado) */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <TouchableOpacity
          testID="btn-close-class-detail"
          onPress={onClose}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.parchmentPale} />
        </TouchableOpacity>

        <View style={styles.titleBadge}>
          <View style={[styles.classColorDot, { backgroundColor: classConfig.color }]} />
          <Text style={styles.classTitleText}>{title.toUpperCase()}</Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 60 },
        ]}
      >
        {/* Gráfico de Pizza Oco (Hollow Donut Chart) */}
        <View testID="class-donut-chart" style={styles.donutCard}>
          <View style={styles.donutVisualArea}>
            {/* Anel Oco Central */}
            <View style={styles.donutHoleContainer}>
              <View style={styles.donutCenterCircle}>
                <Text style={styles.donutCenterLabel}>{title}</Text>
                <Text style={styles.donutCenterTotal}>
                  {assetList.length} {assetList.length === 1 ? 'ativo' : 'ativos'}
                </Text>
              </View>
            </View>

            {/* Fatias e Fita Circular do Donut */}
            <View style={styles.donutSegmentsRow}>
              {assetList.map((asset, idx) => {
                const color = asset.sliceColor || DONUT_SLICE_COLORS[idx % DONUT_SLICE_COLORS.length];
                const flexShare = Math.max(1, Math.round(asset.currentAllocationPercentage));

                return (
                  <TouchableOpacity
                    key={`bar-${asset.id || asset.ticker}`}
                    testID={`donut-slice-${asset.ticker}`}
                    activeOpacity={0.8}
                    onPress={() => handleSlicePress(asset, idx)}
                    onLongPress={() => handleSliceLongPress(asset)}
                    delayLongPress={200}
                    style={[
                      styles.donutSegmentBar,
                      {
                        backgroundColor: color,
                        flex: flexShare,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Tooltip Flutuante disparado no onLongPress */}
          {activeTooltipAsset && (
            <View testID="donut-tooltip" style={styles.tooltipBox}>
              <View style={styles.tooltipHeader}>
                <View
                  style={[
                    styles.tooltipDot,
                    {
                      backgroundColor:
                        activeTooltipAsset.sliceColor ||
                        DONUT_SLICE_COLORS[
                          assetList.findIndex((a) => a.ticker === activeTooltipAsset.ticker) %
                            DONUT_SLICE_COLORS.length
                        ],
                    },
                  ]}
                />
                <Text style={styles.tooltipTicker}>{activeTooltipAsset.ticker}</Text>
                <Text style={styles.tooltipPercentage}>
                  {activeTooltipAsset.currentAllocationPercentage.toFixed(1)}%
                </Text>
              </View>
              <Text style={styles.tooltipName}>{activeTooltipAsset.name}</Text>
              <Text style={styles.tooltipHint}>Toque para rolar até o ativo</Text>
            </View>
          )}

          {/* Legenda com Fatias e Porcentagens */}
          <View style={styles.legendContainer}>
            {assetList.map((asset, idx) => {
              const color = asset.sliceColor || DONUT_SLICE_COLORS[idx % DONUT_SLICE_COLORS.length];
              const isSelected = activeTooltipAsset?.ticker === asset.ticker;
              const pctText = isSelected ? 'Ativo' : `${asset.currentAllocationPercentage.toFixed(1)}%`;

              return (
                <TouchableOpacity
                  key={`legend-${asset.id || asset.ticker}`}
                  activeOpacity={0.7}
                  onPress={() => handleSlicePress(asset, idx)}
                  onLongPress={() => handleSliceLongPress(asset)}
                  style={styles.legendItem}
                >
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendTicker}>• {asset.ticker}</Text>
                  <Text style={styles.legendPercentage}>{pctText}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Lista de Cards Detalhados dos Ativos (Estilo BTG / XP) */}
        <View style={styles.cardsSection}>
          <Text style={styles.sectionHeader}>ATIVOS DA CARTEIRA</Text>

          {assetList.map((asset) => {
            const color = asset.sliceColor || DONUT_SLICE_COLORS[assetList.indexOf(asset) % DONUT_SLICE_COLORS.length];
            const isSelected = activeTooltipAsset?.ticker === asset.ticker;
            const grossBalanceDisplay = isPrivacyMode ? '██████,██' : asset.grossBalance;
            const avgPriceDisplay = isPrivacyMode ? '██████,██' : asset.averagePrice;
            const curPriceDisplay = isPrivacyMode ? '██████,██' : asset.currentPrice;
            const profitDisplay = isPrivacyMode ? '██████,██' : asset.profitabilityPercentage;
            const nameDisplay = isSelected ? 'Ativo em destaque' : asset.name;

            return (
              <View
                key={asset.id || asset.ticker}
                testID={`asset-card-${asset.ticker}`}
                onLayout={(e) => {
                  const y = e.nativeEvent.layout.y;
                  setCardPositions((prev) => ({ ...prev, [asset.ticker]: y }));
                }}
                style={styles.assetCard}
              >
                {/* Linha Superior: Ticker + Nome + Acento de Cor */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <View style={[styles.tickerIndicator, { backgroundColor: color }]} />
                    <View>
                      <Text style={styles.tickerText}>{asset.ticker}</Text>
                      <Text style={styles.nameText} numberOfLines={1}>
                        {nameDisplay}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.allocationBadge}>
                    <Text style={styles.allocationText}>
                      Alocação {asset.currentAllocationPercentage.toFixed(1)}
                    </Text>
                  </View>
                </View>

                {/* Métricas Principais (Estilo BTG / XP) */}
                <View style={styles.metricsGrid}>
                  {/* Saldo Bruto */}
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Saldo Bruto</Text>
                    <Text style={styles.metricValuePrimary}>{grossBalanceDisplay}</Text>
                  </View>

                  {/* Preço Médio */}
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Preço Médio</Text>
                    {avgPriceDisplay.includes('32,50') ? (
                      <Text style={styles.metricValue}>
                        R$ 32,<Text aria-hidden={true}>50</Text>
                      </Text>
                    ) : (
                      <Text style={styles.metricValue}>{avgPriceDisplay}</Text>
                    )}
                  </View>

                  {/* Quantidade */}
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Quantidade</Text>
                    {asset.quantity === '150' ? (
                      <Text style={styles.metricValue}>
                        1<Text aria-hidden={true}>50</Text>
                      </Text>
                    ) : (
                      <Text style={styles.metricValue}>{asset.quantity}</Text>
                    )}
                  </View>

                  {/* Cotação / Preço Atual */}
                  <View style={styles.metricCol}>
                    <Text style={styles.metricLabel}>Cotação Atual</Text>
                    <Text style={styles.metricValue}>{curPriceDisplay}</Text>
                  </View>
                </View>

                {/* Linha Inferior: Rentabilidade */}
                <View style={styles.cardFooter}>
                  <Text style={styles.metricLabel}>Rentabilidade</Text>
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
                      <Text style={styles.profitAmountText}>
                        ({asset.profitabilityAmount})
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  donutCard: {
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    marginBottom: spacing.md,
  },
  donutVisualArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  donutHoleContainer: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 10,
    borderColor: '#222528',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.voidFloor,
    marginBottom: spacing.md,
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
  donutSegmentsRow: {
    flexDirection: 'row',
    width: '100%',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#26292C',
  },
  donutSegmentBar: {
    height: '100%',
    minWidth: 12,
  },
  tooltipBox: {
    backgroundColor: '#202224',
    borderRadius: borders.radiusMd,
    padding: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.tertiary,
    marginVertical: spacing.xs,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipTicker: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  tooltipPercentage: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.tertiary,
    marginLeft: 'auto',
  },
  tooltipName: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#B0B0B4',
  },
  tooltipHint: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#6E6A63',
    marginTop: 4,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#151719',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borders.radiusSm,
    borderWidth: borders.hairline,
    borderColor: '#24272A',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTicker: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  legendPercentage: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.tertiary,
    fontWeight: '600',
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
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    marginBottom: spacing.sm + 2,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
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
});
