import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, borders, spacing } from '../theme/tokens';
import { getPortfolioPalette } from '../theme/palettes';
import {
  AssetClass,
  ClassTarget,
  calculateGlobalTarget,
  validateClassTargets,
  validateAssetTargetsInClass,
} from '../domain/finance';
import { StackedWalletDeck, StackedWalletItem } from '../components/ui';
import { marketApiService } from '../services/marketApi';

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
  isPrivacyMode?: boolean;
}> = ({ onClose, isPrivacyMode = false }) => {
  const insets = useSafeAreaInsets();

  // 1. Estado de Carteiras
  const [portfolios, setPortfolios] = useState<PortfolioItem[]>([
    { id: 'port-1', name: 'Carteira Principal', docketCode: '•••• 001' },
    { id: 'port-2', name: 'Reserva & Oportunidade', docketCode: '•••• 002' },
  ]);
  const [activePortfolioId, setActivePortfolioId] = useState('port-1');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isNewPortfolioModalOpen, setIsNewPortfolioModalOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');

  // 2. Metas Macro por Classe
  const [classTargets, setClassTargets] = useState<ClassTarget[]>([
    { assetClass: 'FIXED_INCOME', targetPercentage: 30 },
    { assetClass: 'FII', targetPercentage: 20 },
    { assetClass: 'STOCK', targetPercentage: 40 },
    { assetClass: 'CRYPTO', targetPercentage: 10 },
  ]);

  // 3. Ativos e Metas na Classe
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
    setActiveIndex(portfolios.length);
    setNewPortfolioName('');
    setIsNewPortfolioModalOpen(false);
  };

  // Handler para busca e preenchimento automático do ativo
  const handleTickerChange = async (text: string) => {
    setNewTicker(text);
    const clean = text.trim().toUpperCase();
    if (clean.length >= 2) {
      try {
        const results = await marketApiService.searchCatalog(clean, selectedClassTab);
        if (results && results.length > 0) {
          const matched = results.find((r) => r.ticker === clean) || results[0];
          if (matched && matched.name) {
            setNewName(matched.name);
          }
        }
      } catch {}
    }
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
    setNewTargetInClass('25');
    setIsAddAssetModalOpen(false);
  };

  // Handler para ajustar peso de um ativo
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
        return colors.secondary;
      case 'FII':
        return colors.tertiary;
      case 'STOCK':
        return colors.primary;
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

  // Mapeamento dos portfolios para o StackedWalletDeck
  const deckPortfolios: StackedWalletItem[] = portfolios.map((p, idx) => {
    const palette = getPortfolioPalette(idx);
    return {
      id: p.id,
      name: p.name,
      docketCode: `REV-CART-00${idx + 1}`,
      accountCode: p.docketCode,
      balance: isPrivacyMode ? '*******' : 'R$ 32.468,00',
      subtitle: 'Patrimônio Total',
      profitText: isPrivacyMode ? '*******' : '+12,4% no ano',
      accentColor: palette.primary,
      paletteId: palette.id,
    };
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xs }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. StackedWalletDeck da Home reaproveitado para troca de carteira */}
        <StackedWalletDeck
          portfolios={deckPortfolios}
          activeIndex={activeIndex}
          onPortfolioChange={(idx, item) => {
            setActiveIndex(idx);
            setActivePortfolioId(item.id);
          }}
          testID="stacked-wallet-deck"
        />

        {/* Botão de adicionar nova carteira */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsNewPortfolioModalOpen(true)}
          style={styles.addPortfolioBtn}
        >
          <MaterialIcons name="add" size={18} color={colors.primary} />
          <Text style={styles.addPortfolioBtnText}>Adicionar Nova Carteira</Text>
        </TouchableOpacity>

        {/* 2. Metas por Classe */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>Metas por Classe</Text>
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

        {/* 3. Ativos e Metas na Classe */}
        <View style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionLabel}>Ativos na Categoria</Text>
              <Text style={styles.sectionHelper}>
                Ativos em {getClassName(selectedClassTab)} (Meta: {currentClassTarget}%)
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

          {/* Lista de Ativos */}
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
                      <Text style={styles.globalBadgeLabel}>Meta Geral</Text>
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

        <View style={{ height: 60 }} />
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
              onChangeText={handleTickerChange}
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
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  addPortfolioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181A',
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#26292C',
    borderStyle: 'dashed',
    gap: 8,
    marginTop: -4,
  },
  addPortfolioBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.parchmentPale,
    fontWeight: '600',
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
    fontSize: 9,
    color: '#8A8C90',
    marginBottom: 2,
  },
  globalBadgeValue: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
  },
  assetTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: borders.hairline,
    borderTopColor: '#2D3033',
  },
  targetInClassLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#AAA',
  },
  microStepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#16181A',
    borderWidth: borders.hairline,
    borderColor: '#383C40',
    alignItems: 'center',
  },
  addAssetBtn: {
    backgroundColor: '#181A1C',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: borders.hairline,
    borderColor: '#2D3033',
    marginTop: 4,
  },
  addAssetBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    borderColor: '#303336',
  },
  modalTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  modalSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8C90',
    marginTop: 2,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#121416',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.parchmentPale,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    borderWidth: borders.hairline,
    borderColor: '#282A2C',
    marginBottom: 10,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#202224',
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#AAA',
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.voidFloor,
    fontWeight: '700',
  },
});

export default PortfolioManagementScreen;
