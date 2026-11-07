import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { TextField } from '../components/ui/TextField';
import { AssetSearchRow, AssetSearchItem } from '../components/ui/AssetSearchRow';
import { RankingTable } from '../components/ui/RankingTable';
import { BentoRow } from '../components/ui/BentoGrid';
import { AssetClass } from '../components/ui/AttributeStatBar';
import { marketApiService, STATIC_CATALOG_ASSETS } from '../services/marketApi';
import { appMetaRepository } from '../repositories/appMetaRepository';
import { RankingItem, rankAssets } from '../domain/finance/assetProfile';
import { colors, typography, borders, layout } from '../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../theme/palettes';

export interface SearchAssetsScreenProps {
  onSelectAsset: (ticker: string) => void;
  onProfilePress?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

const DEFAULT_RECENTS = ['PETR4', 'VALE3', 'ITUB4', 'MXRF11', 'BTC'];

const RANKING_CLASSES: Array<{ id: AssetClass; label: string }> = [
  { id: 'FII', label: 'FIIs' },
  { id: 'STOCK', label: 'Ações' },
  { id: 'CRYPTO', label: 'Cripto' },
];

const CLASS_FILTERS: Array<{ id: AssetClass | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'STOCK', label: 'Ações' },
  { id: 'FII', label: 'FIIs' },
  { id: 'FIXED_INCOME', label: 'Renda fixa' },
  { id: 'CRYPTO', label: 'Cripto' },
];

