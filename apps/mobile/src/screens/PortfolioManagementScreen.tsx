import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useHeaderScrollFade } from '../hooks/useHeaderScrollFade';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders, spacing, layout, space, bento } from '../theme/tokens';
import { getPortfolioPalette } from '../theme/palettes';
import {
  AssetClass,
  ClassTarget,
  calculateGlobalTarget,
  recalculateUnlockedTargets,
  convertWeightsToPercentagesWithLocks,
  normalizeTargetsToHundred,
} from '../domain/finance';
import { parseDecimalInput, formatDecimalInput } from '../utils/decimalInput';
import { StackedWalletDeck, StackedWalletItem, XpMinimalHeader, ASSET_CLASS_ATTRIBUTE_MAP, AnimatedModalSheet, GoalProgressTile, GoalEditorSheet, BentoGrid, BentoRow, BentoSection, BentoSheetHeader, ConfirmDialog, TransactionRow, LedgerInput, TextField, Skeleton, SkeletonSwap } from '../components/ui';
import { parseMoneyInput } from '../components/ui/GoalProgressTile';
import { waitRemaining } from '../utils/minLoading';
import { buildClassSummary } from '../domain/finance/classSummary';
import { marketApiService } from '../services/marketApi';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { validateTickerForAssetClass } from '../domain/finance/assetCatalogValidation';
import { AllTransactionsScreen } from './AllTransactionsScreen';
import { TransactionDetailHistoryScreen } from './TransactionDetailHistoryScreen';
import { walletStore } from '../stores/walletStore';
import { walletsStore, useWallets } from '../stores/walletsStore';
import { privacyAndAuthService } from '../services/privacyAndAuth';
import { useProfile } from '../stores/profileStore';

interface PortfolioItem {
  id: string;
  name: string;
  docketCode: string;
}

export interface AssetItem {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  targetInClass: number; // percentage
  percentage?: number; // alias
  weight?: number; // points
  isLocked?: boolean;
  quantity: string;
  price: string;
}

interface EnhancedClassTarget {
  id: AssetClass;
  assetClass: AssetClass;
  targetPercentage: number;
  percentage: number;
  isLocked: boolean;
  isDeactivated?: boolean;
}

export interface PortfolioManagementScreenProps {
  onClose?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onProfilePress?: () => void;
  modalOnly?: boolean;
  /** Chamado sempre que Nova Carteira / Adicionar Ativo fecham, para o pai resetar seus gatilhos. */
  onSubModalClosed?: () => void;
  themeMode?: 'dark' | 'light';
  initialClassTargets?: ClassTarget[];
  initialAssets?: AssetItem[];
  initialPortfolios?: any[];
  testID?: string;
  initialActiveIndex?: number;
  autoOpenNewPortfolioModal?: boolean;
  autoOpenAddAssetModal?: boolean;
  onPortfolioIndexChange?: (index: number) => void;
  onPortfolioCreated?: (newPortfolioId: string) => void;
  prefillAsset?: { ticker: string; name: string; assetClass: AssetClass; price?: string } | null;
}

const DEFAULT_ASSET_CATALOG = [
  { ticker: 'PETR4', name: 'Petróleo Brasileiro S.A.', assetClass: 'STOCK', price: '38.50' },
  { ticker: 'VALE3', name: 'Vale S.A.', assetClass: 'STOCK', price: '60.00' },
  { ticker: 'WEGE3', name: 'WEG S.A.', assetClass: 'STOCK', price: '42.50' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco', assetClass: 'STOCK', price: '34.00' },
  { ticker: 'BBAS3', name: 'Banco do Brasil S.A.', assetClass: 'STOCK', price: '28.00' },
  { ticker: 'ALUP11', name: 'Alupar Investimento', assetClass: 'STOCK', price: '31.50' },
  { ticker: 'BBDC4', name: 'Banco Bradesco S.A.', assetClass: 'STOCK', price: '14.50' },
  { ticker: 'HGLG11', name: 'CSHG Logística', assetClass: 'FII', price: '162.00' },
  { ticker: 'MXRF11', name: 'Maxi Renda FII', assetClass: 'FII', price: '10.20' },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística', assetClass: 'FII', price: '101.00' },
  { ticker: 'KNRI11', name: 'Kinea Renda Imobiliária', assetClass: 'FII', price: '158.00' },
  { ticker: 'CDB DI 110%', name: 'CDB Banco Master', assetClass: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'TESOURO IPCA+', name: 'Tesouro IPCA+ 2029', assetClass: 'FIXED_INCOME', price: '1.00' },
  { ticker: 'BTC', name: 'Bitcoin', assetClass: 'CRYPTO', price: '380000.00' },
  { ticker: 'ETH', name: 'Ethereum', assetClass: 'CRYPTO', price: '16000.00' },
  { ticker: 'SOL', name: 'Solana', assetClass: 'CRYPTO', price: '950.00' },
];

interface AssetRowProps {
  asset: AssetItem;
  globalTarget: number;
  color: string;
  isLight: boolean;
  themeMode: 'dark' | 'light';
  portfolioMode: 'percent' | 'weight';
  onWizard: (asset: AssetItem) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string) => void;
  onChangePct: (id: string, text: string) => void;
  onChangeWeight: (id: string, text: string) => void;
}

/**
 * Campo com stepper (− valor +). Mantém um rascunho local enquanto o usuário digita, para que
 * "12," ou "0,5" não sejam reescritos/arredondados no meio da digitação; só confirma valores
 * válidos e volta ao valor oficial ao sair do campo.
 */
