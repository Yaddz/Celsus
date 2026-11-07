import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { IndicatorGrid } from '../components/ui/IndicatorGrid';
import { PriceAreaChart, ChartRange } from '../components/ui/PriceAreaChart';
import { DividendsCard } from '../components/ui/DividendsCard';
import { StickyAddBar } from '../components/ui/StickyAddBar';
import { AssetClass } from '../components/ui/AttributeStatBar';
import { marketApiService } from '../services/marketApi';
import { assetRepository } from '../repositories/assetRepository';
import { AssetProfile, PricePoint, Dividend } from '../domain/finance/assetProfile';
import { useWallets } from '../stores/walletsStore';
import { useActivePortfolioId } from '../stores/walletStore';
import { colors, typography, borders } from '../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../theme/palettes';

export interface AssetDetailScreenProps {
  ticker: string;
  onBack: () => void;
  onAddAsset?: (prefill: { ticker: string; name: string; assetClass: AssetClass; price: string }) => void;
  onAdjustTarget?: (assetClass: AssetClass) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

/** Siglas do gráfico → intervalo do serviço (Yahoo) e recorte local em dias (quando o serviço não tem o intervalo exato). */
const RANGE_QUERY: Record<ChartRange, { api: string; days?: number }> = {
  '7D': { api: '1mo', days: 7 },
  '30D': { api: '1mo', days: 30 },
  '6M': { api: '6mo' },
  '1A': { api: '1y' },
  '5A': { api: '5y' },
  MAX: { api: 'max' },
};

async function loadHistory(ticker: string, range: ChartRange): Promise<PricePoint[]> {
  const { api, days } = RANGE_QUERY[range];
  const points = await marketApiService.getPriceHistory(ticker, api);
  if (!days) return points;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cutoff);
}

/** Altura do dock flutuante sem a área segura (trilho 60 + respiro). */
const DOCK_BODY_HEIGHT = 76;

const CLASS_BADGE_LABELS: Record<AssetClass, string> = {
  FIXED_INCOME: 'Renda fixa',
  FII: 'FII',
  STOCK: 'Ação',
  CRYPTO: 'Cripto',
};

const CLASS_BORDER_COLORS: Record<AssetClass, string> = {
  FIXED_INCOME: colors.fixedIncome,
  FII: colors.fii,
  STOCK: colors.stock || colors.primary,
  CRYPTO: colors.crypto,
};

