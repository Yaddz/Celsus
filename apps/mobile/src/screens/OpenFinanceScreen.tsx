import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { OpenFinanceInvestmentReconciliationSheet } from '../components/OpenFinanceInvestmentReconciliationSheet';
import { BentoGrid, BentoTile, ConfirmDialog } from '../components/ui';
import { CircleIconButton } from '../components/ui/CircleIconButton';
import type { FinAccount } from '../db/schema';
import { finRepository } from '../repositories/finRepository';
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
import {
  pluggySyncService,
  type AccountReconciliationChoice,
  type AccountReconciliationProposal,
} from '../services/pluggy/pluggySyncService';
import {
  pluggyInvestmentsSyncService,
  type InvestmentReconciliationChoice,
  type InvestmentReconciliationProposal,
} from '../services/pluggy/pluggyInvestmentsSyncService';
import { computeClassCoverageReport } from '../domain/openFinance/investments';
import {
  buildSyncDiagnostics,
  formatDiagnosticsReportText,
  type SyncDiagnosticsReport,
} from '../domain/openFinance/diagnostics';
import { assetRepository } from '../repositories/assetRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { THEME_COLORS, ThemeMode } from '../theme/palettes';
import { BentoVariant, bento, layout, space, typography } from '../theme/tokens';

