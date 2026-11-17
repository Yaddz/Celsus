import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finAccounts, finEntries } from '../../../db/schema';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import type { PluggyClient } from '../pluggyClient';
import { pluggySyncService } from '../pluggySyncService';
import {
  makePluggyAccounts,
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawCardTx,
} from './pluggyFixtures';
import type { PluggyTransaction } from '../types';

describe('Sprint 98 — Identidade estável, R32, R33, R37 e dedupe s98', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S98-T02: Pluggy recria parcela Panini 5/12 com id novo e mesmo providerId => update in-place e matchedByProviderId 1', async () => {
    const itemId = 'item-panini-prov';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });

    let currentTxId = 'tx-panini-v1';
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        makeSprint97RawCardTx({
          id: currentTxId,
          accountId: card.id,
          description: 'Panini Brasil Ltda 5/12',
          descriptionRaw: 'Panini Brasil Ltda 5/12',
          amount: 8.46,
          date: '2026-11-13T00:00:00.000Z',
          providerId: 'prov-panini-5',
          creditCardMetadata: { installmentNumber: 5, totalInstallments: 12 },
        }),
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    const db = getDatabase();
    const beforeRows = (await db.select().from(finEntries)) as any[];
    expect(beforeRows).toHaveLength(1);
    const localId = beforeRows[0].id;

    currentTxId = 'tx-panini-v2';
    const res2 = await pluggySyncService.syncFinance(itemId, { client });
    const afterRows = (await db.select().from(finEntries)) as any[];
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].id).toBe(localId);
    expect(afterRows[0].external_id).toBe('tx-panini-v2');
    expect((res2.counts as any).matchedByProviderId).toBe(1);
  });

  it('S98-T03: mesmo caso sem providerId (chave ausente) => casa por fingerprint e matchedByFingerprint 1', async () => {
    const itemId = 'item-panini-fp';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });

    let currentTxId = 'tx-fp-v1';
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        {
          id: currentTxId,
          accountId: card.id,
          description: 'Panini Brasil Ltda 5/12',
          currencyCode: 'BRL',
          amount: 8.46,
          date: '2026-11-13T00:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2026-11-13T10:00:00.000Z',
          updatedAt: '2026-11-13T10:00:00.000Z',
        } as PluggyTransaction,
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    const db = getDatabase();
    const beforeRows = (await db.select().from(finEntries)) as any[];
    expect(beforeRows).toHaveLength(1);

    currentTxId = 'tx-fp-v2';
    const res2 = await pluggySyncService.syncFinance(itemId, { client });
    const afterRows = (await db.select().from(finEntries)) as any[];
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].id).toBe(beforeRows[0].id);
    expect(afterRows[0].external_id).toBe('tx-fp-v2');
    expect((res2.counts as any).matchedByFingerprint).toBe(1);
  });

  it('S98-T04: linha com of_removed_at volta no sync seguinte com id novo => restaurada (of_removed_at null, restored 1)', async () => {
    const itemId = 'item-restore';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });

    let mode: 'present' | 'missing' | 'returned' = 'present';
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => {
        if (mode === 'missing') return [];
        return [
          makeSprint97RawCardTx({
            id: mode === 'present' ? 'tx-rem-1' : 'tx-rem-2',
            accountId: card.id,
            description: 'Restaurante Volta',
            descriptionRaw: 'Restaurante Volta',
            amount: 55.0,
            date: '2026-11-10T00:00:00.000Z',
            status: 'POSTED',
            providerId: 'prov-volta',
          }),
        ];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-17T12:00:00Z') });
    mode = 'missing';
    await pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-18T12:00:00Z') });

    const db = getDatabase();
    const removedRows = (await db.select().from(finEntries)) as any[];
    expect(removedRows[0].of_removed_at).not.toBeNull();

    mode = 'returned';
    const res3 = await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-19T12:00:00Z'),
    });
    const restoredRows = (await db.select().from(finEntries)) as any[];
    expect(restoredRows).toHaveLength(1);
    expect(restoredRows[0].of_removed_at).toBeNull();
    expect(restoredRows[0].external_id).toBe('tx-rem-2');
    expect((res3.counts as any).restored).toBe(1);
  });

  it('S98-T06: R32 — PARTIAL_SUCCESS com creditCards.isUpdated false pula remoção do cartão mas mantém na conta BANK', async () => {
    const itemId = 'item-partial-r32';
    await openFinanceRepository.addItem(itemId);
    const [checking, card] = makePluggyAccounts();
    const bankAcc = { ...checking, itemId };
    const cardAcc = { ...card, itemId };

    let partialMode = false;
    const client = {
      getItem: async () =>
        makePluggyItem({
          id: itemId,
          executionStatus: partialMode ? 'PARTIAL_SUCCESS' : 'SUCCESS',
          statusDetail: partialMode
            ? {
                transactions: { isUpdated: true },
                creditCards: { isUpdated: false },
              }
            : null,
        }),
      listAccounts: async () => [bankAcc, cardAcc],
      listTransactions: async (accId: string) => {
        if (partialMode) return [];
        if (accId === bankAcc.id) {
          return [
            {
              id: 'tx-bank-r32',
              accountId: bankAcc.id,
              description: 'Compra débito',
              currencyCode: 'BRL',
              amount: -40,
              date: '2026-11-10T12:00:00.000Z',
              type: 'DEBIT',
              status: 'POSTED',
              createdAt: '2026-11-10T12:00:00.000Z',
              updatedAt: '2026-11-10T12:00:00.000Z',
            },
          ];
        }
        return [
          makeSprint97RawCardTx({
            id: 'tx-card-r32',
            accountId: cardAcc.id,
            amount: 120,
            date: '2026-11-10T00:00:00.000Z',
            status: 'POSTED',
          }),
        ];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-17T12:00:00Z') });
    partialMode = true;
    const res2 = await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-18T12:00:00Z'),
    });

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    const bankRow = rows.find((r) => r.external_id === 'tx-bank-r32');
    const cardRow = rows.find((r) => r.external_id === 'tx-card-r32');
    expect(bankRow.of_removed_at).not.toBeNull();
    expect(cardRow.of_removed_at).toBeNull();
    expect((res2.counts as any).removalSkippedReason).toBe('PRODUCT_NOT_UPDATED');
  });

  it('S98-T07: R32 — consentExpiresAt no passado bloqueia sync e não remove nenhum lançamento', async () => {
    const itemId = 'item-expired-r32';
    await openFinanceRepository.addItem(itemId);
    const localAcc = await finRepository.createAccount({
      name: 'Conta Expirada',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: 'acc-exp-1',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: '2026-11-10',
      status: 'paid',
      account_id: localAcc.id,
      category_id: 'cat-outros-despesa',
      description: 'Compra preservada',
      source: 'OPEN_FINANCE',
      external_id: 'tx-exp-1',
    });

    const client = {
      getItem: async () =>
        makePluggyItem({
          id: itemId,
          consentExpiresAt: '2026-10-01T00:00:00.000Z',
        }),
      listAccounts: async () => [],
      listTransactions: async () => [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await expect(
      pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-17T12:00:00Z') })
    ).rejects.toThrow();

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    expect(rows[0].of_removed_at).toBeNull();
  });

  it('S98-T08: dedupe s98 remove duplicata que não veio na busca, copia edição para a mantida e é idempotente', async () => {
    const itemId = 'item-dedupe-1';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const localAcc = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: card.id,
    });

    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 9834,
        due_date: '2026-11-13',
        paid_date: '2026-11-13',
        paid_amount_cents: 9834,
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-outros-despesa',
        description: 'Shopee *Dncleoinformti 12/12',
        description_raw: 'SHOPEE *DNCLEOINFORMTI 12/12',
        source: 'OPEN_FINANCE',
        external_id: 'tx-shopee-keep',
      },
      {
        kind: 'expense',
        amount_cents: 9834,
        due_date: '2026-11-13',
        paid_date: '2026-11-13',
        paid_amount_cents: 9834,
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-compras',
        description: 'Shopee *Dncleoinformti 12/12',
        description_raw: 'SHOPEE *DNCLEOINFORMTI 12/12',
        user_edited_fields: JSON.stringify(['category_id']),
        source: 'OPEN_FINANCE',
        external_id: 'tx-shopee-old',
      },
    ]);

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        makeSprint97RawCardTx({
          id: 'tx-shopee-keep',
          accountId: card.id,
          description: 'SHOPEE *DNCLEOINFORMTI 12/12',
          descriptionRaw: 'SHOPEE *DNCLEOINFORMTI 12/12',
          amount: 98.34,
          date: '2026-11-13T00:00:00.000Z',
          status: 'POSTED',
        }),
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    const kept = rows.find((r) => r.external_id === 'tx-shopee-keep');
    const removed = rows.find((r) => r.external_id === 'tx-shopee-old');
    expect(kept.of_removed_at).toBeNull();
    expect(kept.category_id).toBe('cat-compras');
    expect(kept.user_edited_fields).toContain('category_id');
    expect(removed.of_removed_at).not.toBeNull();
    expect(removed.of_class_reason).toBe('DUPLICATE_MERGED');
    expect(await appMetaRepository.get('fin:of:dedupe:s98')).toBe('1');

    // Rodar novamente é idempotente
    await pluggySyncService.syncFinance(itemId, { client });
    const rowsAfter = (await db.select().from(finEntries)) as any[];
    expect(rowsAfter).toHaveLength(2);
  });

  it('S98-T09: dedupe s98 com edição nos dois lados => nenhum muda e dedupeConflicts 1', async () => {
    const itemId = 'item-dedupe-conflict';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const localAcc = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: card.id,
    });

    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 9834,
        due_date: '2026-11-13',
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-compras',
        description: 'Shopee 1',
        description_raw: 'SHOPEE *DNCLEOINFORMTI 12/12',
        user_edited_fields: JSON.stringify(['category_id']),
        source: 'OPEN_FINANCE',
        external_id: 'tx-c-keep',
      },
      {
        kind: 'expense',
        amount_cents: 9834,
        due_date: '2026-11-13',
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-servicos',
        description: 'Shopee 2',
        description_raw: 'SHOPEE *DNCLEOINFORMTI 12/12',
        user_edited_fields: JSON.stringify(['category_id']),
        source: 'OPEN_FINANCE',
        external_id: 'tx-c-other',
      },
    ]);

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        makeSprint97RawCardTx({
          id: 'tx-c-keep',
          accountId: card.id,
          description: 'SHOPEE *DNCLEOINFORMTI 12/12',
          descriptionRaw: 'SHOPEE *DNCLEOINFORMTI 12/12',
          amount: 98.34,
          date: '2026-11-13T00:00:00.000Z',
          status: 'POSTED',
        }),
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    const res = await pluggySyncService.syncFinance(itemId, { client });
    expect((res.counts as any).dedupeConflicts).toBe(1);

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    expect(rows.every((r) => r.of_removed_at === null)).toBe(true);
  });

  it('S98-T10: R33 — reconexão pré-seleciona conta antiga do mesmo COMPE/subtipo/4 dígitos e não duplica histórico por providerId', async () => {
    const oldItemId = 'item-old-expired';
    const newItemId = 'item-new-reconnected';
    await openFinanceRepository.addItem(oldItemId);
    await openFinanceRepository.upsertItem({
      id: oldItemId,
      connector_name: 'MeuPluggy',
      status: 'LOGIN_ERROR',
      execution_status: 'USER_AUTHORIZATION_EXPIRED',
      consent_expires_at: '2026-10-01T00:00:00.000Z',
      last_synced_at: '2026-10-01T00:00:00.000Z',
      last_error: null,
    });
    await openFinanceRepository.addItem(newItemId);

    const oldLocalCard = await finRepository.createAccount({
      name: 'XP · Cartão ·· 1234',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-card-old-1234',
      maskedNumber: '1234',
    });

    const historyBatch = Array.from({ length: 20 }, (_, i) => ({
      kind: 'expense' as const,
      amount_cents: 1000 + i * 100,
      due_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      paid_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      paid_amount_cents: 1000 + i * 100,
      status: 'paid' as const,
      account_id: oldLocalCard.id,
      category_id: 'cat-compras',
      description: `Compra ${i + 1}`,
      source: 'OPEN_FINANCE',
      external_id: `old-tx-${i + 1}`,
      of_provider_id: `prov-hist-${i + 1}`,
    }));
    await finRepository.createEntriesBatch(historyBatch);

    const newCheckingForCompe = {
      ...makePluggyAccounts()[0],
      id: 'of-chk-new',
      itemId: newItemId,
      bankData: { transferNumber: '348/0001/99999-0' },
    };
    const newCard = makeSprint97CardAccount7ccce4de({
      id: 'of-card-new-1234',
      itemId: newItemId,
      number: '**** 1234',
      name: 'XP Visa Infinite',
    });

    const client = {
      getItem: async () => makePluggyItem({ id: newItemId }),
      listAccounts: async () => [newCheckingForCompe, newCard],
      listTransactions: async (accId: string) => {
        if (accId === newCheckingForCompe.id) return [];
        return Array.from({ length: 20 }, (_, i) =>
          makeSprint97RawCardTx({
            id: `new-tx-${i + 1}`,
            accountId: newCard.id,
            description: `Compra ${i + 1}`,
            amount: (1000 + i * 100) / 100,
            date: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
            status: 'POSTED',
            providerId: `prov-hist-${i + 1}`,
          })
        );
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    const proposals = await pluggySyncService.previewAccountReconciliation(newItemId, client);
    const cardProposal = proposals.find((p) => p.pluggyAccount.id === newCard.id);
    expect(cardProposal?.suggestedLocalAccountId).toBe(oldLocalCard.id);

    await pluggySyncService.syncFinance(newItemId, {
      client,
      accountChoices: [
        { pluggyAccountId: newCard.id, targetLocalAccountId: oldLocalCard.id },
        { pluggyAccountId: newCheckingForCompe.id, targetLocalAccountId: 'CREATE_NEW' },
      ],
    });

    const db = getDatabase();
    const updatedAcc = await finRepository.getAccountById(oldLocalCard.id);
    expect(updatedAcc?.of_account_id).toBe(newCard.id);
    const entriesAfter = await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.account_id, oldLocalCard.id));
    expect(entriesAfter).toHaveLength(20);
  });

  it('S98-T12: R37/D43 — migração fullhistory busca sem dateFrom, cria só as que faltam e grava app_meta', async () => {
    const itemId = 'item-fullhistory';
    await openFinanceRepository.addItem(itemId);
    await openFinanceRepository.recordSyncRun({
      id: 'run-prev-1',
      item_id: itemId,
      started_at: '2026-11-16T10:00:00Z',
      finished_at: '2026-11-16T10:01:00Z',
      status: 'SUCCESS',
      kind: 'FINANCE',
      counts_json: '{}',
      error: null,
    });
    const checking = { ...makePluggyAccounts()[0], itemId };
    const localAcc = await finRepository.createAccount({
      name: 'Nubank Conta',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: checking.id,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: '2026-11-10',
      status: 'paid',
      account_id: localAcc.id,
      category_id: 'cat-outros-despesa',
      description: 'Compra recente',
      source: 'OPEN_FINANCE',
      external_id: 'tx-recent',
    });

    const calls: Array<Record<string, unknown>> = [];
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [checking],
      listTransactions: async (_accId: string, params?: Record<string, unknown>) => {
        calls.push(params ?? {});
        if (!params?.dateFrom && !params?.createdAtFrom) {
          return [
            {
              id: 'tx-2024-old',
              accountId: checking.id,
              description: 'Compra antiga 2024',
              currencyCode: 'BRL',
              amount: -25,
              date: '2024-06-15T12:00:00.000Z',
              type: 'DEBIT',
              status: 'POSTED',
              createdAt: '2024-06-15T12:00:00.000Z',
              updatedAt: '2024-06-15T12:00:00.000Z',
            },
            {
              id: 'tx-recent',
              accountId: checking.id,
              description: 'Compra recente',
              currencyCode: 'BRL',
              amount: -50,
              date: '2026-11-10T12:00:00.000Z',
              type: 'DEBIT',
              status: 'POSTED',
              createdAt: '2026-11-10T12:00:00.000Z',
              updatedAt: '2026-11-10T12:00:00.000Z',
            },
          ];
        }
        return [];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    expect(calls.some((c) => c.dateFrom === undefined && c.createdAtFrom === undefined)).toBe(true);
    expect(await appMetaRepository.get(`fin:of:fullhistory:s98:${itemId}`)).toBe('1');

    const db = getDatabase();
    const rows = await db.select().from(finEntries);
    expect(rows).toHaveLength(2);

    calls.length = 0;
    await pluggySyncService.syncFinance(itemId, { client });
    expect(calls.some((c) => c.dateFrom === undefined && c.createdAtFrom === undefined)).toBe(false);
    expect((await db.select().from(finEntries))).toHaveLength(2);
  });

  it('S98-T13: 1ª sincronização de conexão nova não envia dateFrom; 2º sync volta às duas passadas da R10', async () => {
    const itemId = 'item-first-r37';
    await openFinanceRepository.addItem(itemId);
    const checking = { ...makePluggyAccounts()[0], itemId };

    const calls: Array<Record<string, unknown>> = [];
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [checking],
      listTransactions: async (_accId: string, params?: Record<string, unknown>) => {
        calls.push(params ?? {});
        return [];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-17T12:00:00Z') });
    expect(calls).toHaveLength(1);
    expect(calls[0].dateFrom).toBeUndefined();

    calls.length = 0;
    await pluggySyncService.syncFinance(itemId, { client, now: () => new Date('2026-11-18T12:00:00Z') });
    expect(calls.some((c) => Boolean(c.createdAtFrom))).toBe(true);
    expect(calls.some((c) => Boolean(c.dateFrom))).toBe(true);
  });
});
