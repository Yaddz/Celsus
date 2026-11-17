import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finEntries } from '../../../db/schema';
import {
  collectAppNumbers,
  computePluggyTruth,
  reconcileAppVsPluggy,
} from '../../../domain/openFinance/pluggyTruth';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import type { PluggyClient } from '../pluggyClient';
import { pluggySyncService } from '../pluggySyncService';
import {
  makePluggyAccounts,
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from './pluggyFixtures';
import type { PluggyTransaction } from '../types';

describe('Sprint 100 — Sync: deduplicação sintética, R30 pareamento e reclassificação s100', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S100-T08: pagamento sintético "Pagamento recebido" + pagamento do banco em até 3 dias => fica só o do banco (CARD_PAYMENT_DUPLICATE), idempotente', async () => {
    const itemId = 'item-dup-pay';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });

    const synthTx = makeSprint97RawCardTx({
      id: 'tx-pay-synth',
      accountId: card.id,
      description: 'Pagamento recebido',
      descriptionRaw: 'Pagamento recebido',
      amount: -2900.13,
      type: 'CREDIT',
      status: 'POSTED',
      date: '2026-11-06T00:00:00.000Z',
      operationType: 'PAGAMENTO_FATURA',
    });
    const bankTx = makeSprint97RawCardTx({
      id: 'tx-pay-bank',
      accountId: card.id,
      description: 'Pgto fatura',
      descriptionRaw: 'Pgto fatura',
      amount: -2900.13,
      type: 'CREDIT',
      status: 'POSTED',
      date: '2026-11-07T00:00:00.000Z',
      operationType: 'PAGAMENTO_FATURA',
    });

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [synthTx, bankTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    const db = getDatabase();
    const rows1 = (await db.select().from(finEntries)) as any[];
    const bankRow = rows1.find((r) => r.external_id === 'tx-pay-bank');
    const synthRow = rows1.find((r) => r.external_id === 'tx-pay-synth');
    expect(bankRow.of_removed_at).toBeNull();
    expect(synthRow.of_removed_at).not.toBeNull();
    expect(synthRow.of_class_reason).toBe('CARD_PAYMENT_DUPLICATE');

    await pluggySyncService.syncFinance(itemId, { client });
    const rows2 = (await db.select().from(finEntries)) as any[];
    expect(rows2).toHaveLength(2);
    expect(rows2.find((r) => r.external_id === 'tx-pay-bank')?.of_removed_at).toBeNull();
  });

  it('S100-T09: R30 passo 1 — débito na conta e crédito no cartão de outra conexão => par of-cardpay-*', async () => {
    const itemBank = 'item-bank-r30';
    const itemCard = 'item-card-r30';
    await openFinanceRepository.addItem(itemBank);
    await openFinanceRepository.addItem(itemCard);

    const bankAcc = { ...makePluggyAccounts()[0], id: 'pg-bank-r30', itemId: itemBank };
    const cardAcc = makeSprint97CardAccount7ccce4de({ id: 'pg-card-r30', itemId: itemCard });

    const clientBank = {
      getItem: async () => makePluggyItem({ id: itemBank }),
      listAccounts: async () => [bankAcc],
      listTransactions: async () => [
        {
          id: 'tx-bank-pay-out',
          accountId: bankAcc.id,
          description: 'PAGAMENTO FATURA CARTAO',
          currencyCode: 'BRL',
          amount: -2900.13,
          date: '2026-11-05T12:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2026-11-05T12:00:00.000Z',
          updatedAt: '2026-11-05T12:00:00.000Z',
        } as PluggyTransaction,
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    const clientCard = {
      getItem: async () => makePluggyItem({ id: itemCard }),
      listAccounts: async () => [cardAcc],
      listTransactions: async () => [
        makeSprint97RawCardTx({
          id: 'tx-card-pay-in',
          accountId: cardAcc.id,
          description: 'Pgto fatura',
          amount: -2900.13,
          type: 'CREDIT',
          status: 'POSTED',
          date: '2026-11-06T00:00:00.000Z',
          operationType: 'PAGAMENTO_FATURA',
        }),
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemCard, {
      client: clientCard,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });
    await pluggySyncService.syncFinance(itemBank, {
      client: clientBank,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    const outRow = rows.find((r) => r.external_id === 'tx-bank-pay-out');
    const inRow = rows.find((r) => r.external_id === 'tx-card-pay-in');
    expect(outRow.kind).toBe('transfer_out');
    expect(inRow.kind).toBe('transfer_in');
    expect(outRow.transfer_group_id).toMatch(/^of-cardpay-/);
    expect(outRow.transfer_group_id).toBe(inRow.transfer_group_id);
  });

  it('S100-T10: R30 passo 2 — sem transação no cartão, mas fin_bills.payments_json tem pagamento => transfer_out CARD_BILL_PAYMENT_BILL_MATCH', async () => {
    const itemId = 'item-r30-p2';
    await openFinanceRepository.addItem(itemId);
    const [bankAcc, cardAcc] = makePluggyAccounts();
    const bAcc = { ...bankAcc, itemId };
    const cAcc = { ...cardAcc, itemId };
    const bill = makeSprint97RawBill({
      id: 'bill-p2',
      dueDate: '2026-11-10T00:00:00.000Z',
      totalAmount: 2900.13,
      payments: [
        {
          id: 'p-bill-2',
          paymentDate: '2026-11-06T00:00:00.000Z',
          amount: 2900.13,
          valueType: 'FULL_PAYMENT',
          paymentMode: 'DEBIT_ACCOUNT',
        },
      ],
    });

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [bAcc, cAcc],
      listTransactions: async (accId: string) => {
        if (accId === cAcc.id) return [];
        return [
          {
            id: 'tx-out-p2',
            accountId: bAcc.id,
            description: 'PAGAMENTO FATURA CARTAO',
            currencyCode: 'BRL',
            amount: -2900.13,
            date: '2026-11-05T12:00:00.000Z',
            type: 'DEBIT',
            status: 'POSTED',
            createdAt: '2026-11-05T12:00:00.000Z',
            updatedAt: '2026-11-05T12:00:00.000Z',
          } as PluggyTransaction,
        ];
      },
      listBills: async () => [bill],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const db = getDatabase();
    const row = (
      (await db.select().from(finEntries).where(eq(finEntries.external_id, 'tx-out-p2'))) as any[]
    )[0];
    expect(row.kind).toBe('transfer_out');
    expect(row.of_class_reason).toBe('CARD_BILL_PAYMENT_BILL_MATCH');
  });

  it('S100-T11: R30 passo 3 — nenhum cartão conectado => continua expense CARD_BILL_PAYMENT_UNMATCHED', async () => {
    const itemId = 'item-r30-p3';
    await openFinanceRepository.addItem(itemId);
    const bankAcc = { ...makePluggyAccounts()[0], itemId };

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [bankAcc],
      listTransactions: async () => [
        {
          id: 'tx-out-p3',
          accountId: bankAcc.id,
          description: 'PAGAMENTO FATURA CARTAO',
          currencyCode: 'BRL',
          amount: -850.0,
          date: '2026-11-05T12:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2026-11-05T12:00:00.000Z',
          updatedAt: '2026-11-05T12:00:00.000Z',
        } as PluggyTransaction,
      ],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const db = getDatabase();
    const row = (
      (await db.select().from(finEntries).where(eq(finEntries.external_id, 'tx-out-p3'))) as any[]
    )[0];
    expect(row.kind).toBe('expense');
    expect(row.of_class_reason).toBe('CARD_BILL_PAYMENT_UNMATCHED');
  });

  it('S100-T12: kind editado pelo usuário não é reclassificado nem pareado na migração fin:of:reclassify:s100', async () => {
    const itemId = 'item-s100-edited';
    await openFinanceRepository.addItem(itemId);
    const cardAcc = makeSprint97CardAccount7ccce4de({ itemId });
    const localCard = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: cardAcc.id,
    });

    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 50000,
      due_date: '2026-11-05',
      paid_date: '2026-11-05',
      paid_amount_cents: 50000,
      status: 'paid',
      account_id: localCard.id,
      category_id: 'cat-outros-receita',
      description: 'Pgto fatura',
      user_edited_fields: JSON.stringify(['kind']),
      source: 'OPEN_FINANCE',
      external_id: 'tx-edited-kind',
    });

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [cardAcc],
      listTransactions: async () => [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });
    expect(await appMetaRepository.get('fin:of:reclassify:s100')).toBe('1');

    const db = getDatabase();
    const row = (
      (await db.select().from(finEntries).where(eq(finEntries.external_id, 'tx-edited-kind'))) as any[]
    )[0];
    expect(row.kind).toBe('income');
  });

  it('S100-T14: conferência Pluggy x app para fixture da Sprint 100 tem zero diferenças nas faturas', async () => {
    const itemId = 'item-s100-conf';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const bill = makeSprint97RawBill({
      id: 'bill-s100-nov',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 2900.13,
      payments: [
        {
          id: 'p-s100',
          paymentDate: '2026-11-06T00:00:00.000Z',
          amount: 2900.13,
          valueType: 'FULL_PAYMENT',
          paymentMode: 'DEBIT_ACCOUNT',
        },
      ],
    });
    const txs = [
      makeSprint97RawCardTx({
        id: 'tx-s100-compra',
        accountId: card.id,
        amount: 2900.13,
        type: 'DEBIT',
        status: 'POSTED',
        creditCardMetadata: { billId: bill.id, billForecastDate: '2026-11' },
      }),
      makeSprint97RawCardTx({
        id: 'tx-s100-pgto',
        accountId: card.id,
        description: 'Pgto fatura',
        descriptionRaw: 'Pgto fatura',
        amount: -2900.13,
        type: 'CREDIT',
        status: 'POSTED',
        date: '2026-11-06T00:00:00.000Z',
        operationType: null,
        creditCardMetadata: null,
      }),
    ];

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => txs,
      listBills: async () => [bill],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const entries = await finRepository.listAllEntries();
    const bills = await finRepository.listAllBills();

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: itemId }),
        accounts: [card],
        transactionsByAccount: { [card.id]: txs },
        billsByAccount: { [card.id]: [bill] },
      },
      '2026-11-17'
    );
    const appNums = collectAppNumbers({
      accounts,
      entries,
      bills,
      todayIso: '2026-11-17',
    });

    expect(reconcileAppVsPluggy(truth, appNums)).toEqual([]);
  });
});
