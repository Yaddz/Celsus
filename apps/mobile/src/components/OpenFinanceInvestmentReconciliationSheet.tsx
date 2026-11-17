import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AnimatedModalSheet } from './ui/AnimatedModalSheet';
import { THEME_COLORS, type ThemeMode } from '../theme/palettes';
import type {
  InvestmentReconciliationChoice,
  InvestmentReconciliationProposal,
} from '../services/pluggy/pluggyInvestmentsSyncService';
import type { ClassCoverageStatus } from '../domain/openFinance/investments';
import { layout, space } from '../theme/tokens';

export interface OpenFinanceInvestmentReconciliationSheetProps {
  visible: boolean;
  institutionName: string;
  proposals: InvestmentReconciliationProposal[];
  existingAssets: Array<{ id: string; ticker: string; name: string; assetClass: string }>;
  portfolios: Array<{ id: string; name: string }>;
  coverageByClass?: ClassCoverageStatus[];
  themeMode?: ThemeMode;
  onConfirm: (choices: InvestmentReconciliationChoice[]) => void;
  onClose: () => void;
}

function buildInitialChoices(
  proposals: InvestmentReconciliationProposal[],
  defaultPortfolioId: string
): Record<string, InvestmentReconciliationChoice> {
  const initial: Record<string, InvestmentReconciliationChoice> = {};
  for (const p of proposals) {
    const targetPort = p.suggestedPortfolioId || defaultPortfolioId;
    initial[p.pluggyInvestment.id] = {
      pluggyInvestmentId: p.pluggyInvestment.id,
      action: p.suggestedAssetId ? 'MATCH' : 'CREATE_NEW',
      targetAssetId: p.suggestedAssetId,
      targetPortfolioId: targetPort,
    };
  }
  return initial;
}

export const OpenFinanceInvestmentReconciliationSheet: React.FC<
  OpenFinanceInvestmentReconciliationSheetProps
