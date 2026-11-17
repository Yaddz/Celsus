import * as Crypto from 'expo-crypto';
import { getDatabase, runInTransaction } from '../../db/client';
import { assets, incomeEvents, portfolios } from '../../db/schema';
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
import { detectBankIncomeCandidate } from '../../domain/openFinance/income';
import { findEquivalentIncome } from '../../domain/finance/incomeDedup';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
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
}

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

      const item = await client.getItem(itemId);
      assertItemConsentActive(item, nowDate.getTime());

      const pluggyAccounts = await client.listAccounts(itemId);
      const txsByAccount = new Map<string, Array<{ tx: PluggyTransaction; externalId: string }>>();
      const billsByAccount = new Map<string, PluggyBill[]>();

      for (const acc of pluggyAccounts) {
        let rawTxs: PluggyTransaction[];
        if (isFirstFinanceSync || !createdAtFrom) {
          rawTxs = await client.listTransactions(acc.id, { dateFrom: firstDateFrom });
        } else {
          const [incTxs, recTxs] = await Promise.all([
            client.listTransactions(acc.id, { createdAtFrom }),
            client.listTransactions(acc.id, { dateFrom: reconcileWindowStart }),
          ]);
          rawTxs = [...incTxs, ...recTxs];
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
        for (const pgAcc of pluggyAccounts) {
          const mapped = mapPluggyAccount(pgAcc, item.connector?.name);
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
            localAcc = await finRepository.updateAccount(localAcc.id, {
              name: shouldPreserveName ? localAcc.name : mapped.name,
              auto_name: mapped.name,
              of_account_id: pgAcc.id,
              source: 'OPEN_FINANCE',
              reported_balance_cents: mapped.reportedBalanceCents,
              reported_balance_at: mapped.reportedBalanceAt,
              masked_number: mapped.maskedNumber,
              owner: mapped.owner,
              closing_balance_cents: mapped.closingBalanceCents,
              auto_invested_cents: mapped.autoInvestedCents,
              ...(isFirstLink ? { of_linked_at: nowIso } : {}),
              ...(mapped.type === 'card'
                ? {
                    credit_limit_cents:
                      mapped.creditLimitCents ?? localAcc.credit_limit_cents,
                    credit_used_cents: mapped.creditUsedCents,
                    due_day: mapped.dueDay ?? localAcc.due_day,
                    closing_day: updatedClosingDay,
                  }
                : {}),
            });
            if (isFirstLink && mapped.type === 'checking') {
              newCheckingReportedCents.set(localAcc.id, mapped.reportedBalanceCents);
            }
          } else {
            const createdClosingDay = choice?.closingDay ?? mapped.closingDay;
            localAcc = await finRepository.createAccount({
              name: mapped.name,
              type: mapped.type,
              initialBalanceCents:
                mapped.type === 'checking' ? mapped.reportedBalanceCents : 0,
              closingDay: createdClosingDay,
              dueDay: mapped.dueDay,
              creditLimitCents: mapped.creditLimitCents,
              ofAccountId: pgAcc.id,
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
                billMonth: b.dueDate.slice(0, 7),
                closingDate: b.billClosingDate ? b.billClosingDate.slice(0, 10) : null,
                dueDate: b.dueDate.slice(0, 10),
                totalAmountCents: toCentsDecimal(b.totalAmount),
                minimumPaymentCents:
                  b.minimumPaymentAmount != null ? toCentsDecimal(b.minimumPaymentAmount) : null,
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
        const fetchedExternalIds = new Set<string>();
        const rawTxByExternalId = new Map<string, PluggyTransaction>();
        for (const pgAcc of pluggyAccounts) {
          const localAcc = localAccountByPgId.get(pgAcc.id);
          if (!localAcc) continue;
          const txs = txsByAccount.get(pgAcc.id) ?? [];
          const bills = billsByAccount.get(pgAcc.id) ?? [];
          for (const { tx, externalId } of txs) {
            fetchedExternalIds.add(externalId);
            rawTxByExternalId.set(externalId, tx);
            allMapped.push(
              mapPluggyTransaction(tx, {
                accountId: localAcc.id,
                accountType: localAcc.type === 'card' ? 'card' : 'checking',
                closingDay: localAcc.closing_day,
                dueDay: localAcc.due_day,
                bills,
                rules: rules as unknown as import('../../domain/statementImport').CategoryRuleLike[],
                externalIdOverride: externalId,
              })
            );
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
        }));

        const reconciled = reconcilePluggyTransactions(allMapped, reconcilable, {
          accountTypesById,
        });
        counts.transfersMatched = reconciled.transferPairs.length;

        const existingById = new Map(existingEntries.map((e) => [e.id, e]));
        const toCreate: Array<Record<string, unknown>> = [];
        const syncedEntryRefs: Array<{ entryId: string; externalId: string }> = [];

        for (const row of reconciled.transactions) {
          if (row.action === 'update' && row.matchedEntryId) {
            const existing = existingById.get(row.matchedEntryId);
            if (!existing) continue;

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

            const nextKind = row.transferRole ?? row.kind;
            const nextTransferGroupId =
              row.transferGroupId ?? existing.transfer_group_id ?? null;

            const hasChanges =
              existing.status !== row.status ||
              existing.amount_cents !== row.amountCents ||
              existing.due_date !== row.dueDate ||
              existing.paid_date !== row.paidDate ||
              existing.paid_amount_cents !== row.paidAmountCents ||
              existing.category_id !== preserved.category_id ||
              existing.description !== preserved.description ||
              existing.kind !== nextKind ||
              existing.transfer_group_id !== nextTransferGroupId;

            if (hasChanges) {
              await finRepository.updateEntry(existing.id, {
                kind: nextKind,
                status: row.status,
                amount_cents: row.amountCents,
                due_date: row.dueDate,
                paid_date: row.paidDate,
                paid_amount_cents: row.paidAmountCents,
                category_id: preserved.category_id,
                description: preserved.description,
                description_raw: row.descriptionRaw,
                bill_month: row.billMonth,
                installment_number: row.installmentNumber,
                installment_total: row.installmentTotal,
                transfer_group_id: nextTransferGroupId,
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
            });
            counts.transactionsSettled += 1;
          } else {
            toCreate.push({
              kind: row.transferRole ?? row.kind,
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
              transfer_group_id: row.transferGroupId ?? null,
              source: 'OPEN_FINANCE',
              external_id: row.externalId,
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

        // R9: Detectar proventos creditados na conta da corretora (OPEN_FINANCE_BANK)
        if (syncedEntryRefs.length > 0) {
          const db = getDatabase();
          const [allAssets, allPortfolios, existingIncomes] = await Promise.all([
            db.select().from(assets),
            db.select().from(portfolios),
            db.select().from(incomeEvents),
          ]);
          const workingIncomes = [...existingIncomes];
          const knownTickers = new Set<string>([
            ...allAssets.map((a) => a.ticker),
            ...workingIncomes.map((i) => i.ticker),
          ]);
          const brokerPortfolioId =
            allPortfolios.find((p) => p.of_item_id === itemId)?.id ??
            allAssets.find((a) => a.institution_id === itemId)?.portfolio_id ??
            allPortfolios[0]?.id ??
            null;

          if (brokerPortfolioId && knownTickers.size > 0) {
            for (const ref of syncedEntryRefs) {
              const rawTx = rawTxByExternalId.get(ref.externalId);
              if (!rawTx) continue;
              const candidate = detectBankIncomeCandidate(rawTx, knownTickers);
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
        }

        // R10: Detectar lançamentos Open Finance removidos pela instituição dentro da janela de 40 dias
        const settledEntryIds = new Set(
          reconciled.transactions
            .filter((r) => r.action === 'settle_pending' && r.matchedEntryId)
            .map((r) => r.matchedEntryId!)
        );
        const candidatesForRemoval = existingEntries.filter(
          (e) => syncedAccountIds.has(e.account_id) && !settledEntryIds.has(e.id)
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

        await openFinanceRepository.upsertItem({
          id: item.id,
          connector_name: item.connector?.name ?? item.id,
          status: item.status,
          execution_status: item.executionStatus,
          consent_expires_at: item.consentExpiresAt ?? null,
          last_synced_at: nowIso,
          last_error: null,
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
    const [pluggyAccounts, localAccounts] = await Promise.all([
      client.listAccounts(itemId),
      finRepository.listAccounts(true),
    ]);

    return pluggyAccounts.map((pgAcc) => {
      const targetType = pgAcc.type === 'CREDIT' ? 'card' : 'checking';
      const byOfId = localAccounts.find((a) => a.of_account_id === pgAcc.id);
      if (byOfId) {
        return { pluggyAccount: pgAcc, suggestedLocalAccountId: byOfId.id };
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
    _itemId: string,
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
        const mapped = mapPluggyAccount(pgAcc);

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
            source: 'OPEN_FINANCE',
            reported_balance_cents: mapped.reportedBalanceCents,
            reported_balance_at: mapped.reportedBalanceAt,
            masked_number: mapped.maskedNumber,
            owner: mapped.owner,
            auto_name: mapped.name,
            closing_balance_cents: mapped.closingBalanceCents,
            auto_invested_cents: mapped.autoInvestedCents,
            ...(isFirstLink ? { of_linked_at: nowIso } : {}),
            ...(nextInitialBalance !== undefined
              ? { initial_balance_cents: nextInitialBalance }
              : {}),
            ...(mapped.type === 'card'
              ? {
                  credit_limit_cents: mapped.creditLimitCents,
                  credit_used_cents: mapped.creditUsedCents,
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
};
