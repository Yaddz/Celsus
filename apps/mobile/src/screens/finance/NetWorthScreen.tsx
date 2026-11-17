import React, { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { XpMinimalHeader } from '../../components/ui';
import { FinListCard, FinListRow } from '../../components/ui/FinListCard';
import type { NetWorthSnapshot } from '../../db/schema';
import type { NetWorthResult } from '../../domain/finance/goal';
import { formatCentsBRL, formatYearMonthPtBr } from '../../domain/financeFlow';
import { finGoalsRepository } from '../../repositories/finGoalsRepository';
import { finGoalsService } from '../../services/finGoalsService';
import type { ThemeMode } from '../../theme/palettes';
import { bento, space, typography } from '../../theme/tokens';
import { getFinUiColors, sharedStyles } from './finTheme';

export interface NetWorthScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  referenceDateIso?: string;
  testID?: string;
}

const MASK = 'R$ ••••••';

export const NetWorthScreen: React.FC<NetWorthScreenProps> = ({
  onBack,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  referenceDateIso,
  testID = 'net-worth-screen',
}) => {
  const insets = useSafeAreaInsets();
  const c = getFinUiColors(themeMode);
  const [netWorth, setNetWorth] = useState<NetWorthResult>({
    accountsCents: 0,
    investmentsCents: 0,
    cardDebtCents: 0,
    totalCents: 0,
  });
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);

  const loadData = useCallback(async () => {
    const [nw, snaps] = await Promise.all([
      finGoalsService.computeCurrentNetWorth(referenceDateIso),
      finGoalsRepository.listNetWorthSnapshots(),
    ]);
    setNetWorth(nw);
    setSnapshots([...snaps].reverse());
  }, [referenceDateIso]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showCents = (cents: number) => (isPrivacyMode ? MASK : formatCentsBRL(cents));

  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        module="finance"
        title="Patrimônio"
        subtitle="Visão consolidada"
        isGlobeActive={true}
        onBack={onBack}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />

      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: dockContentPaddingBottom(insets.bottom) }]}>
        <FinListCard themeMode={themeMode} style={{ marginBottom: space.lg }}>
          <View style={styles.heroWrap}>
            <Text style={[styles.heroLabel, { color: c.muted }]}>PATRIMÔNIO LÍQUIDO</Text>
            <Text testID="net-worth-total" style={[styles.heroValue, { color: c.text }]}>
              {showCents(netWorth.totalCents)}
            </Text>
          </View>
        </FinListCard>

        <FinListCard title="COMPOSIÇÃO" themeMode={themeMode} style={{ marginBottom: space.lg }}>
          <FinListRow
            icon="account-balance-wallet"
            avatarColor="#AECDC5"
            title="Contas"
            subtitle="Saldo em conta e dinheiro"
            amountText={showCents(netWorth.accountsCents)}
            themeMode={themeMode}
          />
          <FinListRow
            icon="trending-up"
            avatarColor="#4F9A65"
            title="Investimentos"
            subtitle="Valor de mercado das carteiras"
            amountText={showCents(netWorth.investmentsCents)}
            themeMode={themeMode}
          />
          <FinListRow
            icon="credit-card"
            avatarColor="#D96628"
            title="Cartão"
            subtitle="Faturas em aberto"
            amountText={`-${showCents(netWorth.cardDebtCents)}`}
            isLast
            themeMode={themeMode}
          />
        </FinListCard>

        <FinListCard title="EVOLUÇÃO MENSAL" themeMode={themeMode}>
          {snapshots.length === 0 ? (
            <Text style={[styles.emptyText, { color: c.muted }]}>
              As fotos mensais serão registradas automaticamente a cada mês.
            </Text>
          ) : (
            snapshots.map((snap, idx) => (
              <FinListRow
                key={snap.year_month}
                icon="calendar-today"
                avatarColor="#C49A45"
                title={formatYearMonthPtBr(snap.year_month)}
                subtitle={`Contas ${showCents(snap.accounts_cents)} · Invest. ${showCents(
                  snap.investments_cents
                )}`}
                amountText={showCents(snap.total_cents)}
                isLast={idx === snapshots.length - 1}
                themeMode={themeMode}
              />
            ))
          )}
        </FinListCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  heroWrap: {
    padding: bento.tilePadding,
  },
  heroLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 28,
    fontWeight: '700',
    marginTop: space.xs,
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    padding: space.lg,
    textAlign: 'center',
  },
});