> = ({
  visible,
  institutionName,
  proposals,
  existingAssets,
  portfolios,
  coverageByClass = [],
  themeMode = 'dark',
  onConfirm,
  onClose,
}) => {
  const t = THEME_COLORS[themeMode];
  const defaultPortfolioId = portfolios[0]?.id ?? '';
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(defaultPortfolioId);
  const [choicesMap, setChoicesMap] = useState<Record<string, InvestmentReconciliationChoice>>(() =>
    buildInitialChoices(proposals, defaultPortfolioId)
  );

  useEffect(() => {
    setChoicesMap(buildInitialChoices(proposals, defaultPortfolioId));
    setSelectedPortfolioId(defaultPortfolioId);
  }, [proposals, defaultPortfolioId]);

  const handleToggleCreateNew = (pluggyInvestmentId: string) => {
    setChoicesMap((prev) => {
      const curr = prev[pluggyInvestmentId];
      if (!curr) return prev;
      const nextAction = curr.action === 'MATCH' ? 'CREATE_NEW' : 'MATCH';
      return {
        ...prev,
        [pluggyInvestmentId]: {
          ...curr,
          action: nextAction,
          targetAssetId: nextAction === 'CREATE_NEW' ? null : curr.targetAssetId,
        },
      };
    });
  };

  const handleSelectPortfolio = (portfolioId: string) => {
    setSelectedPortfolioId(portfolioId);
    setChoicesMap((prev) => {
      const next: Record<string, InvestmentReconciliationChoice> = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = { ...v, targetPortfolioId: portfolioId };
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Object.values(choicesMap));
  };

  if (!visible) return null;

  return (
    <AnimatedModalSheet visible={visible} onClose={onClose} themeMode={themeMode}>
      <View testID="of-inv-reconcile-sheet" style={[styles.sheet, { backgroundColor: t.surface }]}>
        <Text style={[styles.title, { color: t.onSurface }]}>Conciliar investimentos · {institutionName}</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Revise o casamento entre os ativos da Pluggy e os existentes na carteira.
        </Text>

        <ScrollView style={styles.scroll}>
          {portfolios.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: t.muted }]}>Carteira de destino</Text>
              <View style={styles.chipRow}>
                {portfolios.map((port) => {
                  const active = port.id === selectedPortfolioId;
                  return (
                    <Pressable
                      key={port.id}
                      testID={`of-reconciliation-portfolio-${port.id}`}
                      onPress={() => handleSelectPortfolio(port.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: active ? t.accent : t.surfaceContainer },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: active ? t.onAccent : t.onSurface },
                          active && styles.chipTextActive,
                        ]}
                      >
                        {port.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {coverageByClass.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: t.muted }]}>Cobertura por classe</Text>
              {coverageByClass.map((cov) => (
                <View key={cov.assetClass} style={[styles.coverageRow, { backgroundColor: t.surfaceContainer }]}>
                  <Text style={[styles.coverageTitle, { color: t.onSurface }]}>{cov.label}</Text>
                  <Text style={[styles.coverageHint, { color: t.muted }]}>{cov.sourceHint}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: t.muted }]}>Ativos encontrados ({proposals.length})</Text>
            {proposals.map((p) => {
              const choice = choicesMap[p.pluggyInvestment.id];
              const matchedAsset = choice?.targetAssetId
                ? existingAssets.find((a) => a.id === choice.targetAssetId)
                : null;
              return (
                <View
                  key={p.pluggyInvestment.id}
                  style={[styles.proposalRow, { backgroundColor: t.surfaceContainer }]}
                >
                  <View style={styles.sideBox}>
                    <Text style={[styles.sideLabel, { color: t.muted }]}>Pluggy</Text>
                    <Text style={[styles.assetTitle, { color: t.onSurface }]}>
                      {p.pluggyInvestment.code || p.pluggyInvestment.name}
                    </Text>
                    <Text style={[styles.assetMeta, { color: t.muted }]}>
                      Qtd: {p.pluggyInvestment.quantity ?? 1} · R${' '}
                      {Number(p.pluggyInvestment.balance).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.sideBox}>
                    <Text style={[styles.sideLabel, { color: t.muted }]}>Existente</Text>
                    <Text style={[styles.assetTitle, { color: t.onSurface }]}>
                      {choice?.action === 'MATCH' && matchedAsset
                        ? matchedAsset.name
                        : 'Criar novo ativo'}
                    </Text>
                    <Pressable
                      testID={`of-reconciliation-toggle-${p.pluggyInvestment.id}`}
                      onPress={() => handleToggleCreateNew(p.pluggyInvestment.id)}
                    >
                      <Text style={[styles.toggleText, { color: t.accent }]}>
                        {choice?.action === 'MATCH' ? 'Trocar / Criar novo' : 'Usar sugerido'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.cancelBtn, { backgroundColor: t.surfaceContainer }]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: t.onSurface }]}>Cancelar</Text>
          </Pressable>
          <Pressable
            testID="of-reconciliation-confirm-btn"
            style={[styles.confirmBtn, { backgroundColor: t.accent }]}
            onPress={handleConfirm}
          >
            <Text style={[styles.confirmText, { color: t.onAccent }]}>Confirmar conciliação</Text>
          </Pressable>
        </View>
      </View>
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.xs,
    maxHeight: '85%',
  },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: space.xs, marginBottom: space.md },
  scroll: { maxHeight: 420 },
  section: { marginBottom: space.lg },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 12,
  },
  chipText: { fontSize: 13 },
  chipTextActive: { fontWeight: '700' },
  coverageRow: {
    padding: space.md,
    borderRadius: 10,
    marginBottom: space.sm,
  },
  coverageTitle: { fontSize: 13, fontWeight: '600' },
  coverageHint: { fontSize: 12, marginTop: space.xs },
  proposalRow: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: 12,
    marginBottom: space.sm,
  },
  sideBox: { flex: 1 },
  sideLabel: { fontSize: 11, marginBottom: space.xs },
  assetTitle: { fontSize: 14, fontWeight: '600' },
  assetMeta: { fontSize: 12, marginTop: space.xs },
  toggleText: { fontSize: 12, marginTop: space.xs, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    paddingVertical: space.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmText: { fontWeight: '700' },
});