export interface OpenFinanceScreenProps {
  onClose?: () => void;
  themeMode?: ThemeMode;
  client?: PluggyClient;
  onCopyReport?: (text: string) => void | Promise<void>;
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
  onCopyReport,
  testID = 'open-finance-screen',
}) => {
  const isLight = themeMode === 'light';
  const variant: BentoVariant = isLight ? 'light' : 'dark';
  const t = THEME_COLORS[themeMode];
  const fg = t.onSurface;
  const muted = t.muted;
  const inset = t.surfaceInset;
  const border = t.border;
  const accent = t.accent;

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
  const [isSyncingFinance, setIsSyncingFinance] = useState(false);
  const [reconcileItemId, setReconcileItemId] = useState<string | null>(null);
  const [reconcileProposals, setReconcileProposals] = useState<AccountReconciliationProposal[]>([]);
  const [reconcileChoices, setReconcileChoices] = useState<Record<string, string | 'CREATE_NEW'>>({});
  const [localAccounts, setLocalAccounts] = useState<FinAccount[]>([]);
  const [coverageReport, setCoverageReport] = useState<PluggyCoverageItemSummary[] | null>(null);
  const [diagnosticsReport, setDiagnosticsReport] = useState<SyncDiagnosticsReport | null>(null);
  const [pendingFinanceQueue, setPendingFinanceQueue] = useState<string[]>([]);
  const [financeTotals, setFinanceTotals] = useState({ created: 0, updated: 0, accounts: 0 });
  const [confirmRemoveVisible, setConfirmRemoveVisible] = useState(false);
  const [isSyncingInvestments, setIsSyncingInvestments] = useState(false);
  const [invReconcile, setInvReconcile] = useState<{
    itemId: string;
    institutionName: string;
    proposals: InvestmentReconciliationProposal[];
    portfolios: Array<{ id: string; name: string }>;
    existingAssets: Array<{ id: string; ticker: string; name: string; assetClass: string }>;
    pendingItemIds: string[];
    totals: { created: number; updated: number; incomesCreated?: number; incomesMatched?: number };
  } | null>(null);

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
    setErrorMessage(null);
    try {
      // Os ativos dessa conexão voltam a ser manuais e as movimentações arquivadas são restauradas
      await pluggyInvestmentsSyncService.disconnectItemInvestments(id);
      await openFinanceRepository.removeItem(id);
      setItems(await openFinanceRepository.listItems());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao remover a conexão.');
    }
  };

  /**
   * Sincroniza os investimentos conexão por conexão. Investimento ainda sem vínculo abre a
   * conciliação (o usuário escolhe carteira e casamento); os já vinculados sincronizam direto.
   */
  const runInvestmentsSync = async (
    itemIds: string[],
    totals: { created: number; updated: number; incomesCreated?: number; incomesMatched?: number }
  ) => {
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const proposals = await pluggyInvestmentsSyncService.previewReconciliation(itemId, {
        client: pluggyClient,
      });
      const needsChoice = proposals.some((p) => p.matchStrategy !== 'EXTERNAL_ID');

      if (needsChoice) {
        const portfolios = await portfolioRepository.listPortfolios();
        if (portfolios.length === 0) {
          setErrorMessage('Crie uma carteira de investimentos antes de sincronizar os investimentos.');
          return;
        }
        const assetLists = await Promise.all(
          portfolios.map((p) => assetRepository.listByPortfolio(p.id))
        );
        const item = items.find((it) => it.id === itemId);
        setInvReconcile({
          itemId,
          institutionName: item?.connector_name || itemId,
          proposals,
          portfolios: portfolios.map((p) => ({ id: p.id, name: p.name })),
          existingAssets: assetLists.flat().map((a) => ({
            id: a.id,
            ticker: a.ticker,
            name: a.name,
            assetClass: a.asset_class,
          })),
          pendingItemIds: itemIds.slice(i + 1),
          totals,
        });
        return;
      }

      const res = await pluggyInvestmentsSyncService.syncInvestments(itemId, {
        client: pluggyClient,
      });
      totals.created += res.counts.assetsCreated;
      totals.updated += res.counts.assetsUpdated;
      totals.incomesCreated = (totals.incomesCreated ?? 0) + (res.counts.incomesCreated ?? 0);
      totals.incomesMatched = (totals.incomesMatched ?? 0) + (res.counts.incomesMatched ?? 0);
    }
    const incNew = totals.incomesCreated ?? 0;
    const incMatched = totals.incomesMatched ?? 0;
    const incSuffix =
      incNew > 0 || incMatched > 0
        ? ` · ${incNew} proventos novos, ${incMatched} já existentes confirmados`
        : '';
    setStatusMessage(
      `Investimentos sincronizados: ${totals.created} novos, ${totals.updated} atualizados${incSuffix}.`
    );
  };

  const handleStartInvestmentsSync = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (items.length === 0) {
      setErrorMessage('Adicione pelo menos um Item ID antes de sincronizar.');
      return;
    }
    setIsSyncingInvestments(true);
    try {
      await runInvestmentsSync(
        items.map((it) => it.id),
        { created: 0, updated: 0 }
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao sincronizar investimentos.');
    } finally {
      setIsSyncingInvestments(false);
    }
  };

  const handleConfirmInvestmentReconciliation = async (
    choices: InvestmentReconciliationChoice[]
  ) => {
    if (!invReconcile) return;
    const { itemId, pendingItemIds, totals } = invReconcile;
    setInvReconcile(null);
    setIsSyncingInvestments(true);
    setErrorMessage(null);
    try {
      const res = await pluggyInvestmentsSyncService.syncInvestments(itemId, {
        client: pluggyClient,
        reconciliationChoices: choices,
      });
      const nextTotals = {
        created: totals.created + res.counts.assetsCreated,
        updated: totals.updated + res.counts.assetsUpdated,
        incomesCreated: (totals.incomesCreated ?? 0) + (res.counts.incomesCreated ?? 0),
        incomesMatched: (totals.incomesMatched ?? 0) + (res.counts.incomesMatched ?? 0),
      };
      await runInvestmentsSync(pendingItemIds, nextTotals);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao sincronizar investimentos.');
    } finally {
      setIsSyncingInvestments(false);
    }
  };

  const openFinanceReconciliationFor = async (itemId: string, remainingQueue: string[]) => {
    const [proposals, accounts] = await Promise.all([
      pluggySyncService.previewAccountReconciliation(itemId, pluggyClient),
      finRepository.listAccounts(false),
    ]);
    const initialChoices: Record<string, string | 'CREATE_NEW'> = {};
    for (const p of proposals) {
      initialChoices[p.pluggyAccount.id] = p.suggestedLocalAccountId ?? 'CREATE_NEW';
    }
    setLocalAccounts(accounts);
    setReconcileProposals(proposals);
    setReconcileChoices(initialChoices);
    setPendingFinanceQueue(remainingQueue);
    setReconcileItemId(itemId);
  };

  const handleStartFinanceSync = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (items.length === 0) {
      setErrorMessage('Adicione pelo menos um Item ID antes de sincronizar.');
      return;
    }
    setIsSyncingFinance(true);
    try {
      const unsynced = items.filter((it) => !it.last_synced_at);
      if (unsynced.length > 0) {
        setFinanceTotals({ created: 0, updated: 0, accounts: 0 });
        await openFinanceReconciliationFor(
          unsynced[0].id,
          unsynced.slice(1).map((u) => u.id)
        );
        return;
      }

      let totalCreated = 0;
      let totalUpdated = 0;
      for (const it of items) {
        const res = await pluggySyncService.syncFinance(it.id, { client: pluggyClient });
        totalCreated += res.counts.transactionsCreated;
        totalUpdated += res.counts.transactionsUpdated;
      }
      await loadState();
      setStatusMessage(
        `Finanças sincronizadas: ${totalCreated} novos, ${totalUpdated} atualizados.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao sincronizar finanças.');
    } finally {
      setIsSyncingFinance(false);
    }
  };

  const handleConfirmReconciliation = async () => {
    if (!reconcileItemId) return;
    setIsSyncingFinance(true);
    setErrorMessage(null);
    try {
      const choices: AccountReconciliationChoice[] = reconcileProposals.map((p) => ({
        pluggyAccountId: p.pluggyAccount.id,
        targetLocalAccountId: reconcileChoices[p.pluggyAccount.id] ?? 'CREATE_NEW',
      }));
      const res = await pluggySyncService.syncFinance(reconcileItemId, {
        client: pluggyClient,
        accountChoices: choices,
      });
      const nextTotals = {
        created: financeTotals.created + res.counts.transactionsCreated,
        updated: financeTotals.updated + res.counts.transactionsUpdated,
        accounts: financeTotals.accounts + res.counts.accountsSynced,
      };
      setFinanceTotals(nextTotals);

      if (pendingFinanceQueue.length > 0) {
        const [nextItemId, ...restQueue] = pendingFinanceQueue;
        await openFinanceReconciliationFor(nextItemId, restQueue);
        return;
      }

      // Sincroniza também os itens já conciliados anteriormente
      const syncedItems = items.filter((it) => Boolean(it.last_synced_at));
      for (const it of syncedItems) {
        const extraRes = await pluggySyncService.syncFinance(it.id, { client: pluggyClient });
        nextTotals.created += extraRes.counts.transactionsCreated;
        nextTotals.updated += extraRes.counts.transactionsUpdated;
      }

      setReconcileItemId(null);
      setReconcileProposals([]);
      setPendingFinanceQueue([]);
      await loadState();
      setStatusMessage(
        `Primeira sincronização concluída: ${nextTotals.accounts} contas, ${nextTotals.created} lançamentos.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro na conciliação inicial.');
    } finally {
      setIsSyncingFinance(false);
    }
  };

  const handleTestConnection = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const currentItems = items.length > 0 ? items : await openFinanceRepository.listItems();
    if (currentItems.length === 0) {
      setErrorMessage('Adicione pelo menos um itemId antes de testar a conexão.');
      return;
    }

    setIsTesting(true);
    const summaries: PluggyCoverageItemSummary[] = [];

    try {
      for (const item of currentItems) {
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

      const firstOk = summaries.find((s) => !s.error);
      if (firstOk) {
        const [rawAccs, rawInvs, localAccs] = await Promise.all([
          typeof pluggyClient.listAccounts === 'function'
            ? pluggyClient.listAccounts(firstOk.itemId).catch(() => [])
            : Promise.resolve([]),
          typeof pluggyClient.listInvestments === 'function'
            ? pluggyClient.listInvestments(firstOk.itemId).catch(() => [])
            : Promise.resolve([]),
          finRepository.listAccounts(true).catch(() => []),
        ]);
        const diag = buildSyncDiagnostics(
          {
            itemId: firstOk.itemId,
            connectorName: firstOk.connectorName,
            accounts: rawAccs,
            investments: rawInvs,
          },
          {
            accounts: localAccs
              .filter((a) => a.source === 'OPEN_FINANCE')
              .map((a) => ({
                ofAccountId: a.of_account_id,
                reportedBalanceCents: a.reported_balance_cents,
                calculatedBalanceCents: a.reported_balance_cents ?? 0,
                hasOwner: Boolean(a.owner),
                hasMaskedNumber: Boolean(a.masked_number),
              })),
          }
        );
        setDiagnosticsReport(diag);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    if (!diagnosticsReport) return;
    const text = formatDiagnosticsReportText(diagnosticsReport);
    if (onCopyReport) {
      await onCopyReport(text);
      setStatusMessage('Relatório de diagnóstico copiado sem dados pessoais.');
      return;
    }
    try {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
      } else {
        await Share.share({ message: text });
      }
      setStatusMessage('Relatório de diagnóstico copiado sem dados pessoais.');
    } catch {
      setErrorMessage('Não foi possível copiar o relatório.');
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
    <View testID={testID} style={[styles.container, { backgroundColor: t.background }]}>
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
                    <View style={{ flex: 1, gap: space.xs }}>
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
                          style={[styles.caption, { color: warnExpiry ? t.warning : muted }]}
                        >
                          {`autorização vence em ${daysLeft} dias`}
                        </Text>
                      ) : null}

                      {expired ? (
                        <Text
                          testID={`open-finance-item-expired-error-${item.id}`}
                          style={[styles.errorText, { color: t.error }]}
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
                style={[styles.primaryBtn, { backgroundColor: accent, marginTop: space.sm }]}
              >
                <Text style={[styles.primaryBtnText, { color: t.onAccent }]}>
                  {isTesting ? 'Testando conexão...' : 'Testar conexão'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="open-finance-sync-finance-btn"
                onPress={handleStartFinanceSync}
                disabled={isSyncingFinance}
                style={[styles.primaryBtn, { backgroundColor: t.primaryButtonBg, marginTop: space.xs }]}
              >
                <Text style={[styles.primaryBtnText, { color: t.onPrimaryButton }]}>
                  {isSyncingFinance ? 'Sincronizando finanças...' : 'Sincronizar finanças'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="open-finance-sync-investments-btn"
                onPress={handleStartInvestmentsSync}
                disabled={isSyncingInvestments}
                style={[styles.primaryBtn, { backgroundColor: t.primaryButtonBg, marginTop: space.xs }]}
              >
                <Text style={[styles.primaryBtnText, { color: t.onPrimaryButton }]}>
                  {isSyncingInvestments ? 'Sincronizando investimentos...' : 'Sincronizar investimentos'}
                </Text>
              </TouchableOpacity>
            </BentoTile>

            {reconcileItemId && reconcileProposals.length > 0 ? (
              <BentoTile
                variant={variant}
                testID="open-finance-reconcile-card"
                style={styles.card}
              >
                <Text style={[styles.sectionTitle, { color: fg }]}>
                  Conciliação inicial de contas
                </Text>
                <Text style={[styles.caption, { color: muted }]}>
                  Ligue cada conta da Pluggy a uma conta existente ou crie uma nova.
                </Text>
                {reconcileProposals.map((prop) => {
                  const selected = reconcileChoices[prop.pluggyAccount.id] ?? 'CREATE_NEW';
                  const targetType = prop.pluggyAccount.type === 'CREDIT' ? 'card' : 'checking';
                  const candidates = localAccounts.filter((a) => a.type === targetType);
                  return (
                    <View
                      key={prop.pluggyAccount.id}
                      style={[styles.itemRow, { borderColor: border, backgroundColor: inset, flexDirection: 'column', alignItems: 'stretch' }]}
                    >
                      <Text style={[styles.itemTitle, { color: fg }]}>
                        {prop.pluggyAccount.marketingName || prop.pluggyAccount.name} ({targetType === 'card' ? 'Cartão' : 'Conta'})
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
                        <TouchableOpacity
                          onPress={() =>
                            setReconcileChoices((prev) => ({
                              ...prev,
                              [prop.pluggyAccount.id]: 'CREATE_NEW',
                            }))
                          }
                          style={[
                            styles.smallBtn,
                            {
                              borderColor: selected === 'CREATE_NEW' ? accent : border,
                              backgroundColor: selected === 'CREATE_NEW' ? accent : 'transparent',
                            },
                          ]}
                        >
                          <Text style={{ fontSize: 12, color: selected === 'CREATE_NEW' ? t.onAccent : fg }}>
                            Criar nova conta
                          </Text>
                        </TouchableOpacity>
                        {candidates.map((cand) => (
                          <TouchableOpacity
                            key={cand.id}
                            onPress={() =>
                              setReconcileChoices((prev) => ({
                                ...prev,
                                [prop.pluggyAccount.id]: cand.id,
                              }))
                            }
                            style={[
                              styles.smallBtn,
                              {
                                borderColor: selected === cand.id ? accent : border,
                                backgroundColor: selected === cand.id ? accent : 'transparent',
                              },
                            ]}
                          >
                            <Text style={{ fontSize: 12, color: selected === cand.id ? t.onAccent : fg }}>
                              {cand.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity
                  testID="open-finance-confirm-reconcile-btn"
                  onPress={handleConfirmReconciliation}
                  disabled={isSyncingFinance}
                  style={[styles.primaryBtn, { backgroundColor: accent, marginTop: space.sm }]}
                >
                  <Text style={styles.primaryBtnText}>Confirmar e sincronizar</Text>
                </TouchableOpacity>
              </BentoTile>
            ) : null}

            {errorMessage ? (
              <BentoTile variant={variant} style={styles.card}>
                <Text style={[styles.errorText, { color: t.error }]}>{errorMessage}</Text>
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
                    <View style={{ flex: 1, gap: space.xs }}>
                      <Text style={[styles.itemTitle, { color: fg }]}>{rep.connectorName}</Text>
                      {rep.error ? (
                        <Text style={[styles.errorText, { color: t.error }]}>{rep.error}</Text>
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
                          <Text style={[styles.caption, { color: rep.hasB3VariableIncome ? t.success : muted }]}>
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

            {diagnosticsReport ? (
              <BentoTile variant={variant} testID="open-finance-diagnostics" style={styles.card}>
                <Text style={[styles.sectionTitle, { color: fg }]}>
                  Diagnóstico da última sincronização
                </Text>
                <Text style={[styles.caption, { color: fg }]}>
                  {`Contas: ${diagnosticsReport.counts.accounts.persisted}/${diagnosticsReport.counts.accounts.received} · Transações: ${diagnosticsReport.counts.transactions.persisted}/${diagnosticsReport.counts.transactions.received} · Faturas: ${diagnosticsReport.counts.bills.persisted}/${diagnosticsReport.counts.bills.received}`}
                </Text>
                <Text style={[styles.caption, { color: fg }]}>
                  {`Investimentos: ${diagnosticsReport.counts.investments.persisted}/${diagnosticsReport.counts.investments.received} · Movimentações: ${diagnosticsReport.counts.investmentTransactions.persisted}/${diagnosticsReport.counts.investmentTransactions.received} · Divergências: ${diagnosticsReport.divergences.length}`}
                </Text>
                <TouchableOpacity
                  testID="open-finance-copy-diagnostics-btn"
                  style={[styles.secondaryBtn, { borderColor: border }]}
                  onPress={() => void handleCopyDiagnostics()}
                >
                  <Text style={[styles.secondaryBtnText, { color: fg }]}>Copiar relatório</Text>
                </TouchableOpacity>
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

      {invReconcile ? (
        <OpenFinanceInvestmentReconciliationSheet
          visible={true}
          institutionName={invReconcile.institutionName}
          proposals={invReconcile.proposals}
          existingAssets={invReconcile.existingAssets}
          portfolios={invReconcile.portfolios}
          coverageByClass={computeClassCoverageReport(
            invReconcile.proposals.map((p) => p.pluggyInvestment)
          )}
          themeMode={themeMode}
          onConfirm={handleConfirmInvestmentReconciliation}
          onClose={() => setInvReconcile(null)}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: layout.screenPadding, paddingTop: space.md, paddingBottom: space.xxl, alignItems: 'center' },
  content: { width: '100%', maxWidth: 960, gap: bento.gap },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  title: { fontSize: 22, fontWeight: '700', fontFamily: typography.fontFamily },
  subtitle: { fontSize: 13 },
  card: { padding: space.lg, gap: space.md },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  steps: { gap: space.sm },
  stepText: { fontSize: 13, lineHeight: 19 },
  bold: { fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 14,
  },
  eyeBtn: { padding: space.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  primaryBtn: {
    borderRadius: 9999,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontWeight: '600', fontSize: 13 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
  },
  itemTitle: { fontSize: 14, fontWeight: '700' },
  smallBtn: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  errorText: { fontSize: 12, lineHeight: 17 },
});

export default OpenFinanceScreen;
