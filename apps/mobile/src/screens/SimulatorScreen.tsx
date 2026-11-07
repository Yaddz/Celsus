import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Decimal from 'decimal.js';
import { colors, typography, spacing, borders, layout, space, bento } from '../theme/tokens';
import { calculateTwoPhaseContribution, planToRebalanceResult, RebalanceResult } from '../domain/finance';
import { rebalanceExecutionService } from '../services/rebalanceExecution';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { Portfolio, Asset } from '../db/schema';
import { DirectiveButton } from '../components/ui/DirectiveButton';
import { LedgerInput } from '../components/ui/LedgerInput';
import { BentoRow, BentoTile } from '../components/ui/BentoGrid';
import { ASSET_CLASS_ATTRIBUTE_MAP, AssetClass } from '../components/ui/AttributeStatBar';

export interface SimulatorScreenProps {
  onClose: () => void;
  onContributionsConfirmed?: () => void;
  initialPortfolioId?: string;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const CATEGORY_MATERIAL_ICONS: Record<AssetClass, keyof typeof MaterialIcons.glyphMap> = {
  FIXED_INCOME: 'account-balance',
  FII: 'domain',
  STOCK: 'trending-up',
  CRYPTO: 'currency-bitcoin',
};

export const SimulatorScreen: React.FC<SimulatorScreenProps> = ({
  onClose,
  onContributionsConfirmed = () => {},
  initialPortfolioId,
  isPrivacyMode = false,
  themeMode = 'dark',
  testID = 'simulator-screen',
}) => {
  const isLight = themeMode === 'light';
  // Barra de navegação/gestos do sistema: o último item precisa ficar acima dela.
  let bottomInset = 0;
  try {
    bottomInset = useSafeAreaInsets().bottom;
  } catch {
    // sem SafeAreaProvider (testes): sem inset
  }
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId || '');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [contributionAmountText, setContributionAmountText] = useState('');

