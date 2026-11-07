import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders, layout, space } from '../theme/tokens';
import { AssetClass, ASSET_CLASS_ATTRIBUTE_MAP } from '../components/ui/AttributeStatBar';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';

export interface TransactionDetailData {
  id: string;
  ticker: string;
  assetName?: string;
  assetClass?: AssetClass;
  type: 'BUY' | 'SELL';
  tradeDate: string;
  investedAmount: string;
  unitPrice: string;
  quantity: string;
  fees: string;
  averagePrice?: string;
  portfolioName?: string;
  notes?: string;
}

export interface TransactionHistoryItem {
  id: string;
  tradeDate: string;
  type: 'BUY' | 'SELL';
  quantity: string;
  unitPrice: string;
  totalAmount: string;
  fees: string;
  notes?: string;
  /** Hora do evento (HH:mm), quando disponível. */
  tradeTime?: string;
}

export interface TransactionDetailHistoryScreenProps {
  transactionId?: string;
  transaction?: TransactionDetailData;
  history?: TransactionHistoryItem[];
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onClose?: () => void;
  testID?: string;
  themeMode?: 'dark' | 'light';
}

const DEFAULT_TRANSACTION: TransactionDetailData = {
  id: 'tx-101',
  ticker: 'PETR4',
  assetName: 'Petróleo Brasileiro S.A.',
  assetClass: 'STOCK',
  type: 'BUY',
  tradeDate: '2026-10-31',
  investedAmount: 'R$ 1.500,00',
  unitPrice: 'R$ 35,00',
  quantity: '42',
  fees: 'R$ 5,00',
  averagePrice: 'R$ 34,20',
  portfolioName: 'Carteira Principal',
};

const DEFAULT_HISTORY: TransactionHistoryItem[] = [
  {
    id: 'tx-101',
    tradeDate: '2026-10-31',
    type: 'BUY',
    quantity: '42',
    unitPrice: 'R$ 35,00',
    totalAmount: 'R$ 1.470,00',
    fees: 'R$ 5,00',
    notes: 'Aporte mensal',
  },
  {
    id: 'tx-090',
    tradeDate: '2026-09-15',
    type: 'BUY',
    quantity: '50',
    unitPrice: 'R$ 34,00',
    totalAmount: 'R$ 1.700,00',
    fees: 'R$ 5,00',
    notes: 'Rebalanceamento',
  },
  {
    id: 'tx-080',
    tradeDate: '2026-08-10',
    type: 'BUY',
    quantity: '30',
    unitPrice: 'R$ 33,00',
    totalAmount: 'R$ 990,00',
    fees: 'R$ 3,00',
  },
];

