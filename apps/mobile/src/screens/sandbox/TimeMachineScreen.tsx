import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { PriceAreaChart, type ChartRange, type PriceChartMarker } from '../../components/ui/PriceAreaChart';
import { SkeletonTile } from '../../components/ui/Skeleton';
import type { PricePoint } from '../../domain/finance/assetProfile';
import { minInRange, maxInRange } from '../../domain/sandbox/extremes';
import type { SandboxScenarioResult } from '../../domain/sandbox/backtest';
import {
  sandboxRepository,
  type SandboxScenarioRecord,
  type TimeMachineLegSpec,
  type TimeMachineScenarioSpec,
} from '../../repositories/sandboxRepository';
import { marketApiService, STATIC_CATALOG_ASSETS } from '../../services/marketApi';
import { sandboxService } from '../../services/sandboxService';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface TimeMachineScreenProps {
  onBack?: () => void;
  initialScenario?: SandboxScenarioRecord | null;
  onScenarioSaved?: (scenario: SandboxScenarioRecord) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onSwitchModule?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

interface CatalogAssetOption {
  ticker: string;
  name: string;
  assetClass: 'STOCK' | 'FII' | 'CRYPTO' | 'US_STOCK' | 'FX';
  keywords: string;
}

const EXTRA_SANDBOX_ASSETS: CatalogAssetOption[] = [
  { ticker: 'USDBRL', name: 'Dólar (USD/BRL)', assetClass: 'FX', keywords: 'dolar usd cambio' },
  { ticker: 'EURBRL', name: 'Euro (EUR/BRL)', assetClass: 'FX', keywords: 'euro eur cambio' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', assetClass: 'US_STOCK', keywords: 'nvidia eua us' },
  { ticker: 'AAPL', name: 'Apple Inc.', assetClass: 'US_STOCK', keywords: 'apple eua us' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', assetClass: 'US_STOCK', keywords: 'microsoft eua us' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', assetClass: 'US_STOCK', keywords: 'amazon eua us' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'US_STOCK', keywords: 'google alphabet eua us' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: 'US_STOCK', keywords: 'sp500 spy etf eua' },
];

const SANDBOX_CATALOG: CatalogAssetOption[] = [
  ...EXTRA_SANDBOX_ASSETS,
  ...STATIC_CATALOG_ASSETS.filter((a) => a.asset_class !== 'FIXED_INCOME').map((a) => ({
    ticker: a.ticker,
    name: a.name,
    assetClass: a.asset_class as CatalogAssetOption['assetClass'],
    keywords: `${a.ticker} ${a.name}`.toLowerCase(),
  })),
];

function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatBRL(val: number | null | undefined, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return 'R$ •••••';
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(val: number | null | undefined, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return '••••%';
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function defaultDates(): { buyDate: string; sellDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { buyDate: yearAgo, sellDate: today };
}

function makeDefaultLeg(index: number): TimeMachineLegSpec {
  const { buyDate, sellDate } = defaultDates();
  return {
    id: `leg-${index + 1}`,
    ticker: 'PETR4',
    assetClass: 'STOCK',
    investedBRL: 1000,
    buyDate,
    sellDate,
  };
}

function parseInitialSpec(scenario?: SandboxScenarioRecord | null): TimeMachineScenarioSpec | null {
  if (!scenario?.spec_json) return null;
  try {
    const parsed = JSON.parse(scenario.spec_json) as TimeMachineScenarioSpec;
    if (Array.isArray(parsed.legs) && parsed.legs.length > 0) {
      return parsed;
    }
  } catch {
    // ignore invalid json
  }
  return null;
}

export const TimeMachineScreen: React.FC<TimeMachineScreenProps> = ({
  onBack,
  initialScenario,
  onScenarioSaved,
  isPrivacyMode = false,
  onTogglePrivacy,
  onSwitchModule,
  themeMode = 'dark',
  testID = 'time-machine-screen',
}) => {
  const isLight = themeMode === 'light';
  const parsedInit = useMemo(() => parseInitialSpec(initialScenario), [initialScenario]);

  const [legs, setLegs] = useState<TimeMachineLegSpec[]>(() =>
    parsedInit ? parsedInit.legs : [makeDefaultLeg(0)]
  );
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [activeLegIndex, setActiveLegIndex] = useState<number>(0);
  const [taxEnabled, setTaxEnabled] = useState<boolean>(
    parsedInit?.options?.taxEnabled ?? true
  );
  const [reinvestDividends, setReinvestDividends] = useState<boolean>(
    parsedInit?.options?.reinvestDividends ?? true
  );

  const [chartRange, setChartRange] = useState<ChartRange>('1A');
  const [chartSeries, setChartSeries] = useState<PricePoint[]>([]);
  const [loadingSeries, setLoadingSeries] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [touchMode, setTouchMode] = useState<'none' | 'buy' | 'sell'>('none');
  const [exactDateFocused, setExactDateFocused] = useState<boolean>(false);

  const [simulating, setSimulating] = useState<boolean>(false);
  const [result, setResult] = useState<SandboxScenarioResult | null>(null);
  const [showMonthly, setShowMonthly] = useState<boolean>(false);
  const [scenarioName, setScenarioName] = useState<string>(initialScenario?.name ?? '');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const activeLeg = legs[activeLegIndex] ?? legs[0];

  const loadChartSeries = useCallback(async (ticker: string, assetClass: string, range: ChartRange) => {
    setLoadingSeries(true);
    try {
      const rangeParam = range === 'MAX' ? 'max' : range.toLowerCase();
      const pts = await marketApiService.getPriceHistory(ticker, rangeParam, { assetClass });
      setChartSeries(Array.isArray(pts) ? pts : []);
      setIsOffline(false);
    } catch {
      setChartSeries([]);
      setIsOffline(true);
    } finally {
      setLoadingSeries(false);
    }
  }, []);

  useEffect(() => {
    if (activeLeg?.ticker) {
      void Promise.resolve().then(() =>
        loadChartSeries(activeLeg.ticker, activeLeg.assetClass, chartRange)
      );
    }
  }, [activeLeg?.ticker, activeLeg?.assetClass, chartRange, loadChartSeries]);

  const executeSimulation = useCallback(
    async (
      currentLegs: TimeMachineLegSpec[],
      opts: { taxEnabled: boolean; reinvestDividends: boolean }
    ) => {
      setSimulating(true);
      try {
        const res = await sandboxService.runTimeMachine({
          legs: currentLegs,
          options: opts,
        });
        setResult(res);
      } catch {
        setIsOffline(true);
      } finally {
        setSimulating(false);
      }
    },
    []
  );

  // Recalcula automaticamente ao abrir um cenário salvo
  useEffect(() => {
    if (parsedInit) {
      void Promise.resolve().then(() =>
        executeSimulation(parsedInit.legs, parsedInit.options)
      );
    }
  }, [parsedInit, executeSimulation]);

  const updateLeg = (idx: number, patch: Partial<TimeMachineLegSpec>) => {
    setLegs((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleSelectAsset = (idx: number, option: CatalogAssetOption) => {
    updateLeg(idx, { ticker: option.ticker, assetClass: option.assetClass });
    setSearchQueries((prev) => ({ ...prev, [idx]: '' }));
    setActiveLegIndex(idx);
  };

  const handleAddLeg = () => {
    const nextIdx = legs.length;
    setLegs((prev) => [...prev, makeDefaultLeg(nextIdx)]);
    setActiveLegIndex(nextIdx);
  };

  const handleShortcutMin = () => {
    if (chartSeries.length === 0) return;
    const from = chartSeries[0].date;
    const to = chartSeries[chartSeries.length - 1].date;
    const minPt = minInRange(
      chartSeries.map((p) => ({ date: p.date, close: p.close })),
      from,
      to
    );
    if (minPt) {
      updateLeg(activeLegIndex, { buyDate: minPt.date });
    }
  };

  const handleShortcutMax = () => {
    if (chartSeries.length === 0) return;
    const from = chartSeries[0].date;
    const to = chartSeries[chartSeries.length - 1].date;
    const maxPt = maxInRange(
      chartSeries.map((p) => ({ date: p.date, close: p.close })),
      from,
      to
    );
    if (maxPt) {
      updateLeg(activeLegIndex, { sellDate: maxPt.date });
    }
  };

  const handleToggleTax = (nextVal: boolean) => {
    setTaxEnabled(nextVal);
    if (result) {
      executeSimulation(legs, { taxEnabled: nextVal, reinvestDividends });
    }
  };

  const handleToggleReinvest = () => {
    const nextVal = !reinvestDividends;
    setReinvestDividends(nextVal);
    if (result) {
      executeSimulation(legs, { taxEnabled, reinvestDividends: nextVal });
    }
  };

  const handleSaveScenario = async () => {
    const name = scenarioName.trim() || `${legs.map((l) => l.ticker).join(' + ')}`;
    const saved = await sandboxRepository.saveScenario({
      id: initialScenario?.id,
      name,
      kind: 'time_machine',
      spec: {
        legs,
        options: { taxEnabled, reinvestDividends },
      },
    });
    setSavedFeedback('Cenário salvo');
    onScenarioSaved?.(saved);
  };

  const chartMarkers: PriceChartMarker[] = useMemo(() => {
    if (!activeLeg) return [];
    const list: PriceChartMarker[] = [];
    if (activeLeg.buyDate) list.push({ date: activeLeg.buyDate, type: 'buy', label: 'Compra' });
    if (activeLeg.sellDate) list.push({ date: activeLeg.sellDate, type: 'sell', label: 'Venda' });
    return list;
  }, [activeLeg]);

  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';
  const inputBg = isLight ? '#FFFFFF' : '#1E2024';

  const maxBarValue = useMemo(() => {
    if (!result || result.status !== 'ok') return 1;
    const vals = [
      result.total.netFinalValueBRL ?? 0,
      result.benchmarks.cdi.netFinalValueBRL ?? 0,
      result.benchmarks.ipca.netFinalValueBRL ?? 0,
    ];
    return Math.max(1, ...vals);
  }, [result]);

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Máquina do tempo"
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        rightAccessory={
          <View style={styles.sandboxBadge}>
            <Text style={styles.sandboxBadgeText}>SANDBOX</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.noticeBanner, { backgroundColor: surface, borderColor }]}>
          <MaterialIcons name="science" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: mutedColor }]}>
            Nada aqui mexe nas suas carteiras.
          </Text>
        </View>

        {isOffline && (
          <View testID="tm-offline-banner" style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={16} color="#D5CAA8" />
            <Text style={styles.offlineText}>
              Sem conexão com o motor de mercado: exibindo dados locais disponíveis.
            </Text>
          </View>
        )}

        {/* Pernas / Operações */}
        {legs.map((leg, idx) => {
          const query = searchQueries[idx] ?? '';
          const normQuery = normalizeSearch(query);
          const filteredOptions =
            normQuery.length > 0
              ? SANDBOX_CATALOG.filter(
                  (opt) =>
                    normalizeSearch(opt.ticker).includes(normQuery) ||
                    normalizeSearch(opt.name).includes(normQuery) ||
                    normalizeSearch(opt.keywords).includes(normQuery)
                ).slice(0, 6)
              : [];

          return (
            <View
              key={leg.id ?? idx}
              style={[styles.card, { backgroundColor: surface, borderColor }]}
            >
              <View style={styles.legHeader}>
                <Text style={[styles.legTitle, { color: textColor }]}>
                  Operação {idx + 1} • {leg.ticker} ({leg.assetClass})
                </Text>
              </View>

              <TextInput
                testID={`tm-asset-search-input-${idx}`}
                value={query}
                onChangeText={(txt) => setSearchQueries((prev) => ({ ...prev, [idx]: txt }))}
                placeholder="Buscar B3, FII, cripto, EUA, Dólar ou Euro"
                placeholderTextColor={mutedColor}
                style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
              />

              {filteredOptions.length > 0 && (
                <View style={styles.optionsList}>
                  {filteredOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.ticker}
                      testID={`tm-asset-option-${opt.ticker}`}
                      onPress={() => handleSelectAsset(idx, opt)}
                      style={[styles.optionRow, { borderColor }]}
                    >
                      <Text style={[styles.optionTicker, { color: textColor }]}>{opt.ticker}</Text>
                      <Text style={[styles.optionName, { color: mutedColor }]}>{opt.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.rowInputs}>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: mutedColor }]}>Valor (R$)</Text>
                  <TextInput
                    testID={`tm-amount-input-${idx}`}
                    keyboardType="numeric"
                    value={String(leg.investedBRL ?? '')}
                    onChangeText={(txt) => {
                      const num = parseFloat(txt.replace(',', '.'));
                      updateLeg(idx, { investedBRL: Number.isFinite(num) ? num : 0 });
                    }}
                    style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: mutedColor }]}>Compra</Text>
                  <TextInput
                    testID={`tm-buy-date-input-${idx}`}
                    value={leg.buyDate}
                    onChangeText={(txt) => updateLeg(idx, { buyDate: txt })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={mutedColor}
                    style={[
                      styles.input,
                      {
                        backgroundColor: inputBg,
                        color: textColor,
                        borderColor: exactDateFocused ? colors.primary : borderColor,
                      },
                    ]}
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, { color: mutedColor }]}>Venda</Text>
                  <TextInput
                    testID={`tm-sell-date-input-${idx}`}
                    value={leg.sellDate}
                    onChangeText={(txt) => updateLeg(idx, { sellDate: txt })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={mutedColor}
                    style={[
                      styles.input,
                      {
                        backgroundColor: inputBg,
                        color: textColor,
                        borderColor: exactDateFocused ? colors.primary : borderColor,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          testID="tm-add-leg-btn"
          activeOpacity={0.8}
          onPress={handleAddLeg}
          style={[styles.addLegBtn, { borderColor }]}
        >
          <MaterialIcons name="add" size={18} color={colors.primary} />
          <Text style={styles.addLegText}>+ Adicionar operação</Text>
        </TouchableOpacity>

        {/* Gráfico + Atalhos de data */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          {loadingSeries ? (
            <SkeletonTile testID="tm-loading-skeleton" height={130} themeMode={themeMode} lines={2} />
          ) : (
            <PriceAreaChart
              points={chartSeries}
              activeRange={chartRange}
              onRangeChange={setChartRange}
              markers={chartMarkers}
              onSelectPoint={
                touchMode !== 'none'
                  ? (pt) => {
                      if (touchMode === 'buy') {
                        updateLeg(activeLegIndex, { buyDate: pt.date });
                        setTouchMode('sell');
                      } else {
                        updateLeg(activeLegIndex, { sellDate: pt.date });
                        setTouchMode('none');
                      }
                    }
                  : undefined
              }
              themeMode={themeMode}
            />
          )}

          <View style={styles.chipsRow}>
            <TouchableOpacity
              testID="tm-chip-min"
              onPress={handleShortcutMin}
              style={[styles.shortcutChip, { borderColor }]}
            >
              <Text style={[styles.shortcutChipText, { color: textColor }]}>Na mínima</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tm-chip-max"
              onPress={handleShortcutMax}
              style={[styles.shortcutChip, { borderColor }]}
            >
              <Text style={[styles.shortcutChipText, { color: textColor }]}>Na máxima</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tm-chip-touch-chart"
              onPress={() => setTouchMode((m) => (m === 'none' ? 'buy' : 'none'))}
              style={[
                styles.shortcutChip,
                { borderColor: touchMode !== 'none' ? colors.primary : borderColor },
              ]}
            >
              <Text style={[styles.shortcutChipText, { color: textColor }]}>Tocar no gráfico</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tm-chip-exact-date"
              onPress={() => setExactDateFocused(true)}
              style={[styles.shortcutChip, { borderColor }]}
            >
              <Text style={[styles.shortcutChipText, { color: textColor }]}>Data exata</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          testID="tm-simulate-btn"
          activeOpacity={0.85}
          onPress={() => executeSimulation(legs, { taxEnabled, reinvestDividends })}
          style={styles.simulateBtn}
        >
          <Text style={styles.simulateBtnText}>Simular</Text>
        </TouchableOpacity>

        {simulating && (
          <SkeletonTile testID="tm-simulating-skeleton" height={110} themeMode={themeMode} lines={3} />
        )}

        {/* Resultado */}
        {result && result.status === 'missing_data' && (
          <View
            testID="tm-missing-data-box"
            style={[styles.card, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.missingDash, { color: textColor }]}>—</Text>
            {result.legs
              .filter((l) => l.status === 'missing_data')
              .map((l, i) => (
                <Text key={l.id ?? i} style={[styles.missingReason, { color: mutedColor }]}>
                  {l.missingReason || `Sem dado para ${l.ticker} na data informada.`}
                </Text>
              ))}
          </View>
        )}

        {result && result.status === 'ok' && (
          <View
            testID="tm-result-tile"
            style={[styles.card, { backgroundColor: surface, borderColor }]}
          >
            <Text style={[styles.resultLabel, { color: mutedColor }]}>Resultado líquido estimado</Text>
            <Text testID="tm-net-final-value" style={[styles.resultHero, { color: textColor }]}>
              {formatBRL(result.total.netFinalValueBRL, isPrivacyMode)}
            </Text>
            <Text style={[styles.resultGain, { color: colors.tertiary }]}>
              {formatBRL(result.total.netGainBRL, isPrivacyMode)} ({formatPct(result.total.netGainPct, isPrivacyMode)})
            </Text>

            {/* Barras Cenário × CDI × IPCA */}
            <View style={styles.barsSection}>
              <View testID="tm-bar-scenario" style={styles.barRow}>
                <Text style={[styles.barLabel, { color: textColor }]}>Cenário</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, Math.round(((result.total.netFinalValueBRL ?? 0) / maxBarValue) * 100))}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barValue, { color: textColor }]}>
                  {formatBRL(result.total.netFinalValueBRL, isPrivacyMode)}
                </Text>
              </View>

              <View testID="tm-bar-cdi" style={styles.barRow}>
                <Text style={[styles.barLabel, { color: textColor }]}>CDI</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, Math.round(((result.benchmarks.cdi.netFinalValueBRL ?? 0) / maxBarValue) * 100))}%`,
                        backgroundColor: colors.tertiary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barValue, { color: textColor }]}>
                  {formatBRL(result.benchmarks.cdi.netFinalValueBRL, isPrivacyMode)}
                </Text>
              </View>

              <View testID="tm-bar-ipca" style={styles.barRow}>
                <Text style={[styles.barLabel, { color: textColor }]}>IPCA</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(100, Math.round(((result.benchmarks.ipca.netFinalValueBRL ?? 0) / maxBarValue) * 100))}%`,
                        backgroundColor: '#8A8A8E',
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barValue, { color: textColor }]}>
                  {formatBRL(result.benchmarks.ipca.netFinalValueBRL, isPrivacyMode)}
                </Text>
              </View>

              <Text style={[styles.poupancaDetail, { color: mutedColor }]}>
                Poupança (isenta): {formatBRL(result.benchmarks.poupanca.netFinalValueBRL, isPrivacyMode)} ({formatPct(result.benchmarks.poupanca.netGainPct, isPrivacyMode)})
              </Text>
            </View>

            {/* IR estimado (interruptor) */}
            <View style={styles.optionSwitchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionSwitchLabel, { color: textColor }]}>
                  IR estimado ({formatBRL(result.total.estimatedTaxBRL, isPrivacyMode)})
                </Text>
                <Text style={[styles.optionSwitchSub, { color: mutedColor }]}>
                  {result.total.taxLabel}
                </Text>
              </View>
              <Switch
                testID="tm-tax-switch"
                value={taxEnabled}
                onValueChange={handleToggleTax}
              />
            </View>

            {/* Dividendos reinvestidos */}
            <TouchableOpacity
              testID="tm-reinvest-toggle"
              onPress={handleToggleReinvest}
              style={[styles.reinvestRow, { borderColor }]}
            >
              <Text style={[styles.reinvestText, { color: textColor }]}>
                Dividendos reinvestidos: {reinvestDividends ? 'sim' : 'não'}
              </Text>
              <MaterialIcons name="swap-horiz" size={18} color={colors.primary} />
            </TouchableOpacity>

            {/* Ver mês a mês */}
            <TouchableOpacity
              testID="tm-monthly-btn"
              onPress={() => setShowMonthly((v) => !v)}
              style={[styles.secondaryBtn, { borderColor }]}
            >
              <Text style={[styles.secondaryBtnText, { color: textColor }]}>
                {showMonthly ? 'Ocultar mês a mês' : 'Ver mês a mês'}
              </Text>
            </TouchableOpacity>

            {showMonthly && (
              <View testID="tm-monthly-list" style={styles.monthlyList}>
                {result.total.monthlySeries.map((pt) => (
                  <View key={pt.month} style={[styles.monthlyRow, { borderColor }]}>
                    <Text style={[styles.monthlyMonth, { color: mutedColor }]}>{pt.month}</Text>
                    <Text style={[styles.monthlyVal, { color: textColor }]}>
                      {formatBRL(pt.valueBRL, isPrivacyMode)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Salvar cenário */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <TextInput
            testID="tm-scenario-name-input"
            value={scenarioName}
            onChangeText={setScenarioName}
            placeholder="Nome do cenário"
            placeholderTextColor={mutedColor}
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
          />
          <TouchableOpacity
            testID="tm-save-btn"
            activeOpacity={0.85}
            onPress={handleSaveScenario}
            style={[styles.saveBtn, { borderColor: colors.primary }]}
          >
            <Text style={[styles.saveBtnText, { color: colors.primary }]}>Salvar cenário</Text>
          </TouchableOpacity>
          {savedFeedback ? (
            <Text style={[styles.savedFeedback, { color: colors.tertiary }]}>{savedFeedback}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sandboxBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borders.radiusFull,
    backgroundColor: 'rgba(217, 102, 40, 0.16)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  sandboxBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: 120,
    gap: 12,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
  },
  noticeText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '500' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: borders.radiusMd,
    backgroundColor: '#2A221B',
  },
  offlineText: { fontFamily: typography.fontFamily, fontSize: 12, color: '#D5CAA8', flex: 1 },
  card: {
    borderRadius: borders.radiusLg,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  legHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legTitle: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  optionsList: { gap: 4 },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  optionTicker: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '700' },
  optionName: { fontFamily: typography.fontFamily, fontSize: 12 },
  rowInputs: { flexDirection: 'row', gap: 8 },
  inputGroup: { flex: 1, gap: 4 },
  inputLabel: { fontFamily: typography.fontFamily, fontSize: 11 },
  addLegBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addLegText: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600', color: colors.primary },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcutChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borders.radiusFull,
    borderWidth: 1,
  },
  shortcutChipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  simulateBtn: {
    backgroundColor: colors.primary,
    borderRadius: borders.radiusFull,
    paddingVertical: 14,
    alignItems: 'center',
  },
  simulateBtnText: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  missingDash: { fontFamily: typography.fontFamily, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  missingReason: { fontFamily: typography.fontFamily, fontSize: 12, textAlign: 'center' },
  resultLabel: { fontFamily: typography.fontFamily, fontSize: 12 },
  resultHero: { fontFamily: typography.fontFamily, fontSize: 24, fontWeight: '700' },
  resultGain: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  barsSection: { gap: 8, marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 58, fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(138,138,142,0.2)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { width: 92, textAlign: 'right', fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  poupancaDetail: { fontFamily: typography.fontFamily, fontSize: 11, marginTop: 2 },
  optionSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  optionSwitchLabel: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  optionSwitchSub: { fontFamily: typography.fontFamily, fontSize: 11 },
  reinvestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  reinvestText: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  secondaryBtn: {
    paddingVertical: 10,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  monthlyList: { gap: 4, marginTop: 4 },
  monthlyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1 },
  monthlyMonth: { fontFamily: typography.fontFamily, fontSize: 12 },
  monthlyVal: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  saveBtn: {
    borderWidth: 1,
    borderRadius: borders.radiusFull,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
  savedFeedback: { fontFamily: typography.fontFamily, fontSize: 12, textAlign: 'center', fontWeight: '600' },
});

export default TimeMachineScreen;
