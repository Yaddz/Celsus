import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import type { MacroSeriesPoint } from '../../domain/sandbox/backtest';
import {
  buildComparisonSeries,
  MAX_COMPARE_ASSETS,
  type CompareAssetInput,
} from '../../domain/sandbox/compare';
import { sandboxService } from '../../services/sandboxService';
import { priceAt, type PriceSeriesPoint } from '../../domain/sandbox/priceAt';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface CompareScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

const SERIES_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#38BDF8', '#9CA3AF', '#EC4899'];

function subtractMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1 - months, d || 1));
  return dt.toISOString().slice(0, 10);
}

function inferCompareAssetClass(ticker: string): string {
  const up = ticker.trim().toUpperCase();
  if (up === 'USDBRL' || up === 'EURBRL') return 'FX';
  if (/^[A-Z]{4}11F?$/.test(up)) return 'FII';
  if (/^[A-Z]{4}\d{1,2}F?$/.test(up)) return 'STOCK';
  if (up === 'BTC' || up === 'ETH' || up === 'SOL') return 'CRYPTO';
  return 'US_STOCK';
}

export const CompareScreen: React.FC<CompareScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'compare-screen',
}) => {
  const isLight = themeMode === 'light';
  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  const endDate = referenceDateIso ?? new Date().toISOString().slice(0, 10);
  const [monthsWindow, setMonthsWindow] = useState<number>(12);
  const startDate = useMemo(() => subtractMonths(endDate, monthsWindow), [endDate, monthsWindow]);

  const [selectedTickers, setSelectedTickers] = useState<string[]>(['BOVA11', 'PETR4']);
  const [tickerInput, setTickerInput] = useState<string>('');
  const [assetData, setAssetData] = useState<CompareAssetInput[]>([]);
  const [cdiRates, setCdiRates] = useState<MacroSeriesPoint[]>([]);
  const [ipcaRates, setIpcaRates] = useState<MacroSeriesPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const range = monthsWindow <= 12 ? '1y' : monthsWindow <= 24 ? '2y' : '5y';
      const tickersToLoad = selectedTickers.slice(0, MAX_COMPARE_ASSETS);
      const hasUsStock = tickersToLoad.some((t) => inferCompareAssetClass(t) === 'US_STOCK');
      const [usdBrlSeries, macro, ...rawHistories] = await Promise.all([
        hasUsStock ? sandboxService.getHistory('USDBRL', 'FX', range) : Promise.resolve([] as PriceSeriesPoint[]),
        sandboxService.getMacroSeries(startDate),
        ...tickersToLoad.map(async (ticker) => {
          const assetClass = inferCompareAssetClass(ticker);
          const pts = await sandboxService.getHistory(ticker, assetClass, range);
          return { ticker, assetClass, pts };
        }),
      ]);

      const histories: CompareAssetInput[] = rawHistories.map(({ ticker, assetClass, pts }) => {
        if (assetClass === 'US_STOCK' && usdBrlSeries.length > 0) {
          const converted = pts
            .map((pt) => {
              const fx = priceAt(usdBrlSeries, pt.date);
              if (!fx) return null;
              return { date: pt.date, close: pt.close * fx.price };
            })
            .filter((x): x is PriceSeriesPoint => x !== null);
          return { ticker, priceSeries: converted };
        }
        return { ticker, priceSeries: pts };
      });

      setAssetData(histories);
      setCdiRates(macro.cdi ?? []);
      setIpcaRates(macro.ipca ?? []);
    } catch {
      setAssetData([]);
      setCdiRates([]);
      setIpcaRates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTickers, startDate, monthsWindow]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const comparison = useMemo(
    () =>
      buildComparisonSeries({
        startDate,
        endDate,
        assets: assetData,
        cdi: cdiRates,
        ipca: ipcaRates,
      }),
    [startDate, endDate, assetData, cdiRates, ipcaRates]
  );

  const handleAddTicker = () => {
    const clean = tickerInput.trim().toUpperCase();
    if (!clean) return;
    if (selectedTickers.includes(clean)) {
      setTickerInput('');
      return;
    }
    if (selectedTickers.length >= MAX_COMPARE_ASSETS) return;
    setSelectedTickers((prev) => [...prev, clean]);
    setTickerInput('');
  };

  const handleRemoveTicker = (ticker: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== ticker));
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Comparar"
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
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.cardLabel, { color: mutedColor }]}>
              ATIVOS ({selectedTickers.length}/{MAX_COMPARE_ASSETS})
            </Text>
            <View testID="compare-base-badge" style={styles.baseBadge}>
              <Text style={styles.baseBadgeText}>Base 100 no início</Text>
            </View>
          </View>

          <View style={styles.addRow}>
            <TextInput
              testID="compare-ticker-input"
              value={tickerInput}
              onChangeText={setTickerInput}
              placeholder="Adicionar ticker (ex: VALE3)"
              placeholderTextColor={mutedColor}
              autoCapitalize="characters"
              style={[styles.input, { color: textColor, borderColor }]}
            />
            <TouchableOpacity
              testID="compare-add-btn"
              activeOpacity={0.8}
              disabled={selectedTickers.length >= MAX_COMPARE_ASSETS}
              onPress={handleAddTicker}
              style={[
                styles.addBtn,
                {
                  backgroundColor:
                    selectedTickers.length >= MAX_COMPARE_ASSETS ? borderColor : colors.primary,
                },
              ]}
            >
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.chipsRow}>
            {selectedTickers.map((t) => (
              <TouchableOpacity
                key={t}
                testID={`compare-chip-${t}`}
                onPress={() => handleRemoveTicker(t)}
                style={[styles.chip, { borderColor }]}
              >
                <Text style={[styles.chipText, { color: textColor }]}>{t}</Text>
                <MaterialIcons name="close" size={14} color={mutedColor} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.periodRow}>
            {[
              { label: '6M', months: 6 },
              { label: '1A', months: 12 },
              { label: '2A', months: 24 },
              { label: '5A', months: 60 },
            ].map((p) => {
              const active = monthsWindow === p.months;
              return (
                <TouchableOpacity
                  key={p.label}
                  testID={`compare-period-${p.label}`}
                  onPress={() => setMonthsWindow(p.months)}
                  style={[
                    styles.periodChip,
                    {
                      borderColor: active ? colors.primary : borderColor,
                      backgroundColor: active ? 'rgba(139, 92, 246, 0.14)' : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.periodText,
                      { color: active ? colors.primary : mutedColor },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
            <Text style={[styles.cardLabel, { color: mutedColor }]}>
              DESEMPENHO NORMALIZADO (BASE 100)
            </Text>
            {comparison.items.map((item, idx) => {
              const color = SERIES_COLORS[idx % SERIES_COLORS.length];
              const pctText =
                item.totalReturnPct !== null
                  ? `${item.totalReturnPct >= 0 ? '+' : ''}${item.totalReturnPct
                      .toFixed(1)
                      .replace('.', ',')}%`
                  : 'sem dado';

              return (
                <View
                  key={item.id}
                  testID={`compare-item-${item.id}`}
                  style={[styles.resultRow, { borderBottomColor: borderColor }]}
                >
                  <View style={styles.resultLeft}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <View>
                      <Text style={[styles.itemLabel, { color: textColor }]}>{item.label}</Text>
                      <Text style={[styles.itemSub, { color: mutedColor }]}>
                        {item.status === 'ok' && item.finalValue !== null
                          ? isPrivacyMode
                            ? 'Índice: ••••'
                            : `Índice final: ${item.finalValue.toFixed(1).replace('.', ',')}`
                          : 'sem dado no período'}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.returnText,
                      {
                        color:
                          item.totalReturnPct === null
                            ? mutedColor
                            : item.totalReturnPct >= 0
                            ? colors.tertiary
                            : colors.deficit,
                      },
                    ]}
                  >
                    {isPrivacyMode && item.totalReturnPct !== null ? '••••' : pctText}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  sandboxBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusFull,
  },
  sandboxBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scrollContent: {
    padding: space.md,
    gap: space.md,
    paddingBottom: 40,
  },
  card: {
    borderRadius: borders.radiusLg,
    borderWidth: 1,
    padding: space.md,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: typography.sizes.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  baseBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusFull,
  },
  baseBadgeText: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: borders.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: borders.radiusFull,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  itemSub: {
    fontSize: 12,
  },
  returnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

export default CompareScreen;