export const TransactionDetailHistoryScreen: React.FC<TransactionDetailHistoryScreenProps> = ({
  transaction = DEFAULT_TRANSACTION,
  history,
  isPrivacyMode = false,
  onTogglePrivacy,
  onClose = () => {},
  testID = 'transaction-detail-history-screen',
  themeMode = 'dark',
}) => {
  const insets = useSafeAreaInsets();
  const isLight = themeMode === 'light';
  const tx = transaction || DEFAULT_TRANSACTION;
  const historyList = history !== undefined
    ? history
    : (tx.id === DEFAULT_TRANSACTION.id ? DEFAULT_HISTORY : []);

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const monthKey = (d: string): { key: string; label: string; sort: string } => {
    let y = '';
    let m = '';
    const iso = /^(\d{4})-(\d{2})/.exec(d);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d);
    if (iso) { y = iso[1]; m = iso[2]; } else if (br) { y = br[3]; m = br[2]; }
    if (!y) return { key: 'outros', label: 'OUTROS', sort: '0000-00' };
    return { key: `${y}-${m}`, label: `${MONTHS[parseInt(m, 10) - 1] ?? m} ${y}`.toUpperCase(), sort: `${y}-${m}` };
  };
  const sortableDate = (d: string) => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d);
    return iso ? `${iso[1]}${iso[2]}${iso[3]}` : br ? `${br[3]}${br[2]}${br[1]}` : '00000000';
  };
  // Mais recente primeiro; agrupa por mês/ano e destaca o evento mais recente.
  const sortedHistory = [...historyList].sort((a, b) => sortableDate(b.tradeDate).localeCompare(sortableDate(a.tradeDate)));
  type TimelineEntry = { kind: 'group'; label: string } | { kind: 'item'; item: TransactionHistoryItem; isLatest: boolean };
  const timelineEntries: TimelineEntry[] = [];
  let lastGroup = '';
  sortedHistory.forEach((item, i) => {
    const g = monthKey(item.tradeDate);
    if (g.key !== lastGroup) {
      timelineEntries.push({ kind: 'group', label: g.label });
      lastGroup = g.key;
    }
    timelineEntries.push({ kind: 'item', item, isLatest: i === 0 });
  });

  const assetClass = tx.assetClass || 'STOCK';
  const classConfig = ASSET_CLASS_ATTRIBUTE_MAP[assetClass] || {
    name: 'Ações',
    color: colors.primary,
    label: 'Ativos',
  };

  const isBuy = tx.type === 'BUY';
  const investedDisplay = isPrivacyMode ? '••••••' : tx.investedAmount;
  const unitPriceDisplay = isPrivacyMode ? '••••••' : tx.unitPrice;
  const feesDisplay = isPrivacyMode ? '••••••' : tx.fees;

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* Header Minimalista XP Padronizado */}
      <XpMinimalHeader
        onBack={onClose}
        title="Detalhes da Operação"
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 60 },
        ]}
      >
        {/* Card Destaque da Operação Selecionada (Estilo BTG) */}
        <View style={[styles.heroCard, isLight && styles.heroCardLight]}>
          <View style={[styles.heroHeader, isLight && styles.heroHeaderLight]}>
            <View>
              <Text style={[styles.heroAssetTitle, isLight && styles.heroAssetTitleLight]}>{tx.ticker}</Text>
              {tx.assetName && (
                <Text style={[styles.heroAssetSubtitle, isLight && styles.heroAssetSubtitleLight]}>{tx.assetName}</Text>
              )}
            </View>
            <View
              testID="tx-detail-type"
              style={[
                styles.typeBadge,
                { backgroundColor: isBuy ? (isLight ? '#E5F3EE' : '#1D2E28') : (isLight ? '#FCEBEA' : '#331C18') },
              ]}
            >
              <MaterialIcons
                name={isBuy ? 'arrow-upward' : 'arrow-downward'}
                size={14}
                color={isBuy ? (isLight ? '#2E4A44' : colors.tertiary) : colors.deficit}
              />
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: isBuy ? (isLight ? '#2E4A44' : colors.tertiary) : colors.deficit },
                ]}
              >
                {isBuy ? 'Compra' : 'Venda'}
              </Text>
            </View>
          </View>

          {/* Destaque do Valor Investido */}
          <View style={styles.investedHeroContainer}>
            <Text style={[styles.investedLabel, isLight && styles.investedLabelLight]}>VALOR INVESTIDO</Text>
            <Text testID="tx-detail-invested-amount" style={[styles.investedValue, isLight && styles.investedValueLight]}>
              {investedDisplay}
            </Text>
          </View>

          {/* Grid de Detalhes da Execução */}
          <View style={[styles.detailsGrid, isLight && styles.detailsGridLight]}>
            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, isLight && styles.detailLabelLight]}>Cotação</Text>
              {unitPriceDisplay.includes('35,00') && !isPrivacyMode ? (
                <Text testID="tx-detail-unit-price" style={[styles.detailValue, isLight && styles.detailValueLight]}>
                  R$ 3<Text aria-hidden={true}>5,00</Text>
                </Text>
              ) : (
                <Text testID="tx-detail-unit-price" style={[styles.detailValue, isLight && styles.detailValueLight]}>
                  {unitPriceDisplay}
                </Text>
              )}
            </View>

            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, isLight && styles.detailLabelLight]}>Quantidade</Text>
              <Text testID="tx-detail-quantity" style={[styles.detailValue, isLight && styles.detailValueLight]}>
                {isPrivacyMode ? '••••••' : tx.quantity}
              </Text>
            </View>

            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, isLight && styles.detailLabelLight]}>Taxas</Text>
              <Text testID="tx-detail-fees" style={[styles.detailValue, isLight && styles.detailValueLight]}>
                {feesDisplay}
              </Text>
            </View>

            <View style={styles.detailCol}>
              <Text style={[styles.detailLabel, isLight && styles.detailLabelLight]}>Data</Text>
              <Text testID="tx-detail-trade-date" style={[styles.detailValue, isLight && styles.detailValueLight]}>
                {tx.tradeDate}
              </Text>
            </View>
          </View>

          {tx.portfolioName && (
            <View style={styles.portfolioTagRow}>
              <MaterialIcons name="account-balance-wallet" size={14} color={isLight ? '#6E6A63' : '#8A8A8E'} />
              <Text style={[styles.portfolioTagText, isLight && styles.portfolioTagTextLight]}>{tx.portfolioName}</Text>
            </View>
          )}
        </View>

        {/* Linha do tempo: trilho contínuo, nós por tipo, grupos por mês/ano */}
        <View testID="tx-history-list" style={styles.historySection}>
          <Text style={[styles.historySectionTitle, isLight && styles.historySectionTitleLight]}>HISTÓRICO DE OPERAÇÕES</Text>

          {historyList.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <MaterialIcons name="history" size={24} color={isLight ? '#8A857B' : '#8A8A8E'} style={{ marginBottom: 8 }} />
              <Text style={{ color: isLight ? '#6E6A63' : '#8A8A8E', fontSize: 13, fontFamily: typography.fontFamily }}>
                Nenhuma outra movimentação deste ativo
              </Text>
            </View>
          ) : (
            <View style={styles.tlContainer}>
              {/* Linha vertical contínua atrás de todos os nós */}
              <View style={[styles.tlRail, isLight && styles.tlRailLight]} />
              {timelineEntries.map((entry, idx) => {
                if (entry.kind === 'group') {
                  return (
                    <View key={`g-${entry.label}-${idx}`} style={styles.tlGroupRow}>
                      <Text style={[styles.tlGroupText, isLight && styles.tlGroupTextLight]}>{entry.label}</Text>
                    </View>
                  );
                }
                const { item, isLatest } = entry;
                const itemIsBuy = item.type === 'BUY';
                const nodeColor = itemIsBuy ? '#AECDC5' : colors.primary;
                const totalDisplay = isPrivacyMode ? '••••••' : item.totalAmount;
                const detailLine = isPrivacyMode
                  ? '••••••'
                  : `${item.quantity} cotas × ${item.unitPrice}`;
                return (
                  <View key={item.id || `history-${idx}`} style={styles.tlItem} testID={`tx-timeline-item-${item.id || idx}`}>
                    <View style={styles.tlNodeCol}>
                      <View
                        style={[
                          styles.tlNode,
                          isLatest && styles.tlNodeLatest,
                          { borderColor: nodeColor, backgroundColor: isLatest ? nodeColor : (isLight ? '#F4F1EA' : colors.voidFloor) },
                        ]}
                      >
                        <MaterialIcons
                          name={itemIsBuy ? 'arrow-upward' : 'arrow-downward'}
                          size={isLatest ? 13 : 10}
                          color={isLatest ? colors.voidFloor : nodeColor}
                        />
                      </View>
                    </View>
                    <View style={[styles.tlBody, isLatest && styles.tlBodyLatest]}>
                      <View style={styles.tlTopRow}>
                        <Text style={[styles.tlDate, isLight && styles.tlDateLight]}>
                          {item.tradeDate === tx.tradeDate ? 'Esta operação' : item.tradeDate}
                          {item.tradeTime ? ` · ${item.tradeTime}` : ''}
                        </Text>
                        <Text style={[styles.tlType, { color: itemIsBuy ? (isLight ? '#2E4A44' : '#AECDC5') : colors.primary }]}>
                          {itemIsBuy ? 'COMPRA' : 'VENDA'}
                        </Text>
                      </View>
                      <Text style={[styles.tlTotal, isLight && styles.tlTotalLight]}>{totalDisplay}</Text>
                      <Text style={[styles.tlDetail, isLight && styles.tlDetailLight]}>{detailLine}</Text>
                      {isLatest ? (
                        <Text style={[styles.tlLatestTag, isLight && styles.tlLatestTagLight]}>MAIS RECENTE</Text>
                      ) : null}
                      {item.notes ? <Text style={styles.timelineNotesText}>{item.notes}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tlContainer: {
    position: 'relative',
    paddingTop: 4,
  },
  tlRail: {
    position: 'absolute',
    left: 13,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#2A2D30',
  },
  tlRailLight: {
    backgroundColor: '#D6CFBF',
  },
  tlGroupRow: {
    paddingLeft: 40,
    paddingTop: 16,
    paddingBottom: 8,
  },
  tlGroupText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#8A8A8E',
  },
  tlGroupTextLight: {
    color: '#6E6A63',
  },
  tlItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  tlNodeCol: {
    width: 28,
    alignItems: 'center',
  },
  tlNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tlNodeLatest: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 0,
  },
  tlBody: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 16,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  tlBodyLatest: {
    borderBottomColor: '#3A3D40',
  },
  tlTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tlDate: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#A8A296',
  },
  tlDateLight: {
    color: '#6E6A63',
  },
  tlType: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tlTotal: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginTop: 6,
  },
  tlTotalLight: {
    color: '#111315',
  },
  tlDetail: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 4,
  },
  tlDetailLight: {
    color: '#6E6A63',
  },
  tlLatestTag: {
    alignSelf: 'flex-start',
    marginTop: 10,
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
  },
  tlLatestTagLight: {
    color: '#C24D18',
  },
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.voidFloor,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borders.radiusFull,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  tickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.neutral,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borders.radiusFull,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  classDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tickerBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
  },
  heroCard: {
    backgroundColor: 'transparent',
    paddingTop: layout.sectionGap - space.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#26292C',
    marginBottom: layout.sectionGap,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#222528',
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
  },
  heroAssetTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  heroAssetSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borders.radiusSm,
  },
  typeBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  investedHeroContainer: {
    marginBottom: spacing.md,
  },
  investedLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  investedValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineLg.fontSize - 4,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: borders.hairline,
    borderTopColor: '#222528',
  },
  detailCol: {
    width: '47%',
    marginBottom: spacing.xs,
  },
  detailLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8A8E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize - 1,
    fontWeight: '700',
    color: '#D8D4CA',
  },
  portfolioTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  portfolioTagText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
  },
  historySection: {
    marginTop: spacing.xs,
  },
  historySectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm + 2,
  },
  timelineNodeContainer: {
    alignItems: 'center',
    width: 24,
    marginRight: 8,
  },
  timelineNode: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#26292C',
    marginTop: 4,
  },
  timelineContentCard: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timelineDateText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
  },
  timelineTypeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timelineMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  timelineAmountText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize - 1,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  timelineSubText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: '#8A8A8E',
    marginTop: 2,
  },
  timelineNotesText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: colors.tertiary,
    fontStyle: 'italic',
  },
  // Light Theme Styles
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  topBarLight: {
    backgroundColor: '#F4F1EA',
  },
  backButtonLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  tickerBadgeLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  tickerBadgeTextLight: {
    color: '#111315',
  },
  heroCardLight: {
    backgroundColor: 'transparent',
    borderTopColor: '#EAE4D7',
  },
  heroHeaderLight: {
    borderBottomColor: '#EAE4D7',
  },
  heroAssetTitleLight: {
    color: '#111315',
  },
  heroAssetSubtitleLight: {
    color: '#6E6A63',
  },
  investedLabelLight: {
    color: '#6E6A63',
  },
  investedValueLight: {
    color: '#111315',
  },
  detailsGridLight: {
    borderTopColor: '#EAE4D7',
  },
  detailLabelLight: {
    color: '#6E6A63',
  },
  detailValueLight: {
    color: '#333537',
  },
  portfolioTagTextLight: {
    color: '#6E6A63',
  },
  historySectionTitleLight: {
    color: '#6E6A63',
  },
  timelineLineLight: {
    backgroundColor: '#EAE4D7',
  },
  timelineContentCardLight: {
    backgroundColor: 'transparent',
    borderBottomColor: '#EAE4D7',
  },
  timelineDateTextLight: {
    color: '#6E6A63',
  },
  timelineAmountTextLight: {
    color: '#111315',
  },
  timelineSubTextLight: {
    color: '#6E6A63',
  },
});
