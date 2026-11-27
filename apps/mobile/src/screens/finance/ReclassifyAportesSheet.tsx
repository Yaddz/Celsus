import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AnimatedModalSheet, BentoSheetHeader } from '../../components/ui';
import { DirectiveButton } from '../../components/ui/DirectiveButton';
import { JellyPressable } from '../../components/ui/JellyPressable';
import type { FinEntry } from '../../db/schema';
import { formatCentsBRL } from '../../domain/financeFlow';
import {
  findExpenseAporteCandidates,
  type AporteExpenseCandidate,
} from '../../domain/financeFlow/reclassifyAportes';
import { finRepository } from '../../repositories/finRepository';
import type { ThemeMode } from '../../theme/palettes';
import { colors, space, typography } from '../../theme/tokens';
import { getFinUiColors } from './finTheme';

export interface ReclassifyAportesSheetProps {
  visible: boolean;
  onClose: () => void;
  onReclassified?: () => void;
  isPrivacyMode?: boolean;
  themeMode?: ThemeMode;
}

export const ReclassifyAportesSheet: React.FC<ReclassifyAportesSheetProps> = ({
  visible,
  onClose,
  onReclassified,
  isPrivacyMode = false,
  themeMode = 'dark',
}) => {
  const c = getFinUiColors(themeMode);
  const [candidates, setCandidates] = useState<AporteExpenseCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    (async () => {
      const [entries, brokers] = await Promise.all([
        finRepository.listAllEntries(),
        finRepository.listBrokerAccounts(),
      ]);
      if (!active) return;
      const found = findExpenseAporteCandidates(entries, brokers);
      setCandidates(found);
      setSelectedIds({});
    })();
    return () => {
      active = false;
    };
  }, [visible]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedEntries: FinEntry[] = candidates
    .filter((item) => selectedIds[item.entry.id])
    .map((item) => item.entry);

  const handleConfirm = async () => {
    if (selectedEntries.length === 0) return;
    setIsSaving(true);
    try {
      for (const entry of selectedEntries) {
        await finRepository.updateEntry(entry.id, {
          kind: 'transfer_out',
          of_class_reason: 'INVESTMENT_MOVE',
        });
      }
      onReclassified?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatedModalSheet visible={visible} onClose={onClose} themeMode={themeMode}>
      <BentoSheetHeader
        title="RECLASSIFICAR APORTES ANTIGOS"
        onClose={onClose}
        themeMode={themeMode}
      />
      <Text style={[typography.bodySm, { color: c.muted, marginBottom: space.md }]}>
        Despesas que parecem transferência ou aporte para corretora. Marque apenas as que deseja
        tirar das despesas do mês.
      </Text>
      <ScrollView style={{ maxHeight: 340 }}>
        {candidates.length === 0 ? (
          <Text style={[typography.bodyMd, { color: c.muted, paddingVertical: space.lg }]}>
            Nenhuma despesa antiga com cara de aporte encontrada.
          </Text>
        ) : (
          candidates.map(({ entry, matchedKeyword }) => {
            const checked = Boolean(selectedIds[entry.id]);
            return (
              <JellyPressable
                key={entry.id}
                testID={`reclassify-aporte-item-${entry.id}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => toggleId(entry.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: space.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  gap: space.sm,
                }}
              >
                <MaterialIcons
                  name={checked ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={checked ? colors.primary : c.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodyMd, { color: c.text }]} numberOfLines={1}>
                    {entry.description || 'Despesa'}
                  </Text>
                  <Text style={[typography.labelSm, { color: c.muted }]}>
                    {entry.due_date} • {matchedKeyword}
                  </Text>
                </View>
                <Text style={[typography.bodyMd, { color: c.expense, fontWeight: typography.weights.bold }]}>
                  {formatCentsBRL(entry.amount_cents, isPrivacyMode)}
                </Text>
              </JellyPressable>
            );
          })
        )}
      </ScrollView>
      <View style={{ marginTop: space.md }}>
        <DirectiveButton
          testID="reclassify-aportes-confirm-btn"
          label={
            isSaving
              ? 'RECLASSIFICANDO...'
              : `RECLASSIFICAR (${selectedEntries.length})`
          }
          variant="primary"
          disabled={isSaving || selectedEntries.length === 0}
          onPress={handleConfirm}
          themeMode={themeMode}
        />
      </View>
    </AnimatedModalSheet>
  );
};
