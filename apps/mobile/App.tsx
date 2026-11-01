import './src/setupPolyfills';
import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
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
  StackedWalletDeck,
  WalletCardData,
  QuickActionBentoRow,
  RecentTransactionsCard,
  DotMatrixAllocationCard,
  LedgerInput,
  DirectiveButton,
  FloatingBottomDock,
  DockTab,
  RecentTransactionItem,
  XpMinimalHeader,
  AmbientOrb,
} from './src/components/ui';
import { AssetClass } from './src/components/ui/AttributeStatBar';
import {
  PortfolioManagementScreen,
  TransactionScreen,
  SimulatorScreen,
  StatisticsScreen,
  SettingsBackupScreen,
  ClassDetailScreen,
  TransactionDetailHistoryScreen,
  AllTransactionsScreen,
} from './src/screens';
import {
  redactCurrencyValue,
  redactPercentageValue,
  redactWithAsterisks,
  PRIVACY_ASTERISK_MASK,
  privacyAndAuthService,
} from './src/services/privacyAndAuth';
import {
  getPortfolioPalette,
  themeModeService,
  ThemeMode,
  LIGHT_THEME_TOKENS,
} from './src/theme/palettes';
import {
  calculateSmartContribution,
  RebalanceAssetInput,
  consolidatePortfolios,
  PortfolioConsolidationInput,
} from './src/domain/finance';
import { transactionService } from './src/services/transactionService';
import { marketSyncService } from './src/services/marketSyncService';
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(themeModeService.getThemeMode());
  const [activeWalletIndex, setActiveWalletIndex] = useState(0);
  const [contributionAmount, setContributionAmount] = useState('1500,00');
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  const activePalette = getPortfolioPalette(activeWalletIndex);
  const isLight = themeMode === 'light';

  // Modais de Navegação
  const [isPortfolioManagerModalOpen, setIsPortfolioManagerModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isSettingsBackupModalOpen, setIsSettingsBackupModalOpen] = useState(false);
  const [selectedRecentTransaction, setSelectedRecentTransaction] = useState<RecentTransactionItem | null>(null);
  const [selectedClassDetail, setSelectedClassDetail] = useState<AssetClass | null>(null);
  const [isAllTransactionsModalOpen, setIsAllTransactionsModalOpen] = useState(false);

  // Lista de Movimentações Recentes e Saldos Consolidados
  const [transactionsList, setTransactionsList] = useState<RecentTransactionItem[]>(DEFAULT_TRANSACTIONS);
  const [totalPatrimony, setTotalPatrimony] = useState('R$ 32.468,00');
  const [profitSummary, setProfitSummary] = useState('+12,4% no ano');
  const [walletsList, setWalletsList] = useState<WalletCardData[]>([
    {
      id: 'default-portfolio',
      name: 'DOSSIÊ CONSOLIDADO',
      code: '•••• 001',
      balance: 'R$ 32.468,00',
      profitText: '+12,4% no ano',
      accentColor: colors.primary,
    },
  ]);

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
          const formattedTotal = `R$ ${mvNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          const formattedProfit = `${parseFloat(dossier.totalProfit) >= 0 ? '+' : ''}${dossier.totalProfitPercentage}% total`;
          setTotalPatrimony(formattedTotal);
          setProfitSummary(formattedProfit);
          setWalletsList(
            allPortfolios.map((p, idx) => ({
              id: p.id,
              name: p.name.toUpperCase(),
              code: p.docket_code || `•••• 00${idx + 1}`,
              balance: formattedTotal,
              profitText: formattedProfit,
              accentColor: idx % 2 === 0 ? colors.primary : colors.secondary,
            }))
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
    marketSyncService.syncAllPortfolioTickers()
      .then(() => refreshAppData())
      .catch(() => {});
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

  const balanceDisplay = redactWithAsterisks(totalPatrimony, isPrivacyMode);
  const profitDisplay = redactWithAsterisks(profitSummary, isPrivacyMode);

  // Modal: Configurações / Backup (.celsus.zip) & Perfil do Investidor
  if (isSettingsBackupModalOpen) {
    return (
      <SafeAreaView
        testID="profile-settings-modal"
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <View style={styles.sheetDragHandleContainer}>
          <View style={[styles.sheetDragHandle, isLight && styles.sheetDragHandleLight]} />
        </View>
        <SettingsBackupScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacyMode={(enabled) => setIsPrivacyMode(enabled)}
          onClose={() => setIsSettingsBackupModalOpen(false)}
          onDataRestored={() => refreshAppData()}
          themeMode={themeMode}
          onThemeModeChange={(mode) => {
            setThemeMode(mode);
            themeModeService.setThemeMode(mode);
          }}
        />
      </SafeAreaView>
    );
  }

  // Tela/Aba: Análises & Estatísticas
  if (activeTab === 'stats') {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <StatisticsScreen isPrivacyMode={isPrivacyMode} themeMode={themeMode} />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          onActionPress={() => setIsTransactionModalOpen(true)}
          onNovoAportePress={() => setIsTransactionModalOpen(true)}
          onNovaCarteiraPress={() => {
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // Modal / Tela: Carteiras & Alocação
  if (activeTab === 'wallets' || isPortfolioManagerModalOpen) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <PortfolioManagementScreen
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
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
          onNovoAportePress={() => setIsTransactionModalOpen(true)}
          onNovaCarteiraPress={() => {
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // Modal: Nova Movimentação
  if (isTransactionModalOpen) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <View style={styles.sheetDragHandleContainer}>
          <View style={[styles.sheetDragHandle, isLight && styles.sheetDragHandleLight]} />
        </View>
        <TransactionScreen
          themeMode={themeMode}
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
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <View style={styles.sheetDragHandleContainer}>
          <View style={[styles.sheetDragHandle, isLight && styles.sheetDragHandleLight]} />
        </View>
        <SimulatorScreen
          themeMode={themeMode}
          onClose={() => {
            setIsSimulatorModalOpen(false);
            refreshAppData();
          }}
          onContributionsConfirmed={() => refreshAppData()}
        />
      </SafeAreaView>
    );
  }

  // Tela: Detalhe / Histórico da Movimentação
  if (selectedRecentTransaction) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <TransactionDetailHistoryScreen
          transaction={{
            id: selectedRecentTransaction.id,
            ticker: selectedRecentTransaction.ticker,
            assetName: selectedRecentTransaction.ticker === 'PETR4' ? 'Petróleo Brasileiro S.A.' : `${selectedRecentTransaction.ticker} Ativo`,
            assetClass: selectedRecentTransaction.assetClass,
            type: selectedRecentTransaction.type,
            tradeDate: '2026-10-31',
            investedAmount: isPrivacyMode ? PRIVACY_ASTERISK_MASK : selectedRecentTransaction.amountText,
            unitPrice: 'R$ 35,00',
            quantity: '42',
            fees: 'R$ 5,00',
            portfolioName: 'Carteira Principal',
          }}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          onClose={() => setSelectedRecentTransaction(null)}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedRecentTransaction(null);
            setActiveTab(tab);
          }}
          onActionPress={() => setIsTransactionModalOpen(true)}
          onNovoAportePress={() => setIsTransactionModalOpen(true)}
          onNovaCarteiraPress={() => {
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // Tela: Extrato Completo de Movimentações (AllTransactionsScreen)
  if (isAllTransactionsModalOpen) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <AllTransactionsScreen
          transactions={transactionsList}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          onClose={() => setIsAllTransactionsModalOpen(false)}
          onSelectTransaction={(tx) => {
            setIsAllTransactionsModalOpen(false);
            setSelectedRecentTransaction(tx);
          }}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            setIsAllTransactionsModalOpen(false);
            setActiveTab(tab);
          }}
          onActionPress={() => setIsTransactionModalOpen(true)}
          onNovoAportePress={() => setIsTransactionModalOpen(true)}
          onNovaCarteiraPress={() => {
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // Tela: Detalhe da Classe (Donut Chart + Cards de Ativos)
  if (selectedClassDetail) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
        edges={['top', 'left', 'right']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <ClassDetailScreen
          assetClass={selectedClassDetail}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
          onClose={() => setSelectedClassDetail(null)}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedClassDetail(null);
            setActiveTab(tab);
          }}
          onActionPress={() => setIsTransactionModalOpen(true)}
          onNovoAportePress={() => setIsTransactionModalOpen(true)}
          onNovaCarteiraPress={() => {
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: isLight
            ? LIGHT_THEME_TOKENS.backgroundPrimary
            : colors.voidFloor,
        },
      ]}
      edges={['top', 'left', 'right']}
    >
      <View
        testID="home-screen-root"
        style={[
          styles.safeArea,
          {
            backgroundColor: isLight
              ? LIGHT_THEME_TOKENS.backgroundPrimary
              : colors.voidFloor,
          },
        ]}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />

        {/* Esfera luminosa difusa no topo sincronizada com a paleta da carteira ativa */}
        <AmbientOrb
          testID="ambient-orb"
          palette={activePalette}
          themeMode={themeMode}
        />

        <ScrollView
          testID="home-scroll-content"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Minimalista XP (Avatar + Nome na esquerda, Globo + Olho na direita) */}
          <XpMinimalHeader
            testID="xp-minimal-header"
            userName="Pedro"
            userInitials="PL"
            isPrivacyModeEnabled={isPrivacyMode}
            onAvatarPress={() => setIsSettingsBackupModalOpen(true)}
            onGlobePress={() => Alert.alert('Funcionalidade em desenvolvimento')}
            onTogglePrivacy={() => {
              const next = privacyAndAuthService.togglePrivacyMode();
              setIsPrivacyMode(next.isPrivacyModeEnabled);
            }}
            palette={activePalette}
            themeMode={themeMode}
          />

          {/* 1. Stacked Hero Wallet Deck (WalleZ Stacked Cards) */}
          <StackedWalletDeck
            portfolios={walletsList.map((w, idx) => ({
              ...w,
              balance: isPrivacyMode ? PRIVACY_ASTERISK_MASK : (idx === 0 ? balanceDisplay : w.balance),
              profitText: isPrivacyMode ? PRIVACY_ASTERISK_MASK : (idx === 0 ? profitDisplay : w.profitText),
            }))}
            activeIndex={activeWalletIndex}
            onPortfolioChange={(idx) => setActiveWalletIndex(idx)}
            testID="home-wallet-deck"
          />

          {/* 2. Três Bento Tiles de Ação Rápida com Ícones Ampliados */}
          <QuickActionBentoRow
            variant="v2"
            onAportar={() => setIsTransactionModalOpen(true)}
            onSimular={() => setIsSimulatorModalOpen(true)}
            onMais={() => Alert.alert('Funcionalidade em desenvolvimento')}
            onNovoAportePress={() => setIsTransactionModalOpen(true)}
            onNovaCarteiraPress={() => setIsPortfolioManagerModalOpen(true)}
            themeMode={themeMode}
          />

          {/* 3. Card de Movimentações Recentes Posicionado Mais Acima */}
          <RecentTransactionsCard
            transactions={transactionsList.map((tx) => ({
              ...tx,
              amountText: isPrivacyMode ? PRIVACY_ASTERISK_MASK : tx.amountText,
            }))}
            onViewAll={() => setIsAllTransactionsModalOpen(true)}
            onSelectTransaction={(tx) => setSelectedRecentTransaction(tx)}
            themeMode={themeMode}
            testID="home-recent-transactions"
          />

          {/* 4. Card de Alocação por Categoria (Dot-Matrix Category Grid v2) */}
          <DotMatrixAllocationCard
            totalBalance={balanceDisplay}
            isPrivacyMode={isPrivacyMode}
            variant="v2"
            onRebalancePress={() => setIsSimulatorModalOpen(true)}
            onClassPress={(cls) => setSelectedClassDetail(cls)}
            themeMode={themeMode}
            testID="home-dot-matrix-card"
          />
        </ScrollView>
      </View>

      {/* 7. Barra de Navegação Inferior Flutuante (Floating Bottom Dock) */}
      <FloatingBottomDock
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'wallets') {
            setActiveTab('wallets');
          } else if (tab === 'history') {
            Alert.alert('Funcionalidade em desenvolvimento');
          } else if (tab === 'stats') {
            setActiveTab('stats');
          } else {
            setActiveTab(tab);
          }
        }}
        onActionPress={() => setIsTransactionModalOpen(true)}
        onNovoAportePress={() => setIsTransactionModalOpen(true)}
        onNovaCarteiraPress={() => {
          setIsPortfolioManagerModalOpen(true);
          setActiveTab('wallets');
        }}
        onAdicionarAtivoPress={() => setIsTransactionModalOpen(true)}
        themeMode={themeMode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  sheetDragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  sheetDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3D42',
  },
  sheetDragHandleLight: {
    backgroundColor: '#D1CCC0',
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
