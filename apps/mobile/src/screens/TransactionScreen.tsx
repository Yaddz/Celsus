import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Decimal from 'decimal.js';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { transactionService } from '../services/transactionService';
import { assetRepository } from '../repositories/assetRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { Asset, Portfolio } from '../db/schema';
import { DirectiveButton } from '../components/ui/DirectiveButton';
import { LedgerInput } from '../components/ui/LedgerInput';

export interface TransactionScreenProps {
  onClose: () => void;
  onTransactionSuccess?: () => void;
  initialPortfolioId?: string;
}

export const TransactionScreen: React.FC<TransactionScreenProps> = ({
  onClose,
  onTransactionSuccess = () => {},
  initialPortfolioId,
}) => {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(initialPortfolioId || '');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');

  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeDate, setTradeDate] = useState<string>(
    new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  );
  const [quantity, setQuantity] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [fees, setFees] = useState<string>('0.00');
  const [notes, setNotes] = useState<string>('');

  const [isLoadingAutoFill, setIsLoadingAutoFill] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadPortfolios();
  }, []);

  useEffect(() => {
    if (selectedPortfolioId) {
      loadAssets(selectedPortfolioId);
    }
  }, [selectedPortfolioId]);

  const loadPortfolios = async () => {
    try {
      const list = await portfolioRepository.getAllPortfolios();
      setPortfolios(list);
      if (list.length > 0 && !selectedPortfolioId) {
        setSelectedPortfolioId(list[0].id);
      }
    } catch {
      // Em fallback ou banco inicial
      const fallbackPort: Portfolio = {
        id: 'default-portfolio',
        name: 'Carteira Principal',
        description: 'Dossiê Geral',
        docket_code: 'REV-001',
        is_archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setPortfolios([fallbackPort]);
      setSelectedPortfolioId(fallbackPort.id);
    }
  };

  const loadAssets = async (portId: string) => {
    try {
      const list = await assetRepository.getAssetsByPortfolio(portId);
      setAssets(list);
      if (list.length > 0) {
        setSelectedAssetId(list[0].id);
      } else {
        setSelectedAssetId('');
      }
    } catch {
      setAssets([]);
    }
  };

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  // Auto-fill preço via COTAHIST
  const handleAutoFillPrice = async () => {
    if (!selectedAsset) {
      Alert.alert('Atenção', 'Selecione um ativo para buscar a cotação histórica.');
      return;
    }
    if (!tradeDate) {
      Alert.alert('Atenção', 'Informe a data da operação (AAAA-MM-DD).');
      return;
    }

    setIsLoadingAutoFill(true);
    setAutoFillMessage(null);
    try {
      const price = await transactionService.getAutoFillPrice(
        selectedAsset.ticker,
        tradeDate
      );
      if (price) {
        setUnitPrice(price);
        setAutoFillMessage(`Preço de fechamento (${price}) carregado do COTAHIST.`);
      } else {
        setAutoFillMessage('Cotação não encontrada para esta data (digite manualmente).');
      }
    } catch {
      setAutoFillMessage('Erro ao consultar histórico COTAHIST.');
    } finally {
      setIsLoadingAutoFill(false);
    }
  };

  // Cálculo do total estimado
  const calculateTotal = (): string => {
    try {
      const q = new Decimal(quantity || 0);
      const p = new Decimal(unitPrice || 0);
      const f = new Decimal(fees || 0);
      if (type === 'BUY') {
        return q.mul(p).plus(f).toFixed(2);
      } else {
        return Decimal.max(0, q.mul(p).minus(f)).toFixed(2);
      }
    } catch {
      return '0.00';
    }
  };

  const handleSubmit = async () => {
    if (!selectedAssetId) {
      Alert.alert('Erro', 'Selecione um ativo válido.');
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      Alert.alert('Erro', 'Informe uma quantidade maior que zero.');
      return;
    }
    if (!unitPrice || parseFloat(unitPrice) <= 0) {
      Alert.alert('Erro', 'Informe um preço unitário maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      await transactionService.executeTransaction({
        portfolioId: selectedPortfolioId,
        assetId: selectedAssetId,
        type,
        tradeDate,
        quantity,
        unitPrice,
        fees: fees || '0.00',
        notes: notes || undefined,
      });

      Alert.alert(
        'Sucesso',
        `Movimentação de ${type === 'BUY' ? 'Compra' : 'Venda'} registrada com sucesso!`
      );
      onTransactionSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Erro na Operação', e.message || 'Falha ao registrar movimentação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>NOVA MOVIMENTAÇÃO</Text>
          <Text style={styles.headerSubtitle}>LIVRO-RAZÃO TRANSACIONAL</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <MaterialIcons name="close" size={22} color={colors.parchmentPale} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Seletor Tipo: COMPRA vs VENDA */}
        <View style={styles.typeSelectorRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setType('BUY')}
            style={[
              styles.typeButton,
              type === 'BUY' ? styles.typeButtonBuyActive : styles.typeButtonInactive,
            ]}
          >
            <MaterialIcons
              name="north-east"
              size={18}
              color={type === 'BUY' ? colors.voidFloor : colors.parchmentPale}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'BUY' ? styles.typeButtonTextBuyActive : styles.typeButtonTextInactive,
              ]}
            >
              COMPRA (APORTE)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setType('SELL')}
            style={[
              styles.typeButton,
              type === 'SELL' ? styles.typeButtonSellActive : styles.typeButtonInactive,
            ]}
          >
            <MaterialIcons
              name="south-west"
              size={18}
              color={type === 'SELL' ? colors.voidFloor : colors.parchmentPale}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'SELL' ? styles.typeButtonTextSellActive : styles.typeButtonTextInactive,
              ]}
            >
              VENDA (RESGATE)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Seleção de Carteira */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>CARTEIRA (DOSSIÊ)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {portfolios.map((p) => {
              const isSelected = p.id === selectedPortfolioId;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setSelectedPortfolioId(p.id)}
                  style={[styles.chip, isSelected && styles.chipActive]}
                >
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={16}
                    color={isSelected ? colors.voidFloor : colors.tertiary}
                  />
                  <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Seleção do Ativo */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>ATIVO EM CARTEIRA</Text>
          {assets.length === 0 ? (
            <View style={styles.emptyAssetsNotice}>
              <Text style={styles.emptyAssetsText}>
                Nenhum ativo cadastrado nesta carteira. Cadastre um ativo na aba Carteiras primeiro.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {assets.map((a) => {
                const isSelected = a.id === selectedAssetId;
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setSelectedAssetId(a.id)}
                    style={[styles.chip, isSelected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                      {a.ticker}
                    </Text>
                    <Text
                      style={[
                        styles.chipSubText,
                        isSelected && { color: colors.voidFloor },
                      ]}
                    >
                      ({a.quantity} un)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Data da Operação */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>DATA DO PREGÃO (AAAA-MM-DD)</Text>
          <View style={styles.textInputBox}>
            <MaterialIcons name="calendar-today" size={18} color="#8A8A8E" />
            <TextInput
              style={styles.textInput}
              value={tradeDate}
              onChangeText={setTradeDate}
              placeholder="Ex: 2024-03-15"
              placeholderTextColor="#55585C"
            />
          </View>
        </View>

        {/* Preço Unitário + Botão Auto-Fill COTAHIST */}
        <View style={styles.inputGroup}>
          <View style={styles.labelWithActionRow}>
            <Text style={styles.inputLabel}>PREÇO UNITÁRIO (R$)</Text>
            <TouchableOpacity
              onPress={handleAutoFillPrice}
              style={styles.autoFillBtn}
              disabled={isLoadingAutoFill}
            >
              {isLoadingAutoFill ? (
                <ActivityIndicator size="small" color={colors.tertiary} />
              ) : (
                <>
                  <MaterialIcons name="sync" size={14} color={colors.tertiary} />
                  <Text style={styles.autoFillBtnText}>COTAHIST AUTO</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.textInputBox}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              style={styles.textInput}
              value={unitPrice}
              onChangeText={setUnitPrice}
              placeholder="0.00"
              placeholderTextColor="#55585C"
              keyboardType="decimal-pad"
            />
          </View>

          {autoFillMessage ? (
            <Text style={styles.autoFillFeedback}>{autoFillMessage}</Text>
          ) : null}
        </View>

        {/* Quantidade */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>QUANTIDADE</Text>
          <View style={styles.textInputBox}>
            <TextInput
              style={styles.textInput}
              value={quantity}
              onChangeText={setQuantity}
              placeholder={selectedAsset?.asset_class === 'CRYPTO' ? '0.00000000' : '100'}
              placeholderTextColor="#55585C"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Taxas / Corretagem */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>TAXAS / CORRETAGEM (R$)</Text>
          <View style={styles.textInputBox}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              style={styles.textInput}
              value={fees}
              onChangeText={setFees}
              placeholder="0.00"
              placeholderTextColor="#55585C"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Notas / Observação */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>NOTAS / MOTIVO DA OPERAÇÃO (OPCIONAL)</Text>
          <View style={styles.textInputBox}>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: Aporte mensal de rebalanceamento"
              placeholderTextColor="#55585C"
            />
          </View>
        </View>

        {/* Resumo Financeiro da Operação */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>TOTAL DA OPERAÇÃO:</Text>
            <Text style={styles.summaryValue}>R$ {calculateTotal()}</Text>
          </View>
          {selectedAsset && (
            <Text style={styles.summarySub}>
              Posição atual: {selectedAsset.quantity} un @ PM R$ {selectedAsset.average_price}
            </Text>
          )}
        </View>

        {/* Botão de Registro */}
        <DirectiveButton
          label={isSubmitting ? 'REGISTRANDO...' : 'REGISTRAR NO LIVRO-RAZÃO'}
          variant={type === 'BUY' ? 'primary' : 'secondary'}
          disabled={isSubmitting}
          onPress={handleSubmit}
          style={{ marginTop: spacing.md }}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.primary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: spacing.xs,
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusSm,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md - 2,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
  },
  typeButtonBuyActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonSellActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  typeButtonInactive: {
    backgroundColor: colors.neutral,
    borderColor: '#26292C',
  },
  typeButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
  },
  typeButtonTextBuyActive: {
    color: colors.voidFloor,
  },
  typeButtonTextSellActive: {
    color: colors.voidFloor,
  },
  typeButtonTextInactive: {
    color: colors.parchmentPale,
  },
  inputGroup: {
    marginBottom: spacing.md + 2,
  },
  inputLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  labelWithActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  autoFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.oxidizedSlag,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusSm,
  },
  autoFillBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.tertiary,
    fontWeight: '700',
  },
  autoFillFeedback: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: colors.tertiary,
    marginTop: 4,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.neutral,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borders.radiusPill,
    marginRight: 8,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  chipActive: {
    backgroundColor: colors.tertiary,
    borderColor: colors.tertiary,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.voidFloor,
  },
  chipSubText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: '#8A8A8E',
  },
  emptyAssetsNotice: {
    backgroundColor: colors.neutral,
    padding: spacing.md,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  emptyAssetsText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: '#8A8A8E',
    lineHeight: 18,
  },
  textInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    paddingHorizontal: spacing.md,
    height: 48,
    gap: 8,
  },
  currencyPrefix: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    color: colors.tertiary,
    fontWeight: '700',
  },
  textInput: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    color: colors.parchmentPale,
  },
  summaryCard: {
    backgroundColor: '#1E2124',
    padding: spacing.md,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#2A2D31',
    marginTop: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  summaryValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    color: colors.primary,
    fontWeight: '700',
  },
  summarySub: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 6,
  },
});

export default TransactionScreen;
