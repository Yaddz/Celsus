import './src/setupPolyfills';
import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Modal,
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
  CategoryAllocationData,
  LedgerInput,
  DirectiveButton,
  FloatingBottomDock,
  DockTab,
  RecentTransactionItem,
  XpMinimalHeader,
  AmbientOrb,
} from './src/components/ui';
import { AssetClass } from './src/components/ui/AttributeStatBar';
import { walletStore } from './src/stores/walletStore';
import {
  PortfolioManagementScreen,
  TransactionScreen,
  SimulatorScreen,
  StatisticsScreen,
  SettingsBackupScreen,
  ClassDetailScreen,
  ClassAssetDetailItem,
  TransactionDetailHistoryScreen,
  AllTransactionsScreen,
} from './src/screens';
import {
  redactCurrencyValue,
  redactPercentageValue,
  redactWithAsterisks,
  PRIVACY_ASTERISK_MASK,
  PRIVACY_CURRENCY_MASK,
  PRIVACY_MASK,
  privacyAndAuthService,
} from './src/services/privacyAndAuth';
import * as Font from 'expo-font';
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
import { marketApiService, MarketQuote } from './src/services/marketApi';
import { ASSET_CLASS_ATTRIBUTE_MAP } from './src/components/ui/AttributeStatBar';
import Decimal from 'decimal.js';


