import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from './src/theme/tokens';
import {
  DossierCard,
  QuickActionBentoRow,
  SpecimenHexCard,
  RecentTransactionsCard,
  DotMatrixAllocationCard,
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
  StatisticsScreen,
  SettingsBackupScreen,
} from './src/screens';
import {
  redactCurrencyValue,
  redactPercentageValue,
  privacyAndAuthService,
} from './src/services/privacyAndAuth';
import {
  calculateSmartContribution,
  RebalanceAssetInput,
  consolidatePortfolios,
  PortfolioConsolidationInput,
} from './src/domain/finance';
import { transactionService } from './src/services/transactionService';
import { assetRepository } from './src/repositories/assetRepository';
import { portfolioRepository } from './src/repositories/portfolioRepository';

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
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DockTab>('home');
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [contributionAmount, setContributionAmount] = useState('1500,00');
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  // Modais de Navegação
  const [isPortfolioManagerModalOpen, setIsPortfolioManagerModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isSettingsBackupModalOpen, setIsSettingsBackupModalOpen] = useState(false);

  // Lista de Movimentações Recentes e Saldos Consolidados
  const [transactionsList, setTransactionsList] = useState<RecentTransactionItem[]>(DEFAULT_TRANSACTIONS);
  const [totalPatrimony, setTotalPatrimony] = useState('R$ 32.468,00');
  const [profitSummary, setProfitSummary] = useState('+12,4% no ano');

  const refreshAppData = async () => {
    try {
      // 1. Carrega dados consolidados das carteiras locais
      const allPortfolios = await portfolioRepository.listPortfolios(false);
      if (allPortfolios && allPortfolios.length > 0) {
        const inputs: PortfolioConsolidationInput[] = await Promise.all(
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
              })),
              classTargets: pTargets.map((ct) => ({
                assetClass: ct.asset_class as any,
                targetPercentage: ct.target_percentage,
              })),
            };
          })
        );

        const dossier = consolidatePortfolios(inputs);
        const mvNum = parseFloat(dossier.totalMarketValue);
        if (mvNum > 0) {
          setTotalPatrimony(
            `R$ ${mvNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          );
          setProfitSummary(
            `${parseFloat(dossier.totalProfit) >= 0 ? '+' : ''}${dossier.totalProfitPercentage}% total`
          );
        }
      }

      // 2. Carrega movimentações recentes
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
      // Fallback em caso de banco inicial
    }
  };

  useEffect(() => {
    refreshAppData();
  }, []);

  const handleSimulate = () => {
    const rawVal = contributionAmount.replace(/\./g, '').replace(',', '.');
    const numericAmount = parseFloat(rawVal) || 1500;

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

  const balanceDisplay = redactCurrencyValue(totalPatrimony, isPrivacyMode);
  const profitDisplay = redactPercentageValue(profitSummary, isPrivacyMode);

  // Modal: Configurações / Backup (.celsus.zip) & Segurança Local
  if (isSettingsBackupModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <SettingsBackupScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacyMode={(enabled) => setIsPrivacyMode(enabled)}
          onClose={() => setIsSettingsBackupModalOpen(false)}
          onDataRestored={() => refreshAppData()}
        />
      </SafeAreaView>
    );
  }

  // Tela/Aba: Análises & Estatísticas
  if (activeTab === 'stats') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <StatisticsScreen isPrivacyMode={isPrivacyMode} />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          onActionPress={() => setIsTransactionModalOpen(true)}
        />
      </SafeAreaView>
    );
  }

  // Modal / Tela: Carteiras & Alocação
  if (activeTab === 'wallets' || isPortfolioManagerModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <PortfolioManagementScreen
          onClose={() => {
            setIsPortfolioManagerModalOpen(false);
            setActiveTab('home');
            refreshAppData();
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

  // Modal: Nova Movimentação
  if (isTransactionModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <TransactionScreen
          onClose={() => {
            setIsTransactionModalOpen(false);
            refreshAppData();
          }}
          onTransactionSuccess={() => refreshAppData()}
        />
      </SafeAreaView>
    );
  }

  // Modal: Simulador de Novo Aporte
  if (isSimulatorModalOpen) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <SimulatorScreen
          onClose={() => {
            setIsSimulatorModalOpen(false);
            refreshAppData();
          }}
          onContributionsConfirmed={() => refreshAppData()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Glow de ambiente sutil no topo */}
      <View style={styles.ambientGlow} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 80 },
        ]}
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

          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                const next = privacyAndAuthService.togglePrivacyMode();
                setIsPrivacyMode(next.isPrivacyModeEnabled);
              }}
              style={styles.privacyButton}
            >
              <MaterialIcons
                name={isPrivacyMode ? 'visibility-off' : 'visibility'}
                size={20}
                color={colors.parchmentPale}
              />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setIsSettingsBackupModalOpen(true)}
              style={styles.privacyButton}
            >
              <MaterialIcons
                name="security"
                size={20}
                color={colors.tertiary}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* 1. Stacked Hero Wallet Card (WalleZ Stacked Cards) */}
        <DossierCard
          variant="hero"
          balance={balanceDisplay}
          subtitle="Patrimônio Total"
          accountName="DOSSIÊ CONSOLIDADO"
          accountCode="•••• 001"
          profitText={profitDisplay}
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
        <DotMatrixAllocationCard
          totalBalance={balanceDisplay}
          isPrivacyMode={isPrivacyMode}
          testID="home-dot-matrix-card"
        />

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
            label="Calcular Proposta no Motor"
            variant="secondary"
            materialIcon="calculate"
            onPress={handleSimulate}
          />
          <DirectiveButton
            label="Abrir Simulador Completo"
            variant="primary"
            materialIcon="tune"
            onPress={() => setIsSimulatorModalOpen(true)}
            style={{ marginTop: 8 }}
          />
          <DirectiveButton
            label="Backup .celsus.zip & Segurança Local"
            variant="neutral"
            materialIcon="folder-zip"
            onPress={() => setIsSettingsBackupModalOpen(true)}
            style={{ marginTop: 8 }}
          />
          {simulationResult ? (
            <View style={styles.simulationBox}>
              <Text style={styles.simulationText}>{simulationResult}</Text>
            </View>
          ) : null}
        </DossierCard>
      </ScrollView>

      {/* 7. Barra de Navegação Inferior Flutuante (Floating Bottom Dock) */}
      <FloatingBottomDock
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'wallets') {
            setActiveTab('wallets');
          } else if (tab === 'history') {
            setIsTransactionModalOpen(true);
          } else if (tab === 'stats') {
            setActiveTab('stats');
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
    paddingTop: spacing.xs,
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
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
