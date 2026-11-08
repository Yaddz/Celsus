import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderScrollFade } from '../hooks/useHeaderScrollFade';
import { colors, typography, spacing, borders, layout, space, bento } from '../theme/tokens';
import {
  XpMinimalHeader,
  BentoRow,
  BentoTile,
  AnimatedModalSheet,
  LedgerInput,
  ConfirmDialog,
} from '../components/ui';
import { parseMoneyInput } from '../components/ui/GoalProgressTile';
import { incomeRepository } from '../repositories/incomeRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import {
  filterIncomes,
  monthlySeries,
  yearlySeries,
  groupByMonth,
  rankByTicker,
  trailing12m,
  yieldOnCost,
  averagePerMonth,
  bestMonth,
  IncomeHistoryEvent,
} from '../domain/finance/incomeHistory';
import Decimal from 'decimal.js';

export interface IncomeHistoryScreenProps {
  onBack: () => void;
  onOpenB3Import?: () => void;
  initialPortfolioId?: string;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
  bottomOffset?: number;
  testID?: string;
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const MONTH_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatMonthHeader(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTH_NAMES[m - 1] || ym;
  return `${name} de ${y}`;
}

function formatMonthShort(ym: string): string {
  const [, m] = ym.split('-').map(Number);
  return MONTH_SHORT[m - 1] || ym;
}

function formatDateBr(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export const IncomeHistoryScreen: React.FC<IncomeHistoryScreenProps> = ({
  onBack,
  onOpenB3Import,
  initialPortfolioId,
  isPrivacyMode = false,
  themeMode = 'dark',
  bottomOffset = 0,
  testID = 'income-history-screen',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const { scrollY, scrollProps } = useHeaderScrollFade();

  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<IncomeHistoryEvent[]>([]);
  const [portfolios, setPortfolios] = useState<Array<{ id: string; name: string }>>([]);
  const [assets, setAssets] = useState<any[]>([]);

  // Filtros
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId || 'all');
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'current_year' | '12m' | string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedKind, setSelectedKind] = useState<string>('all');
  const [chartMode, setChartMode] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedBar, setSelectedBar] = useState<string | null>(null);

