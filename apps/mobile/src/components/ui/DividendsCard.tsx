import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dividend, summarizeDividends } from '../../domain/finance/assetProfile';
import { colors, typography, borders } from '../../theme/tokens';

export interface DividendsCardProps {
  dividends: Dividend[];
  currentPrice: number;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

function formatDivDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

export const DividendsCard: React.FC<DividendsCardProps> = ({
  dividends = [],
  currentPrice = 0,
  themeMode = 'dark',
  testID = 'dividends-card',
}) => {
  const isLight = themeMode === 'light';
  const summary = summarizeDividends(dividends, currentPrice);

  const cardBg = isLight ? '#FFFFFF' : '#1A1D21';
  const textColor = isLight ? '#111315' : '#F4F1EA';
  const subtextColor = isLight ? '#6E6A63' : '#8A8A8E';
  const badgeBg = isLight ? '#EAE5D9' : '#22252A';
  const barNeutral = isLight ? 'rgba(0,128,96,0.35)' : 'rgba(40,116,101,0.55)';
  const barHighest = colors.primary;

  const typeLabelMap: Record<string, string> = {
    DIVIDEND: 'Dividendos',
    JCP: 'JCP',
    RENDIMENTO: 'Rendimento',
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: cardBg }]}>
      {/* Cabeçalho de Proventos 12M e Badge de Frequência */}
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.subhead, { color: subtextColor }]}>Últimos 12 meses</Text>
          <Text style={[styles.totalAmount, { color: textColor }]}>
            R$ {summary.total12m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por ação
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: isLight ? '#111315' : '#D5CAA8' }]}>
            {summary.frequency}
          </Text>
        </View>
      </View>

      {/* Mini barras dos últimos 6 pagamentos com destaque no maior */}
      {summary.last6.length > 0 && (
        <View style={styles.barsContainer}>
          {summary.last6.map((div, idx) => {
            const isHighest = Boolean(div.isHighest);
            const height = isHighest ? 34 : 20;
            return (
              <View
                key={`${div.date}-${idx}`}
                testID={isHighest ? 'mini-bar-highest' : `mini-bar-${idx}`}
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: isHighest ? barHighest : barNeutral,
                  },
                ]}
              />
            );
          })}
        </View>
      )}

      {/* Lista Recente de Proventos (2 mais recentes, conforme mockup) */}
      <View style={styles.list}>
        {summary.recent.slice(0, 2).map((div, idx) => (
          <View
            key={`${div.date}-${idx}`}
            style={[
              styles.itemRow,
              idx > 0 && { borderTopWidth: 1, borderTopColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' },
            ]}
          >
            <View>
              <Text style={[styles.itemType, { color: textColor }]}>
                {typeLabelMap[div.type] || div.type}
              </Text>
              <Text style={[styles.itemDate, { color: subtextColor }]}>
                Pago em {formatDivDate(div.date)}
              </Text>
            </View>
            <Text style={[styles.itemAmount, { color: textColor }]}>
              R$ {div.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: borders.radiusLg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  subhead: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginBottom: 2,
  },
  totalAmount: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borders.radiusSm,
  },
  badgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 38,
    gap: 6,
    marginBottom: 16,
  },
  bar: {
    flex: 1,
    borderRadius: 3,
  },
  list: {
    paddingTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemType: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
  itemDate: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 2,
  },
  itemAmount: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
});
