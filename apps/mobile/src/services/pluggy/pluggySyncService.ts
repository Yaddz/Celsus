import * as Crypto from 'expo-crypto';
import { eq } from 'drizzle-orm';
import { getDatabase, runInTransaction } from '../../db/client';
import { assets, finAccounts, incomeEvents, portfolios } from '../../db/schema';
import { matchAppInvestmentTransferOut } from '../../domain/financeFlow';
import {
  applyUserEditedPreservation,
  computeSyncWindowStart,
  deduplicatePluggyAccountTransactions,
  detectRemovedOpenFinanceEntries,
  mapPluggyAccount,
  mapPluggyTransaction,
  reconcilePluggyTransactions,
  shouldAutoSync,
  toCentsDecimal,
  type MappedPluggyTransaction,
  type ReconcilableOpenFinanceEntry,
} from '../../domain/openFinance';
import { transactionBaseFingerprint } from '../../domain/openFinance/identity';
import { toBrtDate, toBrtMonth } from '../../domain/openFinance/dates';
import {
  assignBillMonth,
  deriveCardCalendar,
  inferForecastOffset,
} from '../../domain/openFinance/cardBills';
import {
  detectBankIncomeCandidate,
  type BankIncomeCandidate,
  type KnownIncomeAsset,
} from '../../domain/openFinance/income';
import { findEquivalentIncome } from '../../domain/finance/incomeDedup';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { pluggyClassificationService } from './pluggyClassificationService';
import {
  institutionFromCompe,
  parseTransferNumberCompe,
  resolveInstitutionName,
} from '../../domain/openFinance/institutions';
import { assertItemConsentActive, PluggyClient } from './pluggyClient';
import type { PluggyAccount, PluggyBill, PluggyTransaction } from './types';

export interface PluggySyncCounts {
  accountsSynced: number;
  transactionsFetched: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  transactionsSettled: number;
  transfersMatched: number;
  billsSynced: number;
  entriesRemoved?: number;
  removalConflicts?: number;
  ambiguousIncomeCount?: number;
  ownTransfersPaired?: number;
  cardTopupsPaired?: number;
  reclassified?: number;
  reclassifiedByReason?: Record<string, number>;
  matchedByProviderId?: number;
  matchedByFingerprint?: number;
  restored?: number;
  removalSkippedReason?: string;
  dedupeConflicts?: number;
}

/**
 * Sprint 92: marca, por conexão, que o histórico completo já foi buscado depois da classificação da Sprint 91.
 * Conexões sincronizadas antes dela tinham lançamentos antigos sem `of_category_id`, que a reclassificação não
 * conseguia corrigir.
 */
export const OF_HISTORY_BACKFILL_META_PREFIX = 'fin:of:backfill:s92:';
export const OF_FULL_HISTORY_S98_META_PREFIX = 'fin:of:fullhistory:s98:';
export const OF_RECLOSE_S102B_META_PREFIX = 'fin:of:reclose:s102b:';
export const OF_DEDUPE_S98_META_KEY = 'fin:of:dedupe:s98';
export const OF_DEDUPE_S98_LOG_KEY = 'fin:of:dedupe:s98:log';
export const OF_BILLMONTH_S99_META_KEY = 'fin:of:billmonth:s99';
export const OF_BILLMONTH_S99_LOG_KEY = 'fin:of:billmonth:s99:log';
export const OF_BRT_DATES_S101_META_KEY = 'fin:of:brtdates:s101';
export const OF_BRT_DATES_S101_LOG_KEY = 'fin:of:brtdates:s101:log';
export const BROKER_LINK_SUGGEST_V3_META_PREFIX = 'broker-link-suggest:v3:';

export interface PluggySyncResult {
  runId: string;
  itemId: string;
  status: 'SUCCESS' | 'ERROR';
  counts: PluggySyncCounts;
  accountsNeedingClosingDay: string[];
  error?: string;
}

export interface AccountReconciliationProposal {
  pluggyAccount: PluggyAccount;
  suggestedLocalAccountId: string | null;
}

export interface AccountReconciliationChoice {
  pluggyAccountId: string;
  targetLocalAccountId: string | 'CREATE_NEW';
  closingDay?: number | null;
}

export interface SyncFinanceOptions {
  client?: PluggyClient;
  now?: () => Date;
  accountChoices?: AccountReconciliationChoice[];
}

