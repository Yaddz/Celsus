import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from '../theme/tokens';
import {
  DotMatrixAllocationCard,
  PatrimonyLineChartCard,
  TimePeriod,
} from '../components/ui';
import {
  HistoricalPricePoint,
  HistoricalTransactionInput,
  PeriodFilter,
  filterCurveByPeriod,
  calculatePeriodSummary,
  calculateDailyPatrimonyCurve,
} from '../domain/finance/portfolioHistory';
import {
  consolidatePortfolios,
  ConsolidatedDossierResult,
  PortfolioConsolidationInput,
} from '../domain/finance/consolidatedView';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { transactionRepository } from '../repositories/transactionRepository';

export interface StatisticsScreenProps {
  onClose?: () => void;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
}

const DEFAULT_SAMPLE_CURVE: HistoricalPricePoint[] = [
  { date: '2026-01-01', investedCapital: '20000.00', marketValue: '20000.00', profit: '0.00', profitPercentage: '0.00' },
  { date: '2026-02-01', investedCapital: '25000.00', marketValue: '26200.00', profit: '1200.00', profitPercentage: '4.80' },
  { date: '2026-03-01', investedCapital: '28000.00', marketValue: '30100.00', profit: '2100.00', profitPercentage: '7.50' },
  { date: '2026-04-01', investedCapital: '30000.00', marketValue: '32500.00', profit: '2500.00', profitPercentage: '8.33' },
  { date: '2026-05-01', investedCapital: '32000.00', marketValue: '34200.00', profit: '2200.00', profitPercentage: '6.88' },
  { date: '2026-06-01', investedCapital: '32000.00', marketValue: '35468.00', profit: '3468.00', profitPercentage: '10.84' },
];