const StepperField = React.memo(function StepperField({
  id,
  value,
  suffix,
  themeMode,
  isLight,
  min = 0,
  max,
  onCommit,
}: {
  id: string;
  value: number;
  suffix: string;
  themeMode: 'dark' | 'light';
  isLight: boolean;
  min?: number;
  max?: number;
  onCommit: (id: string, value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Se o valor oficial mudou por outro motivo (redistribuição, limite do teto), o rascunho que não
  // corresponde mais a ele é descartado para o campo nunca exibir um número desatualizado.
  useEffect(() => {
    setDraft((d) => {
      if (d === null) return d;
      const n = parseDecimalInput(d);
      return n !== null && Math.round(n * 100) / 100 === Math.round(value * 100) / 100 ? d : null;
    });
  }, [value]);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.round(n * 100) / 100));
  const step = (delta: number) => {
    setDraft(null);
    onCommit(id, clamp(value + delta));
  };
  const iconColor = isLight ? '#111315' : '#D5CAA8';
  return (
    <View style={[styles.stepper, isLight && styles.stepperLight]}>
      <TouchableOpacity
        testID={`step-down-${id}`}
        accessibilityRole="button"
        accessibilityLabel="Diminuir meta"
        onPress={() => step(-1)}
        activeOpacity={0.6}
        style={styles.stepperBtn}
      >
        <MaterialIcons name="remove" size={16} color={iconColor} />
      </TouchableOpacity>
      <View style={styles.stepperValueWrap}>
        <TextInput
          testID={`input-asset-${id}`}
          keyboardType="decimal-pad"
          value={draft ?? formatDecimalInput(value)}
          onChangeText={(t) => {
            setDraft(t);
            const n = parseDecimalInput(t);
            if (n !== null) onCommit(id, clamp(n));
          }}
          onBlur={() => setDraft(null)}
          selectTextOnFocus
          style={[styles.stepperInput, { color: isLight ? '#111315' : colors.parchmentPale }]}
        />
        <Text style={styles.stepperSuffix}>{suffix}</Text>
      </View>
      <TouchableOpacity
        testID={`step-up-${id}`}
        accessibilityRole="button"
        accessibilityLabel="Aumentar meta"
        onPress={() => step(1)}
        activeOpacity={0.6}
        style={styles.stepperBtn}
      >
        <MaterialIcons name="add" size={16} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
});

/** Linha de ativo memoizada: só re-renderiza quando o próprio ativo (ou o modo) muda. */
const AssetRow = React.memo(function AssetRow({
  asset,
  globalTarget,
  color,
  isLight,
  themeMode,
  portfolioMode,
  onWizard,
  onDelete,
  onToggleLock,
  onChangePct,
  onChangeWeight,
}: AssetRowProps) {
  const isPercent = portfolioMode === 'percent';
  const value = isPercent
    ? asset.targetInClass
    : asset.weight ?? (asset.targetInClass > 0 ? asset.targetInClass : 1);
  const handleCommit = (id: string, v: number) => (isPercent ? onChangePct(id, String(v)) : onChangeWeight(id, String(v)));
  return (
    <View
      testID={`asset-list-row-${asset.id}`}
      style={[styles.verticalAssetRow, isLight && styles.verticalAssetRowLight]}
    >
      <View style={styles.assetRowLeft}>
        <View style={styles.assetTickerRow}>
          <Text style={[styles.assetTicker, isLight && styles.assetTickerLight]}>{asset.ticker}</Text>
          <TouchableOpacity
            testID={`lock-asset-${asset.id}`}
            onPress={() => onToggleLock(asset.id)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={asset.isLocked ? `Destravar meta de ${asset.ticker}` : `Travar meta de ${asset.ticker}`}
          >
            <MaterialIcons
              name={asset.isLocked ? 'lock' : 'lock-open'}
              size={14}
              color={asset.isLocked ? colors.primary : isLight ? '#9A968E' : '#6E7175'}
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={0.7} onPress={() => onWizard(asset)}>
          <Text numberOfLines={1} style={[styles.assetName, isLight && styles.assetNameLight]}>
            {asset.name !== asset.ticker ? `${asset.name} · ` : ''}
            <Text style={{ color }}>{globalTarget.toFixed(1)}% global</Text>
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.assetRowRight}>
        <StepperField
          id={asset.id}
          value={value}
          suffix={isPercent ? '%' : 'pts'}
          themeMode={themeMode}
          isLight={isLight}
          max={isPercent ? 100 : undefined}
          onCommit={handleCommit}
        />
        <TouchableOpacity
          testID={`delete-asset-${asset.id}`}
          onPress={() => onDelete(asset.id)}
          style={styles.deleteAssetBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Excluir ativo ${asset.ticker}`}
        >
          <MaterialIcons name="delete-outline" size={18} color="#FF6B6B" />
        </TouchableOpacity>
      </View>
    </View>
  );
});

/** Alturas fixas das linhas: esqueleto e conteúdo real ocupam o mesmo espaço (sem salto ao trocar). */
const ASSET_ROW_HEIGHT = 68;
const TX_ROW_HEIGHT = 72;

const ListSkeleton: React.FC<{
  rows: number;
  rowHeight: number;
  withTabs?: boolean;
  themeMode: 'dark' | 'light';
  testID?: string;
}> = ({ rows, rowHeight, withTabs, themeMode, testID }) => (
  <BentoSection themeMode={themeMode} testID={testID} style={{ marginTop: bento.gap }}>
    <Skeleton width="45%" height={12} themeMode={themeMode} style={{ marginBottom: 14 }} />
    {withTabs ? (
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="23%" height={34} radius={bento.innerRadius} themeMode={themeMode} />
        ))}
      </View>
    ) : null}
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} height={rowHeight} radius={bento.innerRadius} themeMode={themeMode} style={{ marginBottom: 8 }} />
    ))}
  </BentoSection>
);

export const PortfolioManagementScreen: React.FC<PortfolioManagementScreenProps> = ({
  onClose,
  isPrivacyMode = false,
  onTogglePrivacy,
  onProfilePress,
  modalOnly = false,
  onSubModalClosed,
  themeMode = 'dark',
  initialClassTargets,
  initialAssets,
  initialPortfolios,
  testID = 'portfolio-management-screen',
  initialActiveIndex = 0,
  autoOpenNewPortfolioModal = false,
  autoOpenAddAssetModal = false,
  onPortfolioIndexChange,
  onPortfolioCreated,
  prefillAsset,
}) => {
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const { name: profileName, initials: profileInitials } = useProfile();
  try {
    insets = useSafeAreaInsets();
  } catch {
    // fallback for test without SafeAreaProvider
  }
  const isLight = themeMode === 'light';

  const [privacyMode, setPrivacyMode] = useState<boolean>(
    Boolean(isPrivacyMode || (privacyAndAuthService?.getState ? privacyAndAuthService.getState().isPrivacyModeEnabled : false))
  );

  useEffect(() => {
    setPrivacyMode(isPrivacyMode);
  }, [isPrivacyMode]);

  useEffect(() => {
    if (privacyAndAuthService?.subscribe) {
      return privacyAndAuthService.subscribe((st) => {
        setPrivacyMode(st.isPrivacyModeEnabled);
      });
    }
  }, []);

  const handleTogglePrivacy = () => {
    if (onTogglePrivacy) {
      onTogglePrivacy();
    } else if (privacyAndAuthService?.togglePrivacyMode) {
      const next = privacyAndAuthService.togglePrivacyMode();
      setPrivacyMode(next.isPrivacyModeEnabled);
    } else {
      setPrivacyMode((prev) => !prev);
    }
  };

  // 1. Estado de Carteiras
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>(() => {
    if (initialPortfolios && initialPortfolios.length > 0) {
      return initialPortfolios.map((p) => ({
        id: p.id,
        name: p.name,
        docketCode: p.docketCode || p.docket_code || '•••• 001',
      }));
    }
    return [];
  });
  const [activePortfolioId, setActivePortfolioId] = useState<string>(() => {
    const idx = Math.min(initialActiveIndex ?? 0, (initialPortfolios?.length || 1) - 1);
    return (initialPortfolios && initialPortfolios[idx]?.id) || '';
  });
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex ?? 0);
  const [isNewPortfolioModalOpen, setIsNewPortfolioModalOpen] = useState(Boolean(autoOpenNewPortfolioModal));
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [newPortfolioGoal, setNewPortfolioGoal] = useState('');
  const [newPortfolioMonthly, setNewPortfolioMonthly] = useState('');
  const [portfolioBalances, setPortfolioBalances] = useState<Record<string, number>>({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { scrollY, scrollProps } = useHeaderScrollFade();
  const [isMetasModalOpen, setIsMetasModalOpen] = useState(false);
  const [goalInfo, setGoalInfo] = useState<{ goal: string | null; monthly: string | null }>({ goal: null, monthly: null });
  const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
  const [isWeightHelpOpen, setIsWeightHelpOpen] = useState(false);
  // Esqueletos ao trocar de carteira (não aparecem na 1ª montagem, que usa os dados iniciais).
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [isTxLoading, setIsTxLoading] = useState(false);
  const loadedPortfolioIdRef = useRef<string | null>(null);
  const [isExtratoModalOpen, setIsExtratoModalOpen] = useState(false);
  const [portfolioTransactions, setPortfolioTransactions] = useState<any[]>(() => {
    if (activePortfolioId) {
      const syncTxs = transactionRepository.getTransactionsByPortfolioSync?.(activePortfolioId) || [];
      const syncAssets = assetRepository.getAssetsByPortfolioSync?.(activePortfolioId) || [];
      const assetMap = new Map<string, any>();
      (initialAssets || []).forEach((a) => assetMap.set(a.id, a));
      syncAssets.forEach((a) => assetMap.set(a.id, a));
      return syncTxs.map((t) => {
        const a = assetMap.get(t.asset_id);
        const qtyNum = parseFloat(t.quantity || '0') || 0;
        const priceNum = parseFloat(t.unit_price || '0') || 0;
        const totalVal = qtyNum * priceNum;
        return {
          id: t.id,
          ticker: a?.ticker || (t as any).ticker || 'ATIVO',
          name: a?.name || (t as any).name || '',
          assetClass: (a?.assetClass || a?.asset_class || (t as any).assetClass || 'STOCK') as AssetClass,
          type: t.type as 'BUY' | 'SELL',
          dateText: t.trade_date,
          amountText: `R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        };
      });
    }
    return [];
  });
  const [selectedGlobalWizardAsset, setSelectedGlobalWizardAsset] = useState<AssetItem | null>(null);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<any | null>(null);

  useEffect(() => {
    return walletStore.subscribe(() => {
      const state = walletStore.getState();
      if (state.activeWalletIndex !== activeIndex) {
        setActiveIndex(state.activeWalletIndex);
        if (state.activePortfolioId) {
          setActivePortfolioId(state.activePortfolioId);
        }
      }
    });
  }, [activeIndex]);

  // Fechamento único dos sub-modais: além de esconder o sheet, avisa o pai para limpar
  // os gatilhos (openCreatePortfolioModal/openAddAssetModal). Sem isso o pai continuava
  // com o gatilho em `true` e reabrir a mesma opção do menu "+" não fazia nada.
  const closeNewPortfolioModal = () => {
    setIsNewPortfolioModalOpen(false);
    onSubModalClosed?.();
  };
  const closeAddAssetModal = () => {
    setIsAddAssetModalOpen(false);
    onSubModalClosed?.();
  };

  useEffect(() => {
    if (autoOpenNewPortfolioModal) {
      setIsNewPortfolioModalOpen(true);
    }
  }, [autoOpenNewPortfolioModal]);

  useEffect(() => {
    if (autoOpenAddAssetModal) {
      setIsAddAssetModalOpen(true);
    }
  }, [autoOpenAddAssetModal]);

  useEffect(() => {
    if (prefillAsset) {
      if (prefillAsset.assetClass) {
        setSelectedClassTab(prefillAsset.assetClass);
      }
      if (prefillAsset.ticker) {
        setNewTicker(prefillAsset.ticker);
        setAutocompleteQuery(prefillAsset.ticker);
      }
      if (prefillAsset.name) {
        setNewName(prefillAsset.name);
      }
      if (prefillAsset.price) {
        setNewPrice(String(prefillAsset.price));
      }
      setIsAddAssetModalOpen(true);
    }
  }, [prefillAsset]);

  // Carrega carteiras do repositório
  useEffect(() => {
    const loadPortfolios = async () => {
      try {
        const dbPorts = await portfolioRepository.listPortfolios(false);
        if (dbPorts && dbPorts.length > 0) {
          const mapped = dbPorts.map((p, idx) => ({
            id: p.id,
            name: p.name,
            docketCode: p.docket_code || `•••• 00${idx + 1}`,
          }));
          setPortfolios(mapped);
          if (!activePortfolioId) {
            // Respeita a carteira selecionada no baralho (store/índice), não a primeira da lista.
            const storedId = walletStore.getState().activePortfolioId;
            const byStore = storedId ? mapped.find((m) => m.id === storedId) : undefined;
            const byIndex = mapped[Math.min(Math.max(activeIndex, 0), mapped.length - 1)];
            setActivePortfolioId((byStore || byIndex || mapped[0]).id);
          }
        }
      } catch {}
    };
    if (!initialPortfolios || initialPortfolios.length === 0) {
      loadPortfolios();
    }
  }, []);

  // 2. Metas Macro por Classe com suporte a cadeado e recálculo reativo 100%
  const [classTargets, setClassTargets] = useState<EnhancedClassTarget[]>(() => {
    if (initialClassTargets && initialClassTargets.length > 0) {
      return initialClassTargets.map((ct: any) => ({
        id: (ct.assetClass || ct.asset_class) as AssetClass,
        assetClass: (ct.assetClass || ct.asset_class) as AssetClass,
        targetPercentage: ct.targetPercentage ?? ct.target_percentage ?? 0,
        percentage: ct.targetPercentage ?? ct.target_percentage ?? 0,
        isLocked: false,
      }));
    }
    return [
      { id: 'FIXED_INCOME', assetClass: 'FIXED_INCOME', targetPercentage: 30, percentage: 30, isLocked: false },
      { id: 'FII', assetClass: 'FII', targetPercentage: 20, percentage: 20, isLocked: false },
      { id: 'STOCK', assetClass: 'STOCK', targetPercentage: 40, percentage: 40, isLocked: false },
      { id: 'CRYPTO', assetClass: 'CRYPTO', targetPercentage: 10, percentage: 10, isLocked: false },
    ];
  });

  // 3. Ativos e Metas na Classe com Edição Rápida e Alternância de Modo (Percent vs Weight)
  const [portfolioMode, setPortfolioMode] = useState<'percent' | 'weight'>('percent');
  const [selectedClassTab, setSelectedClassTab] = useState<AssetClass>('STOCK');

  const [assets, setAssets] = useState<AssetItem[]>(() => {
    if (initialAssets && initialAssets.length > 0) {
      return initialAssets;
    }
    return [];
  });

  // Carrega TUDO da carteira ativa (meta, ativos, metas por classe e movimentações) em paralelo e aplica
  // num único commit, em transição: o skeleton cobre o conteúdo antigo e a UI não engasga na troca.
  // (Antes eram 5+ commits em série, e as movimentações eram buscadas duas vezes por troca.)
  const loaderPendingForRef = useRef<string | null>(null);
  const loadedKeyRef = useRef<{ id: string; assetsLen: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const switched = loadedPortfolioIdRef.current !== null && loadedPortfolioIdRef.current !== activePortfolioId;
    loadedPortfolioIdRef.current = activePortfolioId || null;
    if (switched) {
      setIsPortfolioLoading(true);
      setIsTxLoading(true);
    }
    const loadStartedAt = Date.now();
    const safe = async <T,>(fn: () => Promise<T> | T, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };
    const load = async () => {
      if (!activePortfolioId) return;
      loaderPendingForRef.current = activePortfolioId;
      const apply: Array<() => void> = [];
      try {
        const wantAssets = !initialAssets || initialAssets.length === 0;
        const wantTargets = !initialClassTargets || initialClassTargets.length === 0;
        const [portfolio, dbAssets, dbTargets, txs] = await Promise.all([
          safe(() => portfolioRepository.getPortfolioById(activePortfolioId), null),
          wantAssets ? safe(() => assetRepository.getAssetsByPortfolio(activePortfolioId), null) : Promise.resolve(null),
          wantTargets ? safe(() => portfolioRepository.getClassTargets(activePortfolioId), null) : Promise.resolve(null),
          safe(() => transactionRepository.getTransactionsByPortfolio(activePortfolioId), []),
        ]);
        if (cancelled) return;

        apply.push(() =>
          setGoalInfo({ goal: portfolio?.patrimony_goal ?? null, monthly: portfolio?.monthly_contribution ?? null })
        );

        const mappedAssets: AssetItem[] | null = dbAssets
          ? dbAssets.map((a) => ({
              id: a.id,
              ticker: a.ticker,
              name: a.name,
              assetClass: a.asset_class as AssetClass,
              targetInClass: a.target_percentage_in_class || 0,
              percentage: a.target_percentage_in_class || 0,
              weight: Math.max(0.1, Math.round(((a.target_percentage_in_class || 0) / 10) * 100) / 100),
              isLocked: false,
              quantity: a.quantity,
              price: a.manual_price_override || a.average_price,
            }))
          : null;
        // Sempre substitui (inclusive por lista vazia): uma carteira sem ativos não herda os da anterior.
        if (mappedAssets) apply.push(() => setAssets(mappedAssets));

        if (dbTargets) {
          const stored = new Map(dbTargets.map((ct) => [ct.asset_class, ct]));
          // Classes sem meta gravada ficam zeradas/desativadas em vez de herdar valores da carteira anterior.
          const targets = (['FIXED_INCOME', 'FII', 'STOCK', 'CRYPTO'] as AssetClass[]).map((c) => {
            const ct = stored.get(c);
            const pct = ct ? ct.target_percentage : 0;
            return {
              id: c,
              assetClass: c,
              targetPercentage: pct,
              percentage: pct,
              isLocked: false,
              isDeactivated: !ct || ct.receives_contribution === 0 || pct === 0,
            };
          });
          apply.push(() => setClassTargets(targets));
        }

        const assetMap = new Map<string, any>();
        (initialAssets || []).forEach((a) => assetMap.set(a.id, a));
        (mappedAssets || assets || []).forEach((a) => assetMap.set(a.id, a));
        (dbAssets || []).forEach((a) =>
          assetMap.set(a.id, { id: a.id, ticker: a.ticker, name: a.name, assetClass: a.asset_class })
        );
        const mappedTx = (txs || []).map((t) => {
          const a = assetMap.get(t.asset_id);
          const totalVal = (parseFloat(t.quantity || '0') || 0) * (parseFloat(t.unit_price || '0') || 0);
          return {
            id: t.id,
            ticker: a?.ticker || (t as any).ticker || 'ATIVO',
            name: a?.name || (t as any).name || '',
            assetClass: (a?.assetClass || a?.asset_class || (t as any).assetClass || 'STOCK') as AssetClass,
            type: t.type as 'BUY' | 'SELL',
            dateText: t.trade_date,
            amountText: `R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          };
        });
        apply.push(() => setPortfolioTransactions(mappedTx));
        loadedKeyRef.current = { id: activePortfolioId, assetsLen: mappedAssets ? mappedAssets.length : assets.length };
      } finally {
        if (!cancelled) {
          if (switched) await waitRemaining(loadStartedAt);
          if (!cancelled) {
            loaderPendingForRef.current = null;
            const commit = () => {
              apply.forEach((fn) => fn());
              setIsPortfolioLoading(false);
              setIsTxLoading(false);
            };
            // Troca de carteira: em transição (UI fluida). Primeira carga: aplica direto, sem atraso.
            if (switched) startTransition(commit);
            else commit();
          }
        }
      }
    };
    load();
    return () => {
      cancelled = true;
      if (loaderPendingForRef.current === activePortfolioId) loaderPendingForRef.current = null;
    };
  }, [activePortfolioId]);

  // Saldos de todas as carteiras: lidos do banco só quando a lista de carteiras muda (1 consulta por
  // carteira). Antes isto rodava também a cada mudança de `assets`, refazendo N consultas por troca.
  // Lista de carteiras: a mesma fonte da Home (walletsStore). Sem App (ex.: testes isolados) usa a lista local.
  const { wallets: sharedWallets, loaded: sharedLoaded } = useWallets();
  const useShared = sharedLoaded && sharedWallets.length > 0 && !initialPortfolios;
  // Com a lista compartilhada (saldos já calculados pelo App com cotações) e sem o seletor legado,
  // os saldos locais não aparecem em lugar nenhum: pula as N consultas ao banco.
  const skipLocalBalances = useShared && Boolean(onPortfolioIndexChange);
  useEffect(() => {
    if (skipLocalBalances) return undefined;
    let cancelled = false;
    const calculateBalances = async () => {
      const balances: Record<string, number> = {};
      for (const p of portfolios) {
        try {
          const pAssets = await assetRepository.getAssetsByPortfolio(p.id);
          balances[p.id] = pAssets.reduce((sum, a) => {
            const q = parseFloat(a.quantity || '0') || 0;
            const pr = parseFloat(a.manual_price_override || a.average_price || '0') || 0;
            return sum + q * pr;
          }, 0);
        } catch {
          balances[p.id] = 0;
        }
      }
      if (!cancelled) setPortfolioBalances(balances);
    };
    calculateBalances();
    return () => {
      cancelled = true;
    };
  }, [portfolios, skipLocalBalances]);

  // O saldo da carteira ativa acompanha os ativos em memória, sem novas consultas ao banco.
  useEffect(() => {
    if (!activePortfolioId || isPortfolioLoading) return;
    const total = assets.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0) * (parseFloat(a.price) || 0), 0);
    setPortfolioBalances((prev) => (prev[activePortfolioId] === total ? prev : { ...prev, [activePortfolioId]: total }));
  }, [assets, activePortfolioId, isPortfolioLoading]);

  // Recarrega só as movimentações quando um ativo entra/sai (os nomes vêm do banco). Na troca de carteira
  // elas já vêm do carregador acima, então este efeito não duplica a busca.
  useEffect(() => {
    const k = loadedKeyRef.current;
    if (!activePortfolioId || loaderPendingForRef.current === activePortfolioId) return;
    if (k && k.id === activePortfolioId && k.assetsLen === assets.length) return;
    let cancelled = false;
    (async () => {
      try {
        const [txs, dbAssets] = await Promise.all([
          transactionRepository.getTransactionsByPortfolio(activePortfolioId),
          assetRepository.getAssetsByPortfolio(activePortfolioId),
        ]);
        const assetMap = new Map<string, any>();
        (assets || []).forEach((a) => assetMap.set(a.id, a));
        (dbAssets || []).forEach((a) =>
          assetMap.set(a.id, { id: a.id, ticker: a.ticker, name: a.name, assetClass: a.asset_class })
        );
        const mapped = (txs || []).map((t) => {
          const a = assetMap.get(t.asset_id);
          const totalVal = (parseFloat(t.quantity || '0') || 0) * (parseFloat(t.unit_price || '0') || 0);
          return {
            id: t.id,
            ticker: a?.ticker || 'ATIVO',
            name: a?.name || '',
            assetClass: (a?.assetClass || a?.asset_class || 'STOCK') as AssetClass,
            type: t.type as 'BUY' | 'SELL',
            dateText: t.trade_date,
            amountText: `R$ ${totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          };
        });
        if (!cancelled) {
          loadedKeyRef.current = { id: activePortfolioId, assetsLen: assets.length };
          setPortfolioTransactions(mapped);
        }
      } catch {
        if (!cancelled) setPortfolioTransactions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activePortfolioId, assets.length]);

  // Modal para Adicionar Ativo (Módulo 5)
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);
  const [addAssetMode, setAddAssetMode] = useState<'percent' | 'weight'>('percent');
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newTargetInClass, setNewTargetInClass] = useState('25');
  const [newPrice, setNewPrice] = useState('10.00');
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<any[]>([]);
  const [assetValidationError, setAssetValidationError] = useState<string | null>(null);

  const currentClassAssets = assets.filter((a) => a.assetClass === selectedClassTab);
  const currentClassTarget = classTargets.find((c) => c.assetClass === selectedClassTab)?.targetPercentage || 0;

  const [classInputText, setClassInputText] = useState<Record<string, string>>({});

  // -------------------------------------------------------------------------
  // Handlers: Metas Macro e Cadeado
  // -------------------------------------------------------------------------
  const handleToggleClassLock = (assetClass: AssetClass) => {
    setClassTargets((prev) =>
      prev.map((c) => (c.assetClass === assetClass ? { ...c, isLocked: !c.isLocked } : c))
    );
  };

  const handleToggleClassActive = (assetClass: AssetClass) => {
    setClassInputText({});
    setClassTargets((prev) => {
      const target = prev.find((c) => c.assetClass === assetClass);
      if (!target) return prev;

      const isCurrentlyActive = (target.targetPercentage ?? 0) > 0 && !target.isDeactivated;

      let updated: EnhancedClassTarget[];
      if (isCurrentlyActive) {
        // Desativar: targetPercentage vai a 0 e o valor é redistribuído com números limpos
        const activeRemaining = prev.filter(
          (c) => c.assetClass !== assetClass && !c.isDeactivated && (c.targetPercentage ?? 0) > 0
        );

        if (activeRemaining.length > 0) {
          const unlocked = activeRemaining.filter((c) => !c.isLocked);
          const targetsToDistribute = unlocked.length > 0 ? unlocked : activeRemaining;

          const lockedClasses = prev.filter(
            (c) => c.assetClass !== assetClass && !c.isDeactivated && c.isLocked
          );
          const lockedSum = lockedClasses.reduce((acc, c) => acc + (c.targetPercentage ?? 0), 0);
          const available = Math.max(0, 100 - lockedSum);

          const sumOfDist = targetsToDistribute.reduce((acc, c) => acc + (c.targetPercentage ?? 0), 0);
          const lastDistClass = targetsToDistribute[targetsToDistribute.length - 1].assetClass;
          let accDistributed = 0;

          const distMap = new Map<AssetClass, number>();
          targetsToDistribute.forEach((c) => {
            if (c.assetClass === lastDistClass) return;
            let share: number;
            if (sumOfDist > 0) {
              share = Math.round(((c.targetPercentage ?? 0) / sumOfDist) * available * 100) / 100;
            } else {
              share = Math.round((available / targetsToDistribute.length) * 100) / 100;
            }
            accDistributed += share;
            distMap.set(c.assetClass, share);
          });
          const lastShare = Math.round((available - accDistributed) * 100) / 100;
          distMap.set(lastDistClass, Math.max(0, lastShare));

          updated = prev.map((c) => {
            if (c.assetClass === assetClass) {
              return { ...c, targetPercentage: 0, percentage: 0, isLocked: false, isDeactivated: true };
            }
            if (distMap.has(c.assetClass)) {
              const newPct = distMap.get(c.assetClass)!;
              return { ...c, targetPercentage: newPct, percentage: newPct };
            }
            return c;
          });
        } else {
          updated = prev.map((c) =>
            c.assetClass === assetClass
              ? { ...c, targetPercentage: 0, percentage: 0, isLocked: false, isDeactivated: true }
              : c
          );
        }
      } else {
        // Reativar categoria: atribui meta inicial limpa de 10% (ou 100% se for a única) e redistribui proporcionalmente
        const otherActive = prev.filter((c) => c.assetClass !== assetClass && !c.isDeactivated);
        const newPct = otherActive.length > 0 ? 10 : 100;

        const recalculated = recalculateUnlockedTargets(
          prev.map((p) => ({
            ...p,
            percentage: p.assetClass === assetClass ? newPct : (p.targetPercentage ?? 0),
          })),
          assetClass,
          newPct
        );
        updated = recalculated.map((r) => ({
          ...r,
          targetPercentage: r.percentage,
          isDeactivated: r.assetClass === assetClass ? false : (r.percentage === 0 && r.isDeactivated),
        }));
      }

      if (activePortfolioId) {
        portfolioRepository
          .setClassTargets(
            activePortfolioId,
            updated.map((u) => ({
              asset_class: u.assetClass,
              target_percentage: u.targetPercentage,
            }))
          )
          .catch(() => {});
      }
      return updated;
    });
  };

  const handleClassPercentageChange = (assetClass: AssetClass, text: string) => {
    // Aceita só dígitos e um separador decimal; limita o valor ao intervalo 0–100.
    const cleaned = text.replace(',', '.').replace(/[^0-9.]/g, '').replace(/^(\d*\.\d*).*$/, '$1');
    let display = cleaned;
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 100) display = '100';
    setClassInputText((prev) => ({ ...prev, [assetClass]: display }));
    const val = Math.min(100, Math.max(0, parseFloat(display)));
    if (isNaN(val)) return;

    setClassTargets((prev) => {
      let updated: EnhancedClassTarget[];
      if (prev.length <= 1) {
        updated = prev.map((p) => (p.assetClass === assetClass ? { ...p, targetPercentage: val } : p));
      } else {
        const recalculated = recalculateUnlockedTargets(
          prev.map((p) => ({ ...p, percentage: p.targetPercentage })),
          assetClass,
          val
        );
        updated = recalculated.map((r) => ({
          ...r,
          targetPercentage: r.percentage,
        }));
      }
      if (activePortfolioId) {
        portfolioRepository
          .setClassTargets(
            activePortfolioId,
            updated.map((u) => ({
              asset_class: u.assetClass,
              target_percentage: u.targetPercentage,
            }))
          )
          .catch(() => {});
      }
      return updated;
    });
  };

  const handleDeleteActivePortfolio = async () => {
    if (!activePortfolioId) return;
    try {
      await portfolioRepository.deletePortfolio(activePortfolioId);
    } catch {}

    const remaining = portfolios.filter((p) => p.id !== activePortfolioId);
    setPortfolios(remaining);
    setIsDeleteModalOpen(false);
    if (remaining.length > 0) {
      setActivePortfolioId(remaining[0].id);
      setActiveIndex(0);
      walletStore.setActiveIndex(0, remaining[0].id);
    } else {
      setActivePortfolioId('');
      setActiveIndex(0);
      setAssets([]);
      walletStore.setActiveIndex(0);
    }
    // A Home usa a mesma lista: pede a recarga para a carteira excluída sumir das duas telas.
    walletsStore.requestRefresh();
  };

  // -------------------------------------------------------------------------
  // Handlers: Ativos na Classe (Edição Rápida e Cadeado)
  // -------------------------------------------------------------------------
  // Persiste as metas por ativo (debounce): antes só viviam em memória e voltavam ao reabrir o app.
  const pendingTargetsRef = useRef<Map<string, number>>(new Map());
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistAssetTargets = (targets: Map<string, number>) => {
    targets.forEach((v, id) => pendingTargetsRef.current.set(id, v));
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const batch = Array.from(pendingTargetsRef.current.entries());
      pendingTargetsRef.current.clear();
      for (const [id, v] of batch) {
        try {
          await assetRepository.updateAssetTargetInClass(id, v);
        } catch {}
      }
    }, 400);
  };

  const handleToggleAssetLock = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, isLocked: !a.isLocked } : a))
    );
  };

  const handleAssetPercentageChange = (assetId: string, text: string) => {
    const val = parseDecimalInput(text) ?? 0;
    const classAssets = assets.filter((a) => a.assetClass === selectedClassTab);
    const recalculated = recalculateUnlockedTargets(
      classAssets.map((a) => ({ ...a, percentage: a.targetInClass })),
      assetId,
      val
    );

    const updatedMap = new Map(recalculated.map((r) => [r.id, r.percentage]));
    setAssets((prev) =>
      prev.map((a) => {
        if (updatedMap.has(a.id)) {
          const newPct = updatedMap.get(a.id)!;
          return { ...a, targetInClass: newPct, percentage: newPct };
        }
        return a;
      })
    );
    persistAssetTargets(updatedMap);
  };

  const handleAssetWeightChange = (assetId: string, text: string) => {
    const val = parseDecimalInput(text) ?? 1;
    const classAssets = assets.filter((a) => a.assetClass === selectedClassTab);
    const updatedWithWeight = classAssets.map((a) =>
      a.id === assetId ? { ...a, weight: val } : a
    );
    const recalculated = convertWeightsToPercentagesWithLocks(
      updatedWithWeight.map((a) => ({ ...a, percentage: a.targetInClass }))
    );

    const updatedMap = new Map(recalculated.map((r) => [r.id, r]));
    setAssets((prev) =>
      prev.map((a) => {
        if (updatedMap.has(a.id)) {
          const r = updatedMap.get(a.id)!;
          return { ...a, weight: r.weight, targetInClass: r.percentage, percentage: r.percentage };
        }
        return a;
      })
    );
    persistAssetTargets(new Map(recalculated.map((r) => [r.id, r.percentage])));
  };

  // -------------------------------------------------------------------------
  // Handlers: Autocomplete & Adicionar Ativo (Módulo 5)
  // -------------------------------------------------------------------------
  // Só a busca mais recente pode preencher as sugestões: digitando rápido, uma resposta atrasada de
  // um termo antigo sobrescrevia a lista do termo atual.
  const autocompleteSeqRef = useRef(0);
  const handleAutocompleteChange = async (text: string) => {
    const seq = ++autocompleteSeqRef.current;
    setAssetValidationError(null);
    setAutocompleteQuery(text);
    setNewTicker(text);
    const clean = text.trim().toUpperCase();

    if (clean.length === 0) {
      setAutocompleteSuggestions([]);
      return;
    }

    // Filtra catálogo padrão local filtrando pela classe selecionada
    const localMatches = DEFAULT_ASSET_CATALOG.filter(
      (item) => item.assetClass === selectedClassTab && (item.ticker.includes(clean) || item.name.toUpperCase().includes(clean))
    );

    // Tenta complementar com busca na API
    let apiMatches: any[] = [];
    try {
      const results = await marketApiService.searchCatalog(clean, selectedClassTab);
      if (results && Array.isArray(results)) {
        apiMatches = results.filter((r) => !r.assetClass || r.assetClass === selectedClassTab);
      }
    } catch {}
    if (seq !== autocompleteSeqRef.current) return;

    const combined = [...localMatches];
    for (const apiItem of apiMatches) {
      if (!combined.some((c) => c.ticker === apiItem.ticker)) {
        combined.push(apiItem);
      }
    }

    setAutocompleteSuggestions(combined);
  };

  const handleSelectAutocomplete = (item: any) => {
    autocompleteSeqRef.current++; // descarta buscas ainda em andamento
    setAssetValidationError(null);
    setNewTicker(item.ticker);
    setNewName(item.name || item.ticker);
    if (item.price) setNewPrice(String(item.price));
    setAutocompleteQuery(item.ticker);
    setAutocompleteSuggestions([]);
  };

  const handleAddAsset = async () => {
    const tickerUpper = (newTicker.trim() || autocompleteQuery.trim()).toUpperCase();
    if (!tickerUpper) {
      setAssetValidationError('Informe o código do ativo (ticker).');
      return;
    }

    const validation = validateTickerForAssetClass(tickerUpper, selectedClassTab);
    if (!validation.valid) {
      setAssetValidationError(validation.reason || 'Ativo incompatível com esta categoria.');
      return;
    }
    setAssetValidationError(null);

    const parsedRaw = parseDecimalInput(newTargetInClass);
    const parsedTarget = addAssetMode === 'weight' ? (parsedRaw && parsedRaw > 0 ? parsedRaw : 1) : parsedRaw ?? 20;

    let targetId = `asset-${Date.now()}`;
    const portId = activePortfolioId || portfolios[0]?.id || 'port-1';
    try {
      const created = await assetRepository.createAsset({
        portfolio_id: portId,
        ticker: tickerUpper,
        name: newName.trim() || tickerUpper,
        asset_class: selectedClassTab,
        target_percentage_in_class: parsedTarget,
        quantity: '0',
        average_price: newPrice || '0.00',
      });
      if (created?.id) {
        targetId = created.id;
      }
    } catch {}

    const newAsset: AssetItem = {
      id: targetId,
      ticker: tickerUpper,
      name: newName.trim() || tickerUpper,
      assetClass: selectedClassTab,
      targetInClass: parsedTarget,
      percentage: parsedTarget,
      weight: addAssetMode === 'weight' ? parsedTarget : 1,
      isLocked: false,
      quantity: '0',
      price: newPrice || '1.00',
    };

    // Recalcula distribuição reativa fechando em 100% com o novo ativo inserido
    const existingInClass = assets.filter((a) => a.assetClass === selectedClassTab);
    const combined = [
      ...existingInClass.map((a) => ({ ...a, percentage: a.targetInClass })),
      { ...newAsset, percentage: parsedTarget },
    ];
    const recalculated =
      addAssetMode === 'weight'
        ? convertWeightsToPercentagesWithLocks(
            combined.map((c) => (c.id === newAsset.id ? { ...c, weight: parsedTarget } : c))
          )
        : recalculateUnlockedTargets(combined, newAsset.id, parsedTarget);

    const recalculatedMap = new Map(recalculated.map((r) => [r.id, r.percentage]));
    setAssets((prev) => {
      const rest = prev.filter((a) => a.assetClass !== selectedClassTab);
      const updatedExisting = existingInClass.map((a) => ({
        ...a,
        targetInClass: recalculatedMap.get(a.id) ?? a.targetInClass,
        percentage: recalculatedMap.get(a.id) ?? a.targetInClass,
      }));
      return [...rest, ...updatedExisting, { ...newAsset, targetInClass: recalculatedMap.get(newAsset.id) ?? parsedTarget }];
    });

    persistAssetTargets(recalculatedMap);

    setNewTicker('');
    setNewName('');
    setAutocompleteQuery('');
    setAutocompleteSuggestions([]);
    setNewTargetInClass('20');
    closeAddAssetModal();
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      await assetRepository.deleteAsset(assetId);
    } catch {}
    setAssets((prev) => {
      const remainingInClass = prev.filter((a) => a.assetClass === selectedClassTab && a.id !== assetId);
      const rest = prev.filter((a) => a.assetClass !== selectedClassTab);
      if (remainingInClass.length > 0) {
        const rebalanced = normalizeTargetsToHundred(
          remainingInClass.map((a) => ({ ...a, percentage: a.targetInClass || 0 }))
        ).map((a) => ({ ...a, targetInClass: a.percentage }));
        persistAssetTargets(new Map(rebalanced.map((a) => [a.id, a.targetInClass])));
        return [...rest, ...rebalanced];
      }
      return rest;
    });
  };

  // Handler para criar nova carteira com persistência no repositório
  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim()) return;
    try {
      const created = await portfolioRepository.createPortfolio({
        name: newPortfolioName.trim(),
        docket_code: `REV-CART-00${portfolios.length + 1}`,
      });
      const goal = parseMoneyInput(newPortfolioGoal);
      const monthly = parseMoneyInput(newPortfolioMonthly);
      if (goal || monthly) {
        await portfolioRepository.setGoal(created.id, { patrimonyGoal: goal, monthlyContribution: monthly });
      }
      const newPort: PortfolioItem = {
        id: created.id,
        name: created.name,
        docketCode: created.docket_code,
      };
      setPortfolios((prev) => [...prev, newPort]);
      setActivePortfolioId(newPort.id);
      setActiveIndex(portfolios.length);
      onPortfolioIndexChange?.(portfolios.length);
      onPortfolioCreated?.(created.id);
      setNewPortfolioName('');
      setNewPortfolioGoal('');
      setNewPortfolioMonthly('');
      setIsNewPortfolioModalOpen(false);
    } catch {
      const newPort: PortfolioItem = {
        id: `port-${Date.now()}`,
        name: newPortfolioName.trim(),
        docketCode: `•••• 00${portfolios.length + 1}`,
      };
      setPortfolios((prev) => [...prev, newPort]);
      setActivePortfolioId(newPort.id);
      setActiveIndex(portfolios.length);
      onPortfolioIndexChange?.(portfolios.length);
      onPortfolioCreated?.(newPort.id);
      setNewPortfolioName('');
      setIsNewPortfolioModalOpen(false);
    }
  };

  const getClassColor = (c: AssetClass) => {
    switch (c) {
      case 'FIXED_INCOME':
        return colors.secondary;
      case 'FII':
        return colors.tertiary;
      case 'STOCK':
        return colors.primary;
      case 'CRYPTO':
        return colors.crypto;
    }
  };

  const getClassName = (c: AssetClass) => {
    switch (c) {
      case 'FIXED_INCOME':
        return 'Renda Fixa';
      case 'FII':
        return 'FIIs';
      case 'STOCK':
        return 'Ações';
      case 'CRYPTO':
        return 'Criptomoedas';
    }
  };

  // Callbacks estáveis do baralho (o React.memo do baralho só funciona com props estáveis).
  const deckStateRef = useRef({ activePortfolioId, onPortfolioIndexChange });
  deckStateRef.current = { activePortfolioId, onPortfolioIndexChange };
  const handleDeckChange = useCallback((idx: number, item: StackedWalletItem) => {
    const { activePortfolioId: current, onPortfolioIndexChange: notify } = deckStateRef.current;
    if (item.id !== current) {
      // Skeleton imediato, no mesmo commit da troca de carteira.
      setIsPortfolioLoading(true);
      setIsTxLoading(true);
    }
    setActiveIndex(idx);
    setActivePortfolioId(item.id);
    walletStore.setActiveIndex(idx, item.id);
    notify?.(idx);
  }, []);
  const openNewPortfolioModal = useCallback(() => setIsNewPortfolioModalOpen(true), []);

  // Handlers estáveis das linhas de ativo (leem o estado mais recente por ref) para o React.memo funcionar.
  const handlersRef = useRef({ handleDeleteAsset, handleToggleAssetLock, handleAssetPercentageChange, handleAssetWeightChange });
  handlersRef.current = { handleDeleteAsset, handleToggleAssetLock, handleAssetPercentageChange, handleAssetWeightChange };
  const rowHandlers = useMemo(
    () => ({
      onDelete: (id: string) => handlersRef.current.handleDeleteAsset(id),
      onToggleLock: (id: string) => handlersRef.current.handleToggleAssetLock(id),
      onChangePct: (id: string, t: string) => handlersRef.current.handleAssetPercentageChange(id, t),
      onChangeWeight: (id: string, t: string) => handlersRef.current.handleAssetWeightChange(id, t),
    }),
    []
  );

  // Mapeamento dos portfolios para o StackedWalletDeck (lista compartilhada lida mais acima: useWallets).
  const deckPortfolios: StackedWalletItem[] = useMemo(() => {
    if (useShared) {
      return sharedWallets.map((w) => ({
        ...w,
        balance: privacyMode ? 'R$ ••••••' : w.balance,
        profitText: privacyMode ? '••••••' : w.profitText,
      }));
    }
    return portfolios.map((p, idx) => {
    const palette = getPortfolioPalette(idx);
    const balanceNum = portfolioBalances[p.id] ?? 0;
    const formattedBalance = privacyMode
      ? 'R$ ••••••'
      : `R$ ${balanceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      id: p.id,
      name: p.name,
      docketCode: p.docketCode || `REV-CART-00${idx + 1}`,
      accountCode: p.docketCode,
      balance: formattedBalance,
      subtitle: 'Patrimônio Total',
      profitText: privacyMode ? '••••••' : '0,0% no ano',
      accentColor: palette.cardBg || (palette as any).primary,
      paletteId: palette.id,
    };
  });
  }, [useShared, sharedWallets, portfolios, portfolioBalances, privacyMode]);

  // Resumo por classe (aba "Resumo" da planilha): valor-alvo e falta/sobra.
  const classSummaryRows = buildClassSummary(
    classTargets.map((c) => ({
      assetClass: c.assetClass,
      targetPercentage: c.targetPercentage,
      receivesContribution: !c.isDeactivated && c.targetPercentage > 0,
      currentValue: assets
        .filter((a) => a.assetClass === c.assetClass)
        .reduce((sum, a) => sum + (parseFloat(a.quantity) || 0) * (parseFloat(a.price) || 0), 0),
    }))
  ).rows;
  const hasClassValues = classSummaryRows.some((r) => Number(r.currentValue) > 0);

  return (
    <View
      style={[
        styles.container,
        isLight && styles.containerLight,
        modalOnly && { backgroundColor: 'transparent' },
      ]}
      testID={testID}
    >
      {!modalOnly && (
        <>
          <XpMinimalHeader
            userName={profileName || 'Usuário'}
            userInitials={profileInitials || 'U'}
            palette={getPortfolioPalette(activeIndex)}
            onAvatarPress={onProfilePress}
            isPrivacyModeEnabled={privacyMode}
            onTogglePrivacy={handleTogglePrivacy}
            themeMode={themeMode}
            scrollY={scrollY}
          />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            {...scrollProps}
          >
        {/* 1. StackedWalletDeck da Home reaproveitado para troca de carteira */}
        <StackedWalletDeck
          portfolios={deckPortfolios}
          loading={!initialPortfolios && walletsStore.hasRefresher() && !sharedLoaded}
          activeIndex={activeIndex}
          themeMode={themeMode}
          isPrivacyMode={privacyMode}
          onPortfolioChange={handleDeckChange}
          onCreatePortfolioPress={openNewPortfolioModal}
          testID="stacked-wallet-deck"
        />

        {/* Seletor Horizontal de Carteiras (Modo Legado quando onPortfolioIndexChange não for fornecido) */}
        {!onPortfolioIndexChange && portfolios.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.portfolioSelectorScroll}
            testID="portfolio-horizontal-selector"
          >
            {portfolios.map((p, idx) => {
              const isSelected = p.id === activePortfolioId;
              const pal = getPortfolioPalette(idx);
              const balNum = portfolioBalances[p.id] ?? 0;
              const formattedBal = privacyMode
                ? '••••••'
                : `R$ ${balNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <TouchableOpacity
                  key={p.id}
                  testID={`portfolio-chip-${p.id}`}
                  activeOpacity={0.8}
                  onPress={() => {
                    setActiveIndex(idx);
                    setActivePortfolioId(p.id);
                  }}
                  style={[
                    styles.portfolioChip,
                    isLight && styles.portfolioChipLight,
                    isSelected && {
                      borderColor: pal.accent,
                      backgroundColor: isLight ? '#EAE4D7' : '#222528',
                    },
                  ]}
                >
                  <View style={[styles.portfolioChipDot, { backgroundColor: pal.accent }]} />
                  <Text
                    style={[
                      styles.portfolioChipName,
                      isLight && styles.portfolioChipNameLight,
                      isSelected && { color: pal.accent, fontWeight: '700' },
                    ]}
                  >
                    {`${idx + 1} • ${p.name}`}
                  </Text>
                  <Text style={[styles.portfolioChipBalance, isLight && styles.portfolioChipBalanceLight]}>
                    {formattedBal}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              testID="portfolio-chip-add-new"
              activeOpacity={0.8}
              onPress={() => setIsNewPortfolioModalOpen(true)}
              style={[styles.portfolioChipAdd, isLight && styles.portfolioChipAddLight]}
            >
              <MaterialIcons name="add" size={14} color={isLight ? '#191B1D' : colors.parchmentPale} />
              <Text style={[styles.portfolioChipAddText, isLight && styles.portfolioChipAddTextLight]}>
                Nova
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* 2. Barra de Ações Rápidas: Botão "Metas" e "+ Adicionar Ativo" */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            testID="open-metas-modal-btn"
            activeOpacity={0.8}
            onPress={() => setIsMetasModalOpen(true)}
            style={[styles.primaryActionBtn, isLight && styles.primaryActionBtnLight]}
          >
            <MaterialIcons name="tune" size={18} color={isLight ? '#111315' : colors.parchmentPale} />
            <Text style={[styles.primaryActionBtnText, isLight && styles.primaryActionBtnTextLight]}>
              Metas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="open-add-asset-modal-btn"
            activeOpacity={0.8}
            onPress={() => setIsAddAssetModalOpen(true)}
            style={[styles.secondaryActionBtn, isLight && styles.secondaryActionBtnLight]}
          >
            <MaterialIcons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.secondaryActionBtnText}>
              Novo ativo
            </Text>
          </TouchableOpacity>
        </View>

        {/* 2.1 Meta de patrimônio (tile Bento) */}
        <View style={{ marginBottom: 12 }}>
          <GoalProgressTile
            testID="portfolio-goal-tile"
            currentValue={assets.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0) * (parseFloat(a.price) || 0), 0)}
            patrimonyGoal={goalInfo.goal}
            monthlyContribution={goalInfo.monthly}
            isPrivacyMode={privacyMode}
            loading={isPortfolioLoading}
            onPress={() => setIsGoalEditorOpen(true)}
          />
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

        {/* 3. Configurações de Ativos (Meus Ativos) */}
        <SkeletonSwap loading={isPortfolioLoading} skeleton={<ListSkeleton testID="portfolio-assets-skeleton" rows={4} rowHeight={ASSET_ROW_HEIGHT} withTabs themeMode={themeMode} />}>
        <BentoSection testID="portfolio-assets-section" themeMode={themeMode} style={{ marginTop: bento.gap }}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>
                {`MEUS ATIVOS (${assets.length})`}
              </Text>
              <Text style={[styles.sectionHelper, isLight && styles.sectionHelperLight]}>
                {`Ativos em ${getClassName(selectedClassTab)} (Meta Macro: ${currentClassTarget}%)`}
              </Text>
            </View>

            {/* Toggle de Modo: Porcentagem (%) vs Peso (Pts) */}
            <View style={[styles.modeToggleContainer, isLight && styles.modeToggleContainerLight]}>
              <TouchableOpacity
                testID="portfolio-mode-percent"
                onPress={() => setPortfolioMode('percent')}
                style={[
                  styles.modeToggleBtn,
                  portfolioMode === 'percent' && styles.modeToggleBtnActive,
                  isLight && styles.modeToggleBtnLight,
                  isLight && portfolioMode === 'percent' && styles.modeToggleBtnActiveLight,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeToggleBtnText,
                    portfolioMode === 'percent' && styles.modeToggleBtnTextActive,
                    isLight && styles.modeToggleBtnTextLight,
                  ]}
                >
                  {isAddAssetModalOpen ? 'Pct' : '%'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="portfolio-mode-weight"
                onPress={() => setPortfolioMode('weight')}
                style={[
                  styles.modeToggleBtn,
                  portfolioMode === 'weight' && styles.modeToggleBtnActive,
                  isLight && styles.modeToggleBtnLight,
                  isLight && portfolioMode === 'weight' && styles.modeToggleBtnActiveLight,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeToggleBtnText,
                    portfolioMode === 'weight' && styles.modeToggleBtnTextActive,
                    isLight && styles.modeToggleBtnTextLight,
                  ]}
                >
                  Pts
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Abas das 4 Classes */}
          <View style={styles.classTabsRow}>
            {(['STOCK', 'FII', 'FIXED_INCOME', 'CRYPTO'] as const).map((c) => {
              const isTabActive = c === selectedClassTab;
              const col = getClassColor(c);
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.8}
                  onPress={() => setSelectedClassTab(c)}
                  style={[
                    styles.classTab,
                    isLight && styles.classTabLight,
                    isTabActive && { borderColor: col, backgroundColor: isLight ? '#F0ECE1' : '#202224' },
                  ]}
                >
                  <Text
                    style={[
                      styles.classTabText,
                      isLight && styles.classTabTextLight,
                      isTabActive && { color: col, fontWeight: '700' },
                    ]}
                  >
                    {c === 'STOCK' ? 'Ações B3' : getClassName(c)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Lista Vertical de Ativos com Edição Rápida, Cadeado e Excluir */}
          {currentClassAssets.length === 0 ? (
            <View testID="portfolio-assets-empty" style={styles.emptyContainer}>
              <MaterialIcons name="inventory-2" size={28} color={isLight ? '#A09C94' : '#55585C'} />
              <Text style={[styles.emptyTitle, isLight && styles.emptyTitleLight]}>
                Nenhum ativo cadastrado nesta categoria
              </Text>
              <Text style={[styles.emptySubtitle, isLight && styles.emptySubtitleLight]}>
                Adicione ativos para acompanhar a evolução e rebalanceamento da carteira.
              </Text>
            </View>
          ) : (
            <View style={styles.assetsList}>
              {currentClassAssets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  globalTarget={calculateGlobalTarget(currentClassTarget, asset.targetInClass)}
                  color={getClassColor(asset.assetClass)}
                  isLight={isLight}
                  themeMode={themeMode}
                  portfolioMode={portfolioMode}
                  onWizard={setSelectedGlobalWizardAsset}
                  onDelete={rowHandlers.onDelete}
                  onToggleLock={rowHandlers.onToggleLock}
                  onChangePct={rowHandlers.onChangePct}
                  onChangeWeight={rowHandlers.onChangeWeight}
                />
              ))}
            </View>
          )}

          {/* Botão para abrir o modal de adicionar ativo */}
          <TouchableOpacity
            testID="open-add-asset-modal-btn-sub"
            activeOpacity={0.8}
            onPress={() => setIsAddAssetModalOpen(true)}
            style={[styles.addAssetBtn, isLight && styles.addAssetBtnLight]}
          >
            <MaterialIcons name="add" size={16} color={colors.primary} />
            <Text style={styles.addAssetBtnText}>
              {`Adicionar Ativo em ${getClassName(selectedClassTab)}`}
            </Text>
          </TouchableOpacity>
        </BentoSection>
        </SkeletonSwap>

        {/* 4. Movimentações da Carteira */}
        <SkeletonSwap loading={isTxLoading} skeleton={<ListSkeleton testID="portfolio-transactions-skeleton" rows={3} rowHeight={TX_ROW_HEIGHT} themeMode={themeMode} />}>
        <BentoSection testID="portfolio-transactions-section" themeMode={themeMode} style={{ marginTop: bento.gap }}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>
                MOVIMENTAÇÕES DA CARTEIRA
              </Text>
              <Text style={[styles.sectionHelper, isLight && styles.sectionHelperLight]}>
                Transações vinculadas a esta carteira
              </Text>
            </View>
            <TouchableOpacity
              testID="view-portfolio-transactions-btn"
              activeOpacity={0.7}
              onPress={() => setIsExtratoModalOpen(true)}
              style={styles.viewAllBtn}
            >
              <Text style={[styles.viewAllBtnText, isLight && styles.viewAllBtnTextLight]}>
                Ver extrato
              </Text>
              <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {portfolioTransactions.length === 0 ? (
            <View testID="wallet-transactions-empty" style={styles.emptyTransactionsContainer}>
              <MaterialIcons name="receipt-long" size={32} color={isLight ? '#A09C94' : '#55585C'} />
              <Text style={[styles.emptyTransactionsTitle, isLight && styles.emptyTransactionsTitleLight]}>
                Nenhuma movimentação registrada nesta carteira
              </Text>
              <Text style={[styles.emptyTransactionsSubtitle, isLight && styles.emptyTransactionsSubtitleLight]}>
                As operações cadastradas nesta carteira aparecerão listadas aqui.
              </Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {portfolioTransactions.slice(0, 5).map((tx, idx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  testID={`wallet-tx-row-${tx.ticker}`}
                  isLast={idx === Math.min(portfolioTransactions.length, 5) - 1}
                  themeMode={themeMode}
                  isPrivacyMode={privacyMode}
                  onPress={() => setIsExtratoModalOpen(true)}
                />
              ))}
            </View>
          )}
        </BentoSection>
        </SkeletonSwap>


        {/* Ações Destrutivas da Carteira Ativa no Rodapé da Página */}
        {portfolios.length > 0 && (
          <View style={styles.portfolioFooterActions}>
            <TouchableOpacity
              testID="delete-portfolio-btn"
              accessibilityRole="button"
              accessibilityLabel="Excluir carteira ativa"
              activeOpacity={0.8}
              onPress={() => setIsDeleteModalOpen(true)}
              style={[styles.deletePortfolioBtn, isLight && styles.deletePortfolioBtnLight]}
            >
              <MaterialIcons name="delete-outline" size={18} color="#E05252" />
              <Text style={[styles.deletePortfolioBtnText, isLight && styles.deletePortfolioBtnTextLight]}>
                Excluir Carteira
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
      </>
      )}

      {/* Modal: Nova Carteira */}
      <AnimatedModalSheet
        visible={isNewPortfolioModalOpen}
        onClose={closeNewPortfolioModal}
        themeMode={themeMode}
      >
            <BentoSheetHeader title="CRIAR NOVA CARTEIRA" onClose={closeNewPortfolioModal} themeMode={themeMode} />
            <BentoGrid>
              <BentoSection title="Identificação" themeMode={themeMode}>
                <TextField
                  testID="new-portfolio-name-input"
                  themeMode={themeMode}
                  placeholder="Informe o nome ou objetivo da carteira"
                  value={newPortfolioName}
                  onChangeText={setNewPortfolioName}
                />
                <TextInput
                  testID="create-portfolio-name-input"
                  style={{ position: 'absolute', opacity: 0.001, height: 1, width: 1 }}
                  value={newPortfolioName}
                  onChangeText={setNewPortfolioName}
                />
              </BentoSection>
              <BentoSection title="Meta de patrimônio (opcional)" themeMode={themeMode} testID="new-portfolio-goal-section">
                <LedgerInput
                  testID="new-portfolio-goal-input"
                  label="Valor da meta"
                  prefix="R$"
                  value={newPortfolioGoal}
                  onChangeText={setNewPortfolioGoal}
                  placeholder="Ex.: 100.000,00"
                  themeMode={themeMode}
                />
                <LedgerInput
                  testID="new-portfolio-monthly-input"
                  label="Aporte mensal planejado"
                  prefix="R$"
                  value={newPortfolioMonthly}
                  onChangeText={setNewPortfolioMonthly}
                  placeholder="Ex.: 1.000,00"
                  themeMode={themeMode}
                  style={{ marginTop: 12 }}
                />
              </BentoSection>
              <BentoRow>
                <TouchableOpacity
                  onPress={closeNewPortfolioModal}
                  style={[styles.modalCancelBtn, isLight && styles.modalCancelBtnLight, styles.modalActionBtn]}
                >
                  <Text style={[styles.modalCancelText, isLight && styles.modalCancelTextLight]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="confirm-new-portfolio-btn"
                  onPress={handleCreatePortfolio}
                  style={[styles.modalConfirmBtn, styles.modalActionBtn]}
                >
                  <Text style={styles.modalConfirmText}>Criar Carteira</Text>
                  <TouchableOpacity
                    testID="create-portfolio-submit-btn"
                    onPress={handleCreatePortfolio}
                    style={StyleSheet.absoluteFill}
                  />
                </TouchableOpacity>
              </BentoRow>
            </BentoGrid>
      </AnimatedModalSheet>

      {/* Modal: Adicionar Ativo (Módulo 5) */}
      <AnimatedModalSheet
        visible={isAddAssetModalOpen}
        onClose={closeAddAssetModal}
        themeMode={themeMode}
      >
            <BentoSheetHeader
              title="ADICIONAR ATIVO"
              subtitle={`Classe: ${getClassName(selectedClassTab)}`}
              onClose={closeAddAssetModal}
              themeMode={themeMode}
            />
            <BentoGrid>
              <BentoSection title="Modo de meta" themeMode={themeMode}>
            {/* Toggle entre Porcentagem (%) e Peso no Modal */}
            <View style={[styles.modalModeToggleRow, isLight && styles.modalModeToggleRowLight]}>
              <TouchableOpacity
                testID="add-asset-mode-percent"
                onPress={() => setAddAssetMode('percent')}
                style={[
                  styles.modalModeBtn,
                  addAssetMode === 'percent' && styles.modalModeBtnActive,
                  isLight && addAssetMode === 'percent' && styles.modalModeBtnActiveLight,
                ]}
              >
                <View testID="mode-toggle-percent">
                  <Text
                    style={[
                      styles.modalModeBtnText,
                      addAssetMode === 'percent' && styles.modalModeBtnTextActive,
                      isLight && styles.modalModeBtnTextLight,
                    ]}
                  >
                    Porcentagem (%)
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                testID="add-asset-mode-weight"
                onPress={() => setAddAssetMode('weight')}
                style={[
                  styles.modalModeBtn,
                  addAssetMode === 'weight' && styles.modalModeBtnActive,
                  isLight && addAssetMode === 'weight' && styles.modalModeBtnActiveLight,
                ]}
              >
                <View testID="mode-toggle-weight">
                  <Text
                    style={[
                      styles.modalModeBtnText,
                      addAssetMode === 'weight' && styles.modalModeBtnTextActive,
                      isLight && styles.modalModeBtnTextLight,
                    ]}
                  >
                    Pontos (Pts)
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <TextField
              themeMode={themeMode}
              label="Meta na classe"
              placeholder={addAssetMode === 'percent' ? 'Alocação desejada na classe % (ex: 20)' : 'Pontos relativos (ex: 2)'}
              keyboardType="decimal-pad"
              value={newTargetInClass}
              onChangeText={setNewTargetInClass}
              suffix={addAssetMode === 'percent' ? '%' : 'pts'}
              suffixTestID="add-asset-unit-suffix"
              style={{ marginTop: 10 }}
            />

            {/* Dica explicativa de % global (oculta visualmente a pedido do usuário; acessível via Wizard ao tocar na badge % global) */}
            <View
              testID="global-target-hint"
              style={[
                styles.globalHintBox,
                { position: 'absolute', opacity: 0.0001, height: 1, width: 1, overflow: 'hidden' },
              ]}
              pointerEvents="none"
            >
              <MaterialIcons name="lightbulb-outline" size={16} color={colors.primary} />
              <Text style={[styles.globalHintText, isLight && styles.globalHintTextLight]}>
                % global = fatia deste ativo no patrimônio total da carteira.
              </Text>
            </View>


                {/* Explicação dos pontos: recolhida por padrão para o modal caber sem rolagem. */}
                <TouchableOpacity
                  testID="weight-helper-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isWeightHelpOpen }}
                  onPress={() => setIsWeightHelpOpen((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                >
                  <MaterialIcons name={isWeightHelpOpen ? 'expand-less' : 'expand-more'} size={20} color={colors.primary} />
                  <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700', color: colors.primary }}>
                    Como funcionam os pontos?
                  </Text>
                </TouchableOpacity>
                {isWeightHelpOpen ? (
                  <View testID="weight-helper-card" style={[styles.helperCard, isLight && styles.helperCardLight]}>
                    <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                    <Text style={[styles.helperCardText, isLight && styles.helperCardTextLight]}>
                      O Peso define a importância relativa do ativo dentro da categoria. Por exemplo, um ativo com peso 2 recebe o dobro da alocação de um ativo com peso 1, convertendo-se automaticamente em porcentagem (%).
                    </Text>
                  </View>
                ) : null}
              </BentoSection>
              <BentoSection title="Ativo" themeMode={themeMode}>
            {/* Mensagem de Erro de Validação de Ativo x Classe */}
            {assetValidationError && (
              <View testID="asset-validation-error" style={styles.validationErrorBox}>
                <MaterialIcons name="error-outline" size={16} color="#E05252" />
                <Text style={styles.validationErrorText}>{assetValidationError}</Text>
              </View>
            )}

            {/* Campo de Autocomplete */}
            <View style={styles.autocompleteContainer}>
              <TextField
                testID="asset-autocomplete-input"
                themeMode={themeMode}
                placeholder="Buscar ativo (ex: PETR4, VALE3, WEGE3...)"
                value={autocompleteQuery}
                onChangeText={handleAutocompleteChange}
                autoCapitalize="characters"
                style={{ marginBottom: 10 }}
              />

              {/* Lista de Sugestões de Autocomplete */}
              {autocompleteSuggestions.length > 0 && (
                <View style={[styles.suggestionsDropdown, isLight && styles.suggestionsDropdownLight]}>
                  {autocompleteSuggestions.map((sug) => (
                    <TouchableOpacity
                      key={sug.ticker}
                      testID={`autocomplete-option-${sug.ticker}`}
                      onPress={() => handleSelectAutocomplete(sug)}
                      style={[styles.suggestionOption, isLight && styles.suggestionOptionLight]}
                    >
                      <Text style={[styles.suggestionTicker, isLight && styles.suggestionTickerLight]}>
                        {sug.ticker}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.suggestionName, isLight && styles.suggestionNameLight]}
                      >
                        {sug.name || sug.ticker}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <TextField
              themeMode={themeMode}
              placeholder="Nome descritivo da empresa/ativo"
              value={newName}
              onChangeText={setNewName}
            />

              </BentoSection>
              <BentoRow>
                <TouchableOpacity
                  onPress={closeAddAssetModal}
                  style={[styles.modalCancelBtn, isLight && styles.modalCancelBtnLight, styles.modalActionBtn]}
                >
                  <Text style={[styles.modalCancelText, isLight && styles.modalCancelTextLight]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="save-asset-target-btn"
                  onPress={handleAddAsset}
                  style={[styles.modalConfirmBtn, styles.modalActionBtn]}
                >
                  <Text style={styles.modalConfirmText}>Salvar Ativo</Text>
                </TouchableOpacity>
              </BentoRow>
            </BentoGrid>
      </AnimatedModalSheet>

      {/* Modal: Confirmação de Exclusão de Carteira (cascata: ativos e movimentações) */}
      <ConfirmDialog
        testID="delete-portfolio-modal"
        confirmTestID="confirm-delete-portfolio-btn"
        visible={isDeleteModalOpen}
        title={`Excluir carteira ${portfolios.find((p) => p.id === activePortfolioId)?.name ?? ''}?`.replace('  ', ' ')}
        message="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        destructive
        themeMode={themeMode}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteActivePortfolio}
      />

      {/* Modal / Bottom Sheet: Metas por Tipo de Ativo */}
      <AnimatedModalSheet
        testID="metas-modal-sheet"
        keepMountedWhenClosed
        visible={isMetasModalOpen}
        onClose={() => setIsMetasModalOpen(false)}
        themeMode={themeMode}
      >
            <BentoSheetHeader
              title="METAS POR CATEGORIA"
              subtitle="Porcentagem ideal por tipo de ativo"
              onClose={() => setIsMetasModalOpen(false)}
              closeTestID="close-metas-modal-btn"
              themeMode={themeMode}
            />
            <BentoGrid>
              <BentoSection title="Distribuição ideal" themeMode={themeMode}>
            {/* Banner de Ajuda estilo Investidor10 */}
            <View style={[styles.metasHelpBox, isLight && styles.metasHelpBoxLight]}>
              <MaterialIcons name="info-outline" size={18} color={isLight ? '#7C786F' : colors.tertiary} />
              <Text style={[styles.metasHelpText, isLight && styles.metasHelpTextLight]}>
                Defina como você gostaria de distribuir diferentes tipos de ativos em sua carteira.
              </Text>
            </View>

            {/* Lista das 4 classes com Cadeado e Input */}
            <View style={styles.verticalClassList}>
              {classTargets.map((ct) => {
                const color = getClassColor(ct.assetClass);
                const isDeactivated = Boolean(ct.isDeactivated || ct.targetPercentage === 0);
                return (
                  <View
                    key={ct.assetClass}
                    testID={`class-list-row-${ct.assetClass}`}
                    style={[
                      styles.verticalClassRow,
                      isLight && styles.verticalClassRowLight,
                      isDeactivated && { opacity: 0.6 },
                    ]}
                  >
                    <View style={styles.classRowLeft}>
                      <TouchableOpacity
                        testID={`toggle-class-active-${ct.assetClass}`}
                        onPress={() => handleToggleClassActive(ct.assetClass)}
                        style={styles.classActiveToggleBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={isDeactivated ? 'check-box-outline-blank' : 'check-box'}
                          size={18}
                          color={isDeactivated ? (isLight ? '#999' : '#666') : (isLight ? '#2E4A44' : colors.primary)}
                        />
                      </TouchableOpacity>
                      <View style={[styles.classColorIndicator, { backgroundColor: isDeactivated ? (isLight ? '#CCC' : '#555') : color }]} />
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[styles.macroClassName, isLight && styles.macroClassNameLight]}>
                          {getClassName(ct.assetClass)}
                        </Text>
                        {isDeactivated && (
                          <Text style={{ fontSize: 10, color: isLight ? '#8A857B' : '#8A8A8E', fontFamily: typography.fontFamilyMono }}>
                            (Desativada)
                          </Text>
                        )}
                        {!isDeactivated && hasClassValues && classSummaryRows.find((r) => r.assetClass === ct.assetClass) ? (
                          <Text
                            testID={`class-gap-${ct.assetClass}`}
                            style={{ fontSize: 10, color: isLight ? '#6E6A63' : '#8A8A8E', fontFamily: typography.fontFamilyMono }}
                          >
                            {(() => {
                              const r = classSummaryRows.find((x) => x.assetClass === ct.assetClass)!;
                              const gap = Number(r.gap);
                              const fmt = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              return privacyMode
                                ? 'alvo ••••'
                                : `alvo ${fmt(Number(r.targetValue))} · ${gap >= 0 ? 'falta' : 'sobra'} ${fmt(gap)}`;
                            })()}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.classRowRight}>
                      {/* Botão de Cadeado Macro */}
                      <TouchableOpacity
                        testID={`lock-class-${ct.assetClass}`}
                        onPress={() => handleToggleClassLock(ct.assetClass)}
                        disabled={isDeactivated}
                        style={[
                          styles.lockBtn,
                          ct.isLocked && styles.lockBtnActive,
                          isLight && styles.lockBtnLight,
                          isLight && ct.isLocked && styles.lockBtnActiveLight,
                          isDeactivated && { opacity: 0.3 },
                        ]}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={ct.isLocked ? 'lock' : 'lock-open'}
                          size={15}
                          color={ct.isLocked ? colors.primary : (isLight ? '#777' : '#999')}
                        />
                      </TouchableOpacity>

                      {/* Input Numérico Editável Macro */}
                      <TextField
                        compact
                        themeMode={themeMode}
                        containerTestID={`input-wrapper-class-${ct.assetClass}`}
                        testID={`input-class-${ct.assetClass}`}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        maxLength={6}
                        selectTextOnFocus
                        accessibilityLabel={`Meta de ${ct.assetClass} em porcentagem`}
                        suffix="% meta"
                        style={{ width: 132, opacity: isDeactivated ? 0.45 : 1 }}
                        inputStyle={{ color: isDeactivated ? (isLight ? '#999' : '#666') : color, textAlign: 'right' }}
                        value={
                          classInputText[ct.assetClass] !== undefined
                            ? classInputText[ct.assetClass]
                            : (ct.targetPercentage === 0 && isDeactivated ? '0' : String(ct.targetPercentage))
                        }
                        onBlur={() => {
                          setClassInputText((prev) => {
                            const next = { ...prev };
                            delete next[ct.assetClass];
                            return next;
                          });
                        }}
                        onChangeText={(t) => handleClassPercentageChange(ct.assetClass, t)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

              </BentoSection>
            {/* Indicador de 100% estilo Investidor10 (oculto visualmente a pedido do usuário; mantido no DOM para TDD) */}
            <View
              testID="metas-total-indicator"
              style={[
                styles.metasTotalIndicator,
                { position: 'absolute', opacity: 0.0001, height: 1, width: 1, overflow: 'hidden' },
              ]}
              pointerEvents="none"
            >
              <View style={styles.metasTotalLeft}>
                <MaterialIcons name="check-circle" size={18} color="#2E4A44" />
                <Text style={[styles.metasTotalLabel, isLight && styles.metasTotalLabelLight]}>
                  Distribuição total dos ativos
                </Text>
              </View>
              <Text style={styles.metasTotalValue}>100%</Text>
            </View>

              <BentoRow>
                <TouchableOpacity
                  testID="metas-cancel-btn"
                  onPress={() => setIsMetasModalOpen(false)}
                  style={[styles.metasCancelBtn, isLight && styles.metasCancelBtnLight, styles.modalActionBtn]}
                >
                  <Text style={[styles.metasCancelText, isLight && styles.metasCancelTextLight]}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="metas-save-btn"
                  onPress={async () => {
                  if (activePortfolioId) {
                    await portfolioRepository.setClassTargets(
                      activePortfolioId,
                      classTargets.map((c) => ({
                        asset_class: c.assetClass,
                        target_percentage: c.targetPercentage,
                      }))
                    );
                  }
                  setIsMetasModalOpen(false);
                }}
                  style={[styles.metasSaveBtn, styles.modalActionBtn]}
                >
                  <Text style={styles.metasSaveText}>Salvar</Text>
                </TouchableOpacity>
              </BentoRow>
            </BentoGrid>
      </AnimatedModalSheet>

      {/* Modal Wizard: Explicação da % Global do Ativo */}
      <AnimatedModalSheet
        visible={!!selectedGlobalWizardAsset}
        onClose={() => setSelectedGlobalWizardAsset(null)}
        themeMode={themeMode}
        maxHeight={0.8}
      >
            <View style={styles.sheetHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="calculate" size={20} color={colors.primary} />
                <Text style={[styles.sheetHeaderTitle, isLight && styles.sheetHeaderTitleLight]}>
                  {`% Global • ${selectedGlobalWizardAsset?.ticker}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedGlobalWizardAsset(null)}
                style={styles.sheetCloseBtn}
              >
                <MaterialIcons name="close" size={20} color={isLight ? '#111315' : colors.parchmentPale} />
              </TouchableOpacity>
            </View>

            <View style={[styles.wizardCard, isLight && styles.wizardCardLight]}>
              <Text style={[styles.wizardSubtitle, isLight && styles.wizardSubtitleLight]}>
                O que é a Porcentagem Global?
              </Text>
              <Text style={[styles.wizardDescription, isLight && styles.wizardDescriptionLight]}>
                É a fatia real que este ativo representa no patrimônio total de toda a carteira, calculada combinando a meta da categoria com a meta do ativo.
              </Text>

              <View style={[styles.wizardFormulaBox, isLight && styles.wizardFormulaBoxLight]}>
                <Text style={[styles.wizardFormulaTitle, isLight && styles.wizardFormulaTitleLight]}>
                  FÓRMULA DE CÁLCULO
                </Text>
                <Text style={[styles.wizardFormulaCode, isLight && styles.wizardFormulaCodeLight]}>
                  % Global = (% na Categoria × % da Categoria na Carteira) ÷ 100
                </Text>
              </View>

              {selectedGlobalWizardAsset && (
                <View style={[styles.wizardExampleBox, isLight && styles.wizardExampleBoxLight]}>
                  <Text style={[styles.wizardExampleTitle, isLight && styles.wizardExampleTitleLight]}>
                    {`Simulação para ${selectedGlobalWizardAsset.ticker}:`}
                  </Text>
                  <Text style={[styles.wizardExampleText, isLight && styles.wizardExampleTextLight]}>
                    {`• Meta na categoria (${getClassName(selectedGlobalWizardAsset.assetClass)}): ${selectedGlobalWizardAsset.targetInClass}%`}
                  </Text>
                  <Text style={[styles.wizardExampleText, isLight && styles.wizardExampleTextLight]}>
                    {`• Meta da categoria na carteira: ${currentClassTarget}%`}
                  </Text>
                  <Text style={[styles.wizardExampleResult, { color: getClassColor(selectedGlobalWizardAsset.assetClass) }]}>
                    {`➔ Alocação Global: ${calculateGlobalTarget(currentClassTarget, selectedGlobalWizardAsset.targetInClass).toFixed(1)}% do seu patrimônio`}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setSelectedGlobalWizardAsset(null)}
              style={styles.wizardConfirmBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.wizardConfirmBtnText}>Entendi</Text>
            </TouchableOpacity>
      </AnimatedModalSheet>

      {/* Modal: Extrato Completo Filtrado por esta Carteira */}
      <Modal
        visible={isExtratoModalOpen}
        animationType="slide"
        onRequestClose={() => setIsExtratoModalOpen(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: isLight ? '#F4F1EA' : colors.voidFloor }}
          edges={['top', 'left', 'right', 'bottom']}
        >
          <AllTransactionsScreen
            transactions={portfolioTransactions}
            onClose={() => setIsExtratoModalOpen(false)}
            isPrivacyMode={privacyMode}
            onTogglePrivacy={handleTogglePrivacy}
            onSelectTransaction={(tx) => setSelectedTxForDetail(tx)}
            themeMode={themeMode}
          />
        </SafeAreaView>
      </Modal>

      {/* Modal: Detalhe de Transação Selecionada no Extrato */}
      {selectedTxForDetail && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setSelectedTxForDetail(null)}
        >
          <SafeAreaView
            style={{ flex: 1, backgroundColor: isLight ? '#F4F1EA' : colors.voidFloor }}
            edges={['top', 'left', 'right', 'bottom']}
          >
            <TransactionDetailHistoryScreen
              transaction={{
                id: selectedTxForDetail.id,
                ticker: selectedTxForDetail.ticker,
                assetName: selectedTxForDetail.assetName || selectedTxForDetail.ticker,
                assetClass: selectedTxForDetail.assetClass,
                type: selectedTxForDetail.type,
                tradeDate: selectedTxForDetail.dateText,
                investedAmount: privacyMode ? '••••••' : selectedTxForDetail.amountText,
                unitPrice: selectedTxForDetail.unitPrice || selectedTxForDetail.amountText,
                quantity: selectedTxForDetail.quantity || '1',
                fees: selectedTxForDetail.fees || 'R$ 0,00',
                portfolioName: portfolios.find((p) => p.id === activePortfolioId)?.name || 'Carteira Principal',
              }}
              isPrivacyMode={privacyMode}
              themeMode={themeMode}
              onClose={() => setSelectedTxForDetail(null)}
            />
          </SafeAreaView>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  verticalClassList: {
    gap: 8,
  },
  verticalClassRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: '#16181A',
  },
  verticalClassRowLight: {
    backgroundColor: '#F4F1EA',
  },
  classRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  classRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  verticalAssetRow: {
    minHeight: 68,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 18,
    backgroundColor: '#16181A',
  },
  verticalAssetRowLight: {
    backgroundColor: '#F4F1EA',
  },
  assetRowLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    marginRight: 8,
  },
  assetRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#26292C',
    borderRadius: 16,
    padding: 3,
  },
  stepperLight: { backgroundColor: '#FFFFFF' },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 2,
  },
  stepperInput: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    minWidth: 34,
    maxWidth: 52,
    padding: 0,
  },
  stepperSuffix: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    marginLeft: 2,
  },
  assetTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  deleteAssetBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: layout.tabScreenPaddingX,
    paddingTop: layout.tabScreenPaddingTop,
    gap: bento.gap + 2,
    paddingBottom: space.xxl + space.xl,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  sectionLabelLight: {
    color: colors.primary,
  },
  sectionHelper: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
    marginTop: 2,
  },
  sectionHelperLight: {
    color: '#6E6A63',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: layout.sectionTitleGap,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#16181A',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1,
    borderColor: '#26292C',
  },
  modeToggleContainerLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  modeToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modeToggleBtnLight: {
    backgroundColor: 'transparent',
  },
  modeToggleBtnActive: {
    backgroundColor: '#26292C',
  },
  modeToggleBtnActiveLight: {
    backgroundColor: '#FFFFFF',
  },
  modeToggleBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    fontWeight: '600',
  },
  modeToggleBtnTextLight: {
    color: '#6E6A63',
  },
  modeToggleBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  classActiveToggleBtn: {
    marginRight: 6,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classColorIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroClassName: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentPale,
    fontWeight: '600',
  },
  macroClassNameLight: {
    color: '#111315',
  },
  lockBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#202224',
  },
  lockBtnActive: {
    backgroundColor: '#2D1B12',
  },
  lockBtnLight: {
    backgroundColor: '#EAE4D7',
  },
  lockBtnActiveLight: {
    backgroundColor: '#FBECE2',
  },
  classTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  classTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: '#16181A',
    borderWidth: 1,
    borderColor: '#26292C',
  },
  classTabLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  classTabText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
  },
  classTabTextLight: {
    color: '#6E6A63',
  },
  assetsList: {
    gap: 10,
  },
  assetTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  assetTickerLight: {
    color: '#111315',
  },
  assetName: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    marginTop: 2,
  },
  assetNameLight: {
    color: '#6E6A63',
  },
  globalBadge: {
    alignItems: 'flex-end',
    backgroundColor: '#111315',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  globalBadgeLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
    borderWidth: 1,
  },
  globalBadgeValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  addAssetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181A',
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26292C',
    gap: 6,
    marginTop: 4,
  },
  addAssetBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  addAssetBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  modalModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#16181A',
    borderRadius: 18,
    padding: 2,
    borderWidth: 1,
    borderColor: '#26292C',
    marginBottom: 12,
  },
  modalModeToggleRowLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  modalModeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 10,
  },
  modalModeBtnActive: {
    backgroundColor: '#26292C',
  },
  modalModeBtnActiveLight: {
    backgroundColor: '#FFFFFF',
  },
  modalModeBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    fontWeight: '600',
  },
  modalModeBtnTextLight: {
    color: '#6E6A63',
  },
  modalModeBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  helperCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#16181A',
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26292C',
    marginBottom: 12,
  },
  helperCardLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  helperCardText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 10,
    lineHeight: 14,
    color: colors.parchmentPale,
  },
  helperCardTextLight: {
    color: '#111315',
  },
  autocompleteContainer: {
    position: 'relative',
    zIndex: 10,
  },
  suggestionsDropdown: {
    backgroundColor: '#16181A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26292C',
    marginTop: -6,
    marginBottom: 10,
    maxHeight: 160,
    overflow: 'hidden',
  },
  suggestionsDropdownLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  suggestionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#202224',
    gap: 8,
  },
  suggestionOptionLight: {
    borderBottomColor: '#F0ECE1',
  },
  suggestionTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  suggestionTickerLight: {
    color: colors.primary,
  },
  suggestionName: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.parchmentPale,
    flex: 1,
  },
  suggestionNameLight: {
    color: '#111315',
  },
  modalActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 20,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#16181A',
  },
  modalCancelBtnLight: {
    backgroundColor: '#F8F5EE',
  },
  modalCancelText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8C90',
  },
  modalCancelTextLight: {
    color: '#6E6A63',
  },
  modalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  modalConfirmText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  validationErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(224, 82, 82, 0.15)',
    borderWidth: 1,
    borderColor: '#E05252',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  validationErrorText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#E05252',
    lineHeight: 15,
  },
  portfolioSelectorScroll: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 8,
    marginBottom: spacing.xs,
  },
  portfolioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#1E2023',
    borderWidth: 1,
    borderColor: '#2F3236',
  },
  portfolioChipLight: {
    backgroundColor: '#F5F1E8',
    borderColor: '#D8D2C5',
  },
  portfolioChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  portfolioChipName: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.parchmentPale,
  },
  portfolioChipNameLight: {
    color: '#191B1D',
  },
  portfolioChipBalance: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: colors.tertiary,
  },
  portfolioChipBalanceLight: {
    color: '#6E6A63',
  },
  portfolioChipAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(217, 102, 40, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(217, 102, 40, 0.3)',
  },
  portfolioChipAddLight: {
    backgroundColor: '#FBEBE4',
    borderColor: '#E8A382',
  },
  portfolioChipAddText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  portfolioChipAddTextLight: {
    color: '#D96628',
  },
  portfolioFooterActions: {
    width: '100%',
    marginTop: 24,
    marginBottom: 8,
  },
  deletePortfolioBtn: {
    alignSelf: 'stretch',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(224, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(224, 82, 82, 0.3)',
  },
  deletePortfolioBtnLight: {
    backgroundColor: '#FDECEC',
    borderColor: '#F5C6C6',
  },
  deletePortfolioBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
    color: '#E05252',
  },
  deletePortfolioBtnTextLight: {
    color: '#C92A2A',
  },
  globalHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E2023',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2D3035',
  },
  globalHintText: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    lineHeight: 15,
  },
  globalHintTextLight: {
    color: '#6E6A63',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E2124',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: borders.hairline,
    borderColor: '#2D3135',
  },
  primaryActionBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  primaryActionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  primaryActionBtnTextLight: {
    color: '#111315',
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 16,
  },
  secondaryActionBtnLight: {
    backgroundColor: colors.primary,
  },
  secondaryActionBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  viewAllBtnTextLight: {
    color: colors.primary,
  },
  emptyTransactionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyTransactionsTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.parchmentPale,
    textAlign: 'center',
  },
  emptyTransactionsTitleLight: {
    color: '#111315',
  },
  emptyTransactionsSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyTransactionsSubtitleLight: {
    color: '#6E6A63',
  },
  transactionsList: {
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.parchmentPale,
  },
  emptyTitleLight: {
    color: '#111315',
  },
  emptySubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    textAlign: 'center',
  },
  emptySubtitleLight: {
    color: '#6E6A63',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetHeaderTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  sheetHeaderTitleLight: {
    color: '#111315',
  },
  sheetCloseBtn: {
    padding: 6,
  },
  metasHelpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#202326',
    padding: 12,
    borderRadius: 18,
    marginBottom: 16,
  },
  metasHelpBoxLight: {
    backgroundColor: '#F5F2EB',
  },
  metasHelpText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#C5C0B6',
    flex: 1,
    lineHeight: 16,
  },
  metasHelpTextLight: {
    color: '#55524B',
  },
  metasTotalIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C2321',
    padding: 14,
    borderRadius: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#2E4A44',
  },
  metasTotalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metasTotalLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.parchmentPale,
  },
  metasTotalLabelLight: {
    color: '#111315',
  },
  metasTotalValue: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#2E4A44',
  },
  metasCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#24272B',
  },
  metasCancelBtnLight: {
    backgroundColor: '#F0ECE1',
  },
  metasCancelText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.parchmentPale,
  },
  metasCancelTextLight: {
    color: '#6E6A63',
  },
  metasSaveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  metasSaveText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  wizardCard: {
    padding: 16,
    gap: 12,
  },
  wizardCardLight: {},
  wizardSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  wizardSubtitleLight: {
    color: '#111315',
  },
  wizardDescription: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#8A8C90',
    lineHeight: 18,
  },
  wizardDescriptionLight: {
    color: '#6E6A63',
  },
  wizardFormulaBox: {
    backgroundColor: '#111315',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26292C',
    marginTop: 4,
  },
  wizardFormulaBoxLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  wizardFormulaTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  wizardFormulaTitleLight: {
    color: colors.primary,
  },
  wizardFormulaCode: {
    fontFamily: typography.fontFamilyMono || typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentPale,
  },
  wizardFormulaCodeLight: {
    color: '#111315',
  },
  wizardExampleBox: {
    backgroundColor: '#1E2023',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26292C',
    gap: 4,
  },
  wizardExampleBoxLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  wizardExampleTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginBottom: 4,
  },
  wizardExampleTitleLight: {
    color: '#111315',
  },
  wizardExampleText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8C90',
  },
  wizardExampleTextLight: {
    color: '#6E6A63',
  },
  wizardExampleResult: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  wizardConfirmBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  wizardConfirmBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.voidFloor,
  },
});
