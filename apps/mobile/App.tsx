import './src/setupPolyfills';
import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Alert, Modal, BackHandler } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders, layout } from './src/theme/tokens';
import {
  StackedWalletDeck,
  AnimatedModalSheet,
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
  GoalProgressTile,
  GoalEditorSheet,
  HomeIncomeTile,
  BentoRow,
} from './src/components/ui';
import { AssetClass } from './src/components/ui/AttributeStatBar';
import { walletStore } from './src/stores/walletStore';
import { walletsStore, useWallets } from './src/stores/walletsStore';
import { useHeaderScrollFade } from './src/hooks/useHeaderScrollFade';
import { waitRemaining } from './src/utils/minLoading';
import { spreadsheetImportService } from './src/services/spreadsheetImportService';
import { resolveBackAction, BackState } from './src/navigation/backNavigation';
import { AppGate } from './src/components/AppGate';
import { sessionStore } from './src/stores/sessionStore';
import { useProfile, profileStore } from './src/stores/profileStore';
import { deriveInitials } from './src/domain/profile';
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
  SearchAssetsScreen,
  AssetDetailScreen,
} from './src/screens';
import { B3ImportScreen } from './src/screens/B3ImportScreen';
import { B3ImportSheet } from './src/components/B3ImportSheet';
import { IncomeHistoryScreen } from './src/screens/IncomeHistoryScreen';
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
import { transactionRepository } from './src/repositories/transactionRepository';
import { incomeRepository } from './src/repositories/incomeRepository';
import { summarizeIncome } from './src/domain/finance/income';
import { marketApiService, MarketQuote } from './src/services/marketApi';
import { ASSET_CLASS_ATTRIBUTE_MAP } from './src/components/ui/AttributeStatBar';
import Decimal from 'decimal.js';


/** Tema atual para quem desenha fora do AppContent (bloqueio e onboarding). */
function useGlobalThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(themeModeService.getThemeMode());
  useEffect(() => {
    const unsubscribe = themeModeService.subscribe(setMode);
    // Tema salvo no aparelho. No Jest o tema começa sempre escuro (as suítes contam com isso).
    if (process.env.NODE_ENV !== 'test') themeModeService.hydrate().then(setMode).catch(() => {});
    return unsubscribe;
  }, []);
  return mode;
}

export default function App() {
  const themeMode = useGlobalThemeMode();
  const [initialAction, setInitialAction] = useState<'import_b3' | 'create_wallet' | 'explore' | null>(null);

  // Nome e iniciais do perfil para a tela de bloqueio, os headers e o Perfil (antes ninguém carregava
  // o perfil na abertura e o bloqueio mostrava "Investidor").
  // No Jest fica de fora: a leitura assíncrona atravessava o reset de banco entre as suítes de tela.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'test') profileStore.ensureLoaded().catch(() => {});
  }, []);
  return (
    <SafeAreaProvider>
      {/* No app real o onboarding roda (nome, PIN opcional, digital). As suítes antigas de telas montam
          <App /> direto na Home, então só no Jest o portão pula o onboarding. */}
      <AppGate
        themeMode={themeMode}
        bypassOnboardingUntilSprint44={process.env.NODE_ENV === 'test'}
        onOnboardingComplete={(action) => {
          if (action) setInitialAction(action);
        }}
      >
        <AppContent
          initialAction={initialAction}
          onClearInitialAction={() => setInitialAction(null)}
        />
      </AppGate>
    </SafeAreaProvider>
  );
}

/** Sem carteira (ou carteira ainda sem metas): nenhuma categoria; o bento mostra o estado vazio. */
const INITIAL_CATEGORY_ALLOCATIONS: CategoryAllocationData[] = [];

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

