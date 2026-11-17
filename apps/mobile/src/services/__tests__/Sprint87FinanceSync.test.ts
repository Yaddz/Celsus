import { resetDatabase, getDatabase } from '../../db/client';
import { finAccounts, finEntries } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { calculateAccountBalance } from '../../domain/financeFlow';
import {
  makePluggyAccounts,
  makePluggyItem,
} from '../pluggy/__tests__/pluggyFixtures';
import type { PluggyClient } from '../pluggy/pluggyClient';
import type { PluggyTransaction } from '../pluggy/types';

describe('Sprint 87 — Bancos e cartões: janela, duplicatas e saldos (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S87-T01: só existe run INVESTMENTS => janela de finanças é de 12 meses (D15, R10)', async () => {
    await openFinanceRepository.addItem('item-inv-only');
    await openFinanceRepository.recordSyncRun({
      id: 'of-inv-123',
      item_id: 'item-inv-only',
      started_at: '2026-11-15T10:00:00Z',
      finished_at: '2026-11-15T10:01:00Z',
      status: 'SUCCESS',
      counts_json: '{}',
      error: null,
    });

    const listTxCalls: Array<Record<string, unknown>> = [];
    const checking = makePluggyAccounts()[0];
    const client = {
      getItem: async () => makePluggyItem({ id: 'item-inv-only' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-inv-only' }],
      listTransactions: async (_accId: string, params?: Record<string, unknown>) => {
        listTxCalls.push(params ?? {});
        return [];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-inv-only', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    expect(listTxCalls).toHaveLength(1);
    expect(listTxCalls[0].dateFrom).toBeUndefined();
    expect(listTxCalls[0].createdAtFrom).toBeUndefined();
  });

  it('S87-T02: incremental usa createdAtFrom; parcela com date antiga e createdAt novo entra (D16, R10)', async () => {
    await openFinanceRepository.addItem('item-inc');
    await openFinanceRepository.recordSyncRun({
      id: 'fin-run-1',
      item_id: 'item-inc',
      started_at: '2026-11-10T10:00:00Z',
      finished_at: '2026-11-10T10:05:00Z',
      status: 'SUCCESS',
      counts_json: '{}',
      error: null,
      kind: 'FINANCE',
    } as any);

    const listTxCalls: Array<Record<string, unknown>> = [];
    const checking = makePluggyAccounts()[0];
    const retroTx: PluggyTransaction = {
      id: 'tx-retro-1',
      description: 'Parcela retroativa',
      currencyCode: 'BRL',
      amount: -150,
      date: '2026-09-01T12:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      accountId: checking.id,
      createdAt: '2026-11-15T12:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-inc' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-inc' }],
      listTransactions: async (_accId: string, params?: Record<string, unknown>) => {
        listTxCalls.push(params ?? {});
        if (params?.createdAtFrom) return [retroTx];
        return [];
      },
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-inc', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    expect(listTxCalls.some((c) => typeof c.createdAtFrom === 'string')).toBe(true);
    expect(listTxCalls.some((c) => c.dateFrom === '2026-10-08')).toBe(true);

    const entries = await finRepository.listAllEntries();
    expect(entries.some((e) => e.external_id === 'tx-retro-1')).toBe(true);
  });

  it('S87-T03: pendente id-1 some e aparece postada id-2 com o mesmo valor => um lançamento ativo só (id-1 soft-deletado) (D14, R10)', async () => {
    await openFinanceRepository.addItem('item-pend');
    const card = makePluggyAccounts()[1];
    const localCard = await finRepository.createAccount({
      name: 'Cartão Itaú',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 20,
      ofAccountId: card.id,
      source: 'OPEN_FINANCE',
    });

    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 12000,
        due_date: '2026-11-10',
        paid_date: '2026-11-10',
        paid_amount_cents: 12000,
        status: 'pending',
        account_id: localCard.id,
        category_id: 'cat-outros-despesa',
        description: 'Compra Loja X',
        source: 'OPEN_FINANCE',
        external_id: 'id-1',
      },
    ]);

    await openFinanceRepository.recordSyncRun({
      id: 'fin-prev-pend',
      item_id: 'item-pend',
      started_at: '2026-11-11T10:00:00Z',
      finished_at: '2026-11-11T10:01:00Z',
      status: 'SUCCESS',
      counts_json: '{}',
      error: null,
      kind: 'FINANCE',
    } as any);

    const postedTx: PluggyTransaction = {
      id: 'id-2',
      description: 'Compra Loja X',
      currencyCode: 'BRL',
      amount: -120,
      date: '2026-11-12T12:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      accountId: card.id,
      createdAt: '2026-11-12T12:00:00Z',
      updatedAt: '2026-11-12T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-pend' }),
      listAccounts: async () => [{ ...card, itemId: 'item-pend' }],
      listTransactions: async () => [postedTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-pend', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const entries = await finRepository.listAllEntries();
    const active = entries.filter((e) => !(e as any).of_removed_at);
    expect(active).toHaveLength(1);
    expect(active[0].external_id).toBe('id-2');
    expect(active[0].status).toBe('paid');
  });

  it('S87-T07: mesmo id com valores diferentes no mesmo fetch => dois lançamentos (D18)', async () => {
    await openFinanceRepository.addItem('item-banrisul');
    const checking = makePluggyAccounts()[0];

    const txA: PluggyTransaction = {
      id: 'dup-id',
      description: 'Pix A',
      currencyCode: 'BRL',
      amount: -50,
      date: '2026-11-15T10:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      accountId: checking.id,
      createdAt: '2026-11-15T10:00:00Z',
      updatedAt: '2026-11-15T10:00:00Z',
    };
    const txB: PluggyTransaction = {
      ...txA,
      amount: -75,
      description: 'Pix B',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-banrisul' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-banrisul' }],
      listTransactions: async () => [txA, txB],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-banrisul', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const entries = await finRepository.listAllEntries();
    expect(entries).toHaveLength(2);
  });

  it('S87-T08: vincular conta manual com saldo 1.000 e 5 lançamentos manuais => saldo calculado = balance da Pluggy (D17, R11)', async () => {
    await openFinanceRepository.addItem('item-link');
    const manualAcc = await finRepository.createAccount({
      name: 'Conta Manual',
      type: 'checking',
      initialBalanceCents: 100000, // 1000.00
    });

    // 5 lançamentos manuais antigos
    await finRepository.createEntriesBatch(
      Array.from({ length: 5 }, (_, i) => ({
        kind: 'expense',
        amount_cents: 10000, // 100 cada = -500
        due_date: `2026-01-0${i + 1}`,
        paid_date: `2026-01-0${i + 1}`,
        paid_amount_cents: 10000,
        status: 'paid',
        account_id: manualAcc.id,
        category_id: 'cat-outros-despesa',
        description: `Manual #${i + 1}`,
        source: 'MANUAL',
      }))
    );

    const checking = { ...makePluggyAccounts()[0], balance: 4520.5, itemId: 'item-link' };
    const pgTx: PluggyTransaction = {
      id: 'pg-link-tx-1',
      description: 'Salário',
      currencyCode: 'BRL',
      amount: 2000,
      date: '2026-11-10T12:00:00Z',
      type: 'CREDIT',
      status: 'POSTED',
      accountId: checking.id,
      createdAt: '2026-11-10T12:00:00Z',
      updatedAt: '2026-11-10T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-link' }),
      listAccounts: async () => [checking],
      listTransactions: async () => [pgTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-link', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
      accountChoices: [
        { pluggyAccountId: checking.id, targetLocalAccountId: manualAcc.id },
      ],
    });

    const accounts = await finRepository.listAccounts(true);
    const updatedAcc = accounts.find((a) => a.id === manualAcc.id)!;
    const entries = await finRepository.listAllEntries();
    const calc = calculateAccountBalance(updatedAcc.initial_balance_cents, entries, updatedAcc.id);
    expect(calc).toBe(452050);
    expect(updatedAcc.masked_number).toBe('3456');
  });

  it('S87-T09: cartão com creditLimit 5.000 e availableCreditLimit 3.200 => credit_used_cents 180000 (D18, R11)', async () => {
    await openFinanceRepository.addItem('item-card-limit');
    const card = {
      ...makePluggyAccounts()[1],
      itemId: 'item-card-limit',
      creditData: {
        level: 'Black',
        brand: 'Mastercard',
        balanceCloseDate: '2026-11-10T00:00:00.000Z',
        balanceDueDate: '2026-11-20T00:00:00.000Z',
        creditLimit: 5000,
        availableCreditLimit: 3200,
        minimumPayment: 200,
      },
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-card-limit' }),
      listAccounts: async () => [card],
      listTransactions: async () => [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-card-limit', {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const db = getDatabase();
    const [savedCard] = await db
      .select()
      .from(finAccounts)
      .where(eq(finAccounts.of_account_id, card.id));
    expect((savedCard as any).credit_used_cents).toBe(180000);
  });
});
