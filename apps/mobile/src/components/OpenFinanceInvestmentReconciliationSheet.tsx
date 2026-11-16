import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  InvestmentReconciliationChoice,
  InvestmentReconciliationProposal,
} from '../services/pluggy/pluggyInvestmentsSyncService';
import type { ClassCoverageStatus } from '../domain/openFinance/investments';

export interface OpenFinanceInvestmentReconciliationSheetProps {
  visible: boolean;
  institutionName: string;
  proposals: InvestmentReconciliationProposal[];
  existingAssets: Array<{ id: string; ticker: string; name: string; assetClass: string }>;
  portfolios: Array<{ id: string; name: string }>;
  coverageByClass?: ClassCoverageStatus[];
  onConfirm: (choices: InvestmentReconciliationChoice[]) => void;
  onClose: () => void;
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
  onConfirm,
  onClose,
}) => {
  const defaultPortfolioId = portfolios[0]?.id ?? '';
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(defaultPortfolioId);
  const [choicesMap, setChoicesMap] = useState<Record<string, InvestmentReconciliationChoice>>({});

  useEffect(() => {
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
    setChoicesMap(initial);
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Conciliar investimentos · {institutionName}</Text>
          <Text style={styles.subtitle}>
            Revise o casamento entre os ativos da Pluggy e os existentes na carteira.
          </Text>

          <ScrollView style={styles.scroll}>
            {portfolios.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Carteira de destino</Text>
                <View style={styles.chipRow}>
                  {portfolios.map((port) => {
                    const active = port.id === selectedPortfolioId;
                    return (
                      <Pressable
                        key={port.id}
                        testID={`of-reconciliation-portfolio-${port.id}`}
                        onPress={() => handleSelectPortfolio(port.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
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
                <Text style={styles.sectionLabel}>Cobertura por classe</Text>
                {coverageByClass.map((cov) => (
                  <View key={cov.assetClass} style={styles.coverageRow}>
                    <Text style={styles.coverageTitle}>{cov.label}</Text>
                    <Text style={styles.coverageHint}>{cov.sourceHint}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ativos encontrados ({proposals.length})</Text>
              {proposals.map((p) => {
                const choice = choicesMap[p.pluggyInvestment.id];
                const matchedAsset = choice?.targetAssetId
                  ? existingAssets.find((a) => a.id === choice.targetAssetId)
                  : null;
                return (
                  <View key={p.pluggyInvestment.id} style={styles.proposalRow}>
                    <View style={styles.sideBox}>
                      <Text style={styles.sideLabel}>Pluggy</Text>
                      <Text style={styles.assetTitle}>
                        {p.pluggyInvestment.code || p.pluggyInvestment.name}
                      </Text>
                      <Text style={styles.assetMeta}>
                        Qtd: {p.pluggyInvestment.quantity ?? 1} · R${' '}
                        {Number(p.pluggyInvestment.balance).toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.sideBox}>
                      <Text style={styles.sideLabel}>Existente</Text>
                      <Text style={styles.assetTitle}>
                        {choice?.action === 'MATCH' && matchedAsset
                          ? matchedAsset.name
                          : 'Criar novo ativo'}
                      </Text>
                      <Pressable
                        testID={`of-reconciliation-toggle-${p.pluggyInvestment.id}`}
                        onPress={() => handleToggleCreateNew(p.pluggyInvestment.id)}
                      >
                        <Text style={styles.toggleText}>
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
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              testID="of-reconciliation-confirm-btn"
              style={styles.confirmBtn}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>Confirmar conciliação</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#191B1D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  title: { color: '#E6DECA', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8A8A8E', fontSize: 13, marginTop: 4, marginBottom: 12 },
  scroll: { maxHeight: 420 },
  section: { marginBottom: 16 },
  sectionLabel: { color: '#D5CAA8', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#202224',
  },
  chipActive: { backgroundColor: '#D96628' },
  chipText: { color: '#E6DECA', fontSize: 13 },
  chipTextActive: { color: '#111315', fontWeight: '700' },
  coverageRow: {
    backgroundColor: '#202224',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  coverageTitle: { color: '#E6DECA', fontSize: 13, fontWeight: '600' },
  coverageHint: { color: '#8A8A8E', fontSize: 12, marginTop: 2 },
  proposalRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#202224',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  sideBox: { flex: 1 },
  sideLabel: { color: '#8A8A8E', fontSize: 11, marginBottom: 2 },
  assetTitle: { color: '#E6DECA', fontSize: 14, fontWeight: '600' },
  assetMeta: { color: '#8A8A8E', fontSize: 12, marginTop: 2 },
  toggleText: { color: '#D96628', fontSize: 12, marginTop: 4, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#202224',
    alignItems: 'center',
  },
  cancelText: { color: '#E6DECA', fontWeight: '600' },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#D96628',
    alignItems: 'center',
  },
  confirmText: { color: '#111315', fontWeight: '700' },
});
