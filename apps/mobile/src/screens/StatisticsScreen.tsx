import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useHeaderScrollFade } from '../hooks/useHeaderScrollFade';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getPortfolioPalette } from '../theme/palettes';
import { useActivePortfolioId, useActiveWalletIndex } from '../stores/walletStore';
import { colors, typography, spacing, borders, layout, space, bento } from '../theme/tokens';
import {
  DotMatrixAllocationCard,
  PatrimonyLineChartCard,
  TimePeriod,
  XpMinimalHeader,
  BentoRow,
  BentoTile,
  AnimatedModalSheet,
  LedgerInput,
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
import { incomeRepository } from '../repositories/incomeRepository';
import { useProfile } from '../stores/profileStore';
import { summarizeIncome } from '../domain/finance/income';
import { parseMoneyInput } from '../components/ui/GoalProgressTile';
import { assetRepository } from '../repositories/assetRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { marketApiService } from '../services/marketApi';

export interface StatisticsScreenProps {
  onClose?: () => void;
  onOpenIncomeHistory?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onProfilePress?: () => void;
  onClassPress?: (assetClass: any) => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const StatisticsScreen: React.FC<StatisticsScreenProps> = ({
  onClose,
  onOpenIncomeHistory,
  isPrivacyMode = false,
  onTogglePrivacy,
  onProfilePress,
  onClassPress,
  themeMode = 'dark',
  testID = 'statistics-screen',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<PeriodFilter>('ALL');
  const activeWalletId = useActivePortfolioId();
  const activeWalletIndex = useActiveWalletIndex();
  // Segue a carteira selecionada no baralho; o usuário ainda pode escolher "Consolidadas".
  const { scrollY, scrollProps } = useHeaderScrollFade();
  const { name: profileName, initials: profileInitials } = useProfile();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(activeWalletId ?? 'all'); // 'all' = Carteiras Consolidadas
  useEffect(() => {
    if (activeWalletId) setSelectedPortfolioId(activeWalletId);
  }, [activeWalletId]);
  const [loading, setLoading] = useState(true);
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedDossierResult | null>(null);
  const [dailyCurve, setDailyCurve] = useState<HistoricalPricePoint[]>([]);
  const [transactionsList, setTransactionsList] = useState<HistoricalTransactionInput[]>([]);
  const [portfoliosList, setPortfoliosList] = useState<Array<{ id: string; name: string }>>([]);
  const [incomes, setIncomes] = useState<Array<{ date: string; amount: string }>>([]);

  const incomesSeqRef = React.useRef(0);
  const loadIncomes = async () => {
    const seq = ++incomesSeqRef.current;
    try {
      const rows =
        selectedPortfolioId === 'all'
          ? await incomeRepository.listAll()
          : await incomeRepository.listByPortfolio(selectedPortfolioId);
      if (seq === incomesSeqRef.current) setIncomes(rows.map((r) => ({ date: r.pay_date, amount: r.amount })));
    } catch {
      if (seq === incomesSeqRef.current) setIncomes([]);
    }
  };
  useEffect(() => {
    loadIncomes();
  }, [selectedPortfolioId]);
  const incomeSummary = useMemo(() => summarizeIncome(incomes, new Date().toISOString().slice(0, 10)), [incomes]);

  // Cada troca de carteira invalida a carga anterior (evita a resposta atrasada de outra carteira
  // sobrescrever a atual).
  const loadSeqRef = React.useRef(0);
  const loadData = async () => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    try {
      setLoading(true);
      const allPortfolios = await portfolioRepository.listPortfolios(false);
      if (isStale()) return;
      setPortfoliosList(allPortfolios.map((p) => ({ id: p.id, name: p.name })));

      // Ativos e metas de cada carteira lidos UMA vez (antes os ativos eram lidos de novo mais abaixo).
      const loaded = await Promise.all(
        allPortfolios.map(async (p) => {
          const [pAssets, pTargets] = await Promise.all([
            assetRepository.getAssetsByPortfolio(p.id),
            portfolioRepository.getClassTargets(p.id),
          ]);
          return { p, pAssets, pTargets };
        })
      );

      // Cotações: cache local por ticker e uma única chamada de rede, em lote, para as que faltam
      // (antes: 1 requisição por ativo sem cache).
      const quoteByTicker: Record<string, string> = {};
      const tickers = Array.from(
        new Set(loaded.flatMap(({ pAssets }) => pAssets.map((a) => a.ticker).filter((t): t is string => !!t)))
      );
      const missing: string[] = [];
      await Promise.all(
        tickers.map(async (t) => {
          try {
            const cached = await marketApiService.getCachedQuote(t);
            if (cached?.currentPrice) quoteByTicker[t.toUpperCase()] = cached.currentPrice;
            else missing.push(t);
          } catch {}
        })
      );
      if (missing.length > 0) {
        try {
          const fetched = await marketApiService.fetchQuotes(missing);
          for (const q of fetched || []) {
            if (q?.currentPrice) quoteByTicker[q.ticker.toUpperCase()] = q.currentPrice;
          }
        } catch {}
      }
      if (isStale()) return;

      const consolidationInputs: PortfolioConsolidationInput[] = loaded.map(({ p, pAssets, pTargets }) => ({
        id: p.id,
        name: p.name,
        docketCode: p.docket_code,
        isArchived: p.is_archived,
        assets: pAssets.map((a) => {
          const quotePrice = a.ticker ? quoteByTicker[a.ticker.toUpperCase()] ?? null : null;
          return {
            id: a.id,
            ticker: a.ticker,
            assetClass: a.asset_class as any,
            quantity: a.quantity,
            averagePrice: a.average_price,
            currentPrice: a.manual_price_override || quotePrice || a.average_price,
            manualPriceOverride: a.manual_price_override,
          };
        }),
        classTargets: pTargets.map((ct) => ({
          assetClass: ct.asset_class as any,
          targetPercentage: ct.target_percentage,
        })),
      }));

      const targetInputs = selectedPortfolioId === 'all'
        ? consolidationInputs
        : consolidationInputs.filter((i) => i.id === selectedPortfolioId);
      const dossier = consolidatePortfolios(targetInputs.length > 0 ? targetInputs : consolidationInputs);
      setConsolidatedData(dossier);

      // Coleta ativos e transações da carteira selecionada ou consolidadas
      const selected = loaded.filter(({ p }) => selectedPortfolioId === 'all' || p.id === selectedPortfolioId);
      const targetAssets: any[] = selected.flatMap(({ pAssets }) => pAssets);
      const txLists = await Promise.all(
        selected.map(({ p }) => transactionRepository.getTransactionsByPortfolio(p.id))
      );
      if (isStale()) return;
      const targetTxs: any[] = txLists.flat();

      const mappedTxs: HistoricalTransactionInput[] = targetTxs.map((t) => ({
        id: t.id,
        assetId: t.asset_id,
        type: t.type as any,
        tradeDate: t.trade_date,
        quantity: t.quantity,
        unitPrice: t.unit_price,
        fees: t.fees,
      }));
      // Sempre substitui (inclusive por vazio): uma carteira sem movimentações não herda a curva
      // e as movimentações da carteira vista antes.
      setTransactionsList(mappedTxs);

      if (mappedTxs.length > 0) {
        const histQuotesMap: Record<string, Record<string, string>> = {};
        const todayStr = new Date().toISOString().slice(0, 10);
        for (const a of targetAssets) {
          const price = a.ticker ? quoteByTicker[a.ticker.toUpperCase()] : undefined;
          if (price) {
            if (!histQuotesMap[a.ticker]) histQuotesMap[a.ticker] = {};
            histQuotesMap[a.ticker][todayStr] = price;
          }
        }

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
          historicalQuotes: Object.keys(histQuotesMap).length > 0 ? histQuotesMap : undefined,
        });
        setDailyCurve(curve && curve.length > 0 ? curve : []);
      } else {
        setDailyCurve([]);
      }
    } catch {
      // Se houver erro ou dados vazios, mantém curva e dados padrão
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPortfolioId]);

  // Filtragem da série histórica e cálculo do resumo financeiro
  // Memoizados: a curva diária pode ter milhares de pontos e antes era refiltrada a cada render
  // (inclusive ao rolar a tela, que anima o header).
  const activeCurve = useMemo(() => {
    const filteredCurve = filterCurveByPeriod(dailyCurve, selectedPeriodFilter);
    return filteredCurve.length > 0 ? filteredCurve : dailyCurve;
  }, [dailyCurve, selectedPeriodFilter]);
  const periodSummary = useMemo(
    () => calculatePeriodSummary(activeCurve, transactionsList),
    [activeCurve, transactionsList]
  );

  const totalBalanceStr = consolidatedData
    ? `R$ ${parseFloat(consolidatedData.totalMarketValue || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : 'R$ 0,00';

  const categoryAllocations = consolidatedData
    ? [
        {
          assetClass: 'FIXED_INCOME' as const,
          currentPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.FIXED_INCOME?.currentPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.FIXED_INCOME.currentPercentage),
          targetPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.FIXED_INCOME?.weightedTargetPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.FIXED_INCOME.weightedTargetPercentage),
          marketValue: consolidatedData.classAllocation?.FIXED_INCOME?.marketValue || '0.00',
        },
        {
          assetClass: 'FII' as const,
          currentPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.FII?.currentPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.FII.currentPercentage),
          targetPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.FII?.weightedTargetPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.FII.weightedTargetPercentage),
          marketValue: consolidatedData.classAllocation?.FII?.marketValue || '0.00',
        },
        {
          assetClass: 'STOCK' as const,
          currentPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.STOCK?.currentPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.STOCK.currentPercentage),
          targetPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.STOCK?.weightedTargetPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.STOCK.weightedTargetPercentage),
          marketValue: consolidatedData.classAllocation?.STOCK?.marketValue || '0.00',
        },
        {
          assetClass: 'CRYPTO' as const,
          currentPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.CRYPTO?.currentPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.CRYPTO.currentPercentage),
          targetPercentage: Number.isNaN(parseFloat(consolidatedData.classAllocation?.CRYPTO?.weightedTargetPercentage)) ? 0 : parseFloat(consolidatedData.classAllocation.CRYPTO.weightedTargetPercentage),
          marketValue: consolidatedData.classAllocation?.CRYPTO?.marketValue || '0.00',
        },
      ]
    : undefined;

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      <XpMinimalHeader
        userName={profileName || 'Usuário'}
        userInitials={profileInitials || 'U'}
        palette={getPortfolioPalette(activeWalletIndex)}
        onAvatarPress={onProfilePress}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        scrollY={scrollY}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
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

        {/* Skeleton progress bar suave no topo quando carregando, sem empurrar a tela */}
        {loading && (
          <View
            testID="statistics-skeleton-loading"
            style={[styles.skeletonLine, { height: 3, width: '100%', marginBottom: 8, opacity: 0.7, backgroundColor: colors.primary }]}
          />
        )}

        {/* 1. Gráfico de Linha Suave com Sombra e Card de Resumo do Período */}
        <View style={{ backgroundColor: isLight ? '#FFFFFF' : '#1C1E20', borderRadius: 28, padding: 16, overflow: 'hidden' }}>
        <PatrimonyLineChartCard
          curve={activeCurve}
          selectedPeriod={selectedPeriodFilter}
          onPeriodChange={setSelectedPeriodFilter}
          summary={periodSummary}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          testID="patrimony-line-chart-card"
        />
        </View>

        {/* 2. Card de Alocação por Categoria com Matriz de Pontos */}
        <DotMatrixAllocationCard
          totalBalance={totalBalanceStr}
          allocations={categoryAllocations}
          isPrivacyMode={isPrivacyMode}
          variant="bento"
          onClassPress={onClassPress}
          themeMode={themeMode}
          testID="dot-matrix-allocation-card"
        />

        {/* 3. Métricas consolidadas em tiles Bento */}
        {consolidatedData ? (
          <View style={{ marginTop: space.md }}>
            <Text style={[styles.metricsTitle, isLight && styles.metricsTitleLight]}>PANORAMA GERAL</Text>
            <BentoRow>
              <BentoTile variant="cream" testID="stats-invested-tile">
                <Text style={[styles.metricLabel, { color: bento.variants.cream.muted }]}>Capital Aportado</Text>
                <Text style={[styles.metricValue, { color: bento.variants.cream.foreground }]}>
                  {isPrivacyMode
                    ? 'R$ ••••••'
                    : `R$ ${parseFloat(consolidatedData.totalInvestedCapital).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </Text>
              </BentoTile>
              <BentoTile variant={parseFloat(consolidatedData.totalProfit) >= 0 ? 'forest' : 'primary'} testID="stats-profit-tile">
                <Text style={[styles.metricLabel, { color: bento.variants[parseFloat(consolidatedData.totalProfit) >= 0 ? 'forest' : 'primary'].muted }]}>
                  Lucro / PnL Total
                </Text>
                <Text
                  style={[
                    styles.metricValue,
                    { color: bento.variants[parseFloat(consolidatedData.totalProfit) >= 0 ? 'forest' : 'primary'].foreground },
                  ]}
                >
                  {isPrivacyMode
                    ? 'R$ ••••••'
                    : `${parseFloat(consolidatedData.totalProfit) > 0 ? '+' : ''}R$ ${parseFloat(consolidatedData.totalProfit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${parseFloat(consolidatedData.totalProfitPercentage) > 0 ? '+' : ''}${parseFloat(consolidatedData.totalProfitPercentage).toFixed(2).replace('.', ',')}%)`}
                </Text>
              </BentoTile>
            </BentoRow>
          </View>
        ) : null}

        {/* 4. Proventos (aba Resumo/Histórico da planilha) */}
        <View style={{ marginTop: bento.gap }}>
          <BentoRow>
            {/* Tocar no card ou no botão abre o histórico de proventos */}
            <BentoTile
              variant="gold"
              span={2}
              title="Proventos estimados"
              onPress={onOpenIncomeHistory}
              accessibilityLabel="Proventos estimados. Toque para ver histórico de proventos"
              testID="stats-income-tile"
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={[styles.metricValue, { color: bento.variants.gold.foreground, fontSize: 24 }]}>
                  {isPrivacyMode
                    ? 'R$ ••••••'
                    : `R$ ${parseFloat(incomeSummary.totalYear).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </Text>
                <TouchableOpacity
                  testID="stats-open-income-history-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Ver histórico de proventos"
                  onPress={onOpenIncomeHistory}
                  style={{
                    backgroundColor: 'rgba(255, 179, 0, 0.15)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600', color: bento.variants.gold.foreground }}>
                    Ver histórico
                  </Text>
                </TouchableOpacity>
              </View>
            </BentoTile>
          </BentoRow>
        </View>

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
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: layout.tabScreenPaddingTop,
    paddingBottom: space.xxl,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xs,
    marginBottom: space.lg,
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
    marginTop: layout.sectionGap,
    paddingTop: layout.sectionGap - space.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  metricsTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    marginBottom: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metricsGrid: {
    flexDirection: 'column',
  },
  metricBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  metricLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: '#8A8A8E',
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
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
    borderTopColor: '#EAE4D7',
  },
  metricsTitleLight: {
    color: '#6E6A63',
  },
  metricBoxLight: {
    borderTopColor: '#EAE4D7',
  },
  skeletonCard: {
    backgroundColor: '#191B1D',
    borderRadius: 22,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    padding: spacing.md,
  },
  skeletonCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  skeletonLine: {
    backgroundColor: '#26292C',
    borderRadius: 6,
  },
  metricLabelLight: {
    color: '#6E6A63',
  },
  metricValueLight: {
    color: '#111315',
  },
});

export default StatisticsScreen;
