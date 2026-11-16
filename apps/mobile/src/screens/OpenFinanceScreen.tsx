import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoGrid, BentoTile, ConfirmDialog } from '../components/ui';
import { CircleIconButton } from '../components/ui/CircleIconButton';
import {
  MAX_MEU_PLUGGY_ITEMS,
  MeuPluggyItemLimitError,
  OfItemRecord,
  openFinanceRepository,
} from '../repositories/openFinanceRepository';
import {
  PluggyClient,
  PluggyConsentExpiredError,
  PluggyCoverageItemSummary,
  pluggyCredentialsService,
} from '../services/pluggy/pluggyClient';
import { ThemeMode } from '../theme/palettes';
import { bento, BentoVariant, colors, layout, typography } from '../theme/tokens';

export interface OpenFinanceScreenProps {
  onClose?: () => void;
  themeMode?: ThemeMode;
  client?: PluggyClient;
  testID?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 30;

function computeDaysUntilExpiry(iso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const targetMs = Date.parse(iso);
  if (!Number.isFinite(targetMs)) return null;
  return Math.ceil((targetMs - nowMs) / MS_PER_DAY);
}

function isItemExpired(item: OfItemRecord, nowMs: number = Date.now()): boolean {
  if (item.execution_status === 'USER_AUTHORIZATION_EXPIRED' || item.status === 'LOGIN_ERROR') {
    return true;
  }
  const days = computeDaysUntilExpiry(item.consent_expires_at, nowMs);
  return days !== null && days < 0;
}

export const OpenFinanceScreen: React.FC<OpenFinanceScreenProps> = ({
  onClose,
  themeMode = 'dark',
  client,
  testID = 'open-finance-screen',
}) => {
  const isLight = themeMode === 'light';
  const variant: BentoVariant = isLight ? 'light' : 'dark';
  const fg = bento.variants[variant].foreground;
  const muted = bento.variants[variant].muted;
  const inset = isLight ? '#F6F2EA' : '#161819';
  const border = isLight ? '#ECE6DA' : '#2A2D30';
  const accent = '#D96628';

  const pluggyClient = useMemo(() => client ?? new PluggyClient(), [client]);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [hasSavedCreds, setHasSavedCreds] = useState(false);

  const [items, setItems] = useState<OfItemRecord[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [coverageReport, setCoverageReport] = useState<PluggyCoverageItemSummary[] | null>(null);
  const [confirmRemoveVisible, setConfirmRemoveVisible] = useState(false);

  const loadState = useCallback(async () => {
    const [savedCreds, storedItems] = await Promise.all([
      pluggyCredentialsService.getCredentials(),
      openFinanceRepository.listItems(),
    ]);
    if (savedCreds) {
      setClientId(savedCreds.clientId);
      setClientSecret(savedCreds.clientSecret);
      setHasSavedCreds(true);
    } else {
      setHasSavedCreds(false);
    }
    setItems(storedItems);
  }, []);

  useEffect(() => {
    loadState().catch(() => {});
  }, [loadState]);

  const handleSaveCredentials = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await pluggyCredentialsService.saveCredentials({ clientId, clientSecret });
      setHasSavedCreds(true);
      setStatusMessage('Credenciais salvas com segurança no SecureStore do aparelho.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleAddItem = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const trimmed = newItemId.trim();
    if (!trimmed) {
      setErrorMessage('Cole um itemId válido do Dashboard da Pluggy.');
      return;
    }
    try {
      await openFinanceRepository.addItem(trimmed);
      setNewItemId('');
      setItems(await openFinanceRepository.listItems());
      setStatusMessage('Conexão adicionada. Toque em "Testar conexão" para consultar os dados.');
    } catch (err) {
      if (err instanceof MeuPluggyItemLimitError) {
        setErrorMessage(
          `Limite de ${MAX_MEU_PLUGGY_ITEMS} conexões atingido: o Meu Pluggy gratuito permite no máximo ${MAX_MEU_PLUGGY_ITEMS} bancos conectados.`
        );
      } else {
        setErrorMessage((err as Error).message);
      }
    }
  };

  const handleRemoveItem = async (id: string) => {
    await openFinanceRepository.removeItem(id);
    setItems(await openFinanceRepository.listItems());
  };

  const handleTestConnection = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (items.length === 0) {
      setErrorMessage('Adicione pelo menos um itemId antes de testar a conexão.');
      return;
    }

    setIsTesting(true);
    const summaries: PluggyCoverageItemSummary[] = [];

    try {
      for (const item of items) {
        const startedAt = new Date().toISOString();
        try {
          const summary = await pluggyClient.inspectItemCoverage(item.id);
          summaries.push(summary);
          await openFinanceRepository.upsertItem({
            id: item.id,
            connector_name: summary.connectorName,
            status: summary.status,
            execution_status: summary.executionStatus,
            consent_expires_at: summary.consentExpiresAt,
            last_synced_at: new Date().toISOString(),
            last_error: null,
          });
          await openFinanceRepository.recordSyncRun({
            id: `run-${item.id}-${Date.now()}`,
            item_id: item.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: 'SUCCESS',
            counts_json: JSON.stringify({
              bankAccounts: summary.bankAccountsCount,
              creditCards: summary.creditCardsCount,
              bills: summary.billsCount,
              investments: summary.investmentsCount,
              investmentKinds: summary.investmentKinds,
              hasB3VariableIncome: summary.hasB3VariableIncome,
            }),
            error: null,
          });
        } catch (err) {
          const msg = (err as Error).message;
          const expired = err instanceof PluggyConsentExpiredError;
          await openFinanceRepository.upsertItem({
            id: item.id,
            connector_name: item.connector_name,
            status: expired ? 'LOGIN_ERROR' : 'ERROR',
            execution_status: expired ? 'USER_AUTHORIZATION_EXPIRED' : 'ERROR',
            consent_expires_at: item.consent_expires_at,
            last_synced_at: new Date().toISOString(),
            last_error: msg,
          });
          await openFinanceRepository.recordSyncRun({
            id: `run-${item.id}-${Date.now()}`,
            item_id: item.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            status: 'ERROR',
            counts_json: null,
            error: msg,
          });
          summaries.push({
            itemId: item.id,
            connectorName: item.connector_name ?? item.id,
            status: expired ? 'LOGIN_ERROR' : 'ERROR',
            executionStatus: expired ? 'USER_AUTHORIZATION_EXPIRED' : 'ERROR',
            consentExpiresAt: item.consent_expires_at,
            bankAccountsCount: 0,
            creditCardsCount: 0,
            billsCount: 0,
            investmentsCount: 0,
            investmentKinds: [],
            hasB3VariableIncome: false,
            error: msg,
          });
        }
      }

      setCoverageReport(summaries);
      setItems(await openFinanceRepository.listItems());
    } finally {
      setIsTesting(false);
    }
  };

  const handleConfirmRemoveCredentials = async () => {
    setConfirmRemoveVisible(false);
    await pluggyCredentialsService.clearCredentials();
    setClientId('');
    setClientSecret('');
    setHasSavedCreds(false);
    setCoverageReport(null);
    setStatusMessage('Credenciais removidas do SecureStore.');
  };

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            {onClose ? (
              <CircleIconButton
                icon="arrow-back"
                onPress={onClose}
                themeMode={themeMode}
                testID="open-finance-back-btn"
                accessibilityLabel="Voltar"
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: fg }]}>Open Finance</Text>
              <Text style={[styles.subtitle, { color: muted }]}>
                Uso pessoal via Meu Pluggy (sem servidor)
              </Text>
            </View>
          </View>

