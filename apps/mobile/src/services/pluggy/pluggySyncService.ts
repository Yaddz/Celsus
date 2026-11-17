import * as Crypto from 'expo-crypto';
import { getDatabase, runInTransaction } from '../../db/client';
import { assets, incomeEvents, portfolios } from '../../db/schema';
import {
  applyUserEditedPreservation,
  computeSyncWindowStart,
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
      const lastSuccess = priorRuns.find((r) => r.status === 'SUCCESS');
      const lastSuccessIso = lastSuccess
        ? lastSuccess.finished_at ?? lastSuccess.started_at
        : null;
      const dateFrom = computeSyncWindowStart(lastSuccessIso, nowIso);

      const item = await client.getItem(itemId);
      assertItemConsentActive(item, nowDate.getTime());

      const pluggyAccounts = await client.listAccounts(itemId);
      const txsByAccount = new Map<string, PluggyTransaction[]>();
      const billsByAccount = new Map<string, PluggyBill[]>();

      for (const acc of pluggyAccounts) {
        const txs = await client.listTransactions(acc.id, { dateFrom });
        txsByAccount.set(acc.id, txs);
        counts.transactionsFetched += txs.length;

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
              ...(mapped.type === 'card'
                ? {
                    credit_limit_cents:
                      mapped.creditLimitCents ?? localAcc.credit_limit_cents,
                    due_day: mapped.dueDay ?? localAcc.due_day,
                    closing_day: updatedClosingDay,
                  }
                : {}),
            });
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
            });
            if (mapped.type === 'checking') {
              newCheckingReportedCents.set(localAcc.id, mapped.reportedBalanceCents);
            }
          }

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
        for (const pgAcc of pluggyAccounts) {
          const localAcc = localAccountByPgId.get(pgAcc.id);
          if (!localAcc) continue;
          const txs = txsByAccount.get(pgAcc.id) ?? [];
          const bills = billsByAccount.get(pgAcc.id) ?? [];
          for (const tx of txs) {
            allMapped.push(
              mapPluggyTransaction(tx, {
                accountId: localAcc.id,
                accountType: localAcc.type === 'card' ? 'card' : 'checking',
                closingDay: localAcc.closing_day,
                dueDay: localAcc.due_day,
                bills,
                rules: rules as unknown as import('../../domain/statementImport').CategoryRuleLike[],
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
        const rawTxByExternalId = new Map<string, PluggyTransaction>();
        for (const [, txs] of txsByAccount.entries()) {
          for (const rawTx of txs) {
            rawTxByExternalId.set(rawTx.id, rawTx);
          }
        }
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

        // Conta corrente recém-criada: o saldo do banco já contém o histórico importado. O saldo
        // inicial vira "saldo do banco − lançamentos pagos importados", para o saldo calculado fechar.
        for (const [accountId, reportedCents] of newCheckingReportedCents) {
          let paidNetCents = 0;
          for (const row of reconciled.transactions) {
            if (row.accountId !== accountId || row.status !== 'paid') continue;
            const kind = row.transferRole ?? row.kind;
            const real = row.paidAmountCents ?? row.amountCents;
            paidNetCents += kind === 'income' || kind === 'transfer_in' ? real : -real;
          }
          if (paidNetCents !== 0) {
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
    await runInTransaction(async () => {
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
          });
        } else {
          await finRepository.updateAccount(choice.targetLocalAccountId, {
            of_account_id: pgAcc.id,
            source: 'OPEN_FINANCE',
            reported_balance_cents: mapped.reportedBalanceCents,
            reported_balance_at: mapped.reportedBalanceAt,
            ...(mapped.type === 'card'
              ? {
                  credit_limit_cents: mapped.creditLimitCents,
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
