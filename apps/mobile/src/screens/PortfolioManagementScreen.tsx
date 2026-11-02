import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders, spacing } from '../theme/tokens';
import { getPortfolioPalette } from '../theme/palettes';
import {
  AssetClass,
  ClassTarget,
  calculateGlobalTarget,
  recalculateUnlockedTargets,
  convertWeightsToPercentagesWithLocks,
} from '../domain/finance';
import { StackedWalletDeck, StackedWalletItem, XpMinimalHeader } from '../components/ui';
import { marketApiService } from '../services/marketApi';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { assetRepository } from '../repositories/assetRepository';
import { validateTickerForAssetClass } from '../domain/finance/assetCatalogValidation';

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
}

export interface PortfolioManagementScreenProps {
  onClose?: () => void;
  isPrivacyMode?: boolean;
  themeMode?: 'dark' | 'light';
  initialClassTargets?: ClassTarget[];
  initialAssets?: AssetItem[];
  initialPortfolios?: any[];
  testID?: string;
  initialActiveIndex?: number;
  autoOpenNewPortfolioModal?: boolean;
  autoOpenAddAssetModal?: boolean;
  onPortfolioIndexChange?: (index: number) => void;
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

export const PortfolioManagementScreen: React.FC<PortfolioManagementScreenProps> = ({
  onClose,
  isPrivacyMode = false,
  themeMode = 'dark',
  initialClassTargets,
  initialAssets,
  initialPortfolios,
  testID = 'portfolio-management-screen',
  initialActiveIndex = 0,
  autoOpenNewPortfolioModal = false,
  autoOpenAddAssetModal = false,
  onPortfolioIndexChange,
}) => {
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch {
    // fallback for test without SafeAreaProvider
  }
  const isLight = themeMode === 'light';

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
  const [portfolioBalances, setPortfolioBalances] = useState<Record<string, number>>({});
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
            setActivePortfolioId(mapped[0].id);
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

  // Carrega ativos do repositório quando a carteira ativa mudar
  useEffect(() => {
    const loadAssetsAndTargets = async () => {
      if (!activePortfolioId) return;
      try {
        if (!initialAssets || initialAssets.length === 0) {
          const dbAssets = await assetRepository.getAssetsByPortfolio(activePortfolioId);
          if (dbAssets && dbAssets.length > 0) {
            setAssets(
              dbAssets.map((a) => ({
                id: a.id,
                ticker: a.ticker,
                name: a.name,
                assetClass: a.asset_class as AssetClass,
                targetInClass: a.target_percentage_in_class || 0,
                percentage: a.target_percentage_in_class || 0,
                weight: Math.max(1, Math.round((a.target_percentage_in_class || 0) / 10)),
                isLocked: false,
                quantity: a.quantity,
                price: a.manual_price_override || a.average_price,
              }))
            );
          }
        }
        if (!initialClassTargets || initialClassTargets.length === 0) {
          const dbTargets = await portfolioRepository.getClassTargets(activePortfolioId);
          if (dbTargets && dbTargets.length > 0) {
            setClassTargets(
              dbTargets.map((ct) => ({
                id: ct.asset_class as AssetClass,
                assetClass: ct.asset_class as AssetClass,
                targetPercentage: ct.target_percentage,
                percentage: ct.target_percentage,
                isLocked: false,
              }))
            );
          }
        }
      } catch {}
    };
    loadAssetsAndTargets();
  }, [activePortfolioId]);

  // Carrega saldos reais das carteiras
  useEffect(() => {
    const calculateBalances = async () => {
      const balances: Record<string, number> = {};
      for (const p of portfolios) {
        try {
          const pAssets = await assetRepository.getAssetsByPortfolio(p.id);
          const total = pAssets.reduce((sum, a) => {
            const q = parseFloat(a.quantity || '0') || 0;
            const pr = parseFloat(a.manual_price_override || a.average_price || '0') || 0;
            return sum + q * pr;
          }, 0);
          balances[p.id] = total;
        } catch {
          balances[p.id] = 0;
        }
      }
      setPortfolioBalances(balances);
    };
    calculateBalances();
  }, [portfolios, assets]);

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

  // -------------------------------------------------------------------------
  // Handlers: Metas Macro e Cadeado
  // -------------------------------------------------------------------------
  const handleToggleClassLock = (assetClass: AssetClass) => {
    setClassTargets((prev) =>
      prev.map((c) => (c.assetClass === assetClass ? { ...c, isLocked: !c.isLocked } : c))
    );
  };

  const handleClassPercentageChange = (assetClass: AssetClass, text: string) => {
    const val = parseFloat(text) || 0;
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
    } else {
      setActivePortfolioId('');
      setActiveIndex(0);
      setAssets([]);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Ativos na Classe (Edição Rápida e Cadeado)
  // -------------------------------------------------------------------------
  const handleToggleAssetLock = (assetId: string) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, isLocked: !a.isLocked } : a))
    );
  };

  const handleAssetPercentageChange = (assetId: string, text: string) => {
    const val = parseFloat(text) || 0;
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
  };

  const handleAssetWeightChange = (assetId: string, text: string) => {
    const val = parseFloat(text) || 1;
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
  };

  // -------------------------------------------------------------------------
  // Handlers: Autocomplete & Adicionar Ativo (Módulo 5)
  // -------------------------------------------------------------------------
  const handleAutocompleteChange = async (text: string) => {
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

    const combined = [...localMatches];
    for (const apiItem of apiMatches) {
      if (!combined.some((c) => c.ticker === apiItem.ticker)) {
        combined.push(apiItem);
      }
    }

    setAutocompleteSuggestions(combined);
  };

  const handleSelectAutocomplete = (item: any) => {
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

    const parsedTarget = parseFloat(newTargetInClass) || 20;

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
    const combined = [...existingInClass.map((a) => ({ ...a, percentage: a.targetInClass })), newAsset];
    const recalculated = recalculateUnlockedTargets(combined, newAsset.id, parsedTarget);

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

    setNewTicker('');
    setNewName('');
    setAutocompleteQuery('');
    setAutocompleteSuggestions([]);
    setNewTargetInClass('20');
    setIsAddAssetModalOpen(false);
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      await assetRepository.deleteAsset(assetId);
    } catch {}
    setAssets((prev) => {
      const remainingInClass = prev.filter((a) => a.assetClass === selectedClassTab && a.id !== assetId);
      const rest = prev.filter((a) => a.assetClass !== selectedClassTab);
      if (remainingInClass.length > 0) {
        const total = remainingInClass.reduce((sum, a) => sum + (a.targetInClass || 0), 0);
        const rebalanced = remainingInClass.map((a) => {
          const newPct = total > 0 ? Math.round(((a.targetInClass || 0) / total) * 100) : Math.round(100 / remainingInClass.length);
          return { ...a, targetInClass: newPct, percentage: newPct };
        });
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
      const newPort: PortfolioItem = {
        id: created.id,
        name: created.name,
        docketCode: created.docket_code,
      };
      setPortfolios((prev) => [...prev, newPort]);
      setActivePortfolioId(newPort.id);
      setActiveIndex(portfolios.length);
      onPortfolioIndexChange?.(portfolios.length);
      setNewPortfolioName('');
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

  // Mapeamento dos portfolios para o StackedWalletDeck
  const deckPortfolios: StackedWalletItem[] = portfolios.map((p, idx) => {
    const palette = getPortfolioPalette(idx);
    const balanceNum = portfolioBalances[p.id] ?? 0;
    const formattedBalance = isPrivacyMode
      ? 'R$ ••••••'
      : `R$ ${balanceNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      id: p.id,
      name: p.name,
      docketCode: p.docketCode || `REV-CART-00${idx + 1}`,
      accountCode: p.docketCode,
      balance: formattedBalance,
      subtitle: 'Patrimônio Total',
      profitText: isPrivacyMode ? 'R$ ••••••' : '0,0% no ano',
      accentColor: palette.primary,
      paletteId: palette.id,
    };
  });

  return (
    <View style={[styles.container, isLight && styles.containerLight]} testID={testID}>
      <XpMinimalHeader
        title="Carteiras"
        onBack={onClose}
        isPrivacyModeEnabled={isPrivacyMode}
        themeMode={themeMode}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. StackedWalletDeck da Home reaproveitado para troca de carteira */}
        <StackedWalletDeck
          portfolios={deckPortfolios}
          activeIndex={activeIndex}
          themeMode={themeMode}
          onPortfolioChange={(idx, item) => {
            if (item.id === '__add_wallet_card__') return;
            setActiveIndex(idx);
            setActivePortfolioId(item.id);
            onPortfolioIndexChange?.(idx);
          }}
          onCreatePortfolioPress={() => setIsNewPortfolioModalOpen(true)}
          testID="stacked-wallet-deck"
        />

        {/* 1.1 Seletor Horizontal de Carteiras com Alternância Direta */}
        {portfolios.length > 0 && (
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
              const formattedBal = isPrivacyMode
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
                    onPortfolioIndexChange?.(idx);
                  }}
                  style={[
                    styles.portfolioChip,
                    isLight && styles.portfolioChipLight,
                    isSelected && {
                      borderColor: pal.primary,
                      backgroundColor: isLight ? '#EAE4D7' : '#222528',
                    },
                  ]}
                >
                  <View style={[styles.portfolioChipDot, { backgroundColor: pal.primary }]} />
                  <Text
                    style={[
                      styles.portfolioChipName,
                      isLight && styles.portfolioChipNameLight,
                      isSelected && { color: pal.primary, fontWeight: '700' },
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

        {/* Ações da Carteira Ativa: Excluir Carteira */}
        {portfolios.length > 0 && (
          <View style={styles.portfolioActionsRow}>
            <TouchableOpacity
              testID="delete-portfolio-btn"
              activeOpacity={0.8}
              onPress={() => setIsDeleteModalOpen(true)}
              style={[styles.deletePortfolioBtn, isLight && styles.deletePortfolioBtnLight]}
            >
              <MaterialIcons name="delete-outline" size={16} color="#E05252" />
              <Text style={[styles.deletePortfolioBtnText, isLight && styles.deletePortfolioBtnTextLight]}>
                Excluir Carteira
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 2. Metas por Classe com Rebalanceamento Reativo 100% e Cadeado (Lista Vertical) */}
        <View style={[styles.cardSection, isLight && styles.cardSectionLight]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>
                Metas por Classe
              </Text>
              <Text style={[styles.sectionHelper, isLight && styles.sectionHelperLight]}>
                Alocação ideal entre classes na carteira (100% automático)
              </Text>
            </View>
          </View>

          <View style={styles.verticalClassList}>
            {classTargets.map((ct) => {
              const color = getClassColor(ct.assetClass);
              return (
                <View
                  key={ct.assetClass}
                  testID={`class-list-row-${ct.assetClass}`}
                  style={[styles.verticalClassRow, isLight && styles.verticalClassRowLight]}
                >
                  <View style={styles.classRowLeft}>
                    <View style={[styles.classColorIndicator, { backgroundColor: color }]} />
                    <Text style={[styles.macroClassName, isLight && styles.macroClassNameLight]}>
                      {getClassName(ct.assetClass)}
                    </Text>
                  </View>

                  <View style={styles.classRowRight}>
                    {/* Botão de Cadeado Macro */}
                    <TouchableOpacity
                      testID={`lock-class-${ct.assetClass}`}
                      onPress={() => handleToggleClassLock(ct.assetClass)}
                      style={[
                        styles.lockBtn,
                        ct.isLocked && styles.lockBtnActive,
                        isLight && styles.lockBtnLight,
                        isLight && ct.isLocked && styles.lockBtnActiveLight,
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
                    <View
                      testID={`input-wrapper-class-${ct.assetClass}`}
                      style={[styles.numericInputWrapper, isLight && styles.numericInputWrapperLight]}
                    >
                      <TextInput
                        testID={`input-class-${ct.assetClass}`}
                        keyboardType="numeric"
                        value={String(ct.targetPercentage)}
                        onChangeText={(t) => handleClassPercentageChange(ct.assetClass, t)}
                        style={[styles.numericInputText, { color }]}
                      />
                      <Text style={[styles.inputUnitText, isLight && styles.inputUnitTextLight]}>% meta</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* 3. Ativos e Metas na Classe (Lista Vertical + Edição Rápida Inline + Excluir) */}
        <View style={[styles.cardSection, isLight && styles.cardSectionLight]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>
                Ativos na Categoria
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
                  Pct
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
          <View style={styles.assetsList}>
            {currentClassAssets.map((asset) => {
              const globalTarget = calculateGlobalTarget(currentClassTarget, asset.targetInClass);
              const color = getClassColor(asset.assetClass);

              return (
                <View
                  key={asset.id}
                  testID={`asset-list-row-${asset.id}`}
                  style={[styles.verticalAssetRow, isLight && styles.verticalAssetRowLight]}
                >
                  <View style={styles.assetRowLeft}>
                    <View style={styles.assetTickerRow}>
                      <Text style={[styles.assetTicker, isLight && styles.assetTickerLight]}>
                        {asset.ticker}
                      </Text>
                      <View style={[styles.globalBadge, isLight && styles.globalBadgeLight]}>
                        <Text style={[styles.globalBadgeValue, { color }]}>
                          {globalTarget.toFixed(1)}% global
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.assetName, isLight && styles.assetNameLight]}>
                      {asset.name}
                    </Text>
                  </View>

                  <View style={styles.assetRowRight}>
                    {/* Botão de Excluir Ativo (Bug #8) */}
                    <TouchableOpacity
                      testID={`delete-asset-${asset.id}`}
                      onPress={() => handleDeleteAsset(asset.id)}
                      style={styles.deleteAssetBtn}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Excluir ativo ${asset.ticker}`}
                    >
                      <MaterialIcons name="delete-outline" size={18} color="#FF6B6B" />
                    </TouchableOpacity>

                    {/* Botão de Cadeado do Ativo */}
                    <TouchableOpacity
                      testID={`lock-asset-${asset.id}`}
                      onPress={() => handleToggleAssetLock(asset.id)}
                      style={[
                        styles.lockBtn,
                        asset.isLocked && styles.lockBtnActive,
                        isLight && styles.lockBtnLight,
                        isLight && asset.isLocked && styles.lockBtnActiveLight,
                      ]}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={asset.isLocked ? 'lock' : 'lock-open'}
                        size={15}
                        color={asset.isLocked ? colors.primary : (isLight ? '#777' : '#999')}
                      />
                    </TouchableOpacity>

                    {/* Input Numérico Editável do Ativo */}
                    <View style={[styles.assetNumericInputWrapper, isLight && styles.assetNumericInputWrapperLight]}>
                      <TextInput
                        testID={`input-asset-${asset.id}`}
                        keyboardType="numeric"
                        value={
                          portfolioMode === 'percent'
                            ? String(asset.targetInClass)
                            : String(asset.weight ?? (asset.targetInClass > 0 ? asset.targetInClass : 1))
                        }
                        onChangeText={(t) =>
                          portfolioMode === 'percent'
                            ? handleAssetPercentageChange(asset.id, t)
                            : handleAssetWeightChange(asset.id, t)
                        }
                        style={[styles.assetNumericInputText, isLight && styles.assetNumericInputTextLight]}
                      />
                      <Text style={[styles.inputUnitText, isLight && styles.inputUnitTextLight]}>
                        {portfolioMode === 'percent' ? '% meta' : 'pts'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

            {/* Botão para abrir o modal de adicionar ativo */}
            <TouchableOpacity
              testID="open-add-asset-modal-btn"
              activeOpacity={0.8}
              onPress={() => setIsAddAssetModalOpen(true)}
              style={[styles.addAssetBtn, isLight && styles.addAssetBtnLight]}
            >
              <MaterialIcons name="add" size={16} color={colors.primary} />
              <Text style={styles.addAssetBtnText}>
                {`Adicionar Ativo em ${getClassName(selectedClassTab)}`}
              </Text>
            </TouchableOpacity>
          </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Modal: Nova Carteira */}
      <Modal visible={isNewPortfolioModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, isLight && styles.modalContainerLight]}>
            <Text style={[styles.modalTitle, isLight && styles.modalTitleLight]}>CRIAR NOVA CARTEIRA</Text>
            <Text style={[styles.modalSubtitle, isLight && styles.modalSubtitleLight]}>
              Informe o nome ou finalidade do Dossiê
            </Text>
            <TextInput
              testID="new-portfolio-name-input"
              style={[styles.modalInput, isLight && styles.modalInputLight]}
              placeholder="Ex: Aposentadoria, Férias, Reserva"
              placeholderTextColor={isLight ? '#999' : '#666'}
              value={newPortfolioName}
              onChangeText={setNewPortfolioName}
            />
            <TextInput
              testID="create-portfolio-name-input"
              style={{ position: 'absolute', opacity: 0.001, height: 1, width: 1 }}
              value={newPortfolioName}
              onChangeText={setNewPortfolioName}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                onPress={() => setIsNewPortfolioModalOpen(false)}
                style={[styles.modalCancelBtn, isLight && styles.modalCancelBtnLight]}
              >
                <Text style={[styles.modalCancelText, isLight && styles.modalCancelTextLight]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-new-portfolio-btn"
                onPress={handleCreatePortfolio}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>Criar Dossiê</Text>
                <TouchableOpacity
                  testID="create-portfolio-submit-btn"
                  onPress={handleCreatePortfolio}
                  style={StyleSheet.absoluteFillObject}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Adicionar Ativo (Módulo 5) */}
      <Modal visible={isAddAssetModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, isLight && styles.modalContainerLight]}>
            <Text style={[styles.modalTitle, isLight && styles.modalTitleLight]}>ADICIONAR ATIVO</Text>
            <Text style={[styles.modalSubtitle, isLight && styles.modalSubtitleLight]}>
              {`Classe: ${getClassName(selectedClassTab)}`}
            </Text>

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

            {/* Dica explicativa de % global */}
            <View testID="global-target-hint" style={[styles.globalHintBox, isLight && styles.globalHintBoxLight]}>
              <MaterialIcons name="lightbulb-outline" size={16} color={colors.primary} />
              <Text style={[styles.globalHintText, isLight && styles.globalHintTextLight]}>
                % global = fatia deste ativo no patrimônio total da carteira.
              </Text>
            </View>

            {/* Card Explicativo de Peso (weight-helper-card) */}
            <View testID="weight-helper-card" style={[styles.helperCard, isLight && styles.helperCardLight]}>
              <MaterialIcons name="info-outline" size={16} color={colors.primary} />
              <Text style={[styles.helperCardText, isLight && styles.helperCardTextLight]}>
                O Peso define a importância relativa do ativo dentro da categoria. Por exemplo, um ativo com peso 2 recebe o dobro da alocação de um ativo com peso 1, convertendo-se automaticamente em porcentagem (%).
              </Text>
            </View>

            {/* Mensagem de Erro de Validação de Ativo x Classe */}
            {assetValidationError && (
              <View testID="asset-validation-error" style={styles.validationErrorBox}>
                <MaterialIcons name="error-outline" size={16} color="#E05252" />
                <Text style={styles.validationErrorText}>{assetValidationError}</Text>
              </View>
            )}

            {/* Campo de Autocomplete */}
            <View style={styles.autocompleteContainer}>
              <TextInput
                testID="asset-autocomplete-input"
                style={[styles.modalInput, isLight && styles.modalInputLight]}
                placeholder="Buscar ativo (ex: PETR4, VALE3, WEGE3...)"
                placeholderTextColor={isLight ? '#999' : '#666'}
                value={autocompleteQuery}
                onChangeText={handleAutocompleteChange}
                autoCapitalize="characters"
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

            <TextInput
              style={[styles.modalInput, isLight && styles.modalInputLight]}
              placeholder="Nome descritivo da empresa/ativo"
              placeholderTextColor={isLight ? '#999' : '#666'}
              value={newName}
              onChangeText={setNewName}
            />

            <View style={[styles.modalTargetInputWrapper, isLight && styles.modalTargetInputWrapperLight]}>
              <TextInput
                style={[styles.modalTargetInputText, isLight && styles.modalTargetInputTextLight]}
                placeholder={addAssetMode === 'percent' ? 'Alocação desejada na classe % (ex: 20)' : 'Pontos relativos (ex: 2)'}
                placeholderTextColor={isLight ? '#999' : '#666'}
                keyboardType="numeric"
                value={newTargetInClass}
                onChangeText={setNewTargetInClass}
              />
              <Text
                testID="add-asset-unit-suffix"
                style={[styles.modalTargetUnitSuffix, isLight && styles.modalTargetUnitSuffixLight]}
              >
                {addAssetMode === 'percent' ? '%' : 'pts'}
              </Text>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                onPress={() => setIsAddAssetModalOpen(false)}
                style={[styles.modalCancelBtn, isLight && styles.modalCancelBtnLight]}
              >
                <Text style={[styles.modalCancelText, isLight && styles.modalCancelTextLight]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-asset-target-btn"
                onPress={handleAddAsset}
                style={styles.modalConfirmBtn}
              >
                <Text style={styles.modalConfirmText}>Salvar Ativo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Confirmação de Exclusão de Carteira em Cascata */}
      <Modal visible={isDeleteModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, isLight && styles.modalContainerLight]}>
            <Text style={[styles.modalTitle, isLight && styles.modalTitleLight]}>
              EXCLUIR CARTEIRA
            </Text>
            <Text style={[styles.modalSubtitle, isLight && styles.modalSubtitleLight, { marginBottom: 16 }]}>
              Tem certeza de que deseja excluir esta carteira? Todos os ativos e transações associados serão removidos definitivamente em cascata.
            </Text>
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                onPress={() => setIsDeleteModalOpen(false)}
                style={[styles.modalCancelBtn, isLight && styles.modalCancelBtnLight]}
              >
                <Text style={[styles.modalCancelText, isLight && styles.modalCancelTextLight]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-delete-portfolio-btn"
                onPress={handleDeleteActivePortfolio}
                style={[styles.modalConfirmBtn, { backgroundColor: '#E05252' }]}
              >
                <Text style={styles.modalConfirmText}>Confirmar Exclusão</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1E2023',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D3035',
  },
  verticalClassRowLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  classRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  classRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verticalAssetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1E2023',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2D3035',
    marginBottom: 8,
  },
  verticalAssetRowLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  assetRowLeft: {
    flex: 1,
    gap: 2,
  },
  assetRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assetTickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteAssetBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  addPortfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181A',
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26292C',
    borderStyle: 'dashed',
    gap: 8,
    marginTop: -4,
  },
  addPortfolioBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  addPortfolioBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentPale,
    fontWeight: '600',
  },
  addPortfolioBtnTextLight: {
    color: '#111315',
  },
  cardSection: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    padding: 16,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  cardSectionLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
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
    marginBottom: 14,
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
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  macroCard: {
    width: '48%',
    backgroundColor: '#16181A',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26292C',
    justifyContent: 'space-between',
  },
  macroCardLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  macroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  macroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  numericInputWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#111315',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#26292C',
    width: 72,
    justifyContent: 'flex-end',
  },
  numericInputWrapperLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  numericInputText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    padding: 0,
    textAlign: 'right',
    minWidth: 32,
  },
  inputUnitText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    fontWeight: '600',
    marginLeft: 2,
  },
  inputUnitTextLight: {
    color: '#6E6A63',
  },
  classTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  classTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
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
  assetCard: {
    backgroundColor: '#16181A',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26292C',
  },
  assetCardLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  assetInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
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
  globalBadgeLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#8A8C90',
    textTransform: 'uppercase',
  },
  globalBadgeLabelLight: {
    color: '#6E6A63',
  },
  globalBadgeValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  assetTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#26292C',
  },
  assetTargetRowLight: {
    borderTopColor: '#EAE4D7',
  },
  assetModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  targetInClassLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
  },
  targetInClassLabelLight: {
    color: '#6E6A63',
  },
  convertedPercentLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  assetEditControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assetNumericInputWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#111315',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#26292C',
    minWidth: 64,
  },
  assetNumericInputWrapperLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  assetNumericInputText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.parchmentPale,
    padding: 0,
    minWidth: 26,
    textAlign: 'right',
  },
  assetNumericInputTextLight: {
    color: '#111315',
  },
  addAssetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181A',
    paddingVertical: 12,
    borderRadius: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#26292C',
  },
  modalContainerLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  modalTitleLight: {
    color: colors.primary,
  },
  modalSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    marginTop: 2,
    marginBottom: 14,
  },
  modalSubtitleLight: {
    color: '#6E6A63',
  },
  modalModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#16181A',
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  modalInput: {
    backgroundColor: '#16181A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26292C',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.parchmentPale,
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginBottom: 10,
  },
  modalInputLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
    color: '#111315',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
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
    borderRadius: 10,
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
  portfolioActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  deletePortfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
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
    fontSize: 11,
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
  globalHintBoxLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
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
  modalTargetInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111315',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26292C',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  modalTargetInputWrapperLight: {
    backgroundColor: '#F8F5EE',
    borderColor: '#EAE4D7',
  },
  modalTargetInputText: {
    flex: 1,
    paddingVertical: 10,
    color: colors.parchmentPale,
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  modalTargetInputTextLight: {
    color: '#111315',
  },
  modalTargetUnitSuffix: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 6,
  },
  modalTargetUnitSuffixLight: {
    color: colors.primary,
  },
});