export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const INITIAL_CATEGORY_ALLOCATIONS: CategoryAllocationData[] = [
  { assetClass: 'FIXED_INCOME', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'FII', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'STOCK', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
  { assetClass: 'CRYPTO', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
];

function extractSyncResolvedValue<T = any>(promiseOrVal: any): T | null {
  if (!promiseOrVal) return null;
  if (typeof promiseOrVal.then !== 'function') return promiseOrVal as T;
  const util = (globalThis as any)?.__node_util__;
  if (!util || typeof util.inspect !== 'function') {
    return null;
  }
  try {
    const str = util.inspect(promiseOrVal);
    if (str.includes('<pending>') || str.includes('<rejected>')) return null;
    const start = str.indexOf('{');
    if (start === -1) return null;
    let firstBracket = -1;
    let openChar = '';
    let closeChar = '';
    for (let i = start + 1; i < str.length; i++) {
      if (str[i] === '[' || str[i] === '{') {
        firstBracket = i;
        openChar = str[i];
        closeChar = str[i] === '[' ? ']' : '}';
        break;
      }
    }
    if (firstBracket === -1) return null;
    let depth = 0;
    for (let i = firstBracket; i < str.length; i++) {
      if (str[i] === openChar) depth++;
      else if (str[i] === closeChar) {
        depth--;
        if (depth === 0) {
          const block = str.substring(firstBracket, i + 1);
          const safeJson = block
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
            .replace(/'/g, '"');
          return JSON.parse(safeJson);
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getInitialTransactions(): RecentTransactionItem[] {
  try {
    const txPromise = (transactionService as any)?.getTransactionsByPortfolio?.('default-portfolio');
    const txs = extractSyncResolvedValue<any[]>(txPromise);
    if (txs && Array.isArray(txs) && txs.length > 0) {
      return txs.slice(0, 5).map((t) => {
        const assetPromise = (assetRepository as any)?.getAssetById?.(t.asset_id);
        const asset = extractSyncResolvedValue<any>(assetPromise);
        return {
          id: t.id,
          ticker: asset?.ticker || t.ticker || 'ATIVO',
          assetClass: (asset?.asset_class as any) || 'STOCK',
          type: t.type as 'BUY' | 'SELL',
          dateText: t.trade_date,
          amountText: `R$ ${parseFloat(t.total_amount || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          unitPrice: t.unit_price ? `R$ ${parseFloat(t.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
          quantity: t.quantity ? String(t.quantity) : undefined,
          fees: t.fees ? `R$ ${parseFloat(t.fees).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
          assetName: asset?.name,
        };
      });
    }
  } catch (err) {
    console.error('[App] Failed to load initial transactions:', err);
  }
  return [];
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DockTab>('home');
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(themeModeService.getThemeMode());
  const [activeWalletIndex, setActiveWalletIndex] = useState(0);

  const activePalette = getPortfolioPalette(activeWalletIndex);
  const isLight = themeMode === 'light';

  // Modais de Navegação
  const [isPortfolioManagerModalOpen, setIsPortfolioManagerModalOpen] = useState(false);
  const [openCreatePortfolioModal, setOpenCreatePortfolioModal] = useState(false);
  const [openAddAssetModal, setOpenAddAssetModal] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionModalKey, setTransactionModalKey] = useState(0);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isSettingsBackupModalOpen, setIsSettingsBackupModalOpen] = useState(false);
  const [selectedRecentTransaction, setSelectedRecentTransaction] = useState<RecentTransactionItem | null>(null);
  const [selectedClassDetail, setSelectedClassDetail] = useState<AssetClass | null>(null);
  const [isAllTransactionsModalOpen, setIsAllTransactionsModalOpen] = useState(false);

  // Lista de Movimentações Recentes e Saldos Consolidados
  const [transactionsList, setTransactionsList] = useState<RecentTransactionItem[]>(getInitialTransactions);
  const [totalPatrimony, setTotalPatrimony] = useState('R$ 0,00');
  const [profitSummary, setProfitSummary] = useState('0,0% no ano');
  const [walletsList, setWalletsList] = useState<WalletCardData[]>([]);

  useEffect(() => {
    return walletStore.subscribe(() => {
      const state = walletStore.getState();
      if (state.activeWalletIndex !== activeWalletIndex) {
        setActiveWalletIndex(state.activeWalletIndex);
      }
    });
  }, [activeWalletIndex]);
  const [portfolioAssets, setPortfolioAssets] = useState<any[]>([]);
  const [cachedQuotes, setCachedQuotes] = useState<Record<string, MarketQuote>>({});
  const [categoryAllocations, setCategoryAllocations] = useState<CategoryAllocationData[]>(INITIAL_CATEGORY_ALLOCATIONS);
  const [isOffline, setIsOffline] = useState(false);

  const openTransactionModal = () => {
    setTransactionModalKey((k) => k + 1);
    setIsTransactionModalOpen(true);
  };

  const refreshAppData = async () => {
    try {
      // 1. Carrega dados consolidados das carteiras locais
      const allPortfolios = await portfolioRepository.listPortfolios(false);
      if (allPortfolios && allPortfolios.length > 0) {
        const quoteCacheMap: Record<string, MarketQuote> = {};
        const inputs: PortfolioConsolidationInput[] = await Promise.all(
          allPortfolios.map(async (p) => {
            const pAssets = await assetRepository.getAssetsByPortfolio(p.id);
            const pTargets = await portfolioRepository.getClassTargets(p.id);
            const mappedAssets = await Promise.all(
              pAssets.map(async (a) => {
                let quotePrice: string | null = null;
                if (a.ticker) {
                  try {
                    const normTicker = a.ticker.toUpperCase();
                    if (!quoteCacheMap[normTicker]?.currentPrice) {
                      let cached = await marketApiService.getCachedQuote(a.ticker);
                      if (!cached) {
                        try {
                          const fetched = await marketApiService.fetchQuotes([a.ticker]);
                          if (fetched && fetched.length > 0) {
                            cached = fetched[0];
                          }
                        } catch {}
                      }
                      if (cached) {
                        quoteCacheMap[normTicker] = cached;
                      }
                    }
                    if (quoteCacheMap[normTicker]?.currentPrice) {
                      quotePrice = quoteCacheMap[normTicker].currentPrice;
                    }
                  } catch (err) {
                    console.error('[App] Failed to get cached quote for', a.ticker, err);
                  }
                }
                const currentPrice = a.manual_price_override || quotePrice || a.average_price;
                return {
                  id: a.id,
                  ticker: a.ticker,
                  assetClass: a.asset_class as any,
                  quantity: a.quantity,
                  averagePrice: a.average_price,
                  currentPrice,
                };
              })
            );
            return {
              id: p.id,
              name: p.name,
              docketCode: p.docket_code,
              isArchived: p.is_archived,
              assets: mappedAssets,
              classTargets: pTargets.map((ct) => ({
                assetClass: ct.asset_class as any,
                targetPercentage: ct.target_percentage,
              })),
            };
          })
        );
        setCachedQuotes(quoteCacheMap);

        const dossier = consolidatePortfolios(inputs);
        const breakdownMap = new Map((dossier.portfolioBreakdown || []).map((b) => [b.portfolioId, b]));

        const activePortId = allPortfolios?.[activeWalletIndex]?.id || allPortfolios?.[0]?.id;
        const activeInput = inputs.find((i) => i.id === activePortId) || inputs[0];
        const homeDossier = consolidatePortfolios(activeInput ? [activeInput] : []);

        const mvNum = parseFloat(homeDossier.totalMarketValue || '0');
        const formattedTotal = `R$ ${mvNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        const profitPctStr = parseFloat(homeDossier.totalProfitPercentage || '0').toFixed(1).replace('.', ',');
        const formattedProfit = `${parseFloat(homeDossier.totalProfit || '0') >= 0 ? '+' : ''}${profitPctStr}% total`;
        setTotalPatrimony(formattedTotal);
        setProfitSummary(formattedProfit);
        setWalletsList(
          allPortfolios.map((p, idx) => {
            const b = breakdownMap.get(p.id);
            const pMv = parseFloat(b?.marketValue || '0');
            const pBalance = `R$ ${pMv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            const pProfitNum = parseFloat(b?.profit || '0');
            const pProfitPctStr = parseFloat(b?.profitPercentage || '0').toFixed(1).replace('.', ',');
            const pProfitText = `${pProfitNum >= 0 ? '+' : ''}${pProfitPctStr}% total`;
            const pal = getPortfolioPalette(idx);
            return {
              id: p.id,
              name: p.name.toUpperCase(),
              code: p.docket_code || `•••• 00${idx + 1}`,
              balance: pBalance,
              profitText: pProfitText,
              accentColor: pal.cardBg || pal.accent,
              paletteId: pal.id,
            };
          })
        );

        setCategoryAllocations([
          {
            assetClass: 'FIXED_INCOME',
            currentPercentage: parseFloat(homeDossier.classAllocation.FIXED_INCOME.currentPercentage) || 0,
            targetPercentage: parseFloat(homeDossier.classAllocation.FIXED_INCOME.weightedTargetPercentage) || 0,
            marketValue: homeDossier.classAllocation.FIXED_INCOME.marketValue,
          },
          {
            assetClass: 'FII',
            currentPercentage: parseFloat(homeDossier.classAllocation.FII.currentPercentage) || 0,
            targetPercentage: parseFloat(homeDossier.classAllocation.FII.weightedTargetPercentage) || 0,
            marketValue: homeDossier.classAllocation.FII.marketValue,
          },
          {
            assetClass: 'STOCK',
            currentPercentage: parseFloat(homeDossier.classAllocation.STOCK.currentPercentage) || 0,
            targetPercentage: parseFloat(homeDossier.classAllocation.STOCK.weightedTargetPercentage) || 0,
            marketValue: homeDossier.classAllocation.STOCK.marketValue,
          },
          {
            assetClass: 'CRYPTO',
            currentPercentage: parseFloat(homeDossier.classAllocation.CRYPTO.currentPercentage) || 0,
            targetPercentage: parseFloat(homeDossier.classAllocation.CRYPTO.weightedTargetPercentage) || 0,
            marketValue: homeDossier.classAllocation.CRYPTO.marketValue,
          },
        ]);
      } else {
        setTotalPatrimony('R$ 0,00');
        setProfitSummary('0,0% no ano');
        setWalletsList([]);
        setCategoryAllocations([
          { assetClass: 'FIXED_INCOME', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
          { assetClass: 'FII', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
          { assetClass: 'STOCK', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
          { assetClass: 'CRYPTO', currentPercentage: 0, targetPercentage: 25.0, marketValue: '0,00' },
        ]);
      }

      // 2. Carrega movimentações e ativos da carteira ativa ou primeira cadastrada
      const activePortId = allPortfolios?.[activeWalletIndex]?.id || allPortfolios?.[0]?.id;
      if (activePortId) {
        const pAssets = await assetRepository.getAssetsByPortfolio(activePortId);
        setPortfolioAssets(pAssets || []);
      } else {
        setPortfolioAssets([]);
      }

      const txs = await transactionService.getTransactionsByPortfolio(
        activePortId || 'default-portfolio'
      );
      if (txs && txs.length > 0) {
        const mapped: RecentTransactionItem[] = await Promise.all(
          txs.slice(0, 5).map(async (t) => {
            const asset = await assetRepository.getAssetById(t.asset_id);
            return {
              id: t.id,
              ticker: asset?.ticker || (t as any).ticker || 'ATIVO',
              assetClass: (asset?.asset_class as any) || 'STOCK',
              type: t.type as 'BUY' | 'SELL',
              dateText: t.trade_date,
              amountText: `R$ ${parseFloat(t.total_amount || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              unitPrice: t.unit_price ? `R$ ${parseFloat(t.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
              quantity: t.quantity ? String(t.quantity) : undefined,
              fees: t.fees ? `R$ ${parseFloat(t.fees).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
              assetName: asset?.name,
            };
          })
        );
        setTransactionsList(mapped);
      } else {
        setTransactionsList([]);
      }
    } catch (err) {
      console.error('[App] Failed to refresh app data:', err);
    }
  };

  useEffect(() => {
    // Pré-carregamento de fontes MaterialIcons para evitar layout shift
    if (MaterialIcons?.font && typeof Font?.loadAsync === 'function') {
      Font.loadAsync(MaterialIcons.font).catch(() => {});
    }

    const unsub = privacyAndAuthService.subscribe((state) => {
      setIsPrivacyMode(state.isPrivacyModeEnabled);
    });

    refreshAppData();
    if (typeof marketApiService.checkHealth === 'function') {
      marketApiService.checkHealth()
        .then((health) => {
          if (health && health.status === 'ok') {
            setIsOffline(false);
          } else {
            setIsOffline(true);
          }
        })
        .catch((err) => {
          console.error('[App] Health check failed:', err);
          setIsOffline(true);
        });
    }

    marketApiService.fetchQuotes(['PETR4'])
      .catch((err) => {
        console.error('[App] Quote fetch failed:', err);
        setIsOffline(true);
      });

    marketSyncService.syncAllPortfolioTickers()
      .then(() => {
        refreshAppData();
      })
      .catch((err) => {
        console.error('[App] Sync failed:', err);
        setIsOffline(true);
      });

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const updateActiveWalletData = async () => {
      try {
        const allPortfolios = await portfolioRepository.listPortfolios(false);
        const activePort = allPortfolios?.[activeWalletIndex] || allPortfolios?.[0];
        if (activePort && allPortfolios.length > 0) {
          const pAssets = await assetRepository.getAssetsByPortfolio(activePort.id);
          const pTargets = await portfolioRepository.getClassTargets(activePort.id);
          setPortfolioAssets(pAssets || []);

          const quoteCacheMap: Record<string, MarketQuote> = { ...cachedQuotes };
          const mappedAssets = await Promise.all(
            (pAssets || []).map(async (a) => {
              let quotePrice: string | null = null;
              if (a.ticker) {
                try {
                  const normTicker = a.ticker.toUpperCase();
                  if (!quoteCacheMap[normTicker]?.currentPrice) {
                    let cached = await marketApiService.getCachedQuote(a.ticker);
                    if (!cached) {
                      try {
                        const fetched = await marketApiService.fetchQuotes([a.ticker]);
                        if (fetched && fetched.length > 0) {
                          cached = fetched[0];
                        }
                      } catch {}
                    }
                    if (cached) {
                      quoteCacheMap[normTicker] = cached;
                    }
                  }
                  if (quoteCacheMap[normTicker]?.currentPrice) {
                    quotePrice = quoteCacheMap[normTicker].currentPrice;
                  }
                } catch (err) {
                  console.error('[App] Failed to get cached quote for active wallet:', a.ticker, err);
                }
              }
              const currentPrice = a.manual_price_override || quotePrice || a.average_price;
              return {
                id: a.id,
                ticker: a.ticker,
                assetClass: a.asset_class as any,
                quantity: a.quantity,
                averagePrice: a.average_price,
                currentPrice,
              };
            })
          );
          setCachedQuotes(quoteCacheMap);

          const activeInput: PortfolioConsolidationInput = {
            id: activePort.id,
            name: activePort.name,
            docketCode: activePort.docket_code,
            isArchived: activePort.is_archived,
            assets: mappedAssets,
            classTargets: (pTargets || []).map((ct) => ({
              assetClass: ct.asset_class as any,
              targetPercentage: ct.target_percentage,
            })),
          };

          const homeDossier = consolidatePortfolios([activeInput]);
          const mvNum = parseFloat(homeDossier.totalMarketValue || '0');
          const formattedTotal = `R$ ${mvNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          const profitPctStr = parseFloat(homeDossier.totalProfitPercentage || '0').toFixed(1).replace('.', ',');
          const formattedProfit = `${parseFloat(homeDossier.totalProfit || '0') >= 0 ? '+' : ''}${profitPctStr}% total`;
          setTotalPatrimony(formattedTotal);
          setProfitSummary(formattedProfit);

          setCategoryAllocations([
            {
              assetClass: 'FIXED_INCOME',
              currentPercentage: parseFloat(homeDossier.classAllocation.FIXED_INCOME.currentPercentage) || 0,
              targetPercentage: parseFloat(homeDossier.classAllocation.FIXED_INCOME.weightedTargetPercentage) || 0,
              marketValue: homeDossier.classAllocation.FIXED_INCOME.marketValue,
            },
            {
              assetClass: 'FII',
              currentPercentage: parseFloat(homeDossier.classAllocation.FII.currentPercentage) || 0,
              targetPercentage: parseFloat(homeDossier.classAllocation.FII.weightedTargetPercentage) || 0,
              marketValue: homeDossier.classAllocation.FII.marketValue,
            },
            {
              assetClass: 'STOCK',
              currentPercentage: parseFloat(homeDossier.classAllocation.STOCK.currentPercentage) || 0,
              targetPercentage: parseFloat(homeDossier.classAllocation.STOCK.weightedTargetPercentage) || 0,
              marketValue: homeDossier.classAllocation.STOCK.marketValue,
            },
            {
              assetClass: 'CRYPTO',
              currentPercentage: parseFloat(homeDossier.classAllocation.CRYPTO.currentPercentage) || 0,
              targetPercentage: parseFloat(homeDossier.classAllocation.CRYPTO.weightedTargetPercentage) || 0,
              marketValue: homeDossier.classAllocation.CRYPTO.marketValue,
            },
          ]);

          const txs = await transactionService.getTransactionsByPortfolio(activePort.id);
          if (txs && txs.length > 0) {
            const mapped: RecentTransactionItem[] = await Promise.all(
              txs.slice(0, 5).map(async (t) => {
                const asset = await assetRepository.getAssetById(t.asset_id);
                return {
                  id: t.id,
                  ticker: asset?.ticker || (t as any).ticker || 'ATIVO',
                  assetClass: (asset?.asset_class as any) || 'STOCK',
                  type: t.type as 'BUY' | 'SELL',
                  dateText: t.trade_date,
                  amountText: `R$ ${parseFloat(t.total_amount || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  unitPrice: t.unit_price ? `R$ ${parseFloat(t.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
                  quantity: t.quantity ? String(t.quantity) : undefined,
                  fees: t.fees ? `R$ ${parseFloat(t.fees).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : undefined,
                  assetName: asset?.name,
                };
              })
            );
            setTransactionsList(mapped);
          } else {
            setTransactionsList([]);
          }
        } else {
          setPortfolioAssets([]);
          setTransactionsList([]);
          setTotalPatrimony('R$ 0,00');
          setProfitSummary('0,0% no ano');
          setWalletsList([]);
          setCategoryAllocations(INITIAL_CATEGORY_ALLOCATIONS);
        }
      } catch (err) {
        console.error('[App] Failed to update active wallet data:', err);
      }
    };
    updateActiveWalletData();
  }, [activeWalletIndex]);

  const balanceDisplay = isPrivacyMode ? PRIVACY_CURRENCY_MASK : totalPatrimony;
  const profitDisplay = isPrivacyMode ? PRIVACY_MASK : profitSummary;

  // 1. Modal: Nova Movimentação
  if (isTransactionModalOpen) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setIsTransactionModalOpen(false);
          setOpenAddAssetModal(false);
          setOpenCreatePortfolioModal(false);
          setIsPortfolioManagerModalOpen(false);
          setActiveTab('home');
          refreshAppData();
        }}
      >
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
            key={`tx-modal-${transactionModalKey}`}
            initialPortfolioId={walletsList[activeWalletIndex]?.id}
            themeMode={themeMode}
            onClose={() => {
              setIsTransactionModalOpen(false);
              setOpenAddAssetModal(false);
              setOpenCreatePortfolioModal(false);
              setIsPortfolioManagerModalOpen(false);
              setActiveTab('home');
              refreshAppData();
            }}
            onTransactionSuccess={() => {
              setIsTransactionModalOpen(false);
              setOpenAddAssetModal(false);
              setOpenCreatePortfolioModal(false);
              setIsPortfolioManagerModalOpen(false);
              setActiveTab('home');
              refreshAppData();
            }}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  // 2. Modal: Simulador de Novo Aporte
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

  // 3. Modal: Configurações / Backup (.celsus.zip) & Perfil do Investidor
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

  // 4. Tela: Detalhe / Histórico da Movimentação ou do Ativo
  if (selectedRecentTransaction) {
    const assetHistory = transactionsList
      .filter((t) => t.ticker === selectedRecentTransaction.ticker && t.id !== selectedRecentTransaction.id)
      .map((t) => ({
        id: t.id,
        type: t.type,
        tradeDate: t.dateText,
        quantity: t.quantity || '1',
        unitPrice: t.unitPrice || t.amountText,
        totalAmount: t.amountText,
        fees: t.fees || 'R$ 0,00',
      }));

    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedRecentTransaction(null)}
      >
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
              assetName: selectedRecentTransaction.assetName || (selectedRecentTransaction.ticker === 'PETR4' ? 'Petróleo Brasileiro S.A.' : selectedRecentTransaction.ticker),
              assetClass: selectedRecentTransaction.assetClass,
              type: selectedRecentTransaction.type,
              tradeDate: selectedRecentTransaction.dateText,
              investedAmount: isPrivacyMode ? PRIVACY_ASTERISK_MASK : selectedRecentTransaction.amountText,
              unitPrice: selectedRecentTransaction.unitPrice || selectedRecentTransaction.amountText,
              quantity: selectedRecentTransaction.quantity || '1',
              fees: selectedRecentTransaction.fees || 'R$ 0,00',
              portfolioName: walletsList[activeWalletIndex]?.name || 'Carteira Principal',
            }}
            history={assetHistory}
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
            onActionPress={() => {
              setIsPortfolioManagerModalOpen(false);
              setOpenCreatePortfolioModal(false);
              setOpenAddAssetModal(false);
              setTransactionModalKey((k) => k + 1);
              setIsTransactionModalOpen(true);
            }}
            onNovoAportePress={() => {
              setIsPortfolioManagerModalOpen(false);
              setOpenCreatePortfolioModal(false);
              setOpenAddAssetModal(false);
              setTransactionModalKey((k) => k + 1);
              setIsTransactionModalOpen(true);
            }}
            onNovaCarteiraPress={() => {
              setSelectedRecentTransaction(null);
              setOpenCreatePortfolioModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            onAdicionarAtivoPress={() => {
              setSelectedRecentTransaction(null);
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            themeMode={themeMode}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  // 5. Tela: Extrato Completo de Movimentações (AllTransactionsScreen)
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
          onActionPress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovoAportePress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovaCarteiraPress={() => {
            setIsAllTransactionsModalOpen(false);
            setOpenCreatePortfolioModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => {
            setIsAllTransactionsModalOpen(false);
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // 6. Tela: Detalhe da Classe (Donut Chart + Cards de Ativos)
  if (selectedClassDetail) {
    const classAssetsForDetail: ClassAssetDetailItem[] = portfolioAssets
      .filter((a) => a.asset_class === selectedClassDetail)
      .map((a) => {
        const qtyDec = new Decimal(a.quantity || '0');
        const avgDec = new Decimal(a.average_price || '0');
        const investedDec = qtyDec.mul(avgDec);
        const cached = cachedQuotes[a.ticker?.toUpperCase()] || null;
        const currentPriceDec = cached?.currentPrice
          ? new Decimal(cached.currentPrice)
          : (a.manual_price_override ? new Decimal(a.manual_price_override) : avgDec);
        const grossDec = qtyDec.mul(currentPriceDec);
        const profitDec = grossDec.minus(investedDec);
        const profitPctDec = investedDec.gt(0) ? profitDec.div(investedDec).mul(100) : new Decimal(0);
        const isPos = profitDec.gte(0);

        return {
          id: a.id,
          ticker: a.ticker,
          name: a.name || a.ticker,
          assetClass: a.asset_class as AssetClass,
          currentAllocationPercentage: a.target_percentage_in_class || 100,
          grossBalance: `R$ ${grossDec.toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          quantity: a.quantity,
          averagePrice: `R$ ${avgDec.toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          currentPrice: `R$ ${currentPriceDec.toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          profitabilityPercentage: `${isPos ? '+' : ''}${profitPctDec.toFixed(2).replace('.', ',')}%`,
          profitabilityAmount: `${isPos ? '+' : '-'}R$ ${profitDec.abs().toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          sliceColor: ASSET_CLASS_ATTRIBUTE_MAP[a.asset_class as AssetClass]?.color || colors.primary,
        };
      });

    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedClassDetail(null)}
      >
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
            assets={classAssetsForDetail}
            isPrivacyMode={isPrivacyMode}
            themeMode={themeMode}
            onClose={() => setSelectedClassDetail(null)}
            onAssetPress={async (tickerOrId) => {
              try {
                const allPortfolios = await portfolioRepository.listPortfolios(false);
                const activePortId = allPortfolios?.[activeWalletIndex]?.id || allPortfolios?.[0]?.id;
                let targetAsset: any = null;
                if (activePortId) {
                  const pAssets = await assetRepository.getAssetsByPortfolio(activePortId);
                  targetAsset = pAssets.find((a) => a.id === tickerOrId || a.ticker === tickerOrId);
                }
                const ticker = targetAsset?.ticker || tickerOrId;
                const name = targetAsset?.name || ticker;
                const qty = targetAsset?.quantity || '0';
                const avgPrice = targetAsset?.average_price || '0.00';
                const invested = (parseFloat(qty) * parseFloat(avgPrice)).toFixed(2);
                setSelectedRecentTransaction({
                  id: `asset-detail-${ticker}`,
                  ticker: ticker,
                  assetName: name,
                  assetClass: (targetAsset?.asset_class as AssetClass) || selectedClassDetail,
                  type: 'BUY',
                  dateText: new Date().toLocaleDateString('pt-BR'),
                  amountText: `R$ ${parseFloat(invested).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  unitPrice: `R$ ${parseFloat(avgPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  quantity: qty,
                  fees: 'R$ 0,00',
                });
              } catch (err) {
                console.error('[App] Failed to load asset onAssetPress:', err);
                setSelectedRecentTransaction({
                  id: `asset-detail-${tickerOrId}`,
                  ticker: tickerOrId,
                  assetClass: selectedClassDetail,
                  type: 'BUY',
                  dateText: new Date().toLocaleDateString('pt-BR'),
                  amountText: 'R$ 0,00',
                  unitPrice: 'R$ 0,00',
                  quantity: '0',
                  fees: 'R$ 0,00',
                });
              }
            }}
          />
          <FloatingBottomDock
            activeTab={activeTab}
            onTabChange={(tab) => {
              setSelectedClassDetail(null);
              setActiveTab(tab);
            }}
            onActionPress={() => {
              setIsPortfolioManagerModalOpen(false);
              setOpenCreatePortfolioModal(false);
              setOpenAddAssetModal(false);
              setTransactionModalKey((k) => k + 1);
              setIsTransactionModalOpen(true);
            }}
            onNovoAportePress={() => {
              setIsPortfolioManagerModalOpen(false);
              setOpenCreatePortfolioModal(false);
              setOpenAddAssetModal(false);
              setTransactionModalKey((k) => k + 1);
              setIsTransactionModalOpen(true);
            }}
            onNovaCarteiraPress={() => {
              setSelectedClassDetail(null);
              setOpenCreatePortfolioModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            onAdicionarAtivoPress={() => {
              setSelectedClassDetail(null);
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            themeMode={themeMode}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  // 7. Modal / Tela: Carteiras & Alocação
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
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          themeMode={themeMode}
          initialActiveIndex={activeWalletIndex}
          autoOpenNewPortfolioModal={openCreatePortfolioModal}
          autoOpenAddAssetModal={openAddAssetModal}
          onPortfolioIndexChange={(idx) => setActiveWalletIndex(idx)}
          onClose={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setActiveTab('home');
            refreshAppData();
          }}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          onTabChange={(tab) => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setActiveTab(tab);
          }}
          onActionPress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovoAportePress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovaCarteiraPress={() => {
            setOpenCreatePortfolioModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => {
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          themeMode={themeMode}
        />
      </SafeAreaView>
    );
  }

  // 8. Tela/Aba: Análises & Estatísticas
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
          onActionPress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovoAportePress={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            openTransactionModal();
          }}
          onNovaCarteiraPress={() => {
            setOpenCreatePortfolioModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
          onAdicionarAtivoPress={() => {
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
            setActiveTab('wallets');
          }}
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

        <ScrollView
          testID="home-scroll-view"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isOffline && (
            <View testID="market-status-indicator" style={styles.offlineBanner}>
              <MaterialIcons name="cloud-off" size={16} color={colors.secondary} />
              <Text style={styles.offlineBannerText}>Modo Offline • Exibindo dados locais em cache</Text>
            </View>
          )}

          {/* 1. Stacked Hero Wallet Deck (WalleZ Stacked Cards) */}
          <StackedWalletDeck
            portfolios={walletsList.map((w, idx) => ({
              ...w,
              balance: isPrivacyMode ? PRIVACY_CURRENCY_MASK : (walletsList.length === 1 && idx === 0 ? balanceDisplay : w.balance),
              profitText: isPrivacyMode ? PRIVACY_MASK : (walletsList.length === 1 && idx === 0 ? profitDisplay : w.profitText),
            }))}
            activeIndex={activeWalletIndex}
            onPortfolioChange={(idx, item) => {
              if (item?.id && item.id !== '__add_wallet_card__') {
                setActiveWalletIndex(idx);
                walletStore.setActiveIndex(idx, item.id);
              }
            }}
            onCreatePortfolioPress={() => {
              setOpenCreatePortfolioModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            isPrivacyMode={isPrivacyMode}
            testID="home-wallet-deck"
          />

          {/* 1.1 Indicador Acessível de Carteiras na Home (Alternativa ao gesto) */}
          {walletsList.length > 0 && (
            <View
              style={styles.accessiblePageIndicator}
              testID="home-wallet-pills"
              accessibilityRole="tablist"
              accessibilityLabel="Indicador de carteiras"
            >
              {walletsList.map((w, idx) => {
                const isSelected = idx === activeWalletIndex;
                const pal = getPortfolioPalette(idx);
                return (
                  <TouchableOpacity
                    key={w.id}
                    testID={`home-wallet-pill-${w.id}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={w.name}
                    activeOpacity={0.8}
                    hitSlop={{ top: 19, bottom: 19, left: 19, right: 19 }}
                    onPress={() => {
                      setActiveWalletIndex(idx);
                      walletStore.setActiveIndex(idx, w.id);
                    }}
                    style={[
                      styles.pageDot,
                      isSelected && [styles.pageDotActive, { backgroundColor: pal.accent }],
                    ]}
                  />
                );
              })}
            </View>
          )}

          {/* 2. Três Bento Tiles de Ação Rápida com Ícones Ampliados */}
          <QuickActionBentoRow
            variant="v2"
            onAportar={openTransactionModal}
            onSimular={() => setIsSimulatorModalOpen(true)}
            onMais={() => Alert.alert('Funcionalidade em desenvolvimento')}
            onNovoAportePress={openTransactionModal}
            onNovaCarteiraPress={() => {
              setOpenCreatePortfolioModal(true);
              setIsPortfolioManagerModalOpen(true);
              setActiveTab('wallets');
            }}
            themeMode={themeMode}
          />

          {/* 3. Card de Movimentações Recentes Posicionado Mais Acima */}
          <RecentTransactionsCard
            transactions={transactionsList.map((tx) => ({
              ...tx,
              amountText: isPrivacyMode ? PRIVACY_CURRENCY_MASK : tx.amountText,
            }))}
            onViewAll={() => setIsAllTransactionsModalOpen(true)}
            onSelectTransaction={(tx) => setSelectedRecentTransaction(tx)}
            themeMode={themeMode}
            testID="home-recent-transactions"
          />

          {/* 4. Card de Alocação por Categoria (Dot-Matrix Category Grid v2) */}
          <DotMatrixAllocationCard
            totalBalance={balanceDisplay}
            allocations={categoryAllocations}
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
        onActionPress={openTransactionModal}
        onNovoAportePress={openTransactionModal}
        onNovaCarteiraPress={() => {
          setOpenCreatePortfolioModal(true);
          setIsPortfolioManagerModalOpen(true);
          setActiveTab('wallets');
        }}
        onAdicionarAtivoPress={() => {
          setOpenAddAssetModal(true);
          setIsPortfolioManagerModalOpen(true);
          setActiveTab('wallets');
        }}
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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1F1D',
    borderWidth: 1,
    borderColor: '#593B33',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  offlineBannerText: {
    color: '#D4A373',
    fontSize: 12,
    fontWeight: '500',
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
    paddingHorizontal: spacing.md,
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
  accessiblePageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
    minHeight: 12,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  pageDotActive: {
    width: 18,
    borderRadius: 3,
  },
});
