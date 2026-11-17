import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finEntries } from '../../../db/schema';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import type { PluggyClient } from '../pluggyClient';
import { pluggySyncService } from '../pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from './pluggyFixtures';
import type { PluggyTransaction } from '../types';

describe('Sprint 101 — Sync: SCHEDULED -> POSTED, cancelamento e migração brtdates', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S101-T05: agendamento SCHEDULED volta POSTED com o mesmo id => vira paid na data sem duplicar', async () => {
    const itemId = 'item-sched-settle';
    await openFinanceRepository.addItem(itemId);
    const bank = { ...makePluggyAccounts()[0], itemId };

    let status: 'PENDING' | 'POSTED' = 'PENDING';
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [bank],
      listTransactions: async () => [
        {
          id: 'tx-sched-1',
          accountId: bank.id,
          description: 'Boleto luz',
          currencyCode: 'BRL',
          amount: -200,
          date: '2026-11-25T00:00:00.000Z',
          type: 'DEBIT',
          status,
          createdAt: '2026-11-17T10:00:00.000Z',
          updatedAt: '2026-11-17T10:00:00.000Z',
        } as PluggyTransaction,
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });
    const db = getDatabase();
    const pendingRows = (await db.select().from(finEntries)) as any[];
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].status).toBe('pending');
    expect(pendingRows[0].of_class_reason).toBe('SCHEDULED');

    status = 'POSTED';
    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-25T12:00:00Z'),
    });
    const paidRows = (await db.select().from(finEntries)) as any[];
    expect(paidRows).toHaveLength(1);
    expect(paidRows[0].id).toBe(pendingRows[0].id);
    expect(paidRows[0].status).toBe('paid');
    expect(paidRows[0].paid_date).toBe('2026-11-25');
  });

  it('S101-T06: agendamento cancelado (some da busca) => soft delete sem conflito', async () => {
    const itemId = 'item-sched-cancel';
    await openFinanceRepository.addItem(itemId);
    const bank = { ...makePluggyAccounts()[0], itemId };

    let present = true;
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [bank],
      listTransactions: async () =>
        present
          ? [
              {
                id: 'tx-cancel-1',
                accountId: bank.id,
                description: 'Pix agendado',
                currencyCode: 'BRL',
                amount: -150,
                date: '2026-11-25T00:00:00.000Z',
                type: 'DEBIT',
                status: 'PENDING',
                createdAt: '2026-11-17T10:00:00.000Z',
                updatedAt: '2026-11-17T10:00:00.000Z',
              } as PluggyTransaction,
            ]
          : [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });
    present = false;
    const res2 = await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-18T12:00:00Z'),
    });

    expect(res2.counts.entriesRemoved).toBe(1);
    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    expect(rows[0].of_removed_at).not.toBeNull();
  });

  it('S101-T11: migração fin:of:brtdates:s101 é idempotente e preserva due_date editado manualmente', async () => {
    const itemId = 'item-brt-mig';
    await openFinanceRepository.addItem(itemId);
    const bank = { ...makePluggyAccounts()[0], itemId };
    const localAcc = await finRepository.createAccount({
      name: 'Conta Teste',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: bank.id,
    });

    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 12000,
        due_date: '2026-12-01',
        paid_date: '2026-12-01',
        paid_amount_cents: 12000,
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-outros-despesa',
        description: 'Pix noturno editado',
        user_edited_fields: JSON.stringify(['due_date']),
        source: 'OPEN_FINANCE',
        external_id: 'tx-brt-edited',
        of_created_at: '2026-12-01T01:15:00.000Z',
      },
    ]);

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [bank],
      listTransactions: async () => [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    expect(await appMetaRepository.get('fin:of:brtdates:s101')).toBe('1');
    const log = await appMetaRepository.get('fin:of:brtdates:s101:log');
    expect(log).toBeTruthy();

    const db = getDatabase();
    const row = (
      (await db.select().from(finEntries).where(eq(finEntries.external_id, 'tx-brt-edited'))) as any[]
    )[0];
    expect(row.due_date).toBe('2026-12-01');

    // Rodar de novo é idempotente
    await pluggySyncService.syncFinance(itemId, { client });
    expect(await appMetaRepository.get('fin:of:brtdates:s101')).toBe('1');
  });
});