  const [simulationResult, setSimulationResult] = useState<RebalanceResult | null>(null);
  const [extraShareTickers, setExtraShareTickers] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    loadPortfolios();
  }, []);

  useEffect(() => {
    if (selectedPortfolioId) {
      loadAssets(selectedPortfolioId);
    }
  }, [selectedPortfolioId]);

  const loadPortfolios = async () => {
    try {
      const list = await portfolioRepository.getAllPortfolios();
      setPortfolios(list);
      if (list.length > 0 && !selectedPortfolioId) {
        setSelectedPortfolioId(list[0].id);
      }
    } catch {
      setPortfolios([]);
    }
  };

  const loadAssets = async (portId: string) => {
    try {
      const list = await assetRepository.getAssetsByPortfolio(portId);
      setAssets(list);
    } catch {
      setAssets([]);
    }
  };

  const handleSimulate = async () => {
    const rawVal = contributionAmountText.replace(/\./g, '').replace(',', '.');
    const numericAmount = parseFloat(rawVal);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert('Valor Inválido', 'Informe um valor de aporte maior que zero.');
      return;
    }

    if (assets.length === 0) {
      Alert.alert(
        'Nenhum ativo',
        'Nenhum ativo cadastrado nesta carteira. Adicione ativos na carteira para realizar simulações de aporte.'
      );
      return;
    }

    let classTargets: Awaited<ReturnType<typeof portfolioRepository.getClassTargets>> = [];
    try {
      classTargets = await portfolioRepository.getClassTargets(selectedPortfolioId);
    } catch {
      classTargets = [];
    }
    const priceOf = (a: Asset) => (parseFloat(a.average_price) > 0 ? a.average_price : '50.00');
    const inputAssets = assets.map((a) => ({
      ticker: a.ticker,
      assetClass: a.asset_class as AssetClass,
      price: priceOf(a),
      currentValue: new Decimal(a.quantity || 0).mul(priceOf(a)).toString(),
      targetInClassPercent: a.target_percentage_in_class || 0,
    }));
    // Classes sem meta cadastrada recebem peso igual; "recebe aporte" vem do banco (padrão: sim).
    const presentClasses = Array.from(new Set(inputAssets.map((a) => a.assetClass)));
    const classes = presentClasses.map((c) => {
      const t = classTargets.find((ct) => ct.asset_class === c);
      return {
        assetClass: c,
        targetPercentage: t ? t.target_percentage : 100 / presentClasses.length,
        receivesContribution: t ? t.receives_contribution !== 0 : true,
      };
    });

    const plan = calculateTwoPhaseContribution(numericAmount, classes, inputAssets);
    const currentTotal = inputAssets.reduce((sum, a) => sum.plus(a.currentValue), new Decimal(0));
    const result = planToRebalanceResult(plan, numericAmount, currentTotal.toString());
    setExtraShareTickers(result.extraShareTickers);
    setSimulationResult(result);
  };

  const handleConfirmBatch = async () => {
    if (!simulationResult) return;

    const activeSuggestions = simulationResult.suggestions.filter(
      (s) => new Decimal(s.suggestedQuantity || 0).gt(0)
    );

    if (activeSuggestions.length === 0) {
      Alert.alert('Aviso', 'Nenhum ativo com alocação sugerida neste cálculo.');
      return;
    }

    setIsExecuting(true);
    try {
      // Monta mapa de IDs para os ativos
      const assetIdMap: Record<string, string> = {};
      for (const s of activeSuggestions) {
        const found = assets.find((a) => a.ticker.toUpperCase() === s.ticker.toUpperCase());
        assetIdMap[s.ticker] = found?.id || `sim-asset-${s.ticker}`;
      }

      const today = new Date().toISOString().slice(0, 10);
      const res = await rebalanceExecutionService.executeFromSuggestions({
        portfolioId: selectedPortfolioId || 'default-portfolio',
        tradeDate: today,
        suggestions: simulationResult.suggestions,
        assetIdMap,
        notes: 'Simulador de Aporte Inteligente',
      });

      Alert.alert(
        'Aportes Confirmados!',
        `${res.totalExecuted} ${res.totalExecuted === 1 ? 'aporte registrado' : 'aportes registrados'}.\nTotal investido: R$ ${res.totalAmountInvested}`
      );
      onContributionsConfirmed();
      onClose();
    } catch (e: any) {
      Alert.alert('Erro ao Confirmar', e.message || 'Falha ao processar aportes em lote.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* Top Close Action (sem header) */}
      {onClose && (
        <View style={styles.topActionsRow}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, isLight && styles.closeBtnLight]}
            testID="close-simulator-btn"
          >
            <MaterialIcons
              name="close"
              size={20}
              color={isLight ? '#111315' : colors.parchmentPale}
            />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.screenPadding + Math.max(bottomInset, 16) + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Seletor de Carteira */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>CARTEIRA DESTINO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {portfolios.map((p) => {
              const isSelected = p.id === selectedPortfolioId;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPortfolioId(p.id)}
                  style={[styles.chip, isLight && styles.chipLight, isSelected && styles.chipActive]}
                >
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={16}
                    color={isSelected ? colors.voidFloor : (isLight ? '#6E6A63' : colors.tertiary)}
                  />
                  <Text style={[styles.chipText, isLight && styles.chipTextLight, isSelected && styles.chipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Input de Valor */}
        <View style={styles.section}>
          <LedgerInput
            label="VALOR DISPONÍVEL P/ APORTE (R$)"
            value={contributionAmountText}
            placeholder="0,00"
            onChangeText={setContributionAmountText}
            prefix="R$ "
            suffix=" BRL"
            themeMode={themeMode}
          />

          <DirectiveButton
            label="CALCULAR REBALANCEAMENTO"
            variant="primary"
            materialIcon="calculate"
            onPress={handleSimulate}
            themeMode={themeMode}
            style={{ marginTop: spacing.xs }}
          />
        </View>

        {/* Resultados da Simulação */}
        {simulationResult ? (
          <View style={styles.resultSection}>
            {/* Bento Card de Resumo do Aporte */}
            <BentoRow testID="simulator-metrics">
              {[
                { label: 'TOTAL APORTE', value: simulationResult.contributionAmount, variant: 'cream' as const },
                { label: 'TOTAL ALOCADO', value: simulationResult.totalAllocated, variant: 'forest' as const },
                { label: 'TROCO', value: simulationResult.remainingCash, variant: 'gold' as const },
              ].map((m) => (
                <BentoTile key={m.label} variant={m.variant} style={{ paddingVertical: 12, paddingHorizontal: 6, minHeight: 88, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[styles.metricLabel, { color: bento.variants[m.variant].muted }]}>{m.label}</Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    style={[styles.metricValue, { color: bento.variants[m.variant].foreground }]}
                  >
                    {isPrivacyMode ? (
                      'R$ ••••••'
                    ) : (
                      <>
                        <Text style={styles.metricCurrency}>R$ </Text>
                        {m.value}
                      </>
                    )}
                  </Text>
                </BentoTile>
              ))}
            </BentoRow>
            <View style={{ height: layout.groupGap }} />

            {/* Lista de Ativos Sugeridos */}
            <Text style={[styles.listSectionTitle, isLight && styles.listSectionTitleLight]}>ATIVOS CONTEMPLADOS</Text>

            <View style={[styles.suggestionsContainer, isLight && styles.suggestionsContainerLight]}>
              {simulationResult.suggestions.map((s) => {
                const config = ASSET_CLASS_ATTRIBUTE_MAP[s.assetClass] || {
                  color: colors.primary,
                  label: 'Ativo',
                };
                const iconName = CATEGORY_MATERIAL_ICONS[s.assetClass] || 'trending-up';
                const hasAllocation = parseFloat(s.allocatedAmount) > 0;

                return (
                  <View
                    key={s.ticker}
                    style={[
                      styles.suggestionCard,
                      !hasAllocation && styles.suggestionCardZero,
                      isLight && styles.suggestionCardLight,
                    ]}
                  >
                    {/* Avatar Circular 44x44 */}
                    <View style={[styles.avatar, { backgroundColor: config.color }]}>
                      <MaterialIcons name={iconName} size={22} color={colors.voidFloor} />
                    </View>

                    {/* Detalhes do Ativo */}
                    <View style={styles.detailsCol}>
                      <View style={styles.tickerRow}>
                        <Text style={[styles.tickerText, isLight && styles.tickerTextLight]}>{s.ticker}</Text>
                        <Text style={[styles.classBadgeText, isLight && styles.classBadgeTextLight]}>{config.label}</Text>
                      </View>
                      <Text style={[styles.subDetailText, isLight && styles.subDetailTextLight]}>
                        {extraShareTickers.includes(s.ticker) ? 'Cota extra do troco • ' : ''}
                        Na classe após aporte: {s.targetWeightPercent}%
                      </Text>
                    </View>

                    {/* Quantidade e Valor Alocado */}
                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.allocatedAmountText,
                          hasAllocation
                            ? (isLight ? styles.allocatedPositiveLight : styles.allocatedPositive)
                            : (isLight ? styles.allocatedZeroLight : styles.allocatedZero),
                        ]}
                      >
                        {isPrivacyMode ? 'R$ ••••••' : hasAllocation ? `+R$ ${s.allocatedAmount}` : 'R$ 0,00'}
                      </Text>
                      <Text style={[styles.quantityText, isLight && styles.quantityTextLight]}>
                        {s.suggestedQuantity}{' '}
                        {s.assetClass === 'STOCK' || s.assetClass === 'FII'
                          ? 'cotas'
                          : s.assetClass === 'CRYPTO'
                          ? 'un'
                          : 'BRL'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Botão de Confirmação em Lote */}
            <DirectiveButton
              label={isExecuting ? 'CONFIRMANDO APORTES...' : 'CONFIRMAR APORTES EM LOTE'}
              variant="primary"
              materialIcon="north-east"
              disabled={isExecuting}
              onPress={handleConfirmBatch}
              themeMode={themeMode}
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  topActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  closeBtn: {
    padding: spacing.xs,
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusSm,
  },
  scrollContent: {
    padding: layout.screenPadding,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.neutral,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borders.radiusPill,
    marginRight: 8,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  chipActive: {
    backgroundColor: colors.tertiary,
    borderColor: colors.tertiary,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.voidFloor,
  },
  resultSection: {
    marginTop: layout.sectionGap,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: layout.groupGap,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  metricCurrency: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: 21,
    textAlign: 'center',
    alignSelf: 'stretch',
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  listSectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginBottom: spacing.xs + 2,
  },
  suggestionsContainer: {
    backgroundColor: 'transparent',
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md - 2,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  suggestionCardZero: {
    opacity: 0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 4,
  },
  detailsCol: {
    flex: 1,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tickerText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  classBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
  },
  subDetailText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  allocatedAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    fontWeight: '700',
  },
  allocatedPositive: {
    color: '#AECDC5',
  },
  allocatedZero: {
    color: '#8A8A8E',
  },
  quantityText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  closeBtnLight: {
    backgroundColor: '#EAE4D7',
  },
  sectionLabelLight: {
    color: '#6E6A63',
  },
  chipLight: {
    backgroundColor: '#EDE8DF',
    borderColor: '#E5DFD3',
  },
  chipTextLight: {
    color: '#111315',
  },
  metricCardLight: {
    backgroundColor: 'transparent',
  },
  metricLabelLight: {
    color: '#6E6A63',
  },
  metricValueLight: {
    color: '#111315',
  },
  listSectionTitleLight: {
    color: '#111315',
  },
  suggestionsContainerLight: {
    backgroundColor: 'transparent',
    borderTopColor: '#EAE4D7',
  },
  suggestionCardLight: {
    borderBottomColor: '#EAE4D7',
  },
  tickerTextLight: {
    color: '#111315',
  },
  classBadgeTextLight: {
    color: '#6E6A63',
  },
  subDetailTextLight: {
    color: '#6E6A63',
  },
  allocatedPositiveLight: {
    color: '#1B4D3E',
  },
  allocatedZeroLight: {
    color: '#8A857B',
  },
  quantityTextLight: {
    color: '#1B4D3E',
  },
});

export default SimulatorScreen;
