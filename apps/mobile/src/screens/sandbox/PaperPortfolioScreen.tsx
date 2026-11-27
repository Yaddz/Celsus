import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { calculateDailyPatrimonyCurve } from '../../domain/finance/portfolioHistory';
import {
  simulate,
  type PaperPortfolioItemInput,
  type PaperRebalanceMode,
  type PaperSimulateResult,
} from '../../domain/sandbox/paperPortfolio';
import type { PriceSeriesPoint } from '../../domain/sandbox/priceAt';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { sandboxPortfolioRepository } from '../../repositories/sandboxPortfolioRepository';
import { marketApiService } from '../../services/marketApi';
import { bento, borders, colors, space, typography } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface PaperPortfolioScreenProps {
  onBack?: () => void;
  initialPortfolioId?: string;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onSwitchModule?: () => void;
  onPortfolioConverted?: (portfolioId: string) => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const START_CHIPS: Array<{ label: string; months: number }> = [
  { label: '6M', months: 6 },
  { label: '1A', months: 12 },
  { label: '2A', months: 24 },
  { label: '5A', months: 60 },
];

const REBALANCE_CHIPS: Array<{ label: string; value: PaperRebalanceMode }> = [
  { label: 'Nunca', value: 'never' },
  { label: '3m', value: 3 },
  { label: '6m', value: 6 },
  { label: '12m', value: 12 },
  { label: 'Por aporte', value: 'on_contribution' },
];

function startDateFromMonths(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function formatBRL(val: number | null | undefined, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return 'R$ •••••';
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(val: number | null | undefined, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return '••••%';
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export const PaperPortfolioScreen: React.FC<PaperPortfolioScreenProps> = ({
  onBack,
  isPrivacyMode = false,
  onTogglePrivacy,
  onSwitchModule,
  onPortfolioConverted,
  themeMode = 'dark',
  testID = 'paper-portfolio-screen',
}) => {
  const isLight = themeMode === 'light';

  const [name, setName] = useState('Carteira fictícia');
  const [startMonths, setStartMonths] = useState(12);
  const [initialText, setInitialText] = useState('10000');
  const [monthlyText, setMonthlyText] = useState('1000');
  const [rebalance, setRebalance] = useState<PaperRebalanceMode>(6);
  const [items, setItems] = useState<PaperPortfolioItemInput[]>([
    { ticker: 'PETR4', class: 'STOCK', weight: 50 },
    { ticker: 'HGLG11', class: 'FII', weight: 50 },
  ]);
  const [newTicker, setNewTicker] = useState('');
  const [realPortfolios, setRealPortfolios] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRealId, setSelectedRealId] = useState<string>('');

  const [simResult, setSimResult] = useState<PaperSimulateResult | null>(null);
  const [realCurve, setRealCurve] = useState<Array<{ date: string; valueBRL: number }>>([]);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);
  const [convertedMsg, setConvertedMsg] = useState<string | null>(null);

  useEffect(() => {
    portfolioRepository
      .listPortfolios(false)
      .then((list) => {
        setRealPortfolios(list.map((p) => ({ id: p.id, name: p.name })));
        if (list[0]) setSelectedRealId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const weightSum = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.weight) || 0), 0),
    [items]
  );
  const isWeightValid = items.length > 0 && Math.abs(weightSum - 100) <= 0.01;

  const handleUpdateWeight = (idx: number, raw: string) => {
    const val = parseFloat(raw.replace(',', '.'));
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, weight: Number.isFinite(val) ? val : 0 } : it))
    );
  };

  const handleDistributeRest = () => {
    if (items.length === 0) return;
    const diff = 100 - weightSum;
    if (Math.abs(diff) <= 0.01) return;
    setItems((prev) => {
      const lastIdx = prev.length - 1;
      return prev.map((it, i) =>
        i === lastIdx
          ? { ...it, weight: Math.max(0, Number((it.weight + diff).toFixed(2))) }
          : it
      );
    });
  };

  const handleAddAsset = () => {
    const clean = newTicker.trim().toUpperCase();
    if (!clean) return;
    const inferredClass = clean.endsWith('11') ? 'FII' : 'STOCK';
    setItems((prev) => [...prev, { ticker: clean, class: inferredClass, weight: 0 }]);
    setNewTicker('');
  };

  const handleCopyMyPortfolio = async () => {
    const targetId = selectedRealId || realPortfolios[0]?.id;
    if (!targetId) return;
    const copied = await sandboxPortfolioRepository.copyFromRealPortfolio(targetId);
    if (copied.length > 0) {
      setItems(copied);
    }
  };

  const handleSimulate = useCallback(async () => {
    if (!isWeightValid) return;
    const start = startDateFromMonths(startMonths);
    const end = new Date().toISOString().slice(0, 10);
    const initialCents = Math.round((parseFloat(initialText.replace(',', '.')) || 0) * 100);
    const monthlyCents = Math.round((parseFloat(monthlyText.replace(',', '.')) || 0) * 100);

    const seriesMap: Record<string, PriceSeriesPoint[]> = {};
    await Promise.all(
      items.map(async (it) => {
        try {
          const pts = await marketApiService.getPriceHistory(it.ticker, 'max', {
            assetClass: it.class,
          });
          seriesMap[it.ticker] = (pts ?? []).map((p) => ({
            date: p.date,
            close: p.close,
          }));
        } catch {
          seriesMap[it.ticker] = [];
        }
      })
    );

    let cdiRates: Array<{ date: string; ratePct: number }> = [];
    try {
      const macro = await marketApiService.fetchMacroRates(start);
      cdiRates = (macro ?? [])
        .filter((r) => typeof r.cdi === 'number')
        .map((r) => ({ date: r.date, ratePct: r.cdi as number }));
    } catch {
      cdiRates = [];
    }

    const res = simulate({
      items,
      start,
      end,
      initialCents,
      monthlyCents,
      rebalance,
      series: seriesMap,
      macro: { cdi: cdiRates },
    });
    setSimResult(res);

    // Curva da carteira real no mesmo período usando calculateDailyPatrimonyCurve
    const targetId = selectedRealId || realPortfolios[0]?.id;
    if (targetId) {
      try {
        const [rAssets, rTxs] = await Promise.all([
          assetRepository.getAssetsByPortfolio(targetId),
          transactionRepository.getTransactionsByPortfolio(targetId),
        ]);
        const tickerByAssetId = new Map(rAssets.map((a) => [a.id, a.ticker]));
        const curve = calculateDailyPatrimonyCurve({
          assets: rAssets.map((a) => ({
            id: a.id,
            ticker: a.ticker,
            assetClass: a.asset_class as any,
            quantity: a.quantity,
            averagePrice: a.average_price,
          })),
          transactions: rTxs
            .filter((t): t is typeof t & { type: 'BUY' | 'SELL' } => t.type === 'BUY' || t.type === 'SELL')
            .map((t) => ({
              assetId: t.asset_id,
              ticker: tickerByAssetId.get(t.asset_id) ?? '',
              type: t.type,
              quantity: t.quantity,
              unitPrice: t.unit_price,
              tradeDate: t.trade_date,
            })),
          historicalQuotes: {},
          macroRates: {},
          startDate: start,
          endDate: end,
        });
        setRealCurve(curve.map((c) => ({ date: c.date, valueBRL: Number(c.marketValue) || 0 })));
      } catch {
        setRealCurve([]);
      }
    } else {
      setRealCurve([]);
    }
  }, [isWeightValid, startMonths, initialText, monthlyText, items, rebalance, selectedRealId, realPortfolios]);

  const handleConfirmConvert = async () => {
    setShowConvertConfirm(false);
    const { portfolioId } = await sandboxPortfolioRepository.convertToRealPortfolio({
      name,
      items,
    });
    setConvertedMsg('Carteira real criada com metas (sem movimentações).');
    onPortfolioConverted?.(portfolioId);
  };

  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';
  const inputBg = isLight ? '#FFFFFF' : '#1E2024';

  const realFinal = realCurve[realCurve.length - 1]?.valueBRL ?? 0;
  const cdiFinal = simResult?.cdiCurve[simResult.cdiCurve.length - 1]?.valueBRL ?? 0;

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Carteira fictícia"
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.noticeBanner, { backgroundColor: surface, borderColor }]}>
          <MaterialIcons name="science" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: mutedColor }]}>
            Nada aqui mexe nas suas carteiras.
          </Text>
        </View>

        {/* Parâmetros: início, valores, rebalanceamento */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Período e aportes</Text>
          <View style={styles.chipsRow}>
            {START_CHIPS.map((c) => (
              <TouchableOpacity
                key={c.label}
                testID={`pp-start-chip-${c.label}`}
                onPress={() => setStartMonths(c.months)}
                style={[
                  styles.chip,
                  {
                    borderColor: startMonths === c.months ? colors.primary : borderColor,
                    backgroundColor: startMonths === c.months ? 'rgba(217,102,40,0.16)' : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: textColor }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.rowInputs}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: mutedColor }]}>Inicial (R$)</Text>
              <TextInput
                testID="pp-initial-input"
                keyboardType="numeric"
                value={initialText}
                onChangeText={setInitialText}
                style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: mutedColor }]}>Mensal (R$)</Text>
              <TextInput
                testID="pp-monthly-input"
                keyboardType="numeric"
                value={monthlyText}
                onChangeText={setMonthlyText}
                style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
              />
            </View>
          </View>

          <Text style={[styles.inputLabel, { color: mutedColor }]}>Rebalanceamento</Text>
          <View style={styles.chipsRow}>
            {REBALANCE_CHIPS.map((c) => (
              <TouchableOpacity
                key={String(c.value)}
                testID={`pp-rebalance-chip-${String(c.value)}`}
                onPress={() => setRebalance(c.value)}
                style={[
                  styles.chip,
                  {
                    borderColor: rebalance === c.value ? colors.primary : borderColor,
                    backgroundColor: rebalance === c.value ? 'rgba(217,102,40,0.16)' : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: textColor }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Composição */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <View style={styles.compHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Composição</Text>
            <TouchableOpacity
              testID="pp-copy-real-btn"
              onPress={handleCopyMyPortfolio}
              style={[styles.smallBtn, { borderColor }]}
            >
              <Text style={[styles.smallBtnText, { color: colors.primary }]}>Copiar minha carteira</Text>
            </TouchableOpacity>
          </View>

          {/* Barra de composição */}
          <View style={styles.compBar}>
            {items.map((it, idx) => (
              <View
                key={`${it.ticker}-${idx}`}
                style={{
                  flex: Math.max(0.5, it.weight),
                  height: '100%',
                  backgroundColor: idx % 2 === 0 ? colors.primary : colors.tertiary,
                }}
              />
            ))}
          </View>

          {items.map((it, idx) => (
            <View key={`${it.ticker}-${idx}`} style={[styles.itemRow, { borderColor }]}>
              <Text style={[styles.itemTicker, { color: textColor }]}>
                {it.ticker} ({it.class})
              </Text>
              <View style={styles.weightInputWrap}>
                <TextInput
                  testID={`pp-weight-input-${idx}`}
                  keyboardType="numeric"
                  value={String(it.weight)}
                  onChangeText={(txt) => handleUpdateWeight(idx, txt)}
                  style={[styles.weightInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
                />
                <Text style={{ color: mutedColor }}>%</Text>
              </View>
            </View>
          ))}

          {!isWeightValid && (
            <Text testID="pp-weight-error" style={styles.weightError}>
              A soma dos pesos deve ser 100% (atual: {weightSum.toFixed(1)}%).
            </Text>
          )}

          <View style={styles.compActions}>
            <TouchableOpacity
              testID="pp-distribute-rest-btn"
              onPress={handleDistributeRest}
              style={[styles.smallBtn, { borderColor }]}
            >
              <Text style={[styles.smallBtnText, { color: textColor }]}>Distribuir o restante</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.addRow}>
            <TextInput
              testID="pp-new-ticker-input"
              value={newTicker}
              onChangeText={setNewTicker}
              placeholder="Ticker (ex: WEGE3)"
              placeholderTextColor={mutedColor}
              style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor, borderColor }]}
            />
            <TouchableOpacity
              testID="pp-add-asset-btn"
              onPress={handleAddAsset}
              style={[styles.smallBtn, { borderColor: colors.primary }]}
            >
              <Text style={[styles.smallBtnText, { color: colors.primary }]}>+ Ativo</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          testID="pp-simulate-btn"
          disabled={!isWeightValid}
          onPress={handleSimulate}
          style={[styles.simulateBtn, !isWeightValid && { opacity: 0.5 }]}
        >
          <Text style={styles.simulateBtnText}>Simular</Text>
        </TouchableOpacity>

        {/* Resultados: Gráfico 3 séries + KPIs */}
        {simResult && (
          <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
            <View style={styles.kpiRow}>
              <View style={styles.kpiBox}>
                <Text style={[styles.kpiLabel, { color: mutedColor }]}>Patrimônio final</Text>
                <Text testID="pp-kpi-final-value" style={[styles.kpiValue, { color: textColor }]}>
                  {formatBRL(simResult.finalValueBRL, isPrivacyMode)}
                </Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={[styles.kpiLabel, { color: mutedColor }]}>Pior queda</Text>
                <Text testID="pp-kpi-drawdown" style={[styles.kpiValue, { color: colors.deficit }]}>
                  {formatPct(simResult.maxDrawdownPct, isPrivacyMode)}
                </Text>
              </View>
            </View>

            {/* Gráfico 3 séries: Fictícia × Real × CDI */}
            <View testID="pp-chart-3-series" style={styles.seriesBox}>
              <View testID="pp-series-ficticia" style={styles.seriesRow}>
                <View style={[styles.seriesDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.seriesLabel, { color: textColor }]}>Fictícia</Text>
                <Text style={[styles.seriesValue, { color: textColor }]}>
                  {formatBRL(simResult.finalValueBRL, isPrivacyMode)}
                </Text>
              </View>
              <View testID="pp-series-real" style={styles.seriesRow}>
                <View style={[styles.seriesDot, { backgroundColor: '#5B8DEF' }]} />
                <Text style={[styles.seriesLabel, { color: textColor }]}>Real</Text>
                <Text style={[styles.seriesValue, { color: textColor }]}>
                  {formatBRL(realFinal, isPrivacyMode)}
                </Text>
              </View>
              <View testID="pp-series-cdi" style={styles.seriesRow}>
                <View style={[styles.seriesDot, { backgroundColor: colors.tertiary }]} />
                <Text style={[styles.seriesLabel, { color: textColor }]}>CDI</Text>
                <Text style={[styles.seriesValue, { color: textColor }]}>
                  {formatBRL(cdiFinal, isPrivacyMode)}
                </Text>
              </View>
            </View>

            {simResult.lateStartAssets.length > 0 && (
              <View style={styles.lateBox}>
                {simResult.lateStartAssets.map((l) => (
                  <Text key={l.ticker} style={[styles.lateText, { color: mutedColor }]}>
                    {l.ticker} iniciou em {l.effectiveStart} (sem dado em {l.requestedStart}).
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Transformar em carteira real */}
        <View style={[styles.card, { backgroundColor: surface, borderColor }]}>
          <TextInput
            testID="pp-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Nome da carteira"
            placeholderTextColor={mutedColor}
            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
          />
          <TouchableOpacity
            testID="pp-convert-btn"
            disabled={!isWeightValid}
            onPress={() => setShowConvertConfirm(true)}
            style={[styles.convertBtn, { borderColor: colors.primary }]}
          >
            <Text style={[styles.convertBtnText, { color: colors.primary }]}>
              Transformar em carteira real
            </Text>
          </TouchableOpacity>
          {convertedMsg ? (
            <Text style={[styles.convertedMsg, { color: colors.tertiary }]}>{convertedMsg}</Text>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showConvertConfirm}
        title="Transformar em carteira real?"
        message="Cria uma nova carteira com metas por classe e ativo, sem nenhuma movimentação."
        confirmLabel="Criar carteira"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmConvert}
        onCancel={() => setShowConvertConfirm(false)}
        themeMode={themeMode}
      />
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
  scrollContent: { paddingHorizontal: space.md, paddingBottom: 120, gap: 12 },
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
  card: { borderRadius: borders.radiusLg, padding: 14, borderWidth: 1, gap: 10 },
  sectionTitle: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: borders.radiusFull, borderWidth: 1 },
  chipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  rowInputs: { flexDirection: 'row', gap: 8 },
  inputGroup: { flex: 1, gap: 4 },
  inputLabel: { fontFamily: typography.fontFamily, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemTicker: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  weightInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weightInput: {
    width: 64,
    borderWidth: 1,
    borderRadius: borders.radiusMd,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'right',
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  weightError: { fontFamily: typography.fontFamily, fontSize: 12, color: '#E05252', fontWeight: '600' },
  compActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: borders.radiusFull, borderWidth: 1 },
  smallBtnText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  simulateBtn: {
    backgroundColor: colors.primary,
    borderRadius: borders.radiusFull,
    paddingVertical: 14,
    alignItems: 'center',
  },
  simulateBtnText: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  kpiRow: { flexDirection: 'row', gap: 12 },
  kpiBox: { flex: 1, gap: 2 },
  kpiLabel: { fontFamily: typography.fontFamily, fontSize: 11 },
  kpiValue: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '700' },
  seriesBox: { gap: 8, marginTop: 4 },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seriesDot: { width: 8, height: 8, borderRadius: 4 },
  seriesLabel: { flex: 1, fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '600' },
  seriesValue: { fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '700' },
  lateBox: { marginTop: 4, gap: 2 },
  lateText: { fontFamily: typography.fontFamily, fontSize: 11 },
  convertBtn: { borderWidth: 1, borderRadius: borders.radiusFull, paddingVertical: 12, alignItems: 'center' },
  convertBtnText: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
  convertedMsg: { fontFamily: typography.fontFamily, fontSize: 12, textAlign: 'center', fontWeight: '600' },
});

export default PaperPortfolioScreen;
