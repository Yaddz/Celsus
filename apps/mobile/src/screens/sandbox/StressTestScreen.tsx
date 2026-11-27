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
import { formatCentsBRL } from '../../domain/financeFlow';
import {
  findWorstDrawdownWindow,
  runStressTest,
  type StressTestPositionInput,
} from '../../domain/sandbox/stressTest';
import { assetRepository } from '../../repositories/assetRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { marketApiService } from '../../services/marketApi';
import { patrimonyService } from '../../services/patrimonyService';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { walletStore } from '../../stores/walletStore';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface StressTestScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

function subtractYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y - years, (m || 1) - 1, d || 1));
  return dt.toISOString().slice(0, 10);
}

export const StressTestScreen: React.FC<StressTestScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'stress-test-screen',
}) => {
  const isLight = themeMode === 'light';
  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  const refIso = referenceDateIso ?? new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(subtractYears(refIso, 1));
  const [endDate, setEndDate] = useState<string>(refIso);
  const [loading, setLoading] = useState<boolean>(true);
  const [portfolioName, setPortfolioName] = useState<string>('Carteira ativa');
  const [todayValueBRL, setTodayValueBRL] = useState<number>(0);
  const [positions, setPositions] = useState<StressTestPositionInput[]>([]);
  const [bovaSeries, setBovaSeries] = useState<Array<{ date: string; close: number }>>([]);
  const [shortcutFeedback, setShortcutFeedback] = useState<string | null>(null);

  const loadPortfolioAndSeries = useCallback(async () => {
    setLoading(true);
    try {
      const [patrimony, portfolios] = await Promise.all([
        patrimonyService.getPatrimony(refIso),
        portfolioRepository.listPortfolios(),
      ]);

      const storedActiveId = walletStore.getState().activePortfolioId;
      const activePortfolio =
        portfolios.find((p) => p.id === storedActiveId) ?? portfolios[0] ?? null;

      if (!activePortfolio) {
        setTodayValueBRL(patrimony.investedCents / 100);
        setPositions([]);
        setLoading(false);
        return;
      }

      setPortfolioName(activePortfolio.name);
      const portPatrimony = patrimony.byPortfolio.find(
        (p) => p.portfolioId === activePortfolio.id
      );
      const totalBRL =
        portPatrimony && portPatrimony.marketValueCents > 0
          ? portPatrimony.marketValueCents / 100
          : patrimony.investedCents / 100;

      const assets = await assetRepository.getAssetsByPortfolio(activePortfolio.id);

      const rawValues = assets.map((a) => {
        const qty = Number.parseFloat(a.quantity) || 0;
        const avg = Number.parseFloat(a.average_price) || 0;
        const manual = a.manual_position_value ? Number.parseFloat(a.manual_position_value) : 0;
        const val = manual > 0 ? manual : Math.max(0, qty * avg);
        return { asset: a, val };
      });
      const sumVal = rawValues.reduce((acc, item) => acc + item.val, 0);

      const uniqueTickers = Array.from(
        new Set(assets.map((a) => a.ticker.toUpperCase()).filter(Boolean))
      );

      const historyEntries = await Promise.all(
        uniqueTickers.map(async (ticker) => {
          const pts = await marketApiService.getPriceHistory(ticker, 'max');
          return [ticker, pts] as const;
        })
      );
      const historyMap = new Map(historyEntries);

      const bova =
        historyMap.get('BOVA11') ??
        (await marketApiService.getPriceHistory('BOVA11', 'max'));
      setBovaSeries(bova);

      const builtPositions: StressTestPositionInput[] = rawValues.map(({ asset, val }) => {
        const ticker = asset.ticker.toUpperCase();
        const weight = sumVal > 0 ? val / sumVal : 1 / Math.max(1, rawValues.length);
        return {
          ticker,
          weight,
          priceSeries: historyMap.get(ticker) ?? [],
        };
      });

      setTodayValueBRL(totalBRL > 0 ? totalBRL : sumVal);
      setPositions(builtPositions);

      // Se a janela padrão (último 1 ano) não tiver pontos, ajusta para o intervalo disponível da série
      const defaultStart = subtractYears(refIso, 1);
      const hasPointsInDefault = builtPositions.some((p) =>
        p.priceSeries.some((pt) => pt.date >= defaultStart && pt.date <= refIso)
      );
      if (!hasPointsInDefault) {
        const allDates = builtPositions
          .flatMap((p) => p.priceSeries.map((pt) => pt.date))
          .filter(Boolean)
          .sort();
        if (allDates.length > 0) {
          setStartDate(allDates[0]);
          setEndDate(allDates[allDates.length - 1]);
        }
      }
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [refIso]);

  useEffect(() => {
    loadPortfolioAndSeries();
  }, [loadPortfolioAndSeries]);

  const result = useMemo(
    () =>
      runStressTest({
        todayPortfolioValueBRL: todayValueBRL,
        startDate,
        endDate,
        positions,
      }),
    [todayValueBRL, startDate, endDate, positions]
  );

  const handleWorstDrawdownShortcut = (years: number) => {
    const win = findWorstDrawdownWindow(bovaSeries, years, refIso);
    if (!win) {
      setShortcutFeedback(`Série do IBOV/BOVA11 indisponível para últimos ${years} anos.`);
      return;
    }
    setStartDate(win.startDate);
    setEndDate(win.endDate);
    setShortcutFeedback(
      `Pior queda do IBOV/BOVA11 nos últimos ${years} anos: -${win.drawdownPct
        .toFixed(1)
        .replace('.', ',')}%`
    );
  };

  const maskMoney = (valueBRL: number | null) => {
    if (isPrivacyMode) return PRIVACY_CURRENCY_MASK;
    if (valueBRL === null) return '—';
    return formatCentsBRL(Math.round(valueBRL * 100));
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Teste de estresse"
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
          <Text style={[styles.cardLabel, { color: mutedColor }]}>
            CARTEIRA ATIVA ({portfolioName})
          </Text>
          <Text style={[styles.patrimonyText, { color: textColor }]}>
            Patrimônio de hoje: {maskMoney(todayValueBRL)}
          </Text>
        </View>

        {/* Janela histórica + atalhos dinâmicos */}
        {!loading ? (
          <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
            <Text style={[styles.cardLabel, { color: mutedColor }]}>JANELA HISTÓRICA</Text>

            <View style={styles.shortcutRow}>
              <TouchableOpacity
                testID="stress-shortcut-5y"
                activeOpacity={0.8}
                onPress={() => handleWorstDrawdownShortcut(5)}
                style={[styles.shortcutChip, { borderColor: colors.primary }]}
              >
                <MaterialIcons name="bolt" size={14} color={colors.primary} />
                <Text style={[styles.shortcutText, { color: colors.primary }]}>
                  Pior queda (5 anos)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="stress-shortcut-10y"
                activeOpacity={0.8}
                onPress={() => handleWorstDrawdownShortcut(10)}
                style={[styles.shortcutChip, { borderColor: colors.primary }]}
              >
                <MaterialIcons name="bolt" size={14} color={colors.primary} />
                <Text style={[styles.shortcutText, { color: colors.primary }]}>
                  Pior queda (10 anos)
                </Text>
              </TouchableOpacity>
            </View>

            {shortcutFeedback ? (
              <Text style={[styles.feedbackText, { color: mutedColor }]}>
                {shortcutFeedback}
              </Text>
            ) : null}

            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <Text style={[styles.inputLabel, { color: mutedColor }]}>Início</Text>
                <TextInput
                  testID="stress-start-input"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={mutedColor}
                  style={[styles.input, { color: textColor, borderColor }]}
                />
              </View>
              <View style={styles.dateCol}>
                <Text style={[styles.inputLabel, { color: mutedColor }]}>Fim</Text>
                <TextInput
                  testID="stress-end-input"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={mutedColor}
                  style={[styles.input, { color: textColor, borderColor }]}
                />
              </View>
            </View>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}>
                <Text style={[styles.kpiLabel, { color: mutedColor }]}>Queda máxima</Text>
                <Text
                  testID="stress-kpi-drawdown"
                  style={[styles.kpiValue, { color: colors.deficit }]}
                >
                  {result.maxDrawdownPct !== null
                    ? `-${result.maxDrawdownPct.toFixed(1).replace('.', ',')}%`
                    : '—'}
                </Text>
              </View>

              <View style={[styles.kpiCard, { backgroundColor: surface, borderColor }]}>
                <Text style={[styles.kpiLabel, { color: mutedColor }]}>Recuperação</Text>
                <Text
                  testID="stress-kpi-recovery"
                  style={[styles.kpiValue, { color: textColor }]}
                >
                  {result.status === 'missing_data'
                    ? '—'
                    : result.recovered && result.recoveryDays !== null
                    ? `${result.recoveryDays} dias`
                    : 'Não recuperou'}
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
              <Text style={[styles.kpiLabel, { color: mutedColor }]}>
                Valor no fundo com o patrimônio de hoje
              </Text>
              <Text
                testID="stress-kpi-trough-value"
                style={[styles.troughValue, { color: textColor }]}
              >
                {maskMoney(result.troughValueBRL)}
              </Text>
              {result.troughDate ? (
                <Text style={[styles.subText, { color: mutedColor }]}>
                  Fundo em {result.troughDate}
                  {result.peakDate ? ` (pico em ${result.peakDate})` : ''}
                </Text>
              ) : null}
            </View>

            {/* Avisos de ativos sem dado */}
            {result.warnings.length > 0 ? (
              <View
                testID="stress-warning-missing"
                style={[styles.warningBox, { borderColor: colors.secondary }]}
              >
                <MaterialIcons name="warning-amber" size={18} color={colors.secondary} />
                <Text style={[styles.warningText, { color: textColor }]}>
                  {result.warnings.join(' ')}
                </Text>
              </View>
            ) : null}

            {/* Detalhamento por ativo */}
            <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
              <Text style={[styles.cardLabel, { color: mutedColor }]}>
                COMPOSIÇÃO NA JANELA
              </Text>
              {result.assets.length === 0 ? (
                <Text style={[styles.subText, { color: mutedColor }]}>
                  Nenhum ativo encontrado na carteira ativa.
                </Text>
              ) : (
                result.assets.map((asset) => (
                  <View
                    key={asset.ticker}
                    testID={`stress-asset-${asset.ticker}`}
                    style={[styles.assetRow, { borderBottomColor: borderColor }]}
                  >
                    <View>
                      <Text style={[styles.assetTicker, { color: textColor }]}>
                        {asset.ticker}
                      </Text>
                      <Text style={[styles.subText, { color: mutedColor }]}>
                        Peso hoje: {(asset.weight * 100).toFixed(1).replace('.', ',')}%
                      </Text>
                    </View>
                    <View style={styles.assetRight}>
                      {asset.status === 'missing_data' ? (
                        <View style={styles.missingBadge}>
                          <Text style={styles.missingBadgeText}>sem dado</Text>
                        </View>
                      ) : (
                        <Text style={[styles.assetDd, { color: colors.deficit }]}>
                          {asset.drawdownPct !== null
                            ? `-${asset.drawdownPct.toFixed(1).replace('.', ',')}%`
                            : '—'}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
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
    gap: 8,
  },
  cardLabel: {
    fontSize: typography.sizes.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  patrimonyText: {
    fontSize: typography.sizes.subtitle,
    fontWeight: '600',
  },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borders.radiusFull,
    borderWidth: 1,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackText: {
    fontSize: 12,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dateCol: {
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: space.sm,
  },
  kpiCard: {
    flex: 1,
    borderRadius: borders.radiusLg,
    borderWidth: 1,
    padding: space.md,
    gap: 4,
  },
  kpiLabel: {
    fontSize: 12,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  troughValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  subText: {
    fontSize: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  assetTicker: {
    fontSize: 15,
    fontWeight: '700',
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  assetDd: {
    fontSize: 14,
    fontWeight: '700',
  },
  missingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusFull,
  },
  missingBadgeText: {
    color: colors.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
});

export default StressTestScreen;
