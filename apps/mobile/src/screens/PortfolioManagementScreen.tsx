import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders } from '../theme/tokens';
import {
  AssetClass,
  ClassTarget,
  calculateGlobalTarget,
  validateClassTargets,
  validateAssetTargetsInClass,
  calculateSmartContribution,
  RebalanceAssetInput,
} from '../domain/finance';

interface PortfolioItem {
  id: string;
  name: string;
  docketCode: string;
}

interface AssetItem {
  id: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  targetInClass: number; // wi,c
  quantity: string;
  price: string;
}

export const PortfolioManagementScreen: React.FC<{
  onClose?: () => void;
}> = ({ onClose }) => {
  // 1. Estado de Carteiras
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([
    { id: 'port-1', name: 'Carteira Principal', docketCode: '•••• 001' },
    { id: 'port-2', name: 'Reserva & Oportunidade', docketCode: '•••• 002' },
  ]);
  const [activePortfolioId, setActivePortfolioId] = useState('port-1');
  const [isNewPortfolioModalOpen, setIsNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');

  // 2. Nível 1: Metas Macro por Classe (Wc)
  const [classTargets, setClassTargets] = useState<ClassTarget[]>([
    { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
    { assetClass: 'FII', targetPercentage: 20 },
    { assetClass: 'STOCK', targetPercentage: 40 },
    { assetClass: 'CRYPTO', targetPercentage: 10 },
  ]);

  // 3. Nível 2: Ativos e Metas Micro (wi,c)
  const [selectedClassTab, setSelectedClassTab] = useState<AssetClass>('STOCK');
  const [assets, setAssets] = useState<AssetItem[]>([
    // STOCK (40% macro)
    { id: 'a1', ticker: 'WEGE3', name: 'WEG S.A.', assetClass: 'STOCK', targetInClass: 25, quantity: '100', price: '42.50' },
    { id: 'a2', ticker: 'VALE3', name: 'Vale S.A.', assetClass: 'STOCK', targetInClass: 25, quantity: '80', price: '60.00' },
    { id: 'a3', ticker: 'ITUB4', name: 'Itaú Unibanco', assetClass: 'STOCK', targetInClass: 50, quantity: '200', price: '34.00' },
    // FII (20% macro)
    { id: 'a4', ticker: 'HGLG11', name: 'CSHG Logística', assetClass: 'FII', targetInClass: 50, quantity: '30', price: '162.00' },
    { id: 'a5', ticker: 'KNCR11', name: 'Kinea Rendimentos', assetClass: 'FII', targetInClass: 50, quantity: '50', price: '101.50' },
    // FIXED_INCOME (30% macro)
    { id: 'a6', ticker: 'CDB DI 110%', name: 'CDB Banco Master', assetClass: 'FIXED_INCOME', targetInClass: 60, quantity: '12000', price: '1.00' },
    { id: 'a7', ticker: 'NTN-B IPCA+', name: 'Tesouro IPCA+ 2029', assetClass: 'FIXED_INCOME', targetInClass: 40, quantity: '8000', price: '1.00' },
    // CRYPTO (10% macro)
    { id: 'a8', ticker: 'BTC', name: 'Bitcoin', assetClass: 'CRYPTO', targetInClass: 70, quantity: '0.01500000', price: '380000.00' },
    { id: 'a9', ticker: 'ETH', name: 'Ethereum', assetClass: 'CRYPTO', targetInClass: 30, quantity: '0.12000000', price: '16000.00' },
  ]);

  // Modal para Adicionar Ativo
  const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newName, setNewName] = useState('');
  const [newTargetInClass, setNewTargetInClass] = useState('25');
  const [newPrice, setNewPrice] = useState('10.00');

  // Validação em Tempo Real
  const macroValidation = validateClassTargets(classTargets);
  const currentClassAssets = assets.filter((a) => a.assetClass === selectedClassTab);
  const microValidation = validateAssetTargetsInClass(
    currentClassAssets.map((a) => ({ targetPercentageInClass: a.targetInClass }))
  );

  const activePortfolio = portfolios.find((p) => p.id === activePortfolioId) || portfolios[0];
  const currentClassTarget = classTargets.find((c) => c.assetClass === selectedClassTab)?.targetPercentage || 0;

  // Handlers para ajustar % da Classe
  const handleAdjustClassTarget = (assetClass: AssetClass, delta: number) => {
    setClassTargets((prev) =>
      prev.map((c) => {
        if (c.assetClass === assetClass) {
          const updated = Math.max(0, Math.min(100, c.targetPercentage + delta));
          return { ...c, targetPercentage: updated };
        }
        return c;
      })
    );
  };

  // Handler para criar nova carteira
  const handleCreatePortfolio = () => {
    if (!newPortfolioName.trim()) return;
    const newPort: PortfolioItem = {
      id: `port-${Date.now()}`,
      name: newPortfolioName.trim(),
      docketCode: `•••• 00${portfolios.length + 1}`,
    };
    setPortfolios([...portfolios, newPort]);
    setActivePortfolioId(newPort.id);
    setNewPortfolioName('');
    setIsNewPortfolioModalOpen(false);
  };

  // Handler para adicionar novo ativo
  const handleAddAsset = () => {
    if (!newTicker.trim()) return;
    const newAsset: AssetItem = {
      id: `asset-${Date.now()}`,
      ticker: newTicker.trim().toUpperCase(),
      name: newName.trim() || newTicker.trim().toUpperCase(),
      assetClass: selectedClassTab,
      targetInClass: parseFloat(newTargetInClass) || 0,
      quantity: '0',
      price: newPrice || '1.00',
    };
    setAssets([...assets, newAsset]);
    setNewTicker('');
    setNewName('');
    setIsAddAssetModalOpen(false);
  };

  // Handler para atualizar meta micro de um ativo
  const handleUpdateAssetTarget = (assetId: string, delta: number) => {
    setAssets((prev) =>
      prev.map((a) => {
        if (a.id === assetId) {
          const updated = Math.max(0, Math.min(100, a.targetInClass + delta));
          return { ...a, targetInClass: updated };
        }
        return a;
      })
    );
  };

  const getClassColor = (c: AssetClass) => {
    switch (c) {
      case 'FIXED_INCOME':
        return colors.fixedIncome;
      case 'FII':
        return colors.fii;
      case 'STOCK':
        return colors.stock;
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CARTEIRAS & ALOCAÇÃO</Text>
          <Text style={styles.headerSubtitle}>SISTEMA DE PESOS EM 2 NÍVEIS</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={20} color={colors.parchmentPale} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Seletor de Carteira Ativa */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionLabel}>CARTEIRA ATIVA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
            {portfolios.map((p) => {
              const isSelected = p.id === activePortfolioId;
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => setActivePortfolioId(p.id)}
                  style={[styles.portfolioChip, isSelected && styles.portfolioChipActive]}
                >
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={16}
                    color={isSelected ? colors.voidFloor : colors.tertiary}
                    style={{ marginRight: 6 }}
                  />
                  <View>
                    <Text style={[styles.portfolioChipName, isSelected && styles.portfolioChipNameActive]}>
                      {p.name}
                    </Text>
                    <Text style={styles.portfolioChipDocket}>{p.docketCode}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsNewPortfolioModalOpen(true)}
              style={styles.addPortfolioChip}
            >
              <Text style={styles.addPortfolioIcon}>+</Text>
              <Text style={styles.addPortfolioText}>Nova Carteira</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Nível 1: Metas Macro por Classe */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>NÍVEL 1: METAS MACRO (Wc)</Text>
              <Text style={styles.sectionHelper}>Alocação ideal entre classes na carteira</Text>
            </View>
            <View
              style={[
                styles.validationBadge,
                macroValidation.isValid ? styles.validationBadgeGreen : styles.validationBadgeRed,
              ]}
            >
              <View style={styles.badgeContentRow}>
                <MaterialIcons
                  name={macroValidation.isValid ? 'check-circle' : 'warning'}
                  size={14}
                  color={macroValidation.isValid ? '#AECDC5' : colors.primary}
                />
                <Text style={styles.validationBadgeText}>
                  {macroValidation.sum}% {macroValidation.isValid ? 'OK' : 'AJUSTE P/ 100%'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.macroGrid}>
            {classTargets.map((ct) => {
              const color = getClassColor(ct.assetClass);
              return (
                <View key={ct.assetClass} style={styles.macroCard}>
                  <View style={styles.macroCardHeader}>
                    <View style={[styles.classColorIndicator, { backgroundColor: color }]} />
                    <Text style={styles.macroClassName}>{getClassName(ct.assetClass)}</Text>
                  </View>
                  <Text style={[styles.macroValue, { color }]}>{ct.targetPercentage}%</Text>
                  <View style={styles.stepButtonsRow}>
                    <TouchableOpacity
                      onPress={() => handleAdjustClassTarget(ct.assetClass, -5)}
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepBtnText}>-5%</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAdjustClassTarget(ct.assetClass, +5)}
                      style={[styles.stepBtn, { borderColor: color }]}
                    >
                      <Text style={[styles.stepBtnText, { color }]}>+5%</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Nível 2: Metas Micro por Ativo na Classe */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>NÍVEL 2: METAS MICRO (wi,c)</Text>
              <Text style={styles.sectionHelper}>
                Ativos em {getClassName(selectedClassTab)} (Classe: {currentClassTarget}%)
              </Text>
            </View>
            <View
              style={[
                styles.validationBadge,
                microValidation.isValid ? styles.validationBadgeGreen : styles.validationBadgeRed,
              ]}
            >
              <View style={styles.badgeContentRow}>
                <MaterialIcons
                  name={microValidation.isValid ? 'check-circle' : 'warning'}
                  size={14}
                  color={microValidation.isValid ? '#AECDC5' : colors.primary}
                />
                <Text style={styles.validationBadgeText}>
                  {microValidation.sum}% {microValidation.isValid ? 'OK' : 'AJUSTE'}
                </Text>
              </View>
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
                    isTabActive && { borderColor: col, backgroundColor: '#202224' },
                  ]}
                >
                  <Text style={[styles.classTabText, isTabActive && { color: col, fontWeight: '700' }]}>
                    {getClassName(c)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Lista de Ativos com Meta Micro e Global Ti */}
          <View style={styles.assetsList}>
            {currentClassAssets.map((asset) => {
              const globalTarget = calculateGlobalTarget(currentClassTarget, asset.targetInClass);
              const color = getClassColor(asset.assetClass);

              return (
                <View key={asset.id} style={styles.assetCard}>
                  <View style={styles.assetInfoRow}>
                    <View>
                      <Text style={styles.assetTicker}>{asset.ticker}</Text>
                      <Text style={styles.assetName}>{asset.name}</Text>
                    </View>
                    <View style={styles.globalBadge}>
                      <Text style={styles.globalBadgeLabel}>META GLOBAL Ti</Text>
                      <Text style={[styles.globalBadgeValue, { color }]}>{globalTarget.toFixed(1)}%</Text>
                    </View>
                  </View>

                  <View style={styles.assetTargetRow}>
                    <Text style={styles.targetInClassLabel}>
                      Peso na Classe: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{asset.targetInClass}%</Text>
                    </Text>
                    <View style={styles.stepButtonsRow}>
                      <TouchableOpacity
                        onPress={() => handleUpdateAssetTarget(asset.id, -5)}
                        style={styles.microStepBtn}
                      >
                        <Text style={styles.stepBtnText}>-5%</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleUpdateAssetTarget(asset.id, +5)}
                        style={[styles.microStepBtn, { borderColor: color }]}
                      >
                        <Text style={[styles.stepBtnText, { color }]}>+5%</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsAddAssetModalOpen(true)}
              style={styles.addAssetBtn}
            >
              <Text style={styles.addAssetBtnText}>+ Adicionar Ativo em {getClassName(selectedClassTab)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Modal: Nova Carteira */}
      <Modal visible={isNewPortfolioModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>CRIAR NOVA CARTEIRA</Text>
            <Text style={styles.modalSubtitle}>Informe o nome ou finalidade do Dossiê</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Aposentadoria, Férias, Reserva"
              placeholderTextColor="#666"
              value={newPortfolioName}
              onChangeText={setNewPortfolioName}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                onPress={() => setIsNewPortfolioModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePortfolio} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>Criar Dossiê</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Adicionar Ativo */}
      <Modal visible={isAddAssetModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>ADICIONAR ATIVO</Text>
            <Text style={styles.modalSubtitle}>Classe: {getClassName(selectedClassTab)}</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ticker (ex: BBDC4, KNRI11, SOL)"
              placeholderTextColor="#666"
              value={newTicker}
              onChangeText={setNewTicker}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Nome descritivo da empresa/ativo"
              placeholderTextColor="#666"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Peso dentro da classe % (ex: 20)"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={newTargetInClass}
              onChangeText={setNewTargetInClass}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                onPress={() => setIsAddAssetModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAddAsset} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>Salvar Ativo</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.parchmentPale,
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  cardSection: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    padding: 16,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  sectionHelper: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  validationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  validationBadgeGreen: {
    backgroundColor: '#1E3A2F',
  },
  validationBadgeRed: {
    backgroundColor: '#3E1C15',
  },
  validationBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  portfolioScroll: {
    marginTop: 10,
  },
  portfolioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202224',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: borders.hairline,
    borderColor: '#303336',
    gap: 8,
  },
  portfolioChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#2A1F18',
  },
  portfolioChipIcon: {
    fontSize: 16,
    color: '#888',
  },
  portfolioChipIconActive: {
    color: colors.primary,
  },
  portfolioChipName: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: '#CCC',
  },
  portfolioChipNameActive: {
    color: colors.parchmentPale,
  },
  portfolioChipDocket: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#777',
  },
  addPortfolioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16181A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#303336',
    borderStyle: 'dashed',
    gap: 6,
  },
  addPortfolioIcon: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },
  addPortfolioText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#AAA',
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  macroCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#202224',
    borderRadius: 18,
    padding: 12,
    borderWidth: borders.hairline,
    borderColor: '#2D3033',
  },
  macroCardHeader: {
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
    fontSize: 11,
    color: '#DDD',
    fontWeight: '600',
  },
  macroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 4,
  },
  stepButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  stepBtn: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#16181A',
    borderWidth: borders.hairline,
    borderColor: '#383C40',
    alignItems: 'center',
  },
  stepBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#CCC',
    fontWeight: '700',
  },
  classTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 10,
  },
  classTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: borders.hairline,
    borderColor: '#303336',
    backgroundColor: '#1A1C1E',
    alignItems: 'center',
  },
  classTabText: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#8A8C90',
  },
  assetsList: {
    gap: 10,
    marginTop: 6,
  },
  assetCard: {
    backgroundColor: '#202224',
    borderRadius: 18,
    padding: 12,
    borderWidth: borders.hairline,
    borderColor: '#2D3033',
  },
  assetInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assetTicker: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  assetName: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
  },
  globalBadge: {
    alignItems: 'flex-end',
  },
  globalBadgeLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 8,
    color: '#888',
    letterSpacing: 0.5,
  },
  globalBadgeValue: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  assetTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: borders.hairline,
    borderTopColor: '#2B2E31',
  },
  targetInClassLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#AAA',
  },
  microStepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#16181A',
    borderWidth: borders.hairline,
    borderColor: '#383C40',
  },
  addAssetBtn: {
    backgroundColor: '#181A1C',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#33373B',
    borderStyle: 'dashed',
    marginTop: 6,
  },
  addAssetBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: colors.neutral,
    borderRadius: 24,
    padding: 20,
    borderWidth: borders.hairline,
    borderColor: '#33373B',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  modalSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#888',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#202224',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    color: colors.parchmentPale,
    borderWidth: borders.hairline,
    borderColor: '#33373B',
    marginBottom: 10,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#26282B',
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#AAA',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.voidFloor,
  },
});

export default PortfolioManagementScreen;
