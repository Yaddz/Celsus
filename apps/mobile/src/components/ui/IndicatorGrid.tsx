import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AssetClass } from './AttributeStatBar';
import { indicatorsFor, formatIndicatorValue } from '../../domain/finance/assetProfile';
import { colors, typography, borders } from '../../theme/tokens';

export interface IndicatorGridProps {
  assetClass: AssetClass;
  indicators: Record<string, any>;
  themeMode?: 'dark' | 'light';
}

export const IndicatorGrid: React.FC<IndicatorGridProps> = ({
  assetClass,
  indicators = {},
  themeMode = 'dark',
}) => {
  const isLight = themeMode === 'light';
  const list = indicatorsFor(assetClass);
  const [activeTooltip, setActiveTooltip] = useState<{ title: string; text: string } | null>(null);

  const labelColor = isLight ? '#6E6A63' : '#8A8A8E';
  const valueColor = isLight ? '#111315' : '#F4F1EA';
  const cardBg = isLight ? '#FFFFFF' : '#1A1D21';
  const modalBg = isLight ? '#F4F1EA' : '#22252A';

  if (list.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: cardBg }]}>
        <Text style={[styles.emptyText, { color: labelColor }]}>
          Título de renda fixa: sem indicadores societários.
        </Text>
      </View>
    );
  }

  return (
    <View testID="indicator-grid" style={[styles.container, { backgroundColor: cardBg }]}>
      <View style={styles.grid}>
        {list.map((item) => {
          const rawVal = indicators[item.key];
          const displayVal = formatIndicatorValue(item.key, rawVal);

          return (
            <View key={item.key} style={styles.cell}>
              <TouchableOpacity
                testID={`indicator-label-${item.key}`}
                activeOpacity={0.7}
                onPress={() => setActiveTooltip({ title: item.label, text: item.tooltip })}
                style={styles.labelRow}
                accessibilityRole="button"
                accessibilityLabel={`Ajuda sobre ${item.label}`}
              >
                <Text style={[styles.label, { color: labelColor }]}>{item.label}</Text>
                <MaterialIcons name="info-outline" size={11} color={labelColor} />
              </TouchableOpacity>
              <Text style={[styles.value, { color: valueColor }]}>{displayVal}</Text>
            </View>
          );
        })}
      </View>

      {/* Tooltip Modal explicativo */}
      <Modal
        testID="indicator-tooltip-modal"
        visible={activeTooltip !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveTooltip(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setActiveTooltip(null)}>
          <Pressable style={[styles.modalBox, { backgroundColor: modalBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: valueColor }]}>
                {activeTooltip?.title}
              </Text>
              <TouchableOpacity onPress={() => setActiveTooltip(null)}>
                <MaterialIcons name="close" size={20} color={labelColor} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalBody, { color: isLight ? '#33383F' : '#D5CAA8' }]}>
              {activeTooltip?.text}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  cell: {
    width: '48%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    borderRadius: borders.radiusLg,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
  },
  modalBody: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
  },
});