  // Ações de Detalhe e Formulário
  const [selectedIncome, setSelectedIncome] = useState<IncomeHistoryEvent | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Campos do formulário
  const [formTicker, setFormTicker] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formKind, setFormKind] = useState('RENDIMENTO');
  const [formQuantity, setFormQuantity] = useState('');
  const [formUnitAmount, setFormUnitAmount] = useState('');
  const [formPortfolioId, setFormPortfolioId] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ports, asts, rows] = await Promise.all([
        portfolioRepository.listPortfolios(),
        assetRepository.listAll ? assetRepository.listAll() : [],
        incomeRepository.listAll(),
      ]);
      setPortfolios(ports.map((p) => ({ id: p.id, name: p.name })));
      setAssets(asts || []);
      setIncomes(
        rows.map((r) => ({
          id: r.id,
          portfolioId: r.portfolio_id,
          ticker: r.ticker,
          payDate: r.pay_date,
          amount: r.amount,
          notes: r.notes,
          source: r.source,
          externalId: r.external_id,
          kind: r.kind,
          quantity: r.quantity,
          unitAmount: r.unit_amount,
        }))
      );
    } catch {
      setIncomes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mapa ticker -> classe
  const assetClassMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of assets) {
      if (a.ticker) {
        map[a.ticker.toUpperCase()] = a.asset_class;
      }
    }
    return map;
  }, [assets]);

  // Determinar limites de data e intervalo
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentYear = useMemo(() => today.slice(0, 4), [today]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(currentYear);
    for (const inc of incomes) {
      years.add(inc.payDate.slice(0, 4));
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [incomes, currentYear]);

  // Filtros aplicados
  const { filteredIncomes, fromMonth, toMonth } = useMemo(() => {
    let from: string | undefined;
    let to: string | undefined;

    if (selectedPeriod === 'current_year') {
      from = `${currentYear}-01`;
      to = `${currentYear}-12`;
    } else if (selectedPeriod === '12m') {
      const t12 = trailing12m(incomes, today);
      from = t12.from;
      to = t12.to;
    } else if (/^\d{4}$/.test(selectedPeriod)) {
      from = `${selectedPeriod}-01`;
      to = `${selectedPeriod}-12`;
    } else {
      // 'all': cobre do mês mais antigo com provento até o mais recente
      if (incomes.length > 0) {
        let minDate = incomes[0].payDate;
        let maxDate = incomes[0].payDate;
        for (const inc of incomes) {
          if (inc.payDate < minDate) minDate = inc.payDate;
          if (inc.payDate > maxDate) maxDate = inc.payDate;
        }
        from = minDate.slice(0, 7);
        to = maxDate.slice(0, 7);
      } else {
        from = `${currentYear}-01`;
        to = `${currentYear}-12`;
      }
    }

    const portfolioIds = selectedPortfolioId !== 'all' ? [selectedPortfolioId] : undefined;
    const kind = selectedKind !== 'all' ? selectedKind : undefined;
    const assetClass = selectedClass !== 'all' ? selectedClass : undefined;

    const filtered = filterIncomes(
      incomes,
      {
        portfolioIds,
        from,
        to,
        kind,
        assetClass,
      },
      assetClassMap
    );

    return { filteredIncomes: filtered, fromMonth: from, toMonth: to };
  }, [incomes, selectedPeriod, selectedPortfolioId, selectedKind, selectedClass, assetClassMap, currentYear, today]);

  // Métricas calculadas
  const totalAmount = useMemo(() => {
    return filteredIncomes
      .reduce((sum, inc) => sum.plus(new Decimal(inc.amount || 0)), new Decimal(0))
      .toFixed(2);
  }, [filteredIncomes]);

  const monthSeriesData = useMemo(() => {
    return monthlySeries(filteredIncomes, { from: fromMonth, to: toMonth });
  }, [filteredIncomes, fromMonth, toMonth]);

  const yearSeriesData = useMemo(() => {
    return yearlySeries(filteredIncomes);
  }, [filteredIncomes]);

  const bestMonthData = useMemo(() => {
    return bestMonth(monthSeriesData);
  }, [monthSeriesData]);

  const monthlyAverage = useMemo(() => {
    return averagePerMonth(filteredIncomes, { from: fromMonth, to: toMonth });
  }, [filteredIncomes, fromMonth, toMonth]);

  // Custo para yield on cost
  const costBasis = useMemo(() => {
    const relevantAssets = selectedPortfolioId === 'all'
      ? assets
      : assets.filter((a) => a.portfolio_id === selectedPortfolioId);
    return relevantAssets.reduce((sum, a) => {
      const q = new Decimal(a.quantity || 0);
      const p = new Decimal(a.average_price || 0);
      return sum.plus(q.times(p));
    }, new Decimal(0));
  }, [assets, selectedPortfolioId]);

  const yoc = useMemo(() => {
    const scopeEvents = selectedPortfolioId === 'all'
      ? incomes
      : incomes.filter((i) => i.portfolioId === selectedPortfolioId);
    return yieldOnCost(scopeEvents, costBasis, today);
  }, [incomes, costBasis, today, selectedPortfolioId]);

  const rankings = useMemo(() => {
    return rankByTicker(filteredIncomes, 5);
  }, [filteredIncomes]);

  // Itens da lista agrupada (respeita seleção de barra interativa no gráfico)
  const groupedList = useMemo(() => {
    let items = filteredIncomes;
    if (selectedBar) {
      items = items.filter((i) => i.payDate.startsWith(selectedBar));
    }
    return groupByMonth(items);
  }, [filteredIncomes, selectedBar]);

  // Handlers
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormTicker('');
    setFormAmount('');
    setFormDate(today);
    setFormKind('RENDIMENTO');
    setFormQuantity('');
    setFormUnitAmount('');
    setFormPortfolioId(selectedPortfolioId !== 'all' ? selectedPortfolioId : portfolios[0]?.id || '');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (inc: IncomeHistoryEvent) => {
    setIsEditing(true);
    setFormTicker(inc.ticker);
    setFormAmount(parseFloat(inc.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setFormDate(inc.payDate);
    setFormKind(inc.kind || 'RENDIMENTO');
    setFormQuantity(inc.quantity || '');
    setFormUnitAmount(inc.unitAmount ? parseFloat(inc.unitAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
    setFormPortfolioId(inc.portfolioId);
    setSelectedIncome(null);
    setIsFormOpen(true);
  };

  const handleSaveForm = async () => {
    let amount = parseMoneyInput(formAmount);
    if ((!amount || Number(amount) <= 0) && formQuantity && formUnitAmount) {
      const q = parseMoneyInput(formQuantity);
      const u = parseMoneyInput(formUnitAmount);
      if (q && u && Number(q) > 0 && Number(u) > 0) {
        amount = new Decimal(q).times(new Decimal(u)).toFixed(2);
      }
    }
    if (amount) {
      amount = new Decimal(amount).toFixed(2);
    }
    const targetPortfolio = formPortfolioId || portfolios[0]?.id;
    if (!amount || Number(amount) <= 0 || !formTicker.trim() || !targetPortfolio || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      return;
    }

    if (isEditing && selectedIncome) {
      await incomeRepository.updateIncome(selectedIncome.id, {
        ticker: formTicker.trim().toUpperCase(),
        amount,
        payDate: formDate,
        kind: formKind,
        quantity: (formQuantity && parseMoneyInput(formQuantity)) || undefined,
        unitAmount: (formUnitAmount && parseMoneyInput(formUnitAmount)) || undefined,
        portfolioId: targetPortfolio,
      });
    } else {
      await incomeRepository.addIncome({
        portfolioId: targetPortfolio,
        ticker: formTicker.trim().toUpperCase(),
        payDate: formDate,
        amount,
        kind: formKind,
        quantity: (formQuantity && parseMoneyInput(formQuantity)) || undefined,
        unitAmount: (formUnitAmount && parseMoneyInput(formUnitAmount)) || undefined,
      });
    }

    setIsFormOpen(false);
    setSelectedIncome(null);
    await loadData();
  };

  const handleDeleteIncome = async () => {
    if (!selectedIncome) return;
    await incomeRepository.deleteIncome(selectedIncome.id);
    setShowDeleteConfirm(false);
    setSelectedIncome(null);
    await loadData();
  };

  // Cálculo de altura das barras do gráfico
  const maxChartVal = useMemo(() => {
    const list = chartMode === 'monthly' ? monthSeriesData : yearSeriesData;
    let max = 0;
    for (const p of list) {
      const v = parseFloat(p.total);
      if (v > max) max = v;
    }
    return max > 0 ? max : 1;
  }, [chartMode, monthSeriesData, yearSeriesData]);

  if (loading) {
    return (
      <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
        <XpMinimalHeader title="Proventos" subtitle="Valor líquido recebido" onBack={onBack} themeMode={themeMode} />
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      <XpMinimalHeader title="Proventos" subtitle="Valor líquido recebido" onBack={onBack} themeMode={themeMode} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: space.xxl + bottomOffset }]} {...scrollProps}>
        {incomes.length === 0 ? (
          <View testID="income-empty-state" style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, isLight && styles.emptyTitleLight]}>
              Nenhum provento registrado
            </Text>
            <Text style={[styles.emptySubtitle, isLight && styles.emptySubtitleLight]}>
              Importe sua movimentação da B3 ou registre um provento manualmente para ver seu histórico.
            </Text>
            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
              {onOpenB3Import ? (
                <TouchableOpacity
                  testID="income-empty-b3-btn"
                  accessibilityRole="button"
                  onPress={onOpenB3Import}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>Importar extrato da B3</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                testID="income-empty-add-btn"
                accessibilityRole="button"
                onPress={handleOpenAdd}
                style={[styles.primaryBtn, { backgroundColor: isLight ? '#EAE4D7' : '#2A2D30' }]}
              >
                <Text style={[styles.primaryBtnText, { color: isLight ? '#111315' : '#E6DECA' }]}>
                  Adicionar provento
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* 1. Chips de Filtros */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {/* Escopo */}
              <TouchableOpacity
                testID="scope-chip-all"
                onPress={() => setSelectedPortfolioId('all')}
                style={[styles.filterChip, selectedPortfolioId === 'all' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedPortfolioId === 'all' && styles.filterChipTextActive]}>
                  Todas as carteiras
                </Text>
              </TouchableOpacity>
              {portfolios.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  testID={`scope-chip-${p.id}`}
                  onPress={() => setSelectedPortfolioId(p.id)}
                  style={[styles.filterChip, selectedPortfolioId === p.id && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedPortfolioId === p.id && styles.filterChipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {/* Período */}
              <TouchableOpacity
                testID="period-chip-all"
                onPress={() => setSelectedPeriod('all')}
                style={[styles.filterChip, selectedPeriod === 'all' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedPeriod === 'all' && styles.filterChipTextActive]}>
                  Tudo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="period-chip-current-year"
                onPress={() => setSelectedPeriod('current_year')}
                style={[styles.filterChip, selectedPeriod === 'current_year' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedPeriod === 'current_year' && styles.filterChipTextActive]}>
                  Ano atual
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="period-chip-12m"
                onPress={() => setSelectedPeriod('12m')}
                style={[styles.filterChip, selectedPeriod === '12m' && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, selectedPeriod === '12m' && styles.filterChipTextActive]}>
                  Últimos 12 meses
                </Text>
              </TouchableOpacity>
              {availableYears.map((yr) => (
                <TouchableOpacity
                  key={yr}
                  testID={`period-chip-${yr}`}
                  onPress={() => setSelectedPeriod(yr)}
                  style={[styles.filterChip, selectedPeriod === yr && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, selectedPeriod === yr && styles.filterChipTextActive]}>
                    {yr}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 2. Tiles Bento de Resumo */}
            <View style={{ marginTop: space.sm }}>
              <BentoRow>
                <BentoTile variant="gold">
                  <Text style={[styles.tileLabel, { color: bento.variants.gold.muted }]}>Total no período</Text>
                  <Text testID="income-tile-total" style={[styles.tileValue, { color: bento.variants.gold.foreground }]}>
                    {isPrivacyMode
                      ? 'R$ ••••••'
                      : parseFloat(totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                </BentoTile>
                <BentoTile variant="cream">
                  <Text style={[styles.tileLabel, { color: bento.variants.cream.muted }]}>Média mensal</Text>
                  <Text testID="income-tile-average" style={[styles.tileValue, { color: bento.variants.cream.foreground }]}>
                    {isPrivacyMode
                      ? 'R$ ••••••'
                      : parseFloat(monthlyAverage).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                </BentoTile>
              </BentoRow>

              <View style={{ marginTop: bento.gap }}>
                <BentoRow>
                  <BentoTile variant="cream">
                    <Text style={[styles.tileLabel, { color: bento.variants.cream.muted }]}>Rendimento s/ custo (12m)</Text>
                    <Text testID="income-tile-yoc" style={[styles.tileValue, { color: bento.variants.cream.foreground }]}>
                      {isPrivacyMode
                        ? 'R$ ••••••'
                        : yoc !== null
                        ? `${parseFloat(yoc).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`
                        : '—'}
                    </Text>
                  </BentoTile>
                  <BentoTile variant="cream">
                    <Text style={[styles.tileLabel, { color: bento.variants.cream.muted }]}>Melhor mês</Text>
                    <Text testID="income-tile-best-month" style={[styles.tileValue, { color: bento.variants.cream.foreground }]}>
                      {bestMonthData
                        ? isPrivacyMode
                          ? 'R$ ••••••'
                          : parseFloat(bestMonthData.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                        : '—'}
                    </Text>
                  </BentoTile>
                </BentoRow>
              </View>
            </View>

            {/* 3. Gráfico de Barras */}
            <View style={[styles.card, isLight && styles.cardLight, { marginTop: space.md }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, isLight && styles.cardTitleLight]}>HISTÓRICO</Text>
                <View style={styles.chartToggleContainer}>
                  <TouchableOpacity
                    testID="income-chart-toggle-monthly"
                    onPress={() => setChartMode('monthly')}
                    style={[styles.toggleBtn, chartMode === 'monthly' && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, chartMode === 'monthly' && styles.toggleBtnTextActive]}>
                      Mensal
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="income-chart-toggle-yearly"
                    onPress={() => setChartMode('yearly')}
                    style={[styles.toggleBtn, chartMode === 'yearly' && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleBtnText, chartMode === 'yearly' && styles.toggleBtnTextActive]}>
                      Anual
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barsContainer}>
                {chartMode === 'monthly'
                  ? monthSeriesData.slice(-24).map((pt) => {
                      const val = parseFloat(pt.total);
                      const heightPercent = Math.max(4, Math.round((val / maxChartVal) * 100));
                      const isBest = bestMonthData?.month === pt.month;
                      const isSelected = selectedBar === pt.month;
                      return (
                        <TouchableOpacity
                          key={pt.month}
                          testID={`income-chart-bar-${pt.month}`}
                          accessibilityRole="button"
                          onPress={() => setSelectedBar(selectedBar === pt.month ? null : pt.month)}
                          style={[styles.barCol, isSelected && styles.barColSelected]}
                        >
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  height: `${heightPercent}%`,
                                  backgroundColor: isBest ? colors.primary : isLight ? '#2A2D30' : '#8A8A8E',
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.barLabel, isLight && styles.barLabelLight]}>
                            {formatMonthShort(pt.month)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  : yearSeriesData.map((pt) => {
                      const val = parseFloat(pt.total);
                      const heightPercent = Math.max(4, Math.round((val / maxChartVal) * 100));
                      const isSelected = selectedBar === String(pt.year);
                      return (
                        <TouchableOpacity
                          key={pt.year}
                          testID={`income-chart-bar-${pt.year}`}
                          accessibilityRole="button"
                          onPress={() => setSelectedBar(selectedBar === String(pt.year) ? null : String(pt.year))}
                          style={[styles.barCol, isSelected && styles.barColSelected]}
                        >
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                {
                                  height: `${heightPercent}%`,
                                  backgroundColor: colors.primary,
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.barLabel, isLight && styles.barLabelLight]}>
                            {pt.year}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
              </ScrollView>
            </View>

            {/* 4. Quem Mais Pagou (Ranking Top 5) */}
            {rankings.length > 0 ? (
              <View testID="income-ranking-card" style={[styles.card, isLight && styles.cardLight, { marginTop: space.md }]}>
                <Text style={[styles.cardTitle, isLight && styles.cardTitleLight]}>QUEM MAIS PAGOU</Text>
                {rankings.map((r) => {
                  const maxShare = parseFloat(rankings[0].sharePercent) || 1;
                  const barWidth = Math.max(4, (parseFloat(r.sharePercent) / maxShare) * 100);
                  return (
                    <View key={r.ticker} style={styles.rankRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.rankTicker, isLight && styles.rankTickerLight]}>{r.ticker}</Text>
                        <Text style={[styles.rankValue, isLight && styles.rankValueLight]}>
                          {isPrivacyMode
                            ? 'R$ ••••••'
                            : `R$ ${parseFloat(r.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${r.sharePercent}%)`}
                        </Text>
                      </View>
                      <View style={styles.rankTrack}>
                        <View style={[styles.rankFill, { width: `${barWidth}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* 5. Lista Agrupada por Mês */}
            <View testID="income-list" style={{ marginTop: space.md }}>
              {groupedList.map((grp) => (
                <View key={grp.month} style={{ marginBottom: space.md }}>
                  <View style={styles.monthHeaderRow} testID={`income-month-header-${grp.month}`}>
                    <Text style={[styles.monthHeaderText, isLight && styles.monthHeaderTextLight]}>
                      {formatMonthHeader(grp.month)}
                    </Text>
                    <Text style={[styles.monthHeaderTotal, isLight && styles.monthHeaderTotalLight]}>
                      {isPrivacyMode
                        ? 'R$ ••••••'
                        : `R$ ${parseFloat(grp.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </Text>
                  </View>

                  {grp.items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      testID={`income-row-${item.id}`}
                      accessibilityRole="button"
                      onPress={() => setSelectedIncome(item)}
                      style={[styles.incomeRow, isLight && styles.incomeRowLight]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                          <Text style={[styles.rowTicker, isLight && styles.rowTickerLight]}>{item.ticker}</Text>
                          <View style={styles.kindBadge}>
                            <Text style={styles.kindBadgeText}>{item.kind || 'PROVENTO'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.rowSubtitle, isLight && styles.rowSubtitleLight]}>
                          {formatDateBr(item.payDate)}
                          {item.quantity && item.unitAmount
                            ? ` · ${item.quantity} × R$ ${parseFloat(item.unitAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : ''}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmount, isLight && styles.rowAmountLight]}>
                        {isPrivacyMode
                          ? 'R$ ••••••'
                          : `R$ ${parseFloat(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Botão Fixo Adicionar Provento */}
      <View style={[styles.floatingActionContainer, { bottom: bottomOffset + 16 }]}>
        <TouchableOpacity
          testID="income-add-btn"
          accessibilityRole="button"
          onPress={handleOpenAdd}
          style={styles.floatingActionBtn}
        >
          <Text style={styles.floatingActionText}>+ Adicionar provento</Text>
        </TouchableOpacity>
      </View>

      {/* Sheet de Detalhes com Editar e Excluir */}
      <AnimatedModalSheet
        visible={selectedIncome !== null}
        onClose={() => setSelectedIncome(null)}
        themeMode={themeMode}
        testID="income-detail-sheet"
      >
        {selectedIncome ? (
          <View>
            <Text style={[styles.modalTitle, isLight && styles.modalTitleLight]}>
              {selectedIncome.ticker} · {selectedIncome.kind || 'PROVENTO'}
            </Text>
            <Text style={[styles.modalAmount, isLight && styles.modalAmountLight]}>
              {isPrivacyMode
                ? 'R$ ••••••'
                : `R$ ${parseFloat(selectedIncome.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </Text>
            <Text style={[styles.modalDetail, isLight && styles.modalDetailLight]}>
              Data de pagamento: {formatDateBr(selectedIncome.payDate)}
            </Text>
            {selectedIncome.quantity && selectedIncome.unitAmount ? (
              <Text style={[styles.modalDetail, isLight && styles.modalDetailLight]}>
                Quantidade: {selectedIncome.quantity} cotas · R$ {selectedIncome.unitAmount} por cota
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
              <TouchableOpacity
                testID="income-edit-btn"
                accessibilityRole="button"
                onPress={() => handleOpenEdit(selectedIncome)}
                style={[styles.modalActionBtn, { backgroundColor: isLight ? '#EAE4D7' : '#2A2D30' }]}
              >
                <Text style={[styles.modalActionText, { color: isLight ? '#111315' : '#E6DECA' }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="income-delete-btn"
                accessibilityRole="button"
                onPress={() => setShowDeleteConfirm(true)}
                style={[styles.modalActionBtn, { backgroundColor: '#E05252' }]}
              >
                <Text style={[styles.modalActionText, { color: '#FFFFFF' }]}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </AnimatedModalSheet>

      {/* Confirmação de Exclusão */}
      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Excluir provento"
        message="Deseja realmente excluir este provento? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        confirmTestID="confirm-dialog-confirm-button"
        destructive
        onConfirm={handleDeleteIncome}
        onCancel={() => setShowDeleteConfirm(false)}
        themeMode={themeMode}
      />

      {/* Sheet de Formulário (Adicionar / Editar) */}
      <AnimatedModalSheet
        visible={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        themeMode={themeMode}
        testID="income-form-sheet"
      >
        <Text style={[styles.modalTitle, isLight && styles.modalTitleLight, { marginBottom: 12 }]}>
          {isEditing ? 'EDITAR PROVENTO' : 'ADICIONAR PROVENTO'}
        </Text>

        <LedgerInput
          label="Ativo (Ticker)"
          value={formTicker}
          onChangeText={setFormTicker}
          placeholder="Ex: MXRF11"
          testID="income-form-ticker-input"
          themeMode={themeMode}
        />

        <LedgerInput
          label="Valor recebido"
          prefix="R$"
          value={formAmount}
          onChangeText={setFormAmount}
          placeholder="0,00"
          testID="income-form-amount-input"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <LedgerInput
          label="Data (AAAA-MM-DD)"
          value={formDate}
          onChangeText={setFormDate}
          placeholder="2026-11-06"
          testID="income-form-date-input"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <LedgerInput
          label="Quantidade de cotas (opcional)"
          value={formQuantity}
          onChangeText={setFormQuantity}
          placeholder="Ex: 637"
          testID="income-form-quantity-input"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <LedgerInput
          label="Valor por cota (opcional)"
          prefix="R$"
          value={formUnitAmount}
          onChangeText={setFormUnitAmount}
          placeholder="Ex: 0,10"
          testID="income-form-unit-amount-input"
          themeMode={themeMode}
          style={{ marginTop: 12 }}
        />

        <TouchableOpacity
          testID="income-form-save-btn"
          accessibilityRole="button"
          onPress={handleSaveForm}
          style={[styles.primaryBtn, { marginTop: 20 }]}
        >
          <Text style={styles.primaryBtnText}>Salvar provento</Text>
        </TouchableOpacity>
      </AnimatedModalSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  containerLight: {
    backgroundColor: '#F7F6F2',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: space.sm,
  },
  emptyContainer: {
    marginTop: space.xxl,
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: '#E6DECA',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyTitleLight: {
    color: '#111315',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    color: '#8A8A8E',
    textAlign: 'center',
  },
  emptySubtitleLight: {
    color: '#6E6A63',
  },
  filterRow: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: space.xs,
    marginBottom: space.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borders.radiusPill,
    backgroundColor: '#1C1E20',
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '500',
    color: '#8A8A8E',
  },
  filterChipTextActive: {
    color: '#1A0E08',
    fontWeight: '700',
  },
  tileLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginBottom: 4,
  },
  tileValue: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#141618',
    borderRadius: bento.tileRadius,
    padding: space.md,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  cardTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#8A8A8E',
  },
  cardTitleLight: {
    color: '#6E6A63',
  },
  chartToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1E20',
    borderRadius: borders.radiusPill,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borders.radiusPill,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  toggleBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
  },
  toggleBtnTextActive: {
    color: '#1A0E08',
    fontWeight: '700',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 8,
    paddingVertical: space.xs,
  },
  barCol: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barColSelected: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  barTrack: {
    flex: 1,
    width: 14,
    justifyContent: 'flex-end',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
    marginTop: 4,
  },
  barLabelLight: {
    color: '#6E6A63',
  },
  rankRow: {
    marginTop: space.sm,
  },
  rankTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#E6DECA',
  },
  rankTickerLight: {
    color: '#111315',
  },
  rankValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8A8E',
  },
  rankValueLight: {
    color: '#6E6A63',
  },
  rankTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1C1E20',
    overflow: 'hidden',
  },
  rankFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.xs,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#2A2D30',
    marginBottom: space.xs,
  },
  monthHeaderText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#E6DECA',
    textTransform: 'capitalize',
  },
  monthHeaderTextLight: {
    color: '#111315',
  },
  monthHeaderTotal: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  monthHeaderTotalLight: {
    color: colors.primary,
  },
  incomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#141618',
    marginBottom: 6,
    borderWidth: borders.hairline,
    borderColor: '#202224',
  },
  incomeRowLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  rowTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#E6DECA',
  },
  rowTickerLight: {
    color: '#111315',
  },
  kindBadge: {
    backgroundColor: 'rgba(255, 179, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kindBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  rowSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  rowSubtitleLight: {
    color: '#6E6A63',
  },
  rowAmount: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#E6DECA',
  },
  rowAmountLight: {
    color: '#111315',
  },
  floatingActionContainer: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
  },
  floatingActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: borders.radiusPill,
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  floatingActionText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0E08',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: bento.tileRadius,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0E08',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: '#E6DECA',
  },
  modalTitleLight: {
    color: '#111315',
  },
  modalAmount: {
    fontFamily: typography.fontFamily,
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginVertical: space.xs,
  },
  modalAmountLight: {
    color: colors.primary,
  },
  modalDetail: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#8A8A8E',
    marginBottom: 4,
  },
  modalDetailLight: {
    color: '#6E6A63',
  },
  modalActionBtn: {
    flex: 1,
    borderRadius: bento.tileRadius,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalActionText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
});
