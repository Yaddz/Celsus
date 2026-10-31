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
import Decimal from 'decimal.js';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { calculateSmartContribution, RebalanceAssetInput, RebalanceResult } from '../domain/finance';
import { rebalanceExecutionService } from '../services/rebalanceExecution';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { Portfolio, Asset } from '../db/schema';
import { DirectiveButton } from '../components/ui/DirectiveButton';
import { LedgerInput } from '../components/ui/LedgerInput';
import { ASSET_CLASS_ATTRIBUTE_MAP, AssetClass } from '../components/ui/AttributeStatBar';

export interface SimulatorScreenProps {
  onClose: () => void;
  onContributionsConfirmed?: () => void;
  initialPortfolioId?: string;
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
}) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId || '');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [contributionAmountText, setContributionAmountText] = useState('1500,00');

  const [simulationResult, setSimulationResult] = useState<RebalanceResult | null>(null);
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
      const fallbackPort: Portfolio = {
        id: 'default-portfolio',
        name: 'Carteira Principal',
        description: 'Dossiê Geral',
        docket_code: 'REV-001',
        is_archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPortfolios([fallbackPort]);
      setSelectedPortfolioId(fallbackPort.id);
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

  const handleSimulate = () => {
    const rawVal = contributionAmountText.replace(/\./g, '').replace(',', '.');
    const numericAmount = parseFloat(rawVal);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert('Valor Inválido', 'Informe um valor de aporte maior que zero.');
      return;
    }

    // Se a carteira selecionada tiver ativos cadastrados, usa-os; caso contrário, usa mock ilustrativo
    const inputAssets: RebalanceAssetInput[] =
      assets.length > 0
        ? assets.map((a) => ({
            ticker: a.ticker,
            assetClass: a.asset_class as AssetClass,
            currentQuantity: a.quantity || '0',
            currentPrice: parseFloat(a.average_price) > 0 ? a.average_price : '50.00',
            globalTargetPercentage: a.target_percentage_in_class || 25,
          }))
        : [
            { ticker: 'PETR4', assetClass: 'STOCK', currentQuantity: '200', currentPrice: '38.50', globalTargetPercentage: 35 },
            { ticker: 'HGLG11', assetClass: 'FII', currentQuantity: '45', currentPrice: '162.00', globalTargetPercentage: 25 },
            { ticker: 'CDB DI', assetClass: 'FIXED_INCOME', currentQuantity: '10000', currentPrice: '1.00', globalTargetPercentage: 30 },
            { ticker: 'BTC', assetClass: 'CRYPTO', currentQuantity: '0.0085', currentPrice: '380000.00', globalTargetPercentage: 10 },
          ];

    const result = calculateSmartContribution(numericAmount, inputAssets);
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
        `Sucesso: ${res.totalExecuted} lançamentos BUY gerados no Livro-Razão.\nTotal Investido: R$ ${res.totalAmountInvested}`
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>SIMULADOR DE APORTE</Text>
          <Text style={styles.headerSubtitle}>ALOCAÇÃO POR DÉFICIT RELATIVO</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <MaterialIcons name="close" size={22} color={colors.parchmentPale} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Seletor de Carteira */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CARTEIRA DESTINO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {portfolios.map((p) => {
              const isSelected = p.id === selectedPortfolioId;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPortfolioId(p.id)}
                  style={[styles.chip, isSelected && styles.chipActive]}
                >
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={16}
                    color={isSelected ? colors.voidFloor : colors.tertiary}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
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
            onChangeText={setContributionAmountText}
            prefix="R$ "
            suffix=" BRL"
          />

          <DirectiveButton
            label="CALCULAR REBALANCEAMENTO"
            variant="primary"
            materialIcon="calculate"
            onPress={handleSimulate}
            style={{ marginTop: spacing.xs }}
          />
        </View>

        {/* Resultados da Simulação */}
        {simulationResult ? (
          <View style={styles.resultSection}>
            {/* Bento Card de Resumo do Aporte */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>TOTAL APORTE</Text>
                <Text style={styles.metricValue}>R$ {simulationResult.contributionAmount}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>TOTAL ALOCADO</Text>
                <Text style={[styles.metricValue, { color: '#AECDC5' }]}>
                  R$ {simulationResult.totalAllocated}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>SOBRA EM CAIXA</Text>
                <Text style={[styles.metricValue, { color: colors.tertiary }]}>
                  R$ {simulationResult.remainingCash}
                </Text>
              </View>
            </View>

            {/* Lista de Ativos Sugeridos */}
            <Text style={styles.listSectionTitle}>ATIVOS CONTEMPLADOS</Text>

            <View style={styles.suggestionsContainer}>
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
                    ]}
                  >
                    {/* Avatar Circular 44x44 */}
                    <View style={[styles.avatar, { backgroundColor: config.color }]}>
                      <MaterialIcons name={iconName} size={22} color={colors.voidFloor} />
                    </View>

                    {/* Detalhes do Ativo */}
                    <View style={styles.detailsCol}>
                      <View style={styles.tickerRow}>
                        <Text style={styles.tickerText}>{s.ticker}</Text>
                        <Text style={styles.classBadgeText}>{config.label}</Text>
                      </View>
                      <Text style={styles.subDetailText}>
                        Meta: {s.targetWeightPercent}% • Atual: {s.currentWeightPercent}%
                      </Text>
                    </View>

                    {/* Quantidade e Valor Alocado */}
                    <View style={styles.amountCol}>
                      <Text
                        style={[
                          styles.allocatedAmountText,
                          hasAllocation ? styles.allocatedPositive : styles.allocatedZero,
                        ]}
                      >
                        {hasAllocation ? `+R$ ${s.allocatedAmount}` : 'R$ 0,00'}
                      </Text>
                      <Text style={styles.quantityText}>
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
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: spacing.xs,
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusSm,
  },
  scrollContent: {
    padding: spacing.lg,
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
    marginTop: spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.neutral,
    padding: spacing.sm + 2,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#8A8A8E',
    fontWeight: '700',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
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
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    paddingHorizontal: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
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
});

export default SimulatorScreen;