export const StatisticsScreen: React.FC<StatisticsScreenProps> = ({
  onClose,
  isPrivacyMode = false,
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<PeriodFilter>('ALL');
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('all'); // 'all' = Carteiras Consolidadas
  const [loading, setLoading] = useState(true);
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedDossierResult | null>(null);
  const [dailyCurve, setDailyCurve] = useState<HistoricalPricePoint[]>(DEFAULT_SAMPLE_CURVE);
  const [transactionsList, setTransactionsList] = useState<HistoricalTransactionInput[]>([]);
  const [portfoliosList, setPortfoliosList] = useState<Array<{ id: string; name: string }>>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const allPortfolios = await portfolioRepository.listPortfolios(false);
      setPortfoliosList(allPortfolios.map((p) => ({ id: p.id, name: p.name })));

      const consolidationInputs: PortfolioConsolidationInput[] = await Promise.all(
        allPortfolios.map(async (p) => {
          const pAssets = await assetRepository.getAssetsByPortfolio(p.id);
          const pTargets = await portfolioRepository.getClassTargets(p.id);

          return {
            id: p.id,
            name: p.name,
            docketCode: p.docket_code,
            isArchived: p.is_archived,
            assets: pAssets.map((a) => ({
              id: a.id,
              ticker: a.ticker,
              assetClass: a.asset_class as any,
              quantity: a.quantity,
              averagePrice: a.average_price,
              currentPrice: a.manual_price_override || a.average_price,
              manualPriceOverride: a.manual_price_override,
            })),
            classTargets: pTargets.map((ct) => ({
              assetClass: ct.asset_class as any,
              targetPercentage: ct.target_percentage,
            })),
          };
        })
      );

      const dossier = consolidatePortfolios(consolidationInputs);
      setConsolidatedData(dossier);

      // Coleta ativos e transações da carteira selecionada ou consolidadas
      let targetAssets: any[] = [];
      let targetTxs: any[] = [];

      for (const p of allPortfolios) {
        if (selectedPortfolioId === 'all' || p.id === selectedPortfolioId) {
          const pAssets = await assetRepository.getAssetsByPortfolio(p.id);
          const pTxs = await transactionRepository.getTransactionsByPortfolio(p.id);
          targetAssets.push(...pAssets);
          targetTxs.push(...pTxs);
        }
      }

      if (targetTxs.length > 0) {
        const mappedTxs: HistoricalTransactionInput[] = targetTxs.map((t) => ({
          id: t.id,
          assetId: t.asset_id,
          type: t.type as any,
          tradeDate: t.trade_date,
          quantity: t.quantity,
          unitPrice: t.unit_price,
          fees: t.fees,
        }));
        setTransactionsList(mappedTxs);

        const curve = calculateDailyPatrimonyCurve({
          assets: targetAssets.map((a) => ({
            id: a.id,
            ticker: a.ticker,
            assetClass: a.asset_class as any,
            rfIndexer: a.rf_indexer as any,
            rfRate: a.rf_rate,
            manualPriceOverride: a.manual_price_override,
          })),
          transactions: mappedTxs,
        });

        if (curve && curve.length > 0) {
          setDailyCurve(curve);
        }
      }
    } catch {
      // Se houver erro ou dados vazios, mantém curva e dados padrão
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPortfolioId]);

  // Filtragem da série histórica e cálculo do resumo financeiro
  const filteredCurve = filterCurveByPeriod(dailyCurve, selectedPeriodFilter);
  const activeCurve = filteredCurve.length > 0 ? filteredCurve : dailyCurve;
  const periodSummary = calculatePeriodSummary(activeCurve, transactionsList);

  const totalBalanceStr = consolidatedData
    ? `R$ ${parseFloat(consolidatedData.totalMarketValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'R$ 32.468,00';

  const categoryAllocations = consolidatedData
    ? [
        {
          assetClass: 'FIXED_INCOME' as const,
          currentPercentage: parseFloat(consolidatedData.classAllocation.FIXED_INCOME.currentPercentage) || 32.0,
          targetPercentage: parseFloat(consolidatedData.classAllocation.FIXED_INCOME.weightedTargetPercentage) || 30.0,
          marketValue: consolidatedData.classAllocation.FIXED_INCOME.marketValue,
        },
        {
          assetClass: 'FII' as const,
          currentPercentage: parseFloat(consolidatedData.classAllocation.FII.currentPercentage) || 24.5,
          targetPercentage: parseFloat(consolidatedData.classAllocation.FII.weightedTargetPercentage) || 25.0,
          marketValue: consolidatedData.classAllocation.FII.marketValue,
        },
        {
          assetClass: 'STOCK' as const,
          currentPercentage: parseFloat(consolidatedData.classAllocation.STOCK.currentPercentage) || 33.5,
          targetPercentage: parseFloat(consolidatedData.classAllocation.STOCK.weightedTargetPercentage) || 35.0,
          marketValue: consolidatedData.classAllocation.STOCK.marketValue,
        },
        {
          assetClass: 'CRYPTO' as const,
          currentPercentage: parseFloat(consolidatedData.classAllocation.CRYPTO.currentPercentage) || 10.0,
          targetPercentage: parseFloat(consolidatedData.classAllocation.CRYPTO.weightedTargetPercentage) || 10.0,
          marketValue: consolidatedData.classAllocation.CRYPTO.marketValue,
        },
      ]
    : undefined;

  return (
    <View style={[styles.container, isLight && styles.containerLight, { paddingTop: insets.top + spacing.xs }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Seletor de Carteira: Carteiras Consolidadas ou individuais */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectedPortfolioId('all')}
            style={[
              styles.filterPill,
              isLight && styles.filterPillLight,
              selectedPortfolioId === 'all' && styles.filterPillActive,
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                isLight && styles.filterPillTextLight,
                selectedPortfolioId === 'all' && styles.filterPillTextActive,
              ]}
            >
              Carteiras Consolidadas
            </Text>
          </TouchableOpacity>

          {portfoliosList.map((p) => {
            const isSelected = p.id === selectedPortfolioId;
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => setSelectedPortfolioId(p.id)}
                style={[styles.filterPill, isLight && styles.filterPillLight, isSelected && styles.filterPillActive]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isLight && styles.filterPillTextLight,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}

        {/* 1. Gráfico de Linha Suave com Sombra e Card de Resumo do Período */}
        <PatrimonyLineChartCard
          curve={activeCurve}
          selectedPeriod={selectedPeriodFilter}
          onPeriodChange={setSelectedPeriodFilter}
          summary={periodSummary}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          testID="patrimony-line-chart-card"
        />

        {/* 2. Card de Alocação por Categoria com Matriz de Pontos */}
        <DotMatrixAllocationCard
          totalBalance={totalBalanceStr}
          allocations={categoryAllocations}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          testID="dot-matrix-allocation-card"
        />

        {/* 3. Card de Métricas Financeiras Consolidadas */}
        {consolidatedData ? (
          <View style={[styles.metricsCard, isLight && styles.metricsCardLight]}>
            <Text style={[styles.metricsTitle, isLight && styles.metricsTitleLight]}>RESUMO DO DOSSIÊ</Text>
            <View style={styles.metricsGrid}>
              <View style={[styles.metricBox, isLight && styles.metricBoxLight]}>
                <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Capital Aportado</Text>
                <Text style={[styles.metricValue, isLight && styles.metricValueLight]}>
                  {isPrivacyMode
                    ? '*******'
                    : `R$ ${parseFloat(consolidatedData.totalInvestedCapital).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </Text>
              </View>
              <View style={[styles.metricBox, isLight && styles.metricBoxLight]}>
                <Text style={[styles.metricLabel, isLight && styles.metricLabelLight]}>Lucro / PnL Total</Text>
                <Text
                  style={[
                    styles.metricValue,
                    isLight && styles.metricValueLight,
                    {
                      color:
                        parseFloat(consolidatedData.totalProfit) >= 0
                          ? (isLight ? '#2E4A44' : '#AECDC5')
                          : colors.primary,
                    },
                  ]}
                >
                  {isPrivacyMode
                    ? '*******'
                    : `${parseFloat(consolidatedData.totalProfit) >= 0 ? '+' : ''}R$ ${parseFloat(consolidatedData.totalProfit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${consolidatedData.totalProfitPercentage}%)`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Espaçador para o Dock Flutuante */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borders.radiusPill,
    backgroundColor: '#191B1D',
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#8A8A8E',
  },
  filterPillTextActive: {
    color: colors.voidFloor,
  },
  loadingContainer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  metricsCard: {
    backgroundColor: colors.neutral,
    borderRadius: 22,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  metricsTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    marginBottom: spacing.sm,
    letterSpacing: 1.1,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#111315',
    padding: spacing.sm,
    borderRadius: 16,
    borderWidth: borders.hairline,
    borderColor: '#24272A',
  },
  metricLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginTop: 4,
  },
  // Light Theme Styles
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  filterPillLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  filterPillTextLight: {
    color: '#6E6A63',
  },
  metricsCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    shadowColor: '#111315',
    shadowOpacity: 0.08,
  },
  metricsTitleLight: {
    color: '#6E6A63',
  },
  metricBoxLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  metricLabelLight: {
    color: '#6E6A63',
  },
  metricValueLight: {
    color: '#111315',
  },
});

export default StatisticsScreen;