function generateId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return `of-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export const pluggySyncService = {
  async syncFinance(
    itemId: string,
    options?: SyncFinanceOptions
  ): Promise<PluggySyncResult> {
    const client = options?.client ?? new PluggyClient();
    const nowDate = options?.now ? options.now() : new Date();
    const nowIso = nowDate.toISOString();
    const runId = generateId();

    const counts: PluggySyncCounts = {
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsCreated: 0,
      transactionsUpdated: 0,
      transactionsSettled: 0,
      transfersMatched: 0,
      billsSynced: 0,
      ambiguousIncomeCount: 0,
    };

    try {
      const priorRuns = await openFinanceRepository.listSyncRuns(itemId);
      const financeRuns = priorRuns.filter(
        (r) => (r.kind ?? (r.id.startsWith('of-inv-') ? 'INVESTMENTS' : 'FINANCE')) === 'FINANCE'
      );
      const lastSuccess = financeRuns.find((r) => r.status === 'SUCCESS');
      const lastSuccessIso = lastSuccess
        ? lastSuccess.finished_at ?? lastSuccess.started_at
        : null;
      const isFirstFinanceSync = !lastSuccessIso;
      const firstDateFrom = computeSyncWindowStart(null, nowIso);
      const createdAtFrom = lastSuccessIso
        ? new Date(Date.parse(lastSuccessIso) - 24 * 60 * 60 * 1000).toISOString()
        : null;
      const reconcileWindowStart = isFirstFinanceSync
        ? firstDateFrom
        : new Date(nowDate.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const backfillMetaKey = `${OF_HISTORY_BACKFILL_META_PREFIX}${itemId}`;
      const fullHistoryMetaKey = `${OF_FULL_HISTORY_S98_META_PREFIX}${itemId}`;
      const needsHistoryBackfill =
        !isFirstFinanceSync && (await appMetaRepository.get(backfillMetaKey)) !== '1';
      const needsFullHistoryS98 =
        !isFirstFinanceSync && (await appMetaRepository.get(fullHistoryMetaKey)) !== '1';
      const fetchedFullHistory =
        isFirstFinanceSync || needsHistoryBackfill || needsFullHistoryS98;

      const item = await client.getItem(itemId);
      assertItemConsentActive(item, nowDate.getTime());

      const pluggyAccounts = await client.listAccounts(itemId);
      const txsByAccount = new Map<string, Array<{ tx: PluggyTransaction; externalId: string }>>();
      const billsByAccount = new Map<string, PluggyBill[]>();

      for (const acc of pluggyAccounts) {
        let rawTxs: PluggyTransaction[];
        if (isFirstFinanceSync || !createdAtFrom) {
          // R37: 1ª sincronização busca sem dateFrom para trazer todo o histórico da Pluggy
          rawTxs = await client.listTransactions(acc.id);
        } else {
          const [incTxs, recTxs, historyTxs, fullHistoryS98Txs] = await Promise.all([
            client.listTransactions(acc.id, { createdAtFrom }),
            client.listTransactions(acc.id, { dateFrom: reconcileWindowStart }),
            needsHistoryBackfill
              ? client.listTransactions(acc.id, { dateFrom: firstDateFrom })
              : Promise.resolve([] as PluggyTransaction[]),
            needsFullHistoryS98
              ? client.listTransactions(acc.id)
              : Promise.resolve([] as PluggyTransaction[]),
          ]);
          rawTxs = [...incTxs, ...recTxs, ...historyTxs, ...fullHistoryS98Txs];
        }
        const deduped = deduplicatePluggyAccountTransactions(rawTxs);
        txsByAccount.set(acc.id, deduped);
        counts.transactionsFetched += deduped.length;

        if (acc.type === 'CREDIT') {
          const bills = await client.listBills(acc.id);
          billsByAccount.set(acc.id, bills);
          counts.billsSynced += bills.length;
        }
      }

      const accountsNeedingClosingDay: string[] = [];

      await runInTransaction(async () => {
        const [localAccounts, rules, existingEntries, recurrences] = await Promise.all([
          finRepository.listAccounts(true),
          finRepository.listCategoryRules(),
          finRepository.listAllEntries(),
          finRepository.listRecurrences(),
        ]);

        const recurrenceVariableMap = new Map<string, number>();
        for (const rec of recurrences) {
          recurrenceVariableMap.set(rec.id, rec.variable_amount ?? 0);
        }

        const localAccountByPgId = new Map<string, (typeof localAccounts)[number]>();
        const accountTypesById: Record<string, 'checking' | 'card'> = {};

        for (const acc of localAccounts) {
          if (acc.type === 'checking' || acc.type === 'card') {
            accountTypesById[acc.id] = acc.type;
          }
          if (acc.of_account_id) {
            localAccountByPgId.set(acc.of_account_id, acc);
          }
        }

        const newCheckingReportedCents = new Map<string, number>();
        const syncedAccountIds = new Set<string>();
        // Sprint 96: em conexões Meu Pluggy o conector é genérico; a instituição vem do COMPE das contas
        const itemInstitution = resolveInstitutionName({
          connectorName: item.connector?.name,
          accounts: pluggyAccounts,
        });
        for (const pgAcc of pluggyAccounts) {
          const mapped = mapPluggyAccount(pgAcc, item.connector?.name, itemInstitution);
          const choice = options?.accountChoices?.find(
            (c) => c.pluggyAccountId === pgAcc.id
          );
          let localAcc = localAccountByPgId.get(pgAcc.id);

          if (!localAcc && choice && choice.targetLocalAccountId !== 'CREATE_NEW') {
            localAcc = localAccounts.find((a) => a.id === choice.targetLocalAccountId);
          }

          if (localAcc) {
            const isFirstLink = !(localAcc as any).of_linked_at;
            const shouldPreserveName =
              localAcc.auto_name !== null &&
              localAcc.auto_name !== undefined &&
              localAcc.name !== localAcc.auto_name;
            const updatedClosingDay =
              localAcc.closing_day ?? choice?.closingDay ?? mapped.closingDay ?? null;
            const nextCalendarSource =
              choice?.closingDay != null
                ? 'USER'
                : localAcc.calendar_source ?? (localAcc.closing_day != null ? 'USER' : null);
            localAcc = await finRepository.updateAccount(localAcc.id, {
              name: shouldPreserveName ? localAcc.name : mapped.name,
              auto_name: mapped.name,
              of_account_id: pgAcc.id,
              of_item_id: itemId,
              source: 'OPEN_FINANCE',
              reported_balance_cents: mapped.reportedBalanceCents,
              reported_balance_at: mapped.reportedBalanceAt,
              masked_number: mapped.maskedNumber,
              owner: mapped.owner,
              closing_balance_cents: mapped.closingBalanceCents,
              auto_invested_cents: mapped.autoInvestedCents,
              of_overdraft_used_cents: mapped.ofOverdraftUsedCents,
              of_reserved_cents: mapped.ofReservedCents,
              ...(isFirstLink ? { of_linked_at: nowIso } : {}),
              ...(mapped.type === 'card'
                ? {
                    credit_limit_cents:
                      mapped.creditLimitCents ?? localAcc.credit_limit_cents,
                    credit_used_cents: mapped.creditUsedCents,
                    of_available_limit_cents: mapped.ofAvailableLimitCents,
                    of_minimum_payment_cents: mapped.ofMinimumPaymentCents,
                    of_balance_due_date: mapped.ofBalanceDueDate,
                    due_day: mapped.dueDay ?? localAcc.due_day,
                    closing_day: updatedClosingDay,
                    ...(nextCalendarSource ? { calendar_source: nextCalendarSource } : {}),
                  }
                : {}),
            });
            if (isFirstLink && mapped.type === 'checking') {
              newCheckingReportedCents.set(localAcc.id, mapped.reportedBalanceCents);
            }
          } else {
            const createdClosingDay = choice?.closingDay ?? mapped.closingDay;
            const createdCalendarSource =
              choice?.closingDay != null ? 'USER' : mapped.closingDay != null ? 'DEFAULT' : null;
            localAcc = await finRepository.createAccount({
              name: mapped.name,
              type: mapped.type,
              initialBalanceCents:
                mapped.type === 'checking' ? mapped.reportedBalanceCents : 0,
              closingDay: createdClosingDay,
              dueDay: mapped.dueDay,
              creditLimitCents: mapped.creditLimitCents,
              ofAccountId: pgAcc.id,
              ofItemId: itemId,
              source: 'OPEN_FINANCE',
              reportedBalanceCents: mapped.reportedBalanceCents,
              reportedBalanceAt: mapped.reportedBalanceAt,
              maskedNumber: mapped.maskedNumber,
              owner: mapped.owner,
              autoName: mapped.name,
              ofLinkedAt: nowIso,
              closingBalanceCents: mapped.closingBalanceCents,
              autoInvestedCents: mapped.autoInvestedCents,
              creditUsedCents: mapped.creditUsedCents,
              ofAvailableLimitCents: mapped.ofAvailableLimitCents,
              ofMinimumPaymentCents: mapped.ofMinimumPaymentCents,
              ofBalanceDueDate: mapped.ofBalanceDueDate,
              ofOverdraftUsedCents: mapped.ofOverdraftUsedCents,
              ofReservedCents: mapped.ofReservedCents,
              calendarSource: createdCalendarSource,
            });
            if (mapped.type === 'checking') {
              newCheckingReportedCents.set(localAcc.id, mapped.reportedBalanceCents);
            }
          }
          syncedAccountIds.add(localAcc.id);

          if (localAcc.type === 'card') {
            const bills = billsByAccount.get(pgAcc.id) ?? [];
            for (const b of bills) {
              await finRepository.upsertBill({
                accountId: localAcc.id,
                externalId: b.id,
                billMonth: toBrtMonth(b.dueDate) ?? b.dueDate.slice(0, 7),
                closingDate: b.billClosingDate ? toBrtDate(b.billClosingDate) : null,
                dueDate: toBrtDate(b.dueDate) ?? b.dueDate.slice(0, 10),
                totalAmountCents: toCentsDecimal(b.totalAmount),
                minimumPaymentCents:
                  b.minimumPaymentAmount != null ? toCentsDecimal(b.minimumPaymentAmount) : null,
                allowsInstallments: b.allowsInstallments ?? null,
                payments: b.payments ?? null,
                financeCharges: b.financeCharges ?? null,
              });
            }
            // R26: calendário do cartão vindo das faturas (não sobrescreve 'USER')
            const derivedCal = deriveCardCalendar(bills);
            if (derivedCal && localAcc.calendar_source !== 'USER') {
              localAcc = await finRepository.updateAccount(localAcc.id, {
                closing_day: derivedCal.closingDay,
                due_day: derivedCal.dueDay,
                calendar_source: 'PLUGGY_BILLS',
              });
            }
          }

          localAccountByPgId.set(pgAcc.id, localAcc);
          if (localAcc.type === 'checking' || localAcc.type === 'card') {
            accountTypesById[localAcc.id] = localAcc.type;
          }
          if (localAcc.type === 'card' && localAcc.closing_day == null) {
            accountsNeedingClosingDay.push(localAcc.id);
          }
          counts.accountsSynced += 1;
        }

        const allMapped: MappedPluggyTransaction[] = [];
        const mapOptionsByExternalId = new Map<string, Parameters<typeof mapPluggyTransaction>[1]>();
        const fetchedExternalIds = new Set<string>();
        const rawTxByExternalId = new Map<string, PluggyTransaction>();
        for (const pgAcc of pluggyAccounts) {
          const localAcc = localAccountByPgId.get(pgAcc.id);
          if (!localAcc) continue;
          const txs = txsByAccount.get(pgAcc.id) ?? [];
          const bills = billsByAccount.get(pgAcc.id) ?? [];
          const forecastOffset =
            localAcc.type === 'card'
              ? inferForecastOffset(
                  txs.map((t) => t.tx),
                  bills
                )
              : 0;
          for (const { tx, externalId } of txs) {
            fetchedExternalIds.add(externalId);
            rawTxByExternalId.set(externalId, tx);
            const mapOptions = {
              accountId: localAcc.id,
              accountType: (localAcc.type === 'card' ? 'card' : 'checking') as 'card' | 'checking',
              closingDay: localAcc.closing_day,
              dueDay: localAcc.due_day,
              bills,
              forecastOffset,
              rules: rules as unknown as import('../../domain/statementImport').CategoryRuleLike[],
              externalIdOverride: externalId,
              todayIso: toBrtDate(nowIso) ?? nowIso.slice(0, 10),
            };
            mapOptionsByExternalId.set(externalId, mapOptions);
            allMapped.push(mapPluggyTransaction(tx, mapOptions));
          }
        }

        // R9 / R15 / R16: Detectar proventos ANTES de qualquer classificação de transferência
        const detectedIncomeByExternalId = new Map<string, BankIncomeCandidate>();
        const dbForIncome = getDatabase();
        const [allAssets, allPortfolios, existingIncomes] =
          rawTxByExternalId.size > 0
            ? await Promise.all([
                dbForIncome.select().from(assets),
                dbForIncome.select().from(portfolios),
                dbForIncome.select().from(incomeEvents),
              ])
            : [[], [], []];
        const workingIncomes = [...existingIncomes];
        const knownIncomeAssets: KnownIncomeAsset[] = allAssets.map((a) => ({
          ticker: a.ticker,
          name: a.name,
          status: a.of_status,
        }));
        const assetTickersUpper = new Set(allAssets.map((a) => a.ticker.trim().toUpperCase()));
        for (const inc of workingIncomes) {
          const t = inc.ticker.trim().toUpperCase();
          if (t && !assetTickersUpper.has(t)) {
            knownIncomeAssets.push({ ticker: t, name: null, status: null });
          }
        }
        const brokerPortfolioId =
          allPortfolios.find((p) => p.of_item_id === itemId)?.id ??
          allAssets.find((a) => a.institution_id === itemId)?.portfolio_id ??
          allPortfolios[0]?.id ??
          null;

        if (brokerPortfolioId && knownIncomeAssets.length > 0) {
          for (const [extId, rawTx] of rawTxByExternalId) {
            const candidate = detectBankIncomeCandidate(rawTx, knownIncomeAssets, {
              onAmbiguous: () => {
                counts.ambiguousIncomeCount = (counts.ambiguousIncomeCount ?? 0) + 1;
              },
            });
            if (candidate) {
              detectedIncomeByExternalId.set(extId, candidate);
            }
          }
        }

        // R18: provento tem precedência sobre conta própria/investimento (a categoria 04 vem errada em proventos)
        if (detectedIncomeByExternalId.size > 0) {
          for (let i = 0; i < allMapped.length; i += 1) {
            const extId = allMapped[i].externalId;
            const rawTx = rawTxByExternalId.get(extId);
            const opts = mapOptionsByExternalId.get(extId);
            if (rawTx && opts && detectedIncomeByExternalId.has(extId)) {
              allMapped[i] = mapPluggyTransaction(rawTx, { ...opts, isIncomeLinked: true });
            }
          }
        }

        const reconcilable: ReconcilableOpenFinanceEntry[] = existingEntries.map((e) => ({
          id: e.id,
          account_id: e.account_id,
          external_id: e.external_id,
          amount_cents: e.amount_cents,
          kind: e.kind,
          status: e.status,
          due_date: e.due_date,
          category_id: e.category_id,
          description: e.description,
          user_edited_fields: e.user_edited_fields,
          recurrence_id: e.recurrence_id,
          variable_amount: e.recurrence_id
            ? recurrenceVariableMap.get(e.recurrence_id) ?? 0
            : 0,
          transfer_group_id: e.transfer_group_id,
          description_raw: e.description_raw,
          of_provider_id: e.of_provider_id,
          of_raw_amount_cents: e.of_raw_amount_cents,
          of_removed_at: e.of_removed_at,
        }));

        const reconciled = reconcilePluggyTransactions(allMapped, reconcilable, {
          accountTypesById,
          incomeExternalIds: new Set(detectedIncomeByExternalId.keys()),
        });
        counts.transfersMatched = reconciled.transferPairs.length;

        const existingById = new Map(existingEntries.map((e) => [e.id, e]));
        const toCreate: Array<Record<string, unknown>> = [];
        const syncedEntryRefs: Array<{ entryId: string; externalId: string }> = [];

        for (const row of reconciled.transactions) {
          if (row.action === 'update' && row.matchedEntryId) {
            const existing = existingById.get(row.matchedEntryId);
            if (!existing) continue;

            if (row.matchedBy === 'PROVIDER_ID') {
              counts.matchedByProviderId = (counts.matchedByProviderId ?? 0) + 1;
            } else if (row.matchedBy === 'FINGERPRINT') {
              counts.matchedByFingerprint = (counts.matchedByFingerprint ?? 0) + 1;
            }
            const isRestored = Boolean(existing.of_removed_at);
            if (isRestored) {
              counts.restored = (counts.restored ?? 0) + 1;
            }
            const externalIdChanged = existing.external_id !== row.externalId;

            const preserved = applyUserEditedPreservation(
              {
                category_id: existing.category_id,
                description: existing.description,
                user_edited_fields: existing.user_edited_fields,
              },
              {
                category_id: row.categoryId,
                description: row.description,
              }
            );

            // Par global (of-tr-/of-topup-) ou lançamento ligado a movimentação de carteira (V4c)
            const keepsGlobalPair =
              !!existing.transfer_group_id &&
              existing.transfer_group_id.startsWith('of-') &&
              (existing.kind === 'transfer_out' || existing.kind === 'transfer_in') &&
              !row.transferRole &&
              ((row.classReason ?? 'SIGN') === 'SIGN' || row.classReason === 'OWN_ACCOUNT_UNPAIRED');
            const keepsLinkedTx =
              !!existing.linked_transaction_id &&
              (existing.kind === 'transfer_out' || existing.kind === 'transfer_in');
            const nextKind =
              row.transferRole ?? (keepsGlobalPair || keepsLinkedTx ? existing.kind : row.kind);
            const nextTransferGroupId = keepsLinkedTx
              ? existing.transfer_group_id ?? null
              : row.transferGroupId ?? existing.transfer_group_id ?? null;
            const nextClassReason =
              keepsGlobalPair || keepsLinkedTx
                ? existing.of_class_reason ?? null
                : row.classReason ?? null;
            const nextOfCategoryId = row.ofCategoryId ?? existing.of_category_id ?? null;

            const editedSet = (() => {
              try {
                const arr = JSON.parse(existing.user_edited_fields || '[]');
                return new Set(Array.isArray(arr) ? arr : []);
              } catch {
                return new Set<string>();
              }
            })();
            const nextBillMonth = editedSet.has('bill_month')
              ? existing.bill_month
              : row.billMonth;
            const nextBillMonthSource = editedSet.has('bill_month')
              ? existing.of_bill_month_source ?? null
              : row.ofBillMonthSource ?? existing.of_bill_month_source ?? null;

            const hasChanges =
              externalIdChanged ||
              isRestored ||
              existing.status !== row.status ||
              existing.amount_cents !== row.amountCents ||
              existing.due_date !== row.dueDate ||
              existing.paid_date !== row.paidDate ||
              existing.paid_amount_cents !== row.paidAmountCents ||
              existing.category_id !== preserved.category_id ||
              existing.description !== preserved.description ||
              existing.kind !== nextKind ||
              existing.transfer_group_id !== nextTransferGroupId ||
              existing.bill_month !== nextBillMonth ||
              (existing.of_bill_month_source ?? null) !== nextBillMonthSource ||
              (existing.of_class_reason ?? null) !== nextClassReason ||
              (existing.of_category_id ?? null) !== nextOfCategoryId ||
              (existing.of_provider_id ?? null) !== row.ofProviderId ||
              (existing.of_bill_id ?? null) !== row.ofBillId ||
              (existing.of_bill_forecast_month ?? null) !== row.ofBillForecastMonth ||
              (existing.of_bill_post_date ?? null) !== row.ofBillPostDate ||
              (existing.of_operation_type ?? null) !== row.ofOperationType ||
              (existing.of_raw_status ?? null) !== row.ofRawStatus ||
              (existing.of_raw_type ?? null) !== row.ofRawType ||
              (existing.of_raw_amount_cents ?? null) !== row.ofRawAmountCents ||
              (existing.of_created_at ?? null) !== row.ofCreatedAt;

            if (hasChanges) {
              await finRepository.updateEntry(existing.id, {
                external_id: row.externalId,
                of_removed_at: null,
                kind: nextKind,
                status: row.status,
                amount_cents: row.amountCents,
                due_date: row.dueDate,
                paid_date: row.paidDate,
                paid_amount_cents: row.paidAmountCents,
                category_id: preserved.category_id,
                description: preserved.description,
                description_raw: row.descriptionRaw,
                bill_month: nextBillMonth,
                of_bill_month_source: nextBillMonthSource,
                installment_number: row.installmentNumber,
                installment_total: row.installmentTotal,
                transfer_group_id: nextTransferGroupId,
                of_category_id: nextOfCategoryId,
                of_class_reason: nextClassReason,
                of_provider_id: row.ofProviderId,
                of_bill_id: row.ofBillId,
                of_bill_forecast_month: row.ofBillForecastMonth,
                of_bill_post_date: row.ofBillPostDate,
                of_operation_type: row.ofOperationType,
                of_raw_status: row.ofRawStatus,
                of_raw_type: row.ofRawType,
                of_raw_amount_cents: row.ofRawAmountCents,
                of_created_at: row.ofCreatedAt,
                of_installment_number: row.ofInstallmentNumber,
                of_installment_total: row.ofInstallmentTotal,
              });
              counts.transactionsUpdated += 1;
            }
            if (!existing.linked_income_id) {
              syncedEntryRefs.push({ entryId: existing.id, externalId: row.externalId });
            }
          } else if (row.action === 'settle_pending' && row.matchedEntryId) {
            await finRepository.updateEntry(row.matchedEntryId, {
              status: row.status,
              amount_cents: row.amountCents,
              due_date: row.dueDate,
              paid_date: row.paidDate,
              paid_amount_cents: row.paidAmountCents,
              external_id: row.externalId,
              source: 'OPEN_FINANCE',
              description_raw: row.descriptionRaw,
              of_category_id: row.ofCategoryId ?? null,
              of_class_reason: row.classReason ?? null,
              of_provider_id: row.ofProviderId,
              of_bill_id: row.ofBillId,
              of_bill_forecast_month: row.ofBillForecastMonth,
              of_bill_post_date: row.ofBillPostDate,
              of_operation_type: row.ofOperationType,
              of_raw_status: row.ofRawStatus,
              of_raw_type: row.ofRawType,
              of_raw_amount_cents: row.ofRawAmountCents,
              of_created_at: row.ofCreatedAt,
              of_installment_number: row.ofInstallmentNumber,
              of_installment_total: row.ofInstallmentTotal,
            });
            counts.transactionsSettled += 1;
          } else {
            const baseKind = row.transferRole ?? row.kind;
            const isOutflowCandidate =
              accountTypesById[row.accountId] !== 'card' &&
              (baseKind === 'transfer_out' ||
                (baseKind === 'expense' && row.classReason === 'INVESTMENT_MOVE')) &&
              (row.classReason === 'INVESTMENT_MOVE' || !row.transferGroupId);
            const ofPaidCents =
              row.status === 'paid' ? (row.paidAmountCents ?? row.amountCents) : row.amountCents;
            const matchedAppOut = isOutflowCandidate
              ? matchAppInvestmentTransferOut(existingEntries, {
                  accountId: row.accountId,
                  amountCents: ofPaidCents,
                  entryDate: row.dueDate,
                })
              : null;

            let insertKind = baseKind;
            let insertTransferGroupId = row.transferGroupId ?? null;
            let insertLinkedTxId: string | null = null;
            let insertClassReason = row.classReason ?? null;
            let insertLinkRestore: string | null = null;

            if (matchedAppOut) {
              insertLinkRestore = JSON.stringify({
                kind: baseKind,
                transfer_group_id: row.transferGroupId ?? null,
                of_class_reason: row.classReason ?? null,
              });
              insertKind = 'transfer_out';
              insertTransferGroupId = matchedAppOut.transfer_group_id;
              insertLinkedTxId = matchedAppOut.linked_transaction_id;
              insertClassReason = 'INVESTMENT_MOVE';

              await finRepository.deleteEntry(matchedAppOut.id);
              const idxToRemove = existingEntries.findIndex((e) => e.id === matchedAppOut.id);
              if (idxToRemove >= 0) existingEntries.splice(idxToRemove, 1);

              const pairedIn = existingEntries.find(
                (e) =>
                  e.transfer_group_id === matchedAppOut.transfer_group_id &&
                  e.kind === 'transfer_in'
              );
              if (pairedIn) {
                await finRepository.updateEntry(pairedIn.id, {
                  amount_cents: ofPaidCents,
                  paid_amount_cents: ofPaidCents,
                });
              }
            }

            toCreate.push({
              kind: insertKind,
              amount_cents: row.amountCents,
              due_date: row.dueDate,
              paid_date: row.paidDate,
              paid_amount_cents: row.paidAmountCents,
              status: row.status,
              account_id: row.accountId,
              category_id: row.categoryId,
              description: row.description,
              description_raw: row.descriptionRaw,
              installment_number: row.installmentNumber,
              installment_total: row.installmentTotal,
              bill_month: row.billMonth,
              transfer_group_id: insertTransferGroupId,
              linked_transaction_id: insertLinkedTxId,
              of_link_restore: insertLinkRestore,
              source: 'OPEN_FINANCE',
              external_id: row.externalId,
              of_category_id: row.ofCategoryId ?? null,
              of_class_reason: insertClassReason,
              of_provider_id: row.ofProviderId,
              of_bill_id: row.ofBillId,
              of_bill_forecast_month: row.ofBillForecastMonth,
              of_bill_post_date: row.ofBillPostDate,
              of_operation_type: row.ofOperationType,
              of_raw_status: row.ofRawStatus,
              of_raw_type: row.ofRawType,
              of_raw_amount_cents: row.ofRawAmountCents,
              of_created_at: row.ofCreatedAt,
              of_installment_number: row.ofInstallmentNumber,
              of_installment_total: row.ofInstallmentTotal,
              of_bill_month_source: row.ofBillMonthSource,
            });
          }
        }

        if (toCreate.length > 0) {
          const createdEntries = await finRepository.createEntriesBatch(toCreate);
          counts.transactionsCreated = toCreate.length;
          for (const created of createdEntries) {
            if (created.external_id) {
              syncedEntryRefs.push({ entryId: created.id, externalId: created.external_id });
            }
          }
        }

        // R9 / R15 / R16: Persistir proventos detectados e vincular fin_entries.linked_income_id
        if (syncedEntryRefs.length > 0 && brokerPortfolioId && detectedIncomeByExternalId.size > 0) {
          for (const ref of syncedEntryRefs) {
            const candidate = detectedIncomeByExternalId.get(ref.externalId);
            if (!candidate) continue;

            const byExt = workingIncomes.find((e) => e.external_id === candidate.externalId);
            const equiv =
              byExt ??
              findEquivalentIncome(
                {
                  ticker: candidate.ticker,
                  payDate: candidate.payDate,
                  amount: candidate.amount,
                  kind: candidate.kind,
                },
                workingIncomes.map((e) => ({
                  id: e.id,
                  portfolioId: e.portfolio_id,
                  ticker: e.ticker,
                  payDate: e.pay_date,
                  amount: e.amount,
                  kind: e.kind,
                  source: e.source,
                  externalId: e.external_id,
                  notes: e.notes,
                  quantity: e.quantity,
                  unitAmount: e.unit_amount,
                  createdAt: e.created_at,
                }))
              );

            let linkedIncomeId: string;
            if (equiv && equiv.id) {
              linkedIncomeId = equiv.id;
              await finRepository.deleteInvestmentIncomeByLinkedIncomeId(linkedIncomeId);
            } else {
              const createdInc = await incomeRepository.addIncome({
                portfolioId: brokerPortfolioId,
                ticker: candidate.ticker,
                payDate: candidate.payDate,
                amount: candidate.amount,
                notes: candidate.notes ?? undefined,
                source: 'OPEN_FINANCE_BANK',
                externalId: candidate.externalId,
                kind: candidate.kind,
                quantity: candidate.quantity ?? undefined,
                unitAmount: candidate.unitAmount ?? undefined,
                itemId,
              });
              workingIncomes.push(createdInc);
              linkedIncomeId = createdInc.id;
            }

            await finRepository.updateEntry(ref.entryId, {
              linked_income_id: linkedIncomeId,
            });
          }
        }

        // R32: Detectar lançamentos Open Finance removidos apenas quando o produto veio atualizado
        const execStatusOk =
          item.executionStatus === 'SUCCESS' || item.executionStatus === 'PARTIAL_SUCCESS';
        const eligibleRemovalAccountIds = new Set<string>();
        if (!execStatusOk) {
          counts.removalSkippedReason = 'EXECUTION_STATUS_ERROR';
        } else {
          for (const pgAcc of pluggyAccounts) {
            const localAcc = localAccountByPgId.get(pgAcc.id);
            if (!localAcc || !syncedAccountIds.has(localAcc.id)) continue;
            const productStatus =
              pgAcc.type === 'CREDIT'
                ? item.statusDetail?.creditCards
                : item.statusDetail?.transactions;
            if (productStatus?.isUpdated === false) {
              counts.removalSkippedReason = 'PRODUCT_NOT_UPDATED';
              continue;
            }
            eligibleRemovalAccountIds.add(localAcc.id);
          }
        }

        const matchedEntryIds = new Set(
          reconciled.transactions
            .filter(
              (r) =>
                (r.action === 'settle_pending' || r.action === 'update') &&
                r.matchedEntryId
            )
            .map((r) => r.matchedEntryId!)
        );
        const candidatesForRemoval = existingEntries.filter(
          (e) => eligibleRemovalAccountIds.has(e.account_id) && !matchedEntryIds.has(e.id)
        );
        const removals = detectRemovedOpenFinanceEntries(
          candidatesForRemoval,
          fetchedExternalIds,
          reconcileWindowStart
        );
        for (const rem of removals) {
          if (rem.action === 'conflict') {
            counts.removalConflicts = (counts.removalConflicts ?? 0) + 1;
          } else {
            await finRepository.updateEntry(rem.entryId, { of_removed_at: nowIso });
            counts.entriesRemoved = (counts.entriesRemoved ?? 0) + 1;
          }
        }

        // Sprint 98: limpeza única de duplicatas já gravadas (fin:of:dedupe:s98)
        if ((await appMetaRepository.get(OF_DEDUPE_S98_META_KEY)) !== '1') {
          const entriesForDedupe = await finRepository.listAllEntries();
          const hasEditedFields = (raw: string | null | undefined): boolean => {
            if (!raw) return false;
            const trimmed = raw.trim();
            return trimmed !== '' && trimmed !== '[]' && trimmed !== 'null';
          };
          const groups = new Map<string, typeof entriesForDedupe>();
          for (const e of entriesForDedupe) {
            if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) continue;
            if (!syncedAccountIds.has(e.account_id)) continue;
            const absCents =
              e.of_raw_amount_cents != null
                ? Math.abs(e.of_raw_amount_cents)
                : Math.abs(e.amount_cents);
            const base = transactionBaseFingerprint(
              e.account_id,
              e.due_date,
              absCents,
              e.description_raw ?? e.description
            );
            const key = `${e.kind}|${base}`;
            const list = groups.get(key) ?? [];
            list.push(e);
            groups.set(key, list);
          }

          let dedupeMerged = 0;
          let dedupeConflicts = 0;
          for (const group of groups.values()) {
            if (group.length < 2) continue;
            const distinctExtIds = new Set(group.map((g) => g.external_id).filter(Boolean));
            if (distinctExtIds.size < 2) continue;
            const inFetch = group.filter(
              (g) => g.external_id && fetchedExternalIds.has(g.external_id)
            );
            const notInFetch = group.filter(
              (g) => !g.external_id || !fetchedExternalIds.has(g.external_id)
            );
            if (inFetch.length !== 1 || notInFetch.length === 0) continue;

            const kept = inFetch[0];
            for (const other of notInFetch) {
              const keptEdited = hasEditedFields(kept.user_edited_fields);
              const otherEdited = hasEditedFields(other.user_edited_fields);
              if (keptEdited && otherEdited) {
                dedupeConflicts += 1;
                continue;
              }
              if (!keptEdited && otherEdited) {
                let fields: string[] = [];
                try {
                  fields = JSON.parse(other.user_edited_fields || '[]');
                } catch {
                  fields = [];
                }
                const patch: Record<string, unknown> = {
                  user_edited_fields: other.user_edited_fields,
                };
                if (fields.includes('category_id')) patch.category_id = other.category_id;
                if (fields.includes('description')) patch.description = other.description;
                if (fields.includes('bill_month')) patch.bill_month = other.bill_month;
                if (fields.includes('kind')) patch.kind = other.kind;
                if (other.linked_income_id && !kept.linked_income_id) {
                  patch.linked_income_id = other.linked_income_id;
                }
                if (other.transfer_group_id && !kept.transfer_group_id) {
                  patch.transfer_group_id = other.transfer_group_id;
                }
                await finRepository.updateEntry(kept.id, patch);
              }
              await finRepository.updateEntry(other.id, {
                of_removed_at: nowIso,
                of_class_reason: 'DUPLICATE_MERGED',
              });
              dedupeMerged += 1;
            }
          }

          if (dedupeConflicts > 0) {
            counts.dedupeConflicts = dedupeConflicts;
          }
          await appMetaRepository.set(OF_DEDUPE_S98_META_KEY, '1');
          await appMetaRepository.set(
            OF_DEDUPE_S98_LOG_KEY,
            JSON.stringify({ merged: dedupeMerged, conflicts: dedupeConflicts, at: nowIso })
          );
        }

        // R17–R20: pareamento global entre todas as contas Open Finance e reclassificação única dos já gravados
        // Com o histórico completo em mãos, o pareamento olha a mesma janela; nas demais, os últimos 40 dias.
        const globalPairing = await pluggyClassificationService.pairOwnTransfersAcrossItems(nowIso.slice(0, 10), {
          windowStart: fetchedFullHistory ? firstDateFrom : undefined,
        });
        counts.ownTransfersPaired = globalPairing.paired;
        counts.cardTopupsPaired = globalPairing.topups;

        // R29: deduplicação de pagamento sintético "Pagamento recebido" vs pagamento informado pelo banco (até 3 dias)
        const entriesForSynthDedup = await finRepository.listAllEntries();
        for (const accId of syncedAccountIds) {
          if (accountTypesById[accId] !== 'card') continue;
          const cardPayEntries = entriesForSynthDedup.filter(
            (e) =>
              e.account_id === accId &&
              e.source === 'OPEN_FINANCE' &&
              !e.of_removed_at &&
              e.kind === 'transfer_in' &&
              e.of_class_reason === 'CARD_BILL_PAYMENT'
          );
          const bankPays = cardPayEntries.filter(
            (e) => (e.description_raw ?? e.description).trim().toLowerCase() !== 'pagamento recebido'
          );
          const synthPays = cardPayEntries.filter(
            (e) => (e.description_raw ?? e.description).trim().toLowerCase() === 'pagamento recebido'
          );
          for (const synth of synthPays) {
            const synthMs = Date.parse(`${synth.due_date}T00:00:00Z`);
            const hasBankMatch = bankPays.some((b) => {
              if (b.amount_cents !== synth.amount_cents) return false;
              const bMs = Date.parse(`${b.due_date}T00:00:00Z`);
              return Math.abs(Math.round((synthMs - bMs) / 86400000)) <= 3;
            });
            if (hasBankMatch) {
              await finRepository.updateEntry(synth.id, {
                of_removed_at: nowIso,
                of_class_reason: 'CARD_PAYMENT_DUPLICATE',
              });
            }
          }
        }

        // R30: pareamento de pagamento de fatura na conta corrente + reclassificação s100
        await pluggyClassificationService.pairCardBillPayments(nowIso.slice(0, 10), {
          windowStart: fetchedFullHistory ? firstDateFrom : undefined,
        });
        await pluggyClassificationService.reclassifyOpenFinanceEntriesS100(nowIso.slice(0, 10));

        const reclassification = await pluggyClassificationService.reclassifyOpenFinanceEntries();
        if (reclassification.ran) {
          counts.reclassified = reclassification.changed;
          counts.reclassifiedByReason = reclassification.byReason;
        }

        // Sprint 102b: a importação do histórico completo (R37) acrescenta lançamentos antigos já contidos no
        // saldo do banco, e o saldo calculado deixava de fechar ("divergência de saldo"). Na sincronização que
        // importa o histórico — e uma vez para conexões que já o importaram — refecha o saldo inicial (R11).
        const recloseMetaKey = `${OF_RECLOSE_S102B_META_PREFIX}${itemId}`;
        const needsReclose =
          needsFullHistoryS98 || (await appMetaRepository.get(recloseMetaKey)) !== '1';
        if (needsReclose) {
          for (const pgAcc of pluggyAccounts) {
            if (pgAcc.type !== 'BANK') continue;
            const localAcc = localAccountByPgId.get(pgAcc.id);
            if (!localAcc || localAcc.type !== 'checking') continue;
            if (!newCheckingReportedCents.has(localAcc.id)) {
              newCheckingReportedCents.set(localAcc.id, toCentsDecimal(pgAcc.balance));
            }
          }
        }

        // Conta corrente recém-criada ou recém-vinculada (R11): o saldo do banco já contém o histórico
        // e os lançamentos existentes. Ajusta initial_balance_cents para que o saldo calculado feche.
        if (newCheckingReportedCents.size > 0) {
          const allEntriesAfter = await finRepository.listAllEntries();
          for (const [accountId, reportedCents] of newCheckingReportedCents) {
            let paidNetCents = 0;
            for (const entry of allEntriesAfter) {
              if (entry.account_id !== accountId || entry.status !== 'paid' || entry.of_removed_at) continue;
              const real = entry.paid_amount_cents ?? entry.amount_cents;
              paidNetCents += entry.kind === 'income' || entry.kind === 'transfer_in' ? real : -real;
            }
            await finRepository.updateAccount(accountId, {
              initial_balance_cents: reportedCents - paidNetCents,
            });
          }
        }

        if (needsReclose) {
          await appMetaRepository.set(recloseMetaKey, '1');
        }

        // Sprint 99: migração única fin:of:billmonth:s99
        if ((await appMetaRepository.get(OF_BILLMONTH_S99_META_KEY)) !== '1') {
          const accountsAfter = await finRepository.listAccounts(true);
          const cardAccountsMap = new Map(
            accountsAfter
              .filter((a) => a.type === 'card' && a.source === 'OPEN_FINANCE')
              .map((a) => [a.id, a])
          );
          const billsByLocalAccId = new Map<string, PluggyBill[]>();
          for (const [accId] of cardAccountsMap) {
            const dbBills = await finRepository.listBillsByAccount(accId);
            billsByLocalAccId.set(
              accId,
              dbBills.map((b) => ({
                id: b.external_id ?? b.id,
                dueDate: `${b.due_date}T00:00:00.000Z`,
                billClosingDate: b.closing_date ? `${b.closing_date}T00:00:00.000Z` : null,
                totalAmount: b.total_amount_cents / 100,
                totalAmountCurrencyCode: 'BRL',
              }))
            );
          }
          const entriesForBillMig = await finRepository.listAllEntries();
          const bySource: Record<string, number> = {};
          for (const e of entriesForBillMig) {
            if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) continue;
            const cardAcc = cardAccountsMap.get(e.account_id);
            if (!cardAcc) continue;
            let edited: string[] = [];
            try {
              edited = JSON.parse(e.user_edited_fields || '[]');
            } catch {
              edited = [];
            }
            if (edited.includes('bill_month')) continue;
            const accBills = billsByLocalAccId.get(cardAcc.id) ?? [];
            const assigned = assignBillMonth(
              {
                id: e.external_id ?? e.id,
                accountId: cardAcc.of_account_id ?? cardAcc.id,
                description: e.description,
                currencyCode: 'BRL',
                amount: (e.of_raw_amount_cents ?? e.amount_cents) / 100,
                date: `${e.due_date}T00:00:00.000Z`,
                type: e.kind === 'income' || e.kind === 'transfer_in' ? 'CREDIT' : 'DEBIT',
                status: 'POSTED',
                createdAt: e.of_created_at ?? e.created_at,
                updatedAt: e.created_at,
                creditCardMetadata: {
                  billId: e.of_bill_id ?? null,
                  billForecastDate: e.of_bill_forecast_month ?? null,
                  billPostDate: e.of_bill_post_date ?? null,
                },
              },
              {
                bills: accBills,
                closingDay: cardAcc.closing_day ?? 1,
                dueDay: cardAcc.due_day ?? 10,
              }
            );
            bySource[assigned.source] = (bySource[assigned.source] ?? 0) + 1;
            if (
              e.bill_month !== assigned.billMonth ||
              (e.of_bill_month_source ?? null) !== assigned.source
            ) {
              await finRepository.updateEntry(e.id, {
                bill_month: assigned.billMonth,
                of_bill_month_source: assigned.source,
              });
            }
          }
          await appMetaRepository.set(OF_BILLMONTH_S99_META_KEY, '1');
          await appMetaRepository.set(
            OF_BILLMONTH_S99_LOG_KEY,
            JSON.stringify({ bySource, at: nowIso })
          );
        }

        // Sprint 101: migração única fin:of:brtdates:s101 (D34)
        if ((await appMetaRepository.get(OF_BRT_DATES_S101_META_KEY)) !== '1') {
          const allEntriesForBrt = await finRepository.listAllEntries();
          let updatedCount = 0;
          let skippedEditedCount = 0;
          for (const e of allEntriesForBrt) {
            if (e.source !== 'OPEN_FINANCE' || e.of_removed_at) continue;
            let edited: string[] = [];
            try {
              edited = JSON.parse(e.user_edited_fields || '[]');
            } catch {
              edited = [];
            }
            if (edited.includes('due_date')) {
              skippedEditedCount += 1;
              continue;
            }
            if (e.of_created_at && e.due_date === e.of_created_at.slice(0, 10)) {
              const brt = toBrtDate(e.of_created_at);
              if (brt && brt !== e.due_date) {
                const patch: Partial<typeof e> = { due_date: brt };
                if (e.paid_date && e.paid_date === e.due_date) {
                  patch.paid_date = brt;
                }
                await finRepository.updateEntry(e.id, patch);
                updatedCount += 1;
              }
            }
          }
          await appMetaRepository.set(OF_BRT_DATES_S101_META_KEY, '1');
          await appMetaRepository.set(
            OF_BRT_DATES_S101_LOG_KEY,
            JSON.stringify({ updatedCount, skippedEditedCount, at: nowIso })
          );
        }

        if (fetchedFullHistory) {
          await appMetaRepository.set(backfillMetaKey, '1');
          await appMetaRepository.set(fullHistoryMetaKey, '1');
        }

        await openFinanceRepository.upsertItem({
          id: item.id,
          connector_name: item.connector?.name ?? item.id,
          status: item.status,
          execution_status: item.executionStatus,
          consent_expires_at: item.consentExpiresAt ?? null,
          last_synced_at: nowIso,
          last_error: null,
          last_updated_at: item.lastUpdatedAt ?? null,
          next_auto_sync_at: item.nextAutoSyncAt ?? null,
          status_detail_json: item.statusDetail ? JSON.stringify(item.statusDetail) : null,
          error_code: item.error?.code ?? null,
        });

        await openFinanceRepository.recordSyncRun({
          id: runId,
          item_id: itemId,
          started_at: nowIso,
          finished_at: nowIso,
          status: 'SUCCESS',
          kind: 'FINANCE',
          counts_json: JSON.stringify(counts),
          error: null,
        });
      });

      // V1c (Sprint 115): sugestão de vínculo v3 ao fim de cada sincronização bem-sucedida
      await pluggySyncService.migrateBrokerLinkSuggestV3IfNeeded(itemId);

      return {
        runId,
        itemId,
        status: 'SUCCESS',
        counts,
        accountsNeedingClosingDay,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar Open Finance.';
      const existingItems = await openFinanceRepository.listItems();
      const existingItem = existingItems.find((it) => it.id === itemId);
      if (existingItem) {
        await openFinanceRepository.upsertItem({
          ...existingItem,
          last_error: message,
        });
      }
      await openFinanceRepository.recordSyncRun({
        id: runId,
        item_id: itemId,
        started_at: nowIso,
        finished_at: new Date().toISOString(),
        status: 'ERROR',
        kind: 'FINANCE',
        counts_json: JSON.stringify(counts),
        error: message,
      });
      throw err;
    }
  },

  async previewAccountReconciliation(
    itemId: string,
    client: PluggyClient = new PluggyClient()
  ): Promise<AccountReconciliationProposal[]> {
    const [item, pluggyAccounts, localAccounts] = await Promise.all([
      typeof (client as unknown as Record<string, unknown>).getItem === 'function'
        ? client.getItem(itemId).catch(() => null)
        : Promise.resolve(null),
      client.listAccounts(itemId),
      finRepository.listAccounts(true),
    ]);

    const itemInstitution = resolveInstitutionName({
      connectorName: item?.connector?.name,
      accounts: pluggyAccounts,
    });

    const normalizeInst = (val: string | null | undefined): string =>
      (val ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    return pluggyAccounts.map((pgAcc) => {
      const targetType = pgAcc.type === 'CREDIT' ? 'card' : 'checking';
      const byOfId = localAccounts.find((a) => a.of_account_id === pgAcc.id);
      if (byOfId) {
        return { pluggyAccount: pgAcc, suggestedLocalAccountId: byOfId.id };
      }

      // R33: reconexão sem duplicar por (COMPE/instituição, subtype/tipo, últimos 4 dígitos)
      const digits = (pgAcc.number || '').replace(/\D/g, '');
      const last4 = digits.length >= 4 ? digits.slice(-4) : null;
      const accCompe = parseTransferNumberCompe(pgAcc.bankData?.transferNumber);
      const pgInstitution = (accCompe ? institutionFromCompe(accCompe) : null) ?? itemInstitution;
      const normInst = normalizeInst(pgInstitution);

      if (last4) {
        const accountCompeInstitutions = pluggyAccounts
          .map((a) => {
            const c = parseTransferNumberCompe(a.bankData?.transferNumber);
            return c ? normalizeInst(institutionFromCompe(c)) : '';
          })
          .filter(Boolean);
        const byReconnectKey = localAccounts.find((a) => {
          if (a.source !== 'OPEN_FINANCE' || a.type !== targetType) return false;
          if (a.masked_number !== last4) return false;
          const normAccName = normalizeInst(a.name);
          const normAutoName = normalizeInst(a.auto_name);
          if (!normInst) return true;
          if (normAccName.includes(normInst) || normAutoName.includes(normInst)) {
            return true;
          }
          // Se o conector não for genérico mas as contas têm COMPE (ex.: MeuPluggy/XP), aceita o COMPE da conta
          return accountCompeInstitutions.some(
            (ci) =>
              (normAccName.includes(ci) || normAutoName.includes(ci)) &&
              normalizeInst(pgAcc.name).includes(ci)
          );
        });
        if (byReconnectKey) {
          return { pluggyAccount: pgAcc, suggestedLocalAccountId: byReconnectKey.id };
        }
      }

      const normPgName = (pgAcc.marketingName || pgAcc.name).toLowerCase().trim();
      const byName = localAccounts.find(
        (a) =>
          a.type === targetType &&
          !a.of_account_id &&
          (a.name.toLowerCase().includes(normPgName) ||
            normPgName.includes(a.name.toLowerCase()))
      );
      return {
        pluggyAccount: pgAcc,
        suggestedLocalAccountId: byName?.id ?? null,
      };
    });
  },

  async applyAccountLinks(
    itemId: string,
    choices: AccountReconciliationChoice[],
    pluggyAccounts: PluggyAccount[]
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await runInTransaction(async () => {
      const [localAccounts, allEntries] = await Promise.all([
        finRepository.listAccounts(true),
        finRepository.listAllEntries(),
      ]);
      for (const choice of choices) {
        const pgAcc = pluggyAccounts.find((a) => a.id === choice.pluggyAccountId);
        if (!pgAcc) continue;
        const mapped = mapPluggyAccount(
          pgAcc,
          null,
          resolveInstitutionName({ accounts: pluggyAccounts })
        );

        if (choice.targetLocalAccountId === 'CREATE_NEW') {
          await finRepository.createAccount({
            name: mapped.name,
            type: mapped.type,
            initialBalanceCents:
              mapped.type === 'checking' ? mapped.reportedBalanceCents : 0,
            closingDay: choice.closingDay ?? mapped.closingDay,
            dueDay: mapped.dueDay,
            creditLimitCents: mapped.creditLimitCents,
            ofAccountId: pgAcc.id,
            ofItemId: itemId,
            source: 'OPEN_FINANCE',
            reportedBalanceCents: mapped.reportedBalanceCents,
            reportedBalanceAt: mapped.reportedBalanceAt,
            maskedNumber: mapped.maskedNumber,
            owner: mapped.owner,
            autoName: mapped.name,
            ofLinkedAt: nowIso,
            closingBalanceCents: mapped.closingBalanceCents,
            autoInvestedCents: mapped.autoInvestedCents,
            creditUsedCents: mapped.creditUsedCents,
          });
        } else {
          const existing = localAccounts.find((a) => a.id === choice.targetLocalAccountId);
          const isFirstLink = !existing?.of_linked_at;
          let nextInitialBalance: number | undefined;
          if (isFirstLink && mapped.type === 'checking') {
            let paidNetCents = 0;
            for (const entry of allEntries) {
              if (
                entry.account_id !== choice.targetLocalAccountId ||
                entry.status !== 'paid' ||
                entry.of_removed_at
              ) {
                continue;
              }
              const real = entry.paid_amount_cents ?? entry.amount_cents;
              paidNetCents +=
                entry.kind === 'income' || entry.kind === 'transfer_in' ? real : -real;
            }
            nextInitialBalance = mapped.reportedBalanceCents - paidNetCents;
          }

          await finRepository.updateAccount(choice.targetLocalAccountId, {
            of_account_id: pgAcc.id,
            of_item_id: itemId,
            source: 'OPEN_FINANCE',
            reported_balance_cents: mapped.reportedBalanceCents,
            reported_balance_at: mapped.reportedBalanceAt,
            masked_number: mapped.maskedNumber,
            owner: mapped.owner,
            auto_name: mapped.name,
            closing_balance_cents: mapped.closingBalanceCents,
            auto_invested_cents: mapped.autoInvestedCents,
            of_overdraft_used_cents: mapped.ofOverdraftUsedCents,
            of_reserved_cents: mapped.ofReservedCents,
            ...(isFirstLink ? { of_linked_at: nowIso } : {}),
            ...(nextInitialBalance !== undefined
              ? { initial_balance_cents: nextInitialBalance }
              : {}),
            ...(mapped.type === 'card'
              ? {
                  credit_limit_cents: mapped.creditLimitCents,
                  credit_used_cents: mapped.creditUsedCents,
                  of_available_limit_cents: mapped.ofAvailableLimitCents,
                  of_minimum_payment_cents: mapped.ofMinimumPaymentCents,
                  of_balance_due_date: mapped.ofBalanceDueDate,
                  due_day: mapped.dueDay,
                  ...(choice.closingDay != null || mapped.closingDay != null
                    ? { closing_day: choice.closingDay ?? mapped.closingDay }
                    : {}),
                }
              : {}),
          });
        }
      }
    });
  },

  async syncIfStale(options?: {
    client?: PluggyClient;
    nowMs?: number;
    thresholdHours?: number;
  }): Promise<{ triggered: boolean; results: PluggySyncResult[]; errors: string[] }> {
    const nowMs = options?.nowMs ?? Date.now();
    const thresholdHours = options?.thresholdHours ?? 12;
    const items = await openFinanceRepository.listItems();
    if (items.length === 0) {
      return { triggered: false, results: [], errors: [] };
    }

    const staleItems = items.filter((it) =>
      shouldAutoSync(it.last_synced_at, nowMs, thresholdHours)
    );
    if (staleItems.length === 0) {
      return { triggered: false, results: [], errors: [] };
    }

    const results: PluggySyncResult[] = [];
    const errors: string[] = [];

    for (const item of staleItems) {
      try {
        const res = await this.syncFinance(item.id, {
          client: options?.client,
          now: () => new Date(nowMs),
        });
        results.push(res);
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : 'Falha ao sincronizar Open Finance.'
        );
      }
    }

    return { triggered: true, results, errors };
  },

  /**
   * V1c (Sprint 115): Ao fim de cada sincronização bem-sucedida, para carteiras Pluggy ligadas a uma
   * conta 'broker' vazia (não Open Finance), troca o vínculo para a conta OF da mesma conexão (se única)
   * e arquiva a 'broker' vazia. Respeita `broker-link:manual:<portfolioId>` e marca `broker-link-suggest:v3:<portfolioId>`.
   */
  async migrateBrokerLinkSuggestV3IfNeeded(itemId?: string): Promise<number> {
    const db = getDatabase();
    const [allPortfolios, allAccounts, allEntries] = await Promise.all([
      portfolioRepository.listPortfolios(true),
      finRepository.listAccounts(true),
      finRepository.listAllEntries(),
    ]);

    const accountById = new Map(allAccounts.map((a) => [a.id, a]));
    const accountsWithEntries = new Set(allEntries.map((e) => e.account_id));
    let migratedCount = 0;

    for (const p of allPortfolios) {
      if (!p.of_item_id || !p.fin_account_id) continue;
      if (itemId && p.of_item_id !== itemId) continue;
      const manualChoice = await appMetaRepository.get(`broker-link:manual:${p.id}`);
      if (manualChoice === '1') continue;
      const v3Done = await appMetaRepository.get(`${BROKER_LINK_SUGGEST_V3_META_PREFIX}${p.id}`);
      if (v3Done === '1') continue;

      const linkedAcc = accountById.get(p.fin_account_id);
      if (!linkedAcc) continue;
      if (linkedAcc.type !== 'broker' || linkedAcc.source === 'OPEN_FINANCE') continue;
      if (accountsWithEntries.has(linkedAcc.id)) continue;

      const ofCandidates = allAccounts.filter(
        (a) =>
          a.archived === 0 &&
          a.id !== linkedAcc.id &&
          a.source === 'OPEN_FINANCE' &&
          a.of_item_id === p.of_item_id &&
          (a.type === 'checking' || a.type === 'cash' || a.type === 'broker')
      );

      if (ofCandidates.length === 1) {
        await runInTransaction(async () => {
          await portfolioRepository.linkFinAccount(p.id, ofCandidates[0].id);
          await db
            .update(finAccounts)
            .set({ archived: 1 })
            .where(eq(finAccounts.id, linkedAcc.id));
        });
        await appMetaRepository.set(`${BROKER_LINK_SUGGEST_V3_META_PREFIX}${p.id}`, '1');
        migratedCount += 1;
      }
    }

    return migratedCount;
  },
};