          <BentoGrid>
            {/* Guia 4 etapas */}
            <BentoTile variant={variant} testID="open-finance-guide" style={styles.card}>
              <Text style={[styles.sectionTitle, { color: fg }]}>Como conectar em 4 etapas</Text>
              <View style={styles.steps}>
                <TouchableOpacity onPress={() => Linking.openURL('https://meu.pluggy.ai')}>
                  <Text style={[styles.stepText, { color: fg }]}>
                    1. Crie sua conta em <Text style={{ color: accent, textDecorationLine: 'underline' }}>meu.pluggy.ai</Text> e conecte seus bancos (até 5 conexões).
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL('https://dashboard.pluggy.ai')}>
                  <Text style={[styles.stepText, { color: fg }]}>
                    2. Crie uma aplicação em <Text style={{ color: accent, textDecorationLine: 'underline' }}>dashboard.pluggy.ai</Text> usando a mesma conta.
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.stepText, { color: fg }]}>
                  3. Em Applications → Demo → Connect Account, escolha o conector <Text style={styles.bold}>MeuPluggy</Text>.
                </Text>
                <Text style={[styles.stepText, { color: fg }]}>
                  4. Copie o <Text style={styles.bold}>Client ID</Text>, o <Text style={styles.bold}>Client Secret</Text> e os <Text style={styles.bold}>itemIds</Text> abaixo.
                </Text>
              </View>
            </BentoTile>

            {/* Credenciais */}
            <BentoTile variant={variant} testID="open-finance-credentials-card" style={styles.card}>
              <Text style={[styles.sectionTitle, { color: fg }]}>Credenciais da aplicação</Text>
              <Text style={[styles.caption, { color: muted }]}>
                Guardadas apenas no SecureStore do aparelho. Nunca entram em backups ou logs.
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  testID="open-finance-client-id-input"
                  value={clientId}
                  onChangeText={setClientId}
                  placeholder="Client ID"
                  placeholderTextColor={muted}
                  secureTextEntry={!showClientId}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: inset, color: fg, borderColor: border }]}
                />
                <TouchableOpacity
                  testID="open-finance-toggle-client-id"
                  onPress={() => setShowClientId((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <MaterialIcons name={showClientId ? 'visibility-off' : 'visibility'} size={20} color={muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputRow}>
                <TextInput
                  testID="open-finance-client-secret-input"
                  value={clientSecret}
                  onChangeText={setClientSecret}
                  placeholder="Client Secret"
                  placeholderTextColor={muted}
                  secureTextEntry={!showClientSecret}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: inset, color: fg, borderColor: border }]}
                />
                <TouchableOpacity
                  testID="open-finance-toggle-client-secret"
                  onPress={() => setShowClientSecret((v) => !v)}
                  style={styles.eyeBtn}
                >
                  <MaterialIcons name={showClientSecret ? 'visibility-off' : 'visibility'} size={20} color={muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  testID="open-finance-save-credentials-btn"
                  onPress={handleSaveCredentials}
                  style={[styles.primaryBtn, { backgroundColor: accent }]}
                >
                  <Text style={styles.primaryBtnText}>
                    {hasSavedCreds ? 'Atualizar credenciais' : 'Salvar credenciais'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="open-finance-remove-credentials-btn"
                  onPress={() => setConfirmRemoveVisible(true)}
                  style={[styles.secondaryBtn, { borderColor: border }]}
                >
                  <Text style={[styles.secondaryBtnText, { color: fg }]}>Remover credenciais</Text>
                </TouchableOpacity>
              </View>
            </BentoTile>

            {/* Itens conectados */}
            <BentoTile variant={variant} testID="open-finance-items-card" style={styles.card}>
              <Text style={[styles.sectionTitle, { color: fg }]}>
                Conexões Meu Pluggy ({items.length}/{MAX_MEU_PLUGGY_ITEMS})
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  testID="open-finance-new-item-input"
                  value={newItemId}
                  onChangeText={setNewItemId}
                  placeholder="Cole um itemId do Dashboard"
                  placeholderTextColor={muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { backgroundColor: inset, color: fg, borderColor: border }]}
                />
                <TouchableOpacity
                  testID="open-finance-add-item-btn"
                  onPress={handleAddItem}
                  style={[styles.primaryBtn, { backgroundColor: accent }]}
                >
                  <Text style={styles.primaryBtnText}>Adicionar</Text>
                </TouchableOpacity>
              </View>

              {items.map((item) => {
                const daysLeft = computeDaysUntilExpiry(item.consent_expires_at);
                const expired = isItemExpired(item);
                const warnExpiry = !expired && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS;

                return (
                  <View
                    key={item.id}
                    testID={`open-finance-item-${item.id}`}
                    style={[styles.itemRow, { borderColor: border, backgroundColor: inset }]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.itemTitle, { color: fg }]}>
                        {item.connector_name || item.id}
                      </Text>
                      <Text style={[styles.caption, { color: muted }]}>
                        Status: {item.status ?? 'Não verificado'} · Última atualização:{' '}
                        {item.last_synced_at ? item.last_synced_at.slice(0, 10) : '—'}
                      </Text>

                      {daysLeft !== null && !expired ? (
                        <Text
                          testID={warnExpiry ? `open-finance-item-warning-badge-${item.id}` : undefined}
                          style={[styles.caption, { color: warnExpiry ? '#D4A83B' : muted }]}
                        >
                          {`autorização vence em ${daysLeft} dias`}
                        </Text>
                      ) : null}

                      {expired ? (
                        <Text
                          testID={`open-finance-item-expired-error-${item.id}`}
                          style={[styles.errorText]}
                        >
                          Autorização expirada. Refaça a conexão no Dashboard da Pluggy (MeuPluggy).
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      testID={`open-finance-remove-item-${item.id}`}
                      onPress={() => handleRemoveItem(item.id)}
                      style={styles.eyeBtn}
                    >
                      <MaterialIcons name="delete-outline" size={20} color={muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TouchableOpacity
                testID="open-finance-test-connection-btn"
                onPress={handleTestConnection}
                disabled={isTesting}
                style={[styles.primaryBtn, { backgroundColor: accent, marginTop: 8 }]}
              >
                <Text style={styles.primaryBtnText}>
                  {isTesting ? 'Testando conexão...' : 'Testar conexão'}
                </Text>
              </TouchableOpacity>
            </BentoTile>

            {errorMessage ? (
              <BentoTile variant={variant} style={styles.card}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </BentoTile>
            ) : null}

            {statusMessage ? (
              <BentoTile variant={variant} style={styles.card}>
                <Text style={[styles.caption, { color: fg }]}>{statusMessage}</Text>
              </BentoTile>
            ) : null}

            {coverageReport ? (
              <BentoTile variant={variant} testID="open-finance-coverage-report" style={styles.card}>
                <Text style={[styles.sectionTitle, { color: fg }]}>Relatório de cobertura</Text>
                {coverageReport.map((rep) => (
                  <View key={rep.itemId} style={[styles.itemRow, { borderColor: border, backgroundColor: inset }]}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.itemTitle, { color: fg }]}>{rep.connectorName}</Text>
                      {rep.error ? (
                        <Text style={styles.errorText}>{rep.error}</Text>
                      ) : (
                        <>
                          <Text style={[styles.caption, { color: fg }]}>
                            {`Contas: ${rep.bankAccountsCount} · Cartões: ${rep.creditCardsCount} · Faturas: ${rep.billsCount} · Investimentos: ${rep.investmentsCount}`}
                          </Text>
                          {rep.investmentKinds.length > 0 ? (
                            <Text style={[styles.caption, { color: muted }]}>
                              {`Tipos: ${rep.investmentKinds
                                .map((k) => `${k.type}/${k.subtype ?? 'OTHER'} (${k.count})`)
                                .join(', ')}`}
                            </Text>
                          ) : (
                            <Text style={[styles.caption, { color: muted }]}>
                              Nenhum investimento retornado por este conector.
                            </Text>
                          )}
                          <Text style={[styles.caption, { color: rep.hasB3VariableIncome ? '#2E8B57' : muted }]}>
                            {rep.hasB3VariableIncome
                              ? 'Renda variável B3 (ações/FIIs/ETFs) recebida via Open Finance.'
                              : 'Sem ações/FIIs da B3 neste conector (importação B3 continua necessária).'}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </BentoTile>
            ) : null}
          </BentoGrid>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmRemoveVisible}
        title="Remover credenciais?"
        message="Client ID, Client Secret e API Key serão apagados do SecureStore deste aparelho."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        themeMode={themeMode}
        confirmTestID="open-finance-confirm-remove-btn"
        onConfirm={handleConfirmRemoveCredentials}
        onCancel={() => setConfirmRemoveVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidFloor },
  containerLight: { backgroundColor: '#F4F1EA' },
  scrollContent: { padding: layout.screenPadding, paddingTop: 12, paddingBottom: 40, alignItems: 'center' },
  content: { width: '100%', maxWidth: 960, gap: bento.gap },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', fontFamily: typography.fontFamily },
  subtitle: { fontSize: 13 },
  card: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  steps: { gap: 8 },
  stepText: { fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  eyeBtn: { padding: 8 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryBtn: {
    borderRadius: 9999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 13 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  itemTitle: { fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 12, color: '#D94B4B', lineHeight: 17 },
});

export default OpenFinanceScreen;