export const AssetDetailScreen: React.FC<AssetDetailScreenProps> = ({
  ticker,
  onBack,
  onAddAsset,
  onAdjustTarget,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'asset-detail-screen',
}) => {
  const isLight = themeMode === 'light';
  const insets = useSafeAreaInsets();
  // O dock flutuante (pílulas + respiro) ocupa a base da tela: a barra de adicionar fica logo acima dele.
  const dockClearance = Math.max(insets.bottom, 16) + DOCK_BODY_HEIGHT;
  const cleanTicker = ticker.toUpperCase().trim();

  const [profile, setProfile] = useState<AssetProfile | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [activeRange, setActiveRange] = useState<ChartRange>('1A');
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const rangeRequestRef = useRef(0);
  const activePortfolioId = useActivePortfolioId();
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');

  const { wallets } = useWallets();

  // Selecionar carteira ativa por padrão
  useEffect(() => {
    if (wallets.length > 0 && !selectedWalletId) {
      // Padrão: a carteira que o usuário está usando (não simplesmente a primeira).
      setSelectedWalletId((wallets.find((w) => w.id === activePortfolioId) || wallets[0]).id);
    }
  }, [wallets, selectedWalletId, activePortfolioId]);

  const [walletAssets, setWalletAssets] = useState<any[]>([]);

  const activeWallet = useMemo(() => {
    return wallets.find((w) => w.id === selectedWalletId) || wallets[0] || null;
  }, [wallets, selectedWalletId]);

  useEffect(() => {
    let mounted = true;
    if (activeWallet?.id) {
      assetRepository.getAssetsByPortfolio(activeWallet.id).then((items) => {
        if (mounted) setWalletAssets(items || []);
      }).catch(() => {
        if (mounted) setWalletAssets([]);
      });
    } else {
      setWalletAssets([]);
    }
    return () => {
      mounted = false;
    };
  }, [activeWallet?.id]);

  // Verificar se o ativo já pertence à carteira selecionada
  const existingAsset = useMemo(() => {
    return walletAssets.find((a: any) => a.ticker?.toUpperCase() === cleanTicker);
  }, [walletAssets, cleanTicker]);

  const isAlreadyInWallet = !!existingAsset;

  // Meta só existe se o ativo já está na carteira; fora dela não mostramos meta inventada.
  const assetTargetInWallet = useMemo<number | null>(() => {
    if (!existingAsset) return null;
    const n = parseFloat(String(existingAsset.target_percentage_in_class));
    return Number.isFinite(n) ? n : null;
  }, [existingAsset]);

  // Carregar perfil do ativo e proventos
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([
      marketApiService.getAssetProfile(cleanTicker),
      loadHistory(cleanTicker, activeRange),
      marketApiService.getDividends(cleanTicker),
    ])
      .then(([prof, hist, divs]) => {
        if (mounted) {
          setProfile(prof);
          setPriceHistory(hist);
          setDividends(divs);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('[AssetDetailScreen] error loading profile:', err);
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanTicker, reloadKey]);

  // Recarregar só o gráfico ao trocar de período; respostas antigas (fora de ordem) são descartadas.
  const handleRangeChange = useCallback(
    (range: ChartRange) => {
      setActiveRange(range);
      const req = ++rangeRequestRef.current;
      loadHistory(cleanTicker, range)
        .then((hist) => {
          if (req === rangeRequestRef.current) setPriceHistory(hist);
        })
        .catch(() => {});
    },
    [cleanTicker]
  );

  // Sem preço e sem fonte = não conseguimos carregar nada confiável sobre o ativo.
  const loadFailed = !isLoading && (!profile || profile.source === 'OFFLINE' || !profile.price);

  const handleAddOrAdjust = () => {
    if (isAlreadyInWallet) {
      if (onAdjustTarget && profile) {
        onAdjustTarget(profile.assetClass);
      } else if (onBack) {
        onBack();
      }
    } else {
      onAddAsset?.({
        ticker: cleanTicker,
        name: profile?.name || cleanTicker,
        assetClass: profile?.assetClass || 'STOCK',
        price: profile?.price ? String(profile.price) : '0.00',
      });
    }
  };

  const handleCycleWallet = () => {
    if (wallets.length <= 1) return;
    const currentIndex = wallets.findIndex((w) => w.id === selectedWalletId);
    const nextIndex = (currentIndex + 1) % wallets.length;
    setSelectedWalletId(wallets[nextIndex].id);
  };

  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const cardBg = isLight ? '#FFFFFF' : '#1A1D21';
  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const borderColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  // Variação do dia só é exibida com cotação real (o catálogo local não traz variação).
  const hasLiveQuote = !!profile && profile.source !== 'STATIC_CATALOG' && profile.source !== 'OFFLINE';
  const assetClass = profile?.assetClass || 'STOCK';
  const classColor = CLASS_BORDER_COLORS[assetClass];
  const isPositiveDay = (profile?.change24h || 0) >= 0;
  const changeColor = isPositiveDay ? colors.tertiary : colors.deficit;
  const changeIcon = isPositiveDay ? 'arrow-upward' : 'arrow-downward';
  const prefix = isPositiveDay ? '+' : '';

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: bg }]}>
      {/* Header padrão com voltar, favoritar (ao lado do olho) e privacidade */}
      <XpMinimalHeader
        title="Ativo"
        subtitle="Ficha da empresa"
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: subtextColor }]}>
              Carregando dados do ativo...
            </Text>
          </View>
        ) : loadFailed ? (
          <View testID="asset-detail-error" style={[styles.errorCard, { backgroundColor: cardBg }]}>
            <MaterialIcons name="cloud-off" size={32} color={subtextColor} />
            <Text style={[styles.errorTitle, { color: textColor }]}>Não foi possível carregar {cleanTicker}</Text>
            <Text style={[styles.loadingText, { color: subtextColor, textAlign: 'center' }]}>
              Verifique a conexão e tente de novo.
            </Text>
            <TouchableOpacity
              testID="asset-detail-retry"
              accessibilityRole="button"
              onPress={() => setReloadKey((k) => k + 1)}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Aviso de Dados com Atraso se Cache Vencido */}
            {profile?.isStale && (
              <View style={styles.staleBanner}>
                <MaterialIcons name="schedule" size={14} color="#D5CAA8" />
                <Text style={styles.staleText}>
                  Dados com atraso de mercado • {profile.source || 'Offline'}
                </Text>
              </View>
            )}

            {/* 1. CARD PRINCIPAL DO ATIVO */}
            <View style={[styles.mainCard, { backgroundColor: cardBg }]}>
              {/* Barra colorida da classe na esquerda */}
              <View style={[styles.classColorStrip, { backgroundColor: classColor }]} />

              <View style={styles.mainCardContent}>
                {/* Linha 1: Ticker e Badge da Classe */}
                <View style={styles.tickerBadgeRow}>
                  <Text testID="asset-detail-ticker" style={[styles.tickerTitle, { color: textColor }]}>
                    {cleanTicker}
                  </Text>
                  <View style={[styles.classBadge, { backgroundColor: isLight ? '#EAE5D9' : '#25292E' }]}>
                    <Text style={[styles.classBadgeText, { color: isLight ? '#111315' : '#D5CAA8' }]}>
                      {CLASS_BADGE_LABELS[assetClass] || assetClass}
                    </Text>
                  </View>
                </View>

                {/* Linha 2: Razão Social e Setor */}
                <Text numberOfLines={1} style={[styles.assetSubtitle, { color: subtextColor }]}>
                  {profile?.name || cleanTicker}
                  {profile?.about?.sector ? ` • ${profile.about.sector}` : ''}
                </Text>

                {/* Linha 3: Cotação e Variação do Dia */}
                <View style={styles.quoteRow}>
                  <View>
                    <Text style={[styles.quoteLabel, { color: subtextColor }]}>Cotação atual</Text>
                    <Text style={[styles.quoteValue, { color: textColor }]}>
                      R$ {(profile?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  {hasLiveQuote ? (
                    <View style={styles.dayChangeWrapper}>
                      <MaterialIcons name={changeIcon as any} size={16} color={changeColor} />
                      <Text style={[styles.dayChangeText, { color: changeColor }]}>
                        {prefix}{(profile?.change24h || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Gráfico de Área com Chips de Período */}
                <PriceAreaChart
                  points={priceHistory}
                  activeRange={activeRange}
                  onRangeChange={handleRangeChange}
                  accentColor={classColor}
                  themeMode={themeMode}
                />
              </View>
            </View>

            {/* 2. SEÇÃO: INDICADORES */}
            <View style={styles.sectionWrapper}>
              <Text style={[styles.sectionHeading, { color: subtextColor }]}>
                INDICADORES
              </Text>
              <IndicatorGrid
                assetClass={assetClass}
                indicators={profile?.indicators || {}}
                themeMode={themeMode}
              />
            </View>

            {/* 3. SEÇÃO: PROVENTOS */}
            <View style={styles.sectionWrapper}>
              <Text style={[styles.sectionHeading, { color: subtextColor }]}>
                PROVENTOS
              </Text>
              <DividendsCard
                dividends={dividends}
                currentPrice={profile?.price || 0}
                themeMode={themeMode}
              />
            </View>

            {/* 4. SEÇÃO: SOBRE A EMPRESA */}
            <View style={styles.sectionWrapper}>
              <Text style={[styles.sectionHeading, { color: subtextColor }]}>
                SOBRE A EMPRESA
              </Text>
              <View style={[styles.infoCard, { backgroundColor: cardBg }]}>
                <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.infoLabel, { color: subtextColor }]}>Razão social</Text>
                  <Text style={[styles.infoValue, { color: textColor }]}>
                    {profile?.about?.companyName || profile?.name || cleanTicker}
                  </Text>
                </View>

                <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.infoLabel, { color: subtextColor }]}>Setor</Text>
                  <Text style={[styles.infoValue, { color: textColor }]}>
                    {profile?.about?.sector || '—'}
                  </Text>
                </View>

                <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.infoLabel, { color: subtextColor }]}>Segmento de listagem</Text>
                  <Text style={[styles.infoValue, { color: textColor }]}>
                    {profile?.about?.listingSegment || '—'}
                  </Text>
                </View>

                <View style={[styles.infoRow, { borderBottomColor: borderColor }]}>
                  <Text style={[styles.infoLabel, { color: subtextColor }]}>Ações em circulação</Text>
                  <Text style={[styles.infoValue, { color: textColor }]}>
                    {profile?.about?.sharesOutstanding || '—'}
                  </Text>
                </View>

                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.infoLabel, { color: subtextColor }]}>Site</Text>
                  {profile?.about?.website ? (
                    <TouchableOpacity
                      onPress={() => {
                        const site = profile.about?.website || '';
                        const url = site.startsWith('http') ? site : `https://${site}`;
                        Linking.openURL(url).catch(() => {});
                      }}
                    >
                      <Text style={[styles.siteLink, { color: colors.primary }]}>
                        {profile.about.website.replace(/^https?:\/\//i, '')}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.infoValue, { color: subtextColor }]}>—</Text>
                  )}
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* 5. RODAPÉ FIXO: ADICIONAR À CARTEIRA */}
      <StickyAddBar
        walletName={activeWallet?.name || 'Carteira'}
        assetClass={assetClass}
        targetPercentage={assetTargetInWallet}
        isAlreadyInWallet={isAlreadyInWallet}
        onAddPress={handleAddOrAdjust}
        onWalletSelectPress={handleCycleWallet}
        bottomOffset={dockClearance}
        themeMode={themeMode}
      />
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
    paddingBottom: 24,
  },
  errorCard: {
    borderRadius: borders.radiusLg,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  errorTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: borders.radiusFull,
  },
  retryText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 12,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A3428',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borders.radiusBase,
    marginBottom: 12,
  },
  staleText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#D5CAA8',
  },
  mainCard: {
    borderRadius: borders.radiusLg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 20,
  },
  classColorStrip: {
    width: 5,
  },
  mainCardContent: {
    flex: 1,
    padding: 16,
  },
  tickerBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tickerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  classBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borders.radiusSm,
  },
  classBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
  },
  assetSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 14,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  quoteLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quoteValue: {
    fontFamily: typography.fontFamily,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  dayChangeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 4,
  },
  dayChangeText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionWrapper: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  infoCard: {
    borderRadius: borders.radiusLg,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  infoValue: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  siteLink: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
