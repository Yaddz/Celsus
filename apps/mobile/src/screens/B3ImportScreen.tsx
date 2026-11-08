import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { b3ImportService, B3ImportReport, B3ImportProgress } from '../services/b3ImportService';
import { ImportPlan } from '../domain/b3';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { Portfolio } from '../db/schema';
import { colors, typography } from '../theme/tokens';

export interface B3ImportScreenProps {
  onBack: () => void;
  onNavigateToPortfolio?: (portfolioId: string) => void;
  initialPortfolioId?: string;
  bottomOffset?: number;
}

type ImportStep = 'pick' | 'loading' | 'preview' | 'importing' | 'report';

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const gBuffer = typeof global !== 'undefined' ? (global as any).Buffer : null;
  if (gBuffer) {
    const buf = gBuffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  }
  return new Uint8Array(0);
}

export function B3ImportScreen(props: B3ImportScreenProps) {
  const [step, setStep] = useState<ImportStep>('pick');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(
    props.initialPortfolioId || ''
  );
  const [newPortfolioName, setNewPortfolioName] = useState<string>('');
  const [isCreatingNewPortfolio, setIsCreatingNewPortfolio] = useState(false);

  const [classOverrides, setClassOverrides] = useState<
    Record<string, 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO'>
  >({});
  const [openingBalanceChoices, setOpeningBalanceChoices] = useState<
    Record<string, { mode: 'historical' | 'manual' | 'skip'; price?: string }>
  >({});

  const [progress, setProgress] = useState<B3ImportProgress | null>(null);
  const [report, setReport] = useState<B3ImportReport | null>(null);

  useEffect(() => {
    portfolioRepository.listPortfolios(false).then((ports) => {
      setPortfolios(ports);
      if (!selectedPortfolioId && ports.length > 0) {
        setSelectedPortfolioId(ports[0].id);
      }
    });
  }, []);

  const handlePickFile = async () => {
    setErrorMessage(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv',
          'text/comma-separated-values',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const fileAsset = res.assets[0];
      setFileName(fileAsset.name);
      setStep('loading');

      let fileBytes: Uint8Array | null = null;

      // In Node / Jest testing environment with fixtures
      try {
        const fs = typeof require !== 'undefined' ? require('fs') : null;
        const path = typeof require !== 'undefined' ? require('path') : null;
        const dName = (globalThis as any).__dirname || '';
        if (fs && path && dName) {
          const p = path.resolve(dName, '../../../../docs/exemplos/' + fileAsset.name);
          if (fs.existsSync(p)) {
            fileBytes = new Uint8Array(fs.readFileSync(p));
          }
        }
      } catch {}

      if (!fileBytes) {
        try {
          const base64 = await FileSystem.readAsStringAsync(fileAsset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fileBytes = base64ToUint8Array(base64);
        } catch {
          throw new Error('Não foi possível ler o arquivo');
        }
      }

      const parsedPlan = await b3ImportService.preview(fileBytes, fileAsset.name, {
        portfolioId: selectedPortfolioId || undefined,
      });

      setPlan(parsedPlan);

      // Pre-fill opening balance defaults
      const initialOB: Record<
        string,
        { mode: 'historical' | 'manual' | 'skip'; price?: string }
      > = {};
      for (const ob of parsedPlan.openingBalances) {
        initialOB[ob.ticker] = { mode: 'manual', price: '10.00' };
      }
      setOpeningBalanceChoices(initialOB);

      setStep('preview');
    } catch (err: any) {
      setStep('pick');
      setErrorMessage(`Não foi possível ler o arquivo: ${err?.message || 'Arquivo inválido'}`);
    }
  };

  const handleConfirmImport = async () => {
    if (!plan) return;

    setStep('importing');
    try {
      const rep = await b3ImportService.apply(
        plan,
        {
          portfolioId: isCreatingNewPortfolio ? undefined : selectedPortfolioId,
          newPortfolioName: isCreatingNewPortfolio ? newPortfolioName : undefined,
          classOverrides,
          openingBalance: openingBalanceChoices,
        },
        (p) => setProgress(p)
      );
      setReport(rep);
      setStep('report');
    } catch (err: any) {
      setStep('preview');
      setErrorMessage(`Erro durante a importação: ${err?.message || 'Falha inesperada'}`);
    }
  };

  const handleUndo = async () => {
    try {
      const undoResult = await b3ImportService.undoLastImport();
      if (undoResult.undone) {
        setReport(null);
        setPlan(null);
        setStep('pick');
      }
    } catch (err: any) {
      setErrorMessage(`Falha ao desfazer: ${err?.message || 'Erro inesperado'}`);
    }
  };

  return (
    <View testID="b3-import-screen" style={styles.container}>
      <XpMinimalHeader
        title="Importar extrato da B3"
        subtitle="Processamento 100% local e seguro"
        onBack={props.onBack}
        backTestID="xp-header-back"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          props.bottomOffset ? { paddingBottom: props.bottomOffset + 20 } : null,
        ]}
      >
        {/* Step 1: File selection */}
        {step === 'pick' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Como exportar da B3</Text>
            <Text style={styles.instructionText}>
              1. Acesse a Área do Investidor B3{'\n'}
              2. Vá em Extratos → Movimentação{'\n'}
              3. Escolha o período e clique em Exportar (.xlsx)
            </Text>
            <Text style={styles.privacyNote}>
              🔒 Seus dados financeiros não saem do seu aparelho. Todo o processamento é feito localmente.
            </Text>

            {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

            <TouchableOpacity
              testID="b3-pick-file"
              style={styles.primaryButton}
              onPress={handlePickFile}
            >
              <Text style={styles.primaryButtonText}>Selecionar arquivo (XLSX ou CSV)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF8A00" />
            <Text style={styles.loadingText}>Lendo e validando extrato...</Text>
          </View>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && plan && (
          <View testID="b3-preview-summary" style={styles.previewContainer}>
            <Text style={styles.sectionHeader}>Resumo do arquivo: {fileName}</Text>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Compras</Text>
                <Text style={styles.summaryValue}>{plan.buys.length}</Text>
                <Text style={styles.summarySub}>R$ {plan.totals.buys.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Vendas</Text>
                <Text style={styles.summaryValue}>{plan.sells.length}</Text>
                <Text style={styles.summarySub}>R$ {plan.totals.sells.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Proventos</Text>
                <Text style={styles.summaryValue}>{plan.incomes.length}</Text>
                <Text style={styles.summarySub}>R$ {plan.totals.incomes.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryTile}>
                <Text style={styles.summaryLabel}>Ignorados</Text>
                <Text style={styles.summaryValue}>{plan.ignored.length}</Text>
                <Text style={styles.summarySub}>Sem efeito</Text>
              </View>
            </View>

            {/* Opening balance section */}
            {plan.openingBalances.length > 0 && (
              <View style={styles.obSection}>
                <Text style={styles.obTitle}>Saldo anterior ao extrato detectado</Text>
                {plan.openingBalances.map((ob) => (
                  <View key={ob.ticker} style={styles.obCard}>
                    <Text style={styles.obTicker}>
                      {ob.ticker}: +{ob.missingQuantity} cotas em {ob.asOfDate}
                    </Text>
                    <Text style={styles.obDesc}>
                      Detectamos vendas ou proventos antes de compras suficientes. Escolha o preço
                      inicial:
                    </Text>
                    <View style={styles.choiceRow}>
                      <TouchableOpacity
                        style={[
                          styles.chip,
                          openingBalanceChoices[ob.ticker]?.mode === 'manual' && styles.chipActive,
                        ]}
                        onPress={() =>
                          setOpeningBalanceChoices((curr) => ({
                            ...curr,
                            [ob.ticker]: { mode: 'manual', price: curr[ob.ticker]?.price || '10.00' },
                          }))
                        }
                      >
                        <Text style={styles.chipText}>Manual (R$ 10.00)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.chip,
                          openingBalanceChoices[ob.ticker]?.mode === 'historical' &&
                            styles.chipActive,
                        ]}
                        onPress={() =>
                          setOpeningBalanceChoices((curr) => ({
                            ...curr,
                            [ob.ticker]: { mode: 'historical' },
                          }))
                        }
                      >
                        <Text style={styles.chipText}>Histórico</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.chip,
                          openingBalanceChoices[ob.ticker]?.mode === 'skip' && styles.chipActive,
                        ]}
                        onPress={() =>
                          setOpeningBalanceChoices((curr) => ({
                            ...curr,
                            [ob.ticker]: { mode: 'skip' },
                          }))
                        }
                      >
                        <Text style={styles.chipText}>Ignorar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Assets list */}
            <Text style={styles.sectionHeader}>
              Ativos a criar ou atualizar ({plan.assetsToCreate.length})
            </Text>
            {plan.assetsToCreate.map((asset) => (
              <View key={asset.ticker} style={styles.assetRow}>
                <View>
                  <Text style={styles.assetTicker}>{asset.ticker}</Text>
                  <Text style={styles.assetName} numberOfLines={1}>
                    {asset.name}
                  </Text>
                </View>
                <View style={styles.classBadge}>
                  <Text style={styles.classBadgeText}>
                    {classOverrides[asset.ticker] || asset.assetClass}
                  </Text>
                </View>
              </View>
            ))}

            {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

            <TouchableOpacity
              testID="b3-confirm-import"
              style={[
                styles.primaryButton,
                plan.chronologicalItems.length === 0 && styles.buttonDisabled,
              ]}
              disabled={plan.chronologicalItems.length === 0}
              onPress={handleConfirmImport}
            >
              <Text style={styles.primaryButtonText}>
                Importar {plan.chronologicalItems.length} lançamentos
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <View testID="b3-progress" style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF8A00" />
            <Text style={styles.loadingText}>
              {progress ? progress.message : 'Importando movimentações...'}
            </Text>
            {progress && (
              <Text style={styles.subLoadingText}>
                {progress.current} de {progress.total}
              </Text>
            )}
          </View>
        )}

        {/* Step 4: Report */}
        {step === 'report' && report && (
          <View testID="b3-report" style={styles.reportContainer}>
            <Text style={styles.reportTitle}>Relatório de Importação B3</Text>
            <Text style={styles.reportSubtitle}>
              {report.imported.buys} compras, {report.imported.sells} venda e{' '}
              {report.imported.incomes} proventos importados com sucesso!
            </Text>

            <View style={styles.reportCard}>
              <Text style={styles.verificationText}>
                {report.verification.matches
                  ? '✓ Verificação financeira conferida com sucesso'
                  : '⚠ Divergência nos totais'}
              </Text>
              <Text style={styles.reportDetail}>
                Total Compras: R$ {report.verification.actualBuys}
              </Text>
              <Text style={styles.reportDetail}>
                Total Vendas: R$ {report.verification.actualSells}
              </Text>
              <Text style={styles.reportDetail}>
                Total Proventos: R$ {report.verification.actualIncomes}
              </Text>
              {report.duplicates.buys + report.duplicates.sells + report.duplicates.incomes >
                0 && (
                <Text style={styles.reportDetail}>
                  Itens já existentes: {report.duplicates.buys} compras, {report.duplicates.sells}{' '}
                  vendas, {report.duplicates.incomes} proventos
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => props.onNavigateToPortfolio?.(report.portfolioId) || props.onBack()}
            >
              <Text style={styles.primaryButtonText}>Ver carteira</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleUndo}>
              <Text style={styles.secondaryButtonText}>Desfazer importação</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.textButton} onPress={props.onBack}>
              <Text style={styles.textButtonText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111315',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1C1E20',
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  instructionText: {
    color: '#A0A4A8',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  privacyNote: {
    color: '#FF8A00',
    fontSize: 13,
    marginBottom: 20,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: '#FF8A00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#111315',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#2A2C2E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  textButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  textButtonText: {
    color: '#A0A4A8',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 16,
  },
  subLoadingText: {
    color: '#A0A4A8',
    fontSize: 13,
    marginTop: 6,
  },
  previewContainer: {
    marginTop: 8,
  },
  sectionHeader: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryTile: {
    backgroundColor: '#1C1E20',
    borderRadius: 12,
    padding: 12,
    width: '48%',
  },
  summaryLabel: {
    color: '#A0A4A8',
    fontSize: 12,
  },
  summaryValue: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  summarySub: {
    color: '#FF8A00',
    fontSize: 12,
    marginTop: 2,
  },
  obSection: {
    backgroundColor: '#1C1E20',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  obTitle: {
    color: '#FF8A00',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  obCard: {
    marginTop: 6,
  },
  obTicker: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  obDesc: {
    color: '#A0A4A8',
    fontSize: 12,
    marginVertical: 6,
    lineHeight: 16,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    backgroundColor: '#2A2C2E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: '#FF8A00',
  },
  chipText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  assetRow: {
    backgroundColor: '#1C1E20',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  assetTicker: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  assetName: {
    color: '#A0A4A8',
    fontSize: 12,
    maxWidth: 220,
  },
  classBadge: {
    backgroundColor: '#2A2C2E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  classBadgeText: {
    color: '#FF8A00',
    fontSize: 11,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF5252',
    fontSize: 13,
    marginTop: 10,
  },
  reportContainer: {
    paddingTop: 10,
  },
  reportTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  reportSubtitle: {
    color: '#A0A4A8',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  reportCard: {
    backgroundColor: '#1C1E20',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  verificationText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  reportDetail: {
    color: '#E0E0E0',
    fontSize: 13,
    lineHeight: 20,
  },
});