export const SearchAssetsScreen: React.FC<SearchAssetsScreenProps> = ({
  onSelectAsset,
  onProfilePress,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'search-assets-screen',
}) => {
  const isLight = themeMode === 'light';
  const [, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<AssetClass | 'ALL'>('ALL');
  const [recentSearches, setRecentSearches] = useState<string[]>(DEFAULT_RECENTS);
  const [isOffline, setIsOffline] = useState(false);

  // Estado do Ranking
  const [rankingClass, setRankingClass] = useState<AssetClass>('FII');
  const [rankingBy, setRankingBy] = useState<'dy' | 'pvp' | 'change' | 'price' | 'ticker'>('dy');
  const [rankingDir, setRankingDir] = useState<'asc' | 'desc'>('desc');
  const [rankingItems, setRankingItems] = useState<RankingItem[]>([]);
  const [isRankingLoading, setIsRankingLoading] = useState(false);

  // Carregar buscas recentes
  useEffect(() => {
    let mounted = true;
    appMetaRepository.getRecentSearches().then((recents) => {
      if (mounted && recents && recents.length > 0) {
        setRecentSearches(recents);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Debounce de 250ms na digitação
  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        setDebouncedQuery(searchQuery.trim());
      });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Carregar dados de ranking
  // Mostra de imediato o último resultado da classe (ou o catálogo local) e atualiza por cima quando os
  // indicadores chegam: a primeira consulta pode levar alguns segundos e a lista nunca fica "sumida".
  const rankingCacheRef = useRef<Record<string, RankingItem[]>>({});
  useEffect(() => {
    let mounted = true;
    const key = `${rankingClass}|${rankingBy}`;
    const cachedList = rankingCacheRef.current[key];
    setRankingItems(
      cachedList ??
        STATIC_CATALOG_ASSETS.filter((a) => a.asset_class === rankingClass).map((a) => ({
          ticker: a.ticker,
          name: a.name,
          assetClass: rankingClass,
          price: 0,
          dy12m: null,
          pvp: null,
          change24h: 0,
        }))
    );
    setIsRankingLoading(true);
    marketApiService
      .getRanking(rankingClass, rankingBy, 20)
      .then((items) => {
        if (mounted) {
          const list = items || [];
          if (list.length > 0) rankingCacheRef.current[key] = list;
          setRankingItems(list);
          // Sem nenhum indicador (DY/P-VP) = serviço de fundamentos indisponível; só catálogo local.
          setIsOffline(list.length > 0 && list.every((i) => i.dy12m == null && i.pvp == null));
          setIsRankingLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setIsOffline(true);
          setIsRankingLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [rankingClass, rankingBy]);

  // Resultados: catálogo local aparece na hora; o catálogo do serviço refina (e prevalece) quando chega.
  const toItem = (a: any): AssetSearchItem => ({
    ticker: a.ticker,
    name: a.name || a.ticker,
    assetClass: (a.asset_class || a.assetClass || 'STOCK') as AssetClass,
    price: parseFloat(String(a.price)) || 0,
    // Variação do dia só existe com cotação real; nunca é preenchida com valor padrão.
    change24h: typeof a.change_24h === 'number' ? a.change_24h : undefined,
  });

  const [remoteResults, setRemoteResults] = useState<{ query: string; items: AssetSearchItem[] }>({
    query: '',
    items: [],
  });

  useEffect(() => {
    if (!debouncedQuery) return;
    let mounted = true;
    marketApiService
      .searchCatalog(debouncedQuery, selectedClass === 'ALL' ? undefined : selectedClass)
      .then((res) => {
        if (mounted) setRemoteResults({ query: `${debouncedQuery}|${selectedClass}`, items: (res || []).map(toItem) });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedClass]);

  const searchResults = useMemo<AssetSearchItem[]>(() => {
    const q = debouncedQuery.toUpperCase();
    if (!q) return [];
    let local = STATIC_CATALOG_ASSETS.filter(
      (a) => a.ticker.toUpperCase().includes(q) || a.name.toUpperCase().includes(q)
    );
    if (selectedClass !== 'ALL') local = local.filter((a) => a.asset_class === selectedClass);
    const merged = new Map<string, AssetSearchItem>();
    local.map(toItem).forEach((i) => merged.set(i.ticker, i));
    if (remoteResults.query === `${debouncedQuery}|${selectedClass}`) {
      remoteResults.items.forEach((i) => merged.set(i.ticker, i));
    }
    return Array.from(merged.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, selectedClass, remoteResults]);

  const handleAssetSelect = (ticker: string) => {
    appMetaRepository.addRecentSearch(ticker);
    onSelectAsset(ticker);
  };

  const sortedRanking = useMemo(() => {
    return rankAssets(rankingItems, rankingBy, rankingDir);
  }, [rankingItems, rankingBy, rankingDir]);

  const handleRankingSort = (by: 'dy' | 'pvp' | 'change' | 'price' | 'ticker') => {
    if (rankingBy === by) {
      setRankingDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setRankingBy(by);
      setRankingDir('desc');
    }
  };

  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const chipBg = isLight ? '#EAE5D9' : '#22252A';

  const isTyping = debouncedQuery.length > 0;

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: bg }]}>
      {/* Header padrão minimalista XP */}
      <XpMinimalHeader
        userName="Pedro"
        userInitials="PL"
        isPrivacyModeEnabled={isPrivacyMode}
        onAvatarPress={onProfilePress}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Offline */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="cloud-off" size={16} color="#D5CAA8" />
            <Text style={styles.offlineText}>
              Indicadores indisponíveis agora: exibindo só o catálogo local
            </Text>
          </View>
        )}

        {/* Campo de Busca Único */}
        <View style={styles.searchFieldWrapper}>
          <TextField
            testID="search-asset-input"
            themeMode={themeMode}
            placeholder="Nome da empresa ou ticker"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="characters"
            leftAdornment={
              <MaterialIcons
                name="search"
                size={20}
                color={subtextColor}
                style={{ marginLeft: 8 }}
              />
            }
            rightAdornment={
              searchQuery.length > 0 ? (
                <TouchableOpacity
                  testID="search-clear-button"
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => {
                    setSearchQuery('');
                    setDebouncedQuery('');
                  }}
                >
                  <MaterialIcons name="close" size={18} color={subtextColor} />
                </TouchableOpacity>
              ) : undefined
            }
          />
        </View>

        {/* ESTADO DIGITANDO: RESULTADOS DE BUSCA */}
        {isTyping ? (
          <View style={styles.resultsContainer}>
            {/* Chips de filtro por classe */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.classChipsScroll}
            >
              {CLASS_FILTERS.map((f) => {
                const isSelected = selectedClass === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setSelectedClass(f.id)}
                    style={[
                      styles.classFilterChip,
                      { backgroundColor: isSelected ? colors.primary : chipBg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.classFilterText,
                        { color: isSelected ? '#FFFFFF' : textColor },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {searchResults.length > 0 ? (
              <View style={styles.resultsList}>
                {searchResults.map((item, idx) => (
                  <AssetSearchRow
                    key={item.ticker}
                    item={item}
                    themeMode={themeMode}
                    isLast={idx === searchResults.length - 1}
                    onPress={(selected) => handleAssetSelect(selected.ticker)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyResultsBox}>
                <MaterialIcons name="search-off" size={32} color={subtextColor} />
                <Text style={[styles.emptyTitle, { color: textColor }]}>
                  Nenhum ativo encontrado
                </Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  Tente buscar pelo código do papel ou nome da empresa.
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* ESTADO OCIOSO: MAIS BUSCADOS, ATALHOS E RANKING */
          <View style={styles.idleContainer}>
            {/* Mais Buscados / Recentes */}
            <View style={styles.recentsSection}>
              <Text style={[styles.sectionTitle, { color: subtextColor }]}>
                MAIS BUSCADOS
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentsRow}
              >
                {recentSearches.map((ticker) => (
                  <TouchableOpacity
                    key={ticker}
                    testID={`recent-chip-${ticker}`}
                    activeOpacity={0.7}
                    onPress={() => handleAssetSelect(ticker)}
                    style={[styles.recentChip, { backgroundColor: chipBg }]}
                  >
                    <Text style={[styles.recentChipText, { color: textColor }]}>
                      {ticker}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* 2 Tiles de Atalho em BentoRow (conforme mockup) */}
            <BentoRow style={styles.shortcutRow}>
              {/* Tile Verde: Maiores dividendos */}
              <TouchableOpacity
                testID="shortcut-tile-dividends"
                activeOpacity={0.8}
                onPress={() => {
                  setRankingClass('FII');
                  setRankingBy('dy');
                  setRankingDir('desc');
                }}
                style={[styles.shortcutTile, { backgroundColor: '#1D3B32' }]}
              >
                <View style={styles.shortcutIconCircle}>
                  <MaterialIcons name="attach-money" size={18} color="#48C78E" />
                </View>
                <Text style={styles.shortcutTileText}>Maiores dividendos</Text>
              </TouchableOpacity>

              {/* Tile Dourado: Maiores altas */}
              <TouchableOpacity
                testID="shortcut-tile-gainers"
                activeOpacity={0.8}
                onPress={() => {
                  setRankingBy('change');
                  setRankingDir('desc');
                }}
                style={[styles.shortcutTile, { backgroundColor: '#D89E34' }]}
              >
                <View style={[styles.shortcutIconCircle, { backgroundColor: 'rgba(0,0,0,0.15)' }]}>
                  <MaterialIcons name="trending-up" size={18} color="#111315" />
                </View>
                <Text style={[styles.shortcutTileText, { color: '#111315' }]}>
                  Maiores altas
                </Text>
              </TouchableOpacity>
            </BentoRow>

            {/* Seção Ranking com Filtros de Classe */}
            <View style={styles.rankingSection}>
              <View style={styles.rankingHeaderRow}>
                <Text style={[styles.rankingTitle, { color: textColor }]}>
                  Ranking · {RANKING_CLASSES.find((c) => c.id === rankingClass)?.label} por{' '}
                  {rankingBy === 'dy' ? 'DY' : rankingBy === 'pvp' ? 'P/VP' : rankingBy === 'change' ? 'altas' : 'preço'}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.classChipsScroll}
              >
                {RANKING_CLASSES.map((c) => {
                  const on = rankingClass === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      testID={`ranking-class-${c.id}`}
                      onPress={() => setRankingClass(c.id)}
                      style={[styles.classFilterChip, { backgroundColor: on ? colors.primary : chipBg }]}
                    >
                      <Text style={[styles.classFilterText, { color: on ? '#FFFFFF' : textColor }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Tabela de Ranking */}
              {isRankingLoading ? (
                <View testID="ranking-updating" style={styles.rankingUpdating}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.filtersBtnText, { color: subtextColor }]}>Atualizando indicadores…</Text>
                </View>
              ) : null}
              <RankingTable
                items={sortedRanking}
                sortBy={rankingBy}
                sortDir={rankingDir}
                onSortChange={handleRankingSort}
                onRowPress={handleAssetSelect}
                themeMode={themeMode}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3A3428',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borders.radiusBase,
    marginBottom: 12,
  },
  offlineText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#D5CAA8',
  },
  searchFieldWrapper: {
    marginBottom: 16,
  },
  resultsContainer: {
    marginTop: 4,
  },
  classChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  classFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borders.radiusFull,
  },
  classFilterText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  resultsList: {
    marginTop: 4,
  },
  emptyResultsBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  idleContainer: {
    marginTop: 4,
  },
  recentsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  recentsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  recentChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borders.radiusFull,
  },
  recentChipText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutRow: {
    marginBottom: 20,
    gap: 12,
  },
  shortcutTile: {
    flex: 1,
    height: 90,
    borderRadius: borders.radiusLg,
    padding: 12,
    justifyContent: 'space-between',
  },
  shortcutIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTileText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#F4F1EA',
  },
  rankingSection: {
    marginBottom: 24,
  },
  rankingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankingTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  filtersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filtersBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  rankingUpdating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  rankingLoading: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
