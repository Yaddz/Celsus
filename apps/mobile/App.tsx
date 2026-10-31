import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from './src/theme/tokens';
import {
  DossierCard,
  QuickActionBentoRow,
  SpecimenHexCard,
  RecentTransactionsCard,
  AttributeStatBar,
  LedgerInput,
  DirectiveButton,
  FloatingBottomDock,
  DockTab,
  RecentTransactionItem,
} from './src/components/ui';
import {
  PortfolioManagementScreen,
  TransactionScreen,
  SimulatorScreen,
} from './src/screens';
import { calculateSmartContribution, RebalanceAssetInput } from './src/domain/finance';
import { transactionService } from './src/services/transactionService';
import { assetRepository } from './src/repositories/assetRepository';

const DEFAULT_TRANSACTIONS: RecentTransactionItem[] = [
  {
    id: 'tx-1',
    ticker: 'PETR4',
    assetClass: 'STOCK',
    type: 'BUY',
    dateText: 'Hoje, 14:32',
    amountText: 'R$ 480,00',
  },
  {
    id: 'tx-2',
    ticker: 'HGLG11',
    assetClass: 'FII',
    type: 'BUY',
    dateText: 'Ontem, 10:15',
    amountText: 'R$ 325,50',
  },
  {
    id: 'tx-3',
    ticker: 'CDB 110%',
    assetClass: 'FIXED_INCOME',
    type: 'BUY',
    dateText: '28 Out',
    amountText: 'R$ 1.000,00',
  },
  {
    id: 'tx-4',
    ticker: 'BTC',
    assetClass: 'CRYPTO',
    type: 'BUY',
    dateText: '25 Out',
    amountText: 'R$ 250,00',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<DockTab>('home');
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [periodSelector, setPeriodSelector] = useState<'W' | 'M' | 'Y'>('M');
  const [contributionAmount, setContributionAmount] = useState('1500,00');
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // Modais de Navegação
  const [isPortfolioManagerModalOpen, setIsPortfolioManagerModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);

  // Lista de Movimentações Recentes
  const [transactionsList, setTransactionsList] = useState<RecentTransactionItem[]>(DEFAULT_TRANSACTIONS);

  const refreshTransactions = async () => {
    try {
      const txs = await transactionService.getTransactionsByPortfolio('default-portfolio');
      if (txs && txs.length > 0) {
        const mapped: RecentTransactionItem[] = await Promise.all(
          txs.slice(0, 5).map(async (t) => {
            const asset = await assetRepository.getAssetById(t.asset_id);
            return {
              id: t.id,
              ticker: asset?.ticker || 'ATIVO',
              assetClass: (asset?.asset_class as any) || 'STOCK',
              type: t.type as 'BUY' | 'SELL',
              dateText: t.trade_date,
              amountText: `R$ ${t.total_amount}`,
            };
          })
        );
        setTransactionsList(mapped);
      }
    } catch {
      // Mantém lista padrão em mock
    }
  };

  useEffect(() => {
    refreshTransactions();
  }, []);

  const handleSimulate = () => {
    const rawVal = contributionAmount.replace(/\./g, '').replace(',', '.');
    const numericAmount = parseFloat(rawVal) || 1500;

    // Executa o motor financeiro real de rebalanceamento inteligente da Sprint 3
    const sampleAssets: RebalanceAssetInput[] = [
      { ticker: 'PETR4', assetClass: 'STOCK', currentQuantity: '200', currentPrice: '38.50', globalTargetPercentage: 35 },
      { ticker: 'HGLG11', assetClass: 'FII', currentQuantity: '45', currentPrice: '162.00', globalTargetPercentage: 25 },
      { ticker: 'CDB DI 110%', assetClass: 'FIXED_INCOME', currentQuantity: '10000', currentPrice: '1.00', globalTargetPercentage: 30 },
      { ticker: 'BTC', assetClass: 'CRYPTO', currentQuantity: '0.0085', currentPrice: '380000.00', globalTargetPercentage: 10 },
    ];

    const result = calculateSmartContribution(numericAmount, sampleAssets);
    const activeSuggestions = result.suggestions.filter((s) => parseFloat(s.suggestedAmount) > 0);

    const breakdown = activeSuggestions
      .map(
        (s) =>
          `• ${s.ticker}: ${s.suggestedQuantity} ${
            s.assetClass === 'STOCK' || s.assetClass === 'FII'
              ? 'cotas'
              : s.assetClass === 'CRYPTO'
              ? 'BTC'
              : 'BRL'
          } (R$ ${s.allocatedAmount})`
      )
      .join('\n');

    setSimulationResult(
      `Alocação Inteligente (Motor Financeiro Celsus):\n${breakdown}\n\nTotal Alocado: R$ ${result.totalAllocated} | Troco em Caixa: R$ ${result.remainingCash}`
    );
  };

  const balanceDisplay = isPrivacyMode ? 'R$ ••••••••' : 'R$ 32.468,00';

  // Modal / Tela: Carteiras & Alocação
  if (activeTab === 'wallets' || isPortfolioManagerModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <PortfolioManagementScreen
          onClose={() => {
            setIsPortfolioManagerModalOpen(false);
            setActiveTab('home');
          }}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            setIsPortfolioManagerModalOpen(false);
            setActiveTab(tab);
          }}
          onActionPress={() => setIsTransactionModalOpen(true)}
        />
      </SafeAreaView>
    );
  }

  // Modal / Tela: Nova Movimentação
  if (isTransactionModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <TransactionScreen
          onClose={() => setIsTransactionModalOpen(false)}
          onTransactionSuccess={() => refreshTransactions()}
        />
      </SafeAreaView>
    );
  }

  // Modal / Tela: Simulador de Novo Aporte
  if (isSimulatorModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <SimulatorScreen
          onClose={() => setIsSimulatorModalOpen(false)}
          onContributionsConfirmed={() => refreshTransactions()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Glow de ambiente sutil no topo */}
      <View style={styles.ambientGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Minimalista (Logo Celsus + Botão de Privacidade com Material Icons) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerLogoBadge}>
              <MaterialIcons name="account-balance-wallet" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.brandTitle}>Celsus</Text>
              <Text style={styles.docketSubtitle}>GESTÃO DE CARTEIRAS</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setIsPrivacyMode(!isPrivacyMode)}
            style={styles.privacyButton}
          >
            <MaterialIcons
              name={isPrivacyMode ? 'visibility-off' : 'visibility'}
              size={20}
              color={colors.parchmentPale}
            />
          </TouchableOpacity>
        </View>

        {/* 1. Stacked Hero Wallet Card (WalleZ Stacked Cards) */}
        <DossierCard
          variant="hero"
          balance={balanceDisplay}
          subtitle="Patrimônio Total"
          accountName="CARTEIRA PRINCIPAL"
          accountCode="•••• 001"
          profitText={isPrivacyMode ? '•••••' : '+12,4% no ano'}
          accentColor={colors.primary}
        />

        {/* 2. Três Bento Tiles de Ação Rápida com Ícones Material Symbols */}
        <QuickActionBentoRow
          onAportar={() => setIsTransactionModalOpen(true)}
          onSimular={() => setIsSimulatorModalOpen(true)}
          onMais={() => setIsPortfolioManagerModalOpen(true)}
        />

        {/* 3. Banner Horizontal de Insight */}
        <SpecimenHexCard
          callout="Rebalanceie sua carteira com um novo aporte inteligente"
          badge="REBALANCEAR"
          variant="parchment"
          onPress={() => setIsSimulatorModalOpen(true)}
        />

        {/* 4. Card de Alocação por Categoria (Dot-Matrix Category Grid) */}
        <View style={styles.allocationContainer}>
          <View style={styles.allocationHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>ALOCAÇÃO POR CATEGORIA</Text>
              <Text style={styles.sectionSubtitle}>Distribuição Atual vs Meta</Text>
            </View>

            {/* Seletor W | M | Y */}
            <View style={styles.periodPill}>
              {(['W', 'M', 'Y'] as const).map((p) => {
                const isSelected = p === periodSelector;
                return (
                  <TouchableOpacity
                    key={p}
                    activeOpacity={0.7}
                    onPress={() => setPeriodSelector(p)}
                    style={[
                      styles.periodOption,
                      isSelected && styles.periodOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        isSelected && styles.periodTextSelected,
                      ]}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* As 4 Categorias com Matriz de Pontos */}
          <AttributeStatBar
            assetClass="FIXED_INCOME"
            currentPercentage={32.0}
            targetPercentage={30.0}
            testID="stat-bar-fixed-income"
          />
          <AttributeStatBar
            assetClass="FII"
            currentPercentage={24.5}
            targetPercentage={25.0}
            testID="stat-bar-fii"
          />
          <AttributeStatBar
            assetClass="STOCK"
            currentPercentage={33.5}
            targetPercentage={35.0}
            testID="stat-bar-stock"
          />
          <AttributeStatBar
            assetClass="CRYPTO"
            currentPercentage={10.0}
            targetPercentage={10.0}
            testID="stat-bar-crypto"
          />
        </View>

        {/* 5. Card de Movimentações Recentes com Avatares Circulares e Ícones da Categoria */}
        <RecentTransactionsCard
          transactions={transactionsList}
          onViewAll={() => setIsTransactionModalOpen(true)}
        />

        {/* 6. Simulador de Novo Aporte Integrado */}
        <DossierCard title="SIMULADOR DE NOVO APORTE" variant="default">
          <LedgerInput
            label="VALOR DO APORTE (R$)"
            value={contributionAmount}
            onChangeText={setContributionAmount}
            prefix="R$ "
            suffix=" BRL"
          />
          <DirectiveButton
            label="Abrir Simulador Completo"
            variant="primary"
            materialIcon="calculate"
            onPress={() => setIsSimulatorModalOpen(true)}
          />
          {simulationResult ? (
            <View style={styles.simulationBox}>
              <Text style={styles.simulationText}>{simulationResult}</Text>
            </View>
          ) : null}
        </DossierCard>

        {/* Espaçador para o Dock Flutuante */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* 7. Barra de Navegação Inferior Flutuante (Floating Bottom Dock com Material Icons) */}
      <FloatingBottomDock
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'wallets') {
            setIsPortfolioManagerModalOpen(true);
          } else if (tab === 'history') {
            setIsTransactionModalOpen(true);
          } else if (tab === 'stats') {
            setIsSimulatorModalOpen(true);
          } else {
            setActiveTab(tab);
          }
        }}
        onActionPress={() => setIsTransactionModalOpen(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  ambientGlow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 300,
    height: 180,
    borderRadius: 150,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  scrollContent: {
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingVertical: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral,
    borderWidth: borders.hairline,
    borderColor: '#2A2D30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  docketSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: colors.secondary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  privacyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allocationContainer: {
    marginVertical: spacing.sm,
  },
  allocationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.xs + 2,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize - 2,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 1,
  },
  periodPill: {
    flexDirection: 'row',
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusPill,
    padding: 3,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  periodOption: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusPill,
  },
  periodOptionSelected: {
    backgroundColor: colors.tertiary,
  },
  periodText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#8A8A8E',
  },
  periodTextSelected: {
    color: colors.voidFloor,
  },
  simulationBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.oxidizedSlag,
    borderRadius: borders.radiusBase,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  simulationText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize + 1,
    color: colors.parchmentPale,
    lineHeight: 18,
  },
});