function AppContent(props: {
  initialAction?: 'import_b3' | 'create_wallet' | 'explore' | null;
  onClearInitialAction?: () => void;
} = {}) {
  const insets = useSafeAreaInsets();
  const { name: profileName, initials: profileInitials } = useProfile();
  const [activeTab, setActiveTab] = useState<DockTab>('home');
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(themeModeService.getThemeMode());
  // O tema salvo é lido no início (hydrate) e pode mudar fora daqui: acompanha o serviço.
  useEffect(() => themeModeService.subscribe(setThemeMode), []);
  useEffect(() => {
    profileStore.ensureLoaded().catch(() => {});
  }, []);
  const [activeWalletIndex, setActiveWalletIndex] = useState(0);

  const activePalette = getPortfolioPalette(activeWalletIndex);
  const isLight = themeMode === 'light';

  // Modais de Navegação
  const [isPortfolioManagerModalOpen, setIsPortfolioManagerModalOpen] = useState(() => props.initialAction === 'create_wallet');
  const [openCreatePortfolioModal, setOpenCreatePortfolioModal] = useState(() => props.initialAction === 'create_wallet');
  const [openAddAssetModal, setOpenAddAssetModal] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionModalKey, setTransactionModalKey] = useState(0);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isSettingsBackupModalOpen, setIsSettingsBackupModalOpen] = useState(false);
  const [isB3ImportOpen, setIsB3ImportOpen] = useState(() => props.initialAction === 'import_b3');
  const [isIncomeHistoryOpen, setIsIncomeHistoryOpen] = useState(false);
  const [selectedRecentTransaction, setSelectedRecentTransaction] = useState<RecentTransactionItem | null>(null);
  const [selectedClassDetail, setSelectedClassDetail] = useState<AssetClass | null>(null);
  const [selectedAssetTicker, setSelectedAssetTicker] = useState<string | null>(null);
  const [b3ImportKey, setB3ImportKey] = useState(0);
  const [prefillAsset, setPrefillAsset] = useState<{
    ticker: string;
    name: string;
    assetClass: AssetClass;
    price?: string;
  } | null>(null);
  const [isAllTransactionsModalOpen, setIsAllTransactionsModalOpen] = useState(false);

  // Lista de Movimentações Recentes e Saldos Consolidados
  const [transactionsList, setTransactionsList] = useState<RecentTransactionItem[]>(getInitialTransactions);
  const [totalPatrimony, setTotalPatrimony] = useState('R$ 0,00');
  const [profitSummary, setProfitSummary] = useState('0,0% no ano');
  const [homeIncomeTotal, setHomeIncomeTotal] = useState('0.00');
  // Lista de carteiras: fonte única compartilhada com a página de Carteiras (walletsStore).
  const { wallets: walletsList, loaded: walletsLoaded } = useWallets();
  const setWalletsList = (wallets: WalletCardData[]) => walletsStore.setWallets(wallets);

  useEffect(() => {
    return walletStore.subscribe(() => {
      const state = walletStore.getState();
      if (state.activeWalletIndex !== activeWalletIndex) {
        setActiveWalletIndex(state.activeWalletIndex);
      }
    });
  }, [activeWalletIndex]);
  const [portfolioAssets, setPortfolioAssets] = useState<any[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [homeMarketValue, setHomeMarketValue] = useState('0');
  const [goalInfo, setGoalInfo] = useState<{ goal: string | null; monthly: string | null }>({ goal: null, monthly: null });
  const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
  const walletLoadSeq = React.useRef(0);
  // true entre o início e o fim do carregamento de uma carteira recém-selecionada (mostra skeletons).
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const failedQuoteTickers = React.useRef<Set<string>>(new Set());
  const lastLoadedWalletIndex = React.useRef<number | null>(null);
  const { scrollY: homeScrollY, scrollProps: homeScrollProps } = useHeaderScrollFade();
  const [cachedQuotes, setCachedQuotes] = useState<Record<string, MarketQuote>>({});
  const [categoryAllocations, setCategoryAllocations] = useState<CategoryAllocationData[]>(INITIAL_CATEGORY_ALLOCATIONS);
  const [isOffline, setIsOffline] = useState(false);

  const openTransactionModal = useCallback(() => {
    setTransactionModalKey((k) => k + 1);
    setIsTransactionModalOpen(true);
  }, []);

  // Semente da carteira AUVP (index.ts): recarrega a Home quando a importação inicial terminar.
  const refreshAppDataRef = React.useRef<() => void>(() => {});
  useEffect(() => spreadsheetImportService.onImported(() => refreshAppDataRef.current()), []);

  const refreshAppData = async () => {
    try {
      // 1. Carrega dados consolidados das carteiras locais
      const allPortfolios = await portfolioRepository.listPortfolios(false);
      if (allPortfolios && allPortfolios.length > 0) {
        // Ativos e metas de todas as carteiras em paralelo; cotações resolvidas UMA vez por ticker:
        // cache local primeiro e, para o que faltar, uma única chamada de rede em lote (antes era
        // 1 requisição por ativo sem cache, repetida a cada fechamento de modal).
        const loaded = await Promise.all(
          allPortfolios.map(async (p) => {
            const [pAssets, pTargets] = await Promise.all([
              assetRepository.getAssetsByPortfolio(p.id),
              portfolioRepository.getClassTargets(p.id),
            ]);
            return { p, pAssets, pTargets };
          })
        );
        const quoteCacheMap: Record<string, MarketQuote> = {};
        const allTickers = Array.from(
          new Set(
            loaded.flatMap(({ pAssets }) =>
              pAssets.map((a) => a.ticker?.toUpperCase()).filter((t): t is string => !!t)
            )
          )
        );
        const missing: string[] = [];
        await Promise.all(
          allTickers.map(async (t) => {
            try {
              const cached = await marketApiService.getCachedQuote(t);
              if (cached?.currentPrice) quoteCacheMap[t] = cached;
              else if (!failedQuoteTickers.current.has(t)) missing.push(t);
            } catch (err) {
              console.error('[App] Failed to get cached quote for', t, err);
            }
          })
        );
        if (missing.length > 0) {
          try {
            const fetched = await marketApiService.fetchQuotes(missing);
            const got = new Set<string>();
            for (const q of fetched || []) {
              const key = q.ticker.toUpperCase();
              quoteCacheMap[key] = q;
              got.add(key);
            }
            missing.forEach((t) => !got.has(t) && failedQuoteTickers.current.add(t));
          } catch {
            missing.forEach((t) => failedQuoteTickers.current.add(t));
          }
        }
        const inputs: PortfolioConsolidationInput[] = loaded.map(({ p, pAssets, pTargets }) => ({
          id: p.id,
          name: p.name,
          docketCode: p.docket_code,
          isArchived: p.is_archived,
          assets: pAssets.map((a) => {
            const quotePrice = a.ticker ? quoteCacheMap[a.ticker.toUpperCase()]?.currentPrice ?? null : null;
            return {
              id: a.id,
              ticker: a.ticker,
              assetClass: a.asset_class as any,
              quantity: a.quantity,
              averagePrice: a.average_price,
              currentPrice: a.manual_price_override || quotePrice || a.average_price,
            };
          }),
          classTargets: pTargets.map((ct) => ({
            assetClass: ct.asset_class as any,
            targetPercentage: ct.target_percentage,
          })),
        }));
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
      let activeAssets: any[] = [];
      if (activePortId) {
        activeAssets = (await assetRepository.getAssetsByPortfolio(activePortId)) || [];
      }
      setPortfolioAssets(activeAssets);

      const txs = await transactionRepository.getAllTransactions();
      if (txs && txs.length > 0) {
        // Ativos já carregados: evita 1 consulta ao banco por movimentação.
        const assetById = new Map(activeAssets.map((a) => [a.id, a]));
        const mapped: RecentTransactionItem[] = await Promise.all(
          txs.map(async (t) => {
            const asset = assetById.get(t.asset_id) ?? (await assetRepository.getAssetById(t.asset_id));
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

      // Carrega proventos para o tile da Home
      try {
        const rows = activePortId
          ? await incomeRepository.listByPortfolio(activePortId)
          : await incomeRepository.listAll();
        const mappedIncs = rows.map((r) => ({ date: r.pay_date, amount: r.amount }));
        const incSummary = summarizeIncome(mappedIncs, new Date().toISOString().slice(0, 10));
        setHomeIncomeTotal(incSummary.totalYear);
      } catch {
        setHomeIncomeTotal('0.00');
      }
    } catch (err) {
      console.error('[App] Failed to refresh app data:', err);
    }
  };
  refreshAppDataRef.current = refreshAppData;
  // Outras telas (ex.: Carteiras) pedem recarga da lista após criar/excluir.
  useEffect(() => walletsStore.registerRefresher(() => refreshAppDataRef.current()), []);

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
      // Cada troca de carteira invalida carregamentos anteriores (evita dado atrasado da carteira antiga)
      // e limpa a visão antes de buscar, para nada da carteira anterior permanecer na tela.
      const reqId = ++walletLoadSeq.current;
      const loadStartedAt = Date.now();
      const isStale = () => reqId !== walletLoadSeq.current;
      // A troca marca "carregando" (skeleton) sem limpar dados: o skeleton cobre o conteúdo antigo e
      // todos os valores novos entram de uma vez no fim (1 commit), em vez de reset + vários commits.
      const didSwitch =
        lastLoadedWalletIndex.current !== null && lastLoadedWalletIndex.current !== activeWalletIndex;
      if (didSwitch) {
        setIsWalletLoading(true);
      }
      const apply: Array<() => void> = [];
      lastLoadedWalletIndex.current = activeWalletIndex;
      try {
        const allPortfolios = await portfolioRepository.listPortfolios(false);
        const activePort = allPortfolios?.[activeWalletIndex] || allPortfolios?.[0];
        if (isStale()) return;
        if (activePort && allPortfolios.length > 0) {
          const pAssets = await assetRepository.getAssetsByPortfolio(activePort.id);
          const pTargets = await portfolioRepository.getClassTargets(activePort.id);
          if (isStale()) return;
          apply.push(() => setPortfolioAssets(pAssets || []));

          // Cotações em lote: 1 leitura de cache por ticker novo e UMA única chamada de rede para os que
          // faltam (antes: 1 requisição por ativo a cada troca de carteira). Tickers que já falharam nesta
          // sessão não são consultados de novo; a sincronização periódica cuida deles.
          const quoteCacheMap: Record<string, MarketQuote> = { ...cachedQuotes };
          const tickersNeeded = Array.from(
            new Set((pAssets || []).map((a) => a.ticker?.toUpperCase()).filter((t): t is string => !!t))
          ).filter((t) => !quoteCacheMap[t]?.currentPrice);
          const stillMissing: string[] = [];
          for (const t of tickersNeeded) {
            try {
              const cached = await marketApiService.getCachedQuote(t);
              if (cached) quoteCacheMap[t] = cached;
              else if (!failedQuoteTickers.current.has(t)) stillMissing.push(t);
            } catch (err) {
              console.error('[App] Failed to get cached quote for active wallet:', t, err);
            }
          }
          if (stillMissing.length > 0) {
            try {
              const fetched = await marketApiService.fetchQuotes(stillMissing);
              const got = new Set<string>();
              for (const q of fetched || []) {
                const key = q.ticker.toUpperCase();
                quoteCacheMap[key] = q;
                got.add(key);
              }
              stillMissing.forEach((t) => !got.has(t) && failedQuoteTickers.current.add(t));
            } catch {
              stillMissing.forEach((t) => failedQuoteTickers.current.add(t));
            }
          }
          if (isStale()) return;
          const mappedAssets = (pAssets || []).map((a) => {
            const quotePrice = a.ticker ? quoteCacheMap[a.ticker.toUpperCase()]?.currentPrice ?? null : null;
            return {
              id: a.id,
              ticker: a.ticker,
              assetClass: a.asset_class as any,
              quantity: a.quantity,
              averagePrice: a.average_price,
              currentPrice: a.manual_price_override || quotePrice || a.average_price,
            };
          });
          apply.push(() => setCachedQuotes(quoteCacheMap));
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
          apply.push(() => setTotalPatrimony(formattedTotal));
          apply.push(() => setProfitSummary(formattedProfit));
          apply.push(() => setActivePortfolioId(activePort.id));
          apply.push(() => setHomeMarketValue(String(mvNum)));
          apply.push(() => setGoalInfo({
            goal: (activePort as any).patrimony_goal ?? null,
            monthly: (activePort as any).monthly_contribution ?? null,
          }));

          apply.push(() => setCategoryAllocations([
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
          ]));
          const txs = await transactionRepository.getAllTransactions();
          if (isStale()) return;
          if (txs && txs.length > 0) {
            // Ativos já carregados acima: evita 1 consulta ao banco por movimentação.
            const assetById = new Map((pAssets || []).map((a) => [a.id, a]));
            const mapped: RecentTransactionItem[] = await Promise.all(
              txs.map(async (t) => {
                const asset = assetById.get(t.asset_id) ?? (await assetRepository.getAssetById(t.asset_id));
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
            apply.push(() => setTransactionsList(mapped));
          } else {
            apply.push(() => setTransactionsList([]));
          }

          try {
            const rows = activePort.id
              ? await incomeRepository.listByPortfolio(activePort.id)
              : await incomeRepository.listAll();
            const mappedIncs = rows.map((r) => ({ date: r.pay_date, amount: r.amount }));
            const incSummary = summarizeIncome(mappedIncs, new Date().toISOString().slice(0, 10));
            apply.push(() => setHomeIncomeTotal(incSummary.totalYear));
          } catch {
            apply.push(() => setHomeIncomeTotal('0.00'));
          }
        } else {
          // Sem carteiras: a lista de movimentações vem de refreshAppData (não apagar aqui, evita corrida).
          apply.push(() => setPortfolioAssets([]));
          apply.push(() => setTotalPatrimony('R$ 0,00'));
          apply.push(() => setProfitSummary('0,0% no ano'));
          apply.push(() => setWalletsList([]));
          apply.push(() => setCategoryAllocations(INITIAL_CATEGORY_ALLOCATIONS));
        }
      } catch (err) {
        console.error('[App] Failed to update active wallet data:', err);
      } finally {
        if (!isStale()) {
          // O tempo mínimo do skeleton só vale na troca de carteira; a 1ª carga aplica na hora.
          if (didSwitch) await waitRemaining(loadStartedAt);
          if (!isStale()) {
            // Um único commit com todos os dados novos, em transição: o gesto e as animações seguem
            // fluidos enquanto o React prepara a nova árvore.
            startTransition(() => {
              apply.forEach((fn) => fn());
              setIsWalletLoading(false);
            });
          }
        }
      }
    };
    updateActiveWalletData();
  }, [activeWalletIndex]);

  const balanceDisplay = isPrivacyMode ? PRIVACY_CURRENCY_MASK : totalPatrimony;
  const profitDisplay = isPrivacyMode ? PRIVACY_MASK : profitSummary;

  // Botão/gesto voltar do Android: só fecha o app na Home sem camadas abertas.
  // A decisão está em navigation/backNavigation.ts (função pura, com matriz de testes).
  const backStateRef = React.useRef<BackState>({} as BackState);
  backStateRef.current = {
    isLocked: sessionStore.getState().status === 'locked',
    activeTab,
    isSettingsOpen: isSettingsBackupModalOpen,
    isB3ImportOpen,
    isIncomeHistoryOpen,
    isTransactionDetailOpen: selectedRecentTransaction !== null,
    isAllTransactionsOpen: isAllTransactionsModalOpen,
    isClassDetailOpen: selectedClassDetail !== null,
    isAssetDetailOpen: selectedAssetTicker !== null,
    isTransactionModalOpen,
    isPortfolioManagerOpen: isPortfolioManagerModalOpen,
    isSimulatorOpen: isSimulatorModalOpen,
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = resolveBackAction(backStateRef.current);
      switch (action) {
        case 'minimize':
          BackHandler.exitApp();
          return true;
        case 'close-b3-import':
          setIsB3ImportOpen(false);
          return true;
        case 'close-income-history':
          setIsIncomeHistoryOpen(false);
          return true;
        case 'close-transaction-modal':
          setIsTransactionModalOpen(false);
          return true;
        case 'close-simulator':
          setIsSimulatorModalOpen(false);
          return true;
        case 'close-portfolio-manager':
          setIsPortfolioManagerModalOpen(false);
          setOpenCreatePortfolioModal(false);
          setOpenAddAssetModal(false);
          return true;
        case 'close-settings':
          setIsSettingsBackupModalOpen(false);
          return true;
        case 'close-transaction-detail':
          setSelectedRecentTransaction(null);
          return true;
        case 'close-asset-detail':
          setSelectedAssetTicker(null);
          return true;
        case 'close-all-transactions':
          setIsAllTransactionsModalOpen(false);
          return true;
        case 'close-class-detail':
          setSelectedClassDetail(null);
          return true;
        case 'go-home':
          setActiveTab('home');
          return true;
        default:
          return false; // Home sem camadas: deixa o sistema fechar o app
      }
    });
    return () => sub.remove();
  }, []);

  // Lista do baralho memoizada: sem isso um array novo era criado a cada render do App
  // (inclusive durante o gesto), forçando o baralho a recalcular as cartas.
  const deckPortfolios = useMemo(
    () =>
      walletsList.map((w, idx) => ({
        ...w,
        balance: isPrivacyMode
          ? PRIVACY_CURRENCY_MASK
          : walletsList.length === 1 && idx === 0
          ? balanceDisplay
          : w.balance,
        profitText: isPrivacyMode
          ? PRIVACY_MASK
          : walletsList.length === 1 && idx === 0
          ? profitDisplay
          : w.profitText,
      })),
    [walletsList, isPrivacyMode, balanceDisplay, profitDisplay]
  );
  // Callbacks estáveis da Home: com React.memo nos blocos, a troca de carteira só re-renderiza o que mudou.
  const activePortfolioIdRef = React.useRef<string | null>(null);
  activePortfolioIdRef.current = activePortfolioId;
  const homeOpenSettings = useCallback(() => setIsSettingsBackupModalOpen(true), []);
  const homeGlobePress = useCallback(() => Alert.alert('Funcionalidade em desenvolvimento'), []);
  const homeTogglePrivacy = useCallback(() => {
    const next = privacyAndAuthService.togglePrivacyMode();
    setIsPrivacyMode(next.isPrivacyModeEnabled);
  }, []);
  const homeOpenCreatePortfolio = useCallback(() => {
    setOpenCreatePortfolioModal(true);
    setIsPortfolioManagerModalOpen(true);
  }, []);
  const homeOpenAddAsset = useCallback(() => {
    setOpenAddAssetModal(true);
    setIsPortfolioManagerModalOpen(true);
  }, []);
  const homeOpenSimulator = useCallback(() => setIsSimulatorModalOpen(true), []);
  const homeOpenClass = useCallback((cls: AssetClass) => setSelectedClassDetail(cls), []);
  const homeViewAll = useCallback(() => setIsAllTransactionsModalOpen(true), []);
  const homeSelectTx = useCallback((tx: RecentTransactionItem) => setSelectedRecentTransaction(tx), []);
  const homeGoalPress = useCallback(() => {
    if (activePortfolioIdRef.current) setIsGoalEditorOpen(true);
  }, []);
  const homeTabChange = useCallback((tab: DockTab) => {
    setActiveTab(tab);
  }, []);
  const maskedRecentTransactions = useMemo(
    () =>
      transactionsList.slice(0, 5).map((tx) => ({
        ...tx,
        amountText: isPrivacyMode ? PRIVACY_CURRENCY_MASK : tx.amountText,
      })),
    [transactionsList, isPrivacyMode]
  );

  const handleDeckPortfolioChange = useCallback((idx: number, item: any) => {
    if (item?.id && item.id !== '__add_wallet_card__') {
      // O store notifica App/Carteiras/Análises; um único caminho de atualização.
      walletStore.setActiveIndex(idx, item.id);
    }
  }, []);

  // Modal Helpers (Bottom Sheets sobre qualquer tela)
  const renderTransactionModal = () => (
    <AnimatedModalSheet
      testID="transaction-modal-sheet"
      visible={isTransactionModalOpen}
      onClose={() => {
        setIsTransactionModalOpen(false);
        refreshAppData();
      }}
      themeMode={themeMode}
      fill maxHeight={0.88}
      contentStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
    >
      <TransactionScreen
        isPrivacyMode={isPrivacyMode}
        key={`tx-modal-${transactionModalKey}`}
        initialPortfolioId={walletsList[activeWalletIndex]?.id}
        themeMode={themeMode}
        onClose={() => {
          setIsTransactionModalOpen(false);
          refreshAppData();
        }}
        onTransactionSuccess={() => {
          setIsTransactionModalOpen(false);
          refreshAppData();
        }}
      />
    </AnimatedModalSheet>
  );

  // Limpa os gatilhos dos sub-modais (Nova Carteira / Adicionar Ativo) do menu "+".
  // Sem isso, escolher a mesma opção de novo não mudava nenhum estado e nada abria.
  const resetSubModalTriggers = () => {
    setIsPortfolioManagerModalOpen(false);
    setOpenCreatePortfolioModal(false);
    setOpenAddAssetModal(false);
    setPrefillAsset(null);
    refreshAppData();
  };

  const renderPortfolioManagerModal = () => {
    if (!isPortfolioManagerModalOpen || activeTab === 'wallets') return null;

    const isSubModalOnly = openCreatePortfolioModal || openAddAssetModal || prefillAsset !== null;

    if (isSubModalOnly) {
      return (
        <PortfolioManagementScreen
          modalOnly={true}
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          onProfilePress={() => setIsSettingsBackupModalOpen(true)}
          themeMode={themeMode}
          initialActiveIndex={activeWalletIndex}
          autoOpenNewPortfolioModal={openCreatePortfolioModal}
          autoOpenAddAssetModal={openAddAssetModal || prefillAsset !== null}
          prefillAsset={prefillAsset}
          onSubModalClosed={resetSubModalTriggers}
          onPortfolioIndexChange={(idx) => setActiveWalletIndex(idx)}
          onPortfolioCreated={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setPrefillAsset(null);
            setActiveTab('wallets');
            refreshAppData();
          }}
          onClose={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setPrefillAsset(null);
            refreshAppData();
          }}
        />
      );
    }

    return (
      <AnimatedModalSheet
        testID="portfolio-manager-modal-sheet"
        visible={isPortfolioManagerModalOpen}
        onClose={() => {
          setIsPortfolioManagerModalOpen(false);
          setOpenCreatePortfolioModal(false);
          setOpenAddAssetModal(false);
          refreshAppData();
        }}
        themeMode={themeMode}
        fill maxHeight={0.88}
        contentStyle={{ paddingHorizontal: 0, paddingBottom: 0 }}
      >
        <PortfolioManagementScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          onProfilePress={() => setIsSettingsBackupModalOpen(true)}
          themeMode={themeMode}
          initialActiveIndex={activeWalletIndex}
          autoOpenNewPortfolioModal={openCreatePortfolioModal}
          autoOpenAddAssetModal={openAddAssetModal}
          onSubModalClosed={resetSubModalTriggers}
          onPortfolioIndexChange={(idx) => setActiveWalletIndex(idx)}
          onPortfolioCreated={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setActiveTab('wallets');
            refreshAppData();
          }}
          onClose={() => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            refreshAppData();
          }}
        />
      </AnimatedModalSheet>
    );
  };

  // 2. Modal Padronizado: Simulador de Novo Aporte (Rebalanceamento)
  const renderSimulatorModal = () => (
    <AnimatedModalSheet
      testID="simulator-modal-sheet"
      visible={isSimulatorModalOpen}
      onClose={() => {
        setIsSimulatorModalOpen(false);
        refreshAppData();
      }}
      themeMode={themeMode}
      fill maxHeight={0.92}
      contentStyle={{ paddingHorizontal: 0, paddingBottom: 24 }}
    >
      <SimulatorScreen
        isPrivacyMode={isPrivacyMode}
        themeMode={themeMode}
        onClose={() => {
          setIsSimulatorModalOpen(false);
          refreshAppData();
        }}
        onContributionsConfirmed={() => refreshAppData()}
      />
    </AnimatedModalSheet>
  );

  // 3a. Importação B3: tela cheia que entra deslizando (Modal), por cima do Perfil ou do Histórico de
  // proventos, de onde é aberta. O voltar do Android fecha só ela (onRequestClose) e a origem fica.
  const openB3Import = () => {
    setB3ImportKey((k) => k + 1);
    setIsB3ImportOpen(true);
  };

  useEffect(() => {
    if (props.initialAction === 'import_b3') {
      openB3Import();
      props.onClearInitialAction?.();
    } else if (props.initialAction === 'create_wallet') {
      setOpenCreatePortfolioModal(true);
      props.onClearInitialAction?.();
    }
  }, [props.initialAction]);
  const renderB3ImportModal = () => (
    <B3ImportSheet
      key={`b3-${b3ImportKey}`}
      visible={isB3ImportOpen}
      onClose={() => setIsB3ImportOpen(false)}
      isLight={isLight}
      initialPortfolioId={activePortfolioId || undefined}
      onNavigateToPortfolio={(portId, options) => {
        setIsB3ImportOpen(false);
        setIsSettingsBackupModalOpen(false);
        setIsIncomeHistoryOpen(false);
        setActivePortfolioId(portId);
        // Seleciona a carteira importada também no baralho/Home (antes só o id mudava e a Home
        // continuava mostrando a carteira anterior).
        const idx = walletsStore.getState().wallets.findIndex((w) => w.id === portId);
        if (idx >= 0) walletStore.setActiveIndex(idx, portId);
        refreshAppData();
        if (options?.openMetas) {
          setActiveTab('wallets');
          setIsPortfolioManagerModalOpen(true);
        }
      }}
    />
  );

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
        <SettingsBackupScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacyMode={(enabled) => setIsPrivacyMode(enabled)}
          onClose={() => setIsSettingsBackupModalOpen(false)}
          onDataRestored={() => refreshAppData()}
          onOpenB3Import={openB3Import}
          themeMode={themeMode}
          onThemeModeChange={(mode) => {
            setThemeMode(mode);
            themeModeService.setThemeMode(mode);
          }}
        />
        {renderB3ImportModal()}
      </SafeAreaView>
    );
  }

  // 3c. Tela: Histórico de Proventos (tela cheia)
  if (isIncomeHistoryOpen) {
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
        edges={['top', 'left', 'right', 'bottom']}
      >
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <IncomeHistoryScreen
          onBack={() => setIsIncomeHistoryOpen(false)}
          onOpenB3Import={openB3Import}
          initialPortfolioId={activePortfolioId || undefined}
          isPrivacyMode={isPrivacyMode}
          themeMode={themeMode}
        />
        {renderB3ImportModal()}
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
            onTogglePrivacy={() => {
              const next = privacyAndAuthService.togglePrivacyMode();
              setIsPrivacyMode(next.isPrivacyModeEnabled);
            }}
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
            }}
            onAdicionarAtivoPress={() => {
              setSelectedRecentTransaction(null);
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
            }}
            themeMode={themeMode}
          />
          {renderTransactionModal()}
          {renderPortfolioManagerModal()}
          {renderSimulatorModal()}
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
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          themeMode={themeMode}
          onClose={() => setIsAllTransactionsModalOpen(false)}
          onSelectTransaction={(tx) => setSelectedRecentTransaction(tx)}
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
          }}
          onAdicionarAtivoPress={() => {
            setIsAllTransactionsModalOpen(false);
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
          }}
          themeMode={themeMode}
        />
        {renderTransactionModal()}
        {renderPortfolioManagerModal()}
        {renderSimulatorModal()}
      </SafeAreaView>
    );
  }

  // 6. Tela: Detalhe da Classe (Donut Chart + Cards de Ativos)
  if (selectedClassDetail) {
    const classRawAssets = portfolioAssets.filter((a) => a.asset_class === selectedClassDetail);
    // Valor de mercado de cada ativo e total da categoria: a fatia do donut é a participação real do
    // ativo na categoria (soma 100%), não a meta nem um valor padrão.
    // Mesma precedência de preço da Home (consolidatePortfolios): preço manual > cotação > preço médio.
    // Antes a cotação vencia o preço manual aqui, e o detalhe da classe divergia do card da Home.
    const priceOf = (a: any): Decimal => {
      const cached = cachedQuotes[a.ticker?.toUpperCase()] || null;
      return a.manual_price_override
        ? new Decimal(a.manual_price_override)
        : cached?.currentPrice
        ? new Decimal(cached.currentPrice)
        : new Decimal(a.average_price || '0');
    };
    const grossOf = (a: any): Decimal => new Decimal(a.quantity || '0').mul(priceOf(a));
    const classTotalGross = classRawAssets.reduce((sum, a) => sum.plus(grossOf(a)), new Decimal(0));
    const classAssetsForDetail: ClassAssetDetailItem[] = classRawAssets
      .map((a) => {
        const qtyDec = new Decimal(a.quantity || '0');
        const avgDec = new Decimal(a.average_price || '0');
        const investedDec = qtyDec.mul(avgDec);
        const currentPriceDec = priceOf(a);
        const grossDec = qtyDec.mul(currentPriceDec);
        const profitDec = grossDec.minus(investedDec);
        const profitPctDec = investedDec.gt(0) ? profitDec.div(investedDec).mul(100) : new Decimal(0);
        const isPos = profitDec.gte(0);

        return {
          id: a.id,
          ticker: a.ticker,
          name: a.name || a.ticker,
          assetClass: a.asset_class as AssetClass,
          currentAllocationPercentage: classTotalGross.gt(0)
            ? grossDec.div(classTotalGross).mul(100).toNumber()
            : classRawAssets.length > 0
            ? 100 / classRawAssets.length
            : 0,
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
            onTogglePrivacy={() => {
              const next = privacyAndAuthService.togglePrivacyMode();
              setIsPrivacyMode(next.isPrivacyModeEnabled);
            }}
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
            }}
            onAdicionarAtivoPress={() => {
              setSelectedClassDetail(null);
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
            }}
            themeMode={themeMode}
          />
          {renderTransactionModal()}
          {renderPortfolioManagerModal()}
          {renderSimulatorModal()}
        </SafeAreaView>
      </Modal>
    );
  }

  // 7. Modal / Tela: Carteiras & Alocação
  if (activeTab === 'wallets') {
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
          onProfilePress={() => setIsSettingsBackupModalOpen(true)}
          themeMode={themeMode}
          initialActiveIndex={activeWalletIndex}
          autoOpenNewPortfolioModal={openCreatePortfolioModal}
          autoOpenAddAssetModal={openAddAssetModal || prefillAsset !== null}
          prefillAsset={prefillAsset}
          onSubModalClosed={resetSubModalTriggers}
          onPortfolioIndexChange={(idx) => setActiveWalletIndex(idx)}
          onPortfolioCreated={() => {
            refreshAppData();
          }}
          onClose={() => {
            setPrefillAsset(null);
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            refreshAppData();
          }}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          forceClose={isTransactionModalOpen || isSimulatorModalOpen}
          onTabChange={(tab) => {
            setIsPortfolioManagerModalOpen(false);
            setOpenCreatePortfolioModal(false);
            setOpenAddAssetModal(false);
            setActiveTab(tab);
          }}
          onActionPress={openTransactionModal}
          onNovoAportePress={openTransactionModal}
          onNovaCarteiraPress={() => {
            setOpenCreatePortfolioModal(true);
            setIsPortfolioManagerModalOpen(true);
          }}
          onAdicionarAtivoPress={() => {
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
          }}
          themeMode={themeMode}
        />
        {renderTransactionModal()}
        {renderSimulatorModal()}
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
        <StatisticsScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          themeMode={themeMode}
          onOpenIncomeHistory={() => setIsIncomeHistoryOpen(true)}
          onProfilePress={() => setIsSettingsBackupModalOpen(true)}
          onClassPress={(cls) => setSelectedClassDetail(cls)}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          forceClose={isTransactionModalOpen || isPortfolioManagerModalOpen || isSimulatorModalOpen}
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
          }}
          onAdicionarAtivoPress={() => {
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
          }}
          themeMode={themeMode}
        />
        {renderTransactionModal()}
        {renderPortfolioManagerModal()}
        {renderSimulatorModal()}
      </SafeAreaView>
    );
  }

  // 9. Tela/Aba: Busca e Ficha do Ativo
  if (activeTab === 'search') {
    if (selectedAssetTicker) {
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
          <AssetDetailScreen
            ticker={selectedAssetTicker}
            isPrivacyMode={isPrivacyMode}
            onTogglePrivacy={() => {
              const next = privacyAndAuthService.togglePrivacyMode();
              setIsPrivacyMode(next.isPrivacyModeEnabled);
            }}
            themeMode={themeMode}
            onBack={() => setSelectedAssetTicker(null)}
            onAdjustTarget={() => {
              setActiveTab('wallets');
            }}
            onAddAsset={(prefill) => {
              setPrefillAsset(prefill);
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
            }}
          />
          <FloatingBottomDock
            activeTab={activeTab}
            forceClose={isTransactionModalOpen || isPortfolioManagerModalOpen || isSimulatorModalOpen}
            onTabChange={(tab) => {
              setSelectedAssetTicker(null);
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
            }}
            onAdicionarAtivoPress={() => {
              setOpenAddAssetModal(true);
              setIsPortfolioManagerModalOpen(true);
            }}
            themeMode={themeMode}
          />
          {renderTransactionModal()}
          {renderPortfolioManagerModal()}
          {renderSimulatorModal()}
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
        <StatusBar style={isLight ? 'dark' : 'light'} />
        <SearchAssetsScreen
          isPrivacyMode={isPrivacyMode}
          onTogglePrivacy={() => {
            const next = privacyAndAuthService.togglePrivacyMode();
            setIsPrivacyMode(next.isPrivacyModeEnabled);
          }}
          themeMode={themeMode}
          onProfilePress={() => setIsSettingsBackupModalOpen(true)}
          onSelectAsset={(ticker) => setSelectedAssetTicker(ticker)}
        />
        <FloatingBottomDock
          activeTab={activeTab}
          forceClose={isTransactionModalOpen || isPortfolioManagerModalOpen || isSimulatorModalOpen}
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
          }}
          onAdicionarAtivoPress={() => {
            setOpenAddAssetModal(true);
            setIsPortfolioManagerModalOpen(true);
          }}
          themeMode={themeMode}
        />
        {renderTransactionModal()}
        {renderPortfolioManagerModal()}
        {renderSimulatorModal()}
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
          userName={profileName || 'Usuário'}
          userInitials={profileInitials || (profileName ? deriveInitials(profileName) : '')}
          isPrivacyModeEnabled={isPrivacyMode}
          onAvatarPress={homeOpenSettings}
          onGlobePress={homeGlobePress}
          onTogglePrivacy={homeTogglePrivacy}
          palette={activePalette}
          themeMode={themeMode}
          scrollY={homeScrollY}
        />

        <ScrollView
          testID="home-scroll-view"
          {...homeScrollProps}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {isOffline && (
            <View testID="market-status-indicator" style={[styles.offlineBanner, isLight && styles.offlineBannerLight]}>
              <MaterialIcons name="cloud-off" size={16} color={isLight ? '#8A5A2B' : colors.secondary} />
              <Text style={[styles.offlineBannerText, isLight && styles.offlineBannerTextLight]}>Modo Offline • Exibindo dados locais em cache</Text>
            </View>
          )}

          {/* 1. Stacked Hero Wallet Deck (WalleZ Stacked Cards) */}
          <StackedWalletDeck
            portfolios={deckPortfolios}
            loading={!walletsLoaded}
            activeIndex={activeWalletIndex}
            onPortfolioChange={handleDeckPortfolioChange}
            onCreatePortfolioPress={homeOpenCreatePortfolio}
            onImportB3Press={openB3Import}
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
                      isLight && styles.pageDotLight,
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
            showMais={false}
            onAportar={openTransactionModal}
            onRebalancear={homeOpenSimulator}
            onMais={homeGlobePress}
            onNovoAportePress={openTransactionModal}
            onNovaCarteiraPress={homeOpenCreatePortfolio}
            themeMode={themeMode}
          />

          {/* 4. Card de Alocação por Categoria (Dot-Matrix Category Grid v2) */}
          <DotMatrixAllocationCard
            totalBalance={balanceDisplay}
            allocations={categoryAllocations}
            loading={isWalletLoading}
            isPrivacyMode={isPrivacyMode}
            variant="bento"
            onRebalancePress={homeOpenSimulator}
            onClassPress={homeOpenClass}
            themeMode={themeMode}
            testID="home-dot-matrix-card"
          />
          {/* 2.1 Tile Bento da Meta de Patrimônio + Proventos lado a lado */}
          <View style={{ marginTop: 10 }}>
            <BentoRow>
              <View style={{ flex: 1 }}>
                <GoalProgressTile
                  currentValue={homeMarketValue}
                  patrimonyGoal={goalInfo.goal}
                  monthlyContribution={goalInfo.monthly}
                  isPrivacyMode={isPrivacyMode}
                  loading={isWalletLoading}
                  onPress={homeGoalPress}
                  testID="home-goal-tile"
                />
              </View>
              <View style={{ flex: 1 }}>
                <HomeIncomeTile
                  totalAmount={homeIncomeTotal}
                  isPrivacyMode={isPrivacyMode}
                  loading={isWalletLoading}
                  onPress={() => setIsIncomeHistoryOpen(true)}
                  testID="home-income-tile"
                  themeMode={themeMode}
                />
              </View>
            </BentoRow>
          </View>

          {/* 3. Card de Movimentações Recentes Posicionado Mais Acima */}
          <RecentTransactionsCard
            loading={isWalletLoading}
            transactions={maskedRecentTransactions}
            onViewAll={homeViewAll}
            onSelectTransaction={homeSelectTx}
            themeMode={themeMode}
            testID="home-recent-transactions"
          />

        </ScrollView>
      </View>

      <GoalEditorSheet
        visible={isGoalEditorOpen}
        onClose={() => setIsGoalEditorOpen(false)}
        initialGoal={goalInfo.goal}
        initialMonthly={goalInfo.monthly}
        themeMode={themeMode}
        onSave={async (goal, monthly) => {
          if (activePortfolioId) {
            await portfolioRepository.setGoal(activePortfolioId, { patrimonyGoal: goal, monthlyContribution: monthly });
            setGoalInfo({ goal, monthly });
          }
          setIsGoalEditorOpen(false);
        }}
      />

      {/* 7. Barra de Navegação Inferior Flutuante (Floating Bottom Dock) */}
      <FloatingBottomDock
        activeTab={activeTab}
        forceClose={isTransactionModalOpen || isPortfolioManagerModalOpen || isSimulatorModalOpen}
        onTabChange={homeTabChange}
        onActionPress={openTransactionModal}
        onNovoAportePress={openTransactionModal}
        onNovaCarteiraPress={homeOpenCreatePortfolio}
        onAdicionarAtivoPress={homeOpenAddAsset}
        themeMode={themeMode}
      />
      {renderTransactionModal()}
      {renderPortfolioManagerModal()}
      {renderSimulatorModal()}
      {renderB3ImportModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#191B1D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderWidth: 0,
    borderColor: 'transparent',
    maxHeight: '88%',
    width: '100%',
  },
  sheetContainerLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
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
  offlineBannerLight: {
    backgroundColor: '#F6EBDD',
    borderColor: '#E2C9A6',
  },
  offlineBannerTextLight: {
    color: '#8A5A2B',
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
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: layout.tabScreenPaddingTop,
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
  pageDotLight: {
    backgroundColor: 'rgba(17, 19, 21, 0.18)',
  },
  pageDotActive: {
    width: 18,
    borderRadius: 3,
  },
});
