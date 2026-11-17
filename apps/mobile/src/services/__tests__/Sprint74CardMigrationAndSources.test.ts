import {
  applySchemaUpgrades,
  getRawSqliteDatabase,
  resetDatabase,
} from '../../db/client';
import { mapPluggyTransaction } from '../../domain/openFinance';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../finService';
import { statementImportService } from '../statementImportService';

describe('Sprint 74 — Migração de cartão e fontes de lançamento (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('S74-T06: applySchemaUpgrades converte lançamentos pending de cartão em paid, preenche bill_month nulo, preserva transfers e é idempotente', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 500000,
    });
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
    });

    const pendingExpense = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 12000,
      due_date: '2026-11-10',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-alimentacao',
      description: 'Restaurante',
      bill_month: null,
    });
    const pendingRefund = await finRepository.createEntry({
      kind: 'income',
      amount_cents: 3000,
      due_date: '2026-11-12',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-outros-receita',
      description: 'Estorno',
      bill_month: null,
    });
    const transferInCard = await finRepository.createEntry({
      kind: 'transfer_in',
      amount_cents: 9000,
      due_date: '2026-12-05',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-outros-receita',
      description: 'Pagamento agendado',
      bill_month: '2026-12',
    });
    const checkingPending = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 25000,
      due_date: '2026-11-20',
      paid_date: null,
      paid_amount_cents: null,
      status: 'pending',
      account_id: checking.id,
      category_id: 'cat-moradia',
      description: 'Luz',
      bill_month: null,
    });

    applySchemaUpgrades(getRawSqliteDatabase());
    // Segunda execução não deve quebrar nem alterar dados já migrados
    applySchemaUpgrades(getRawSqliteDatabase());

    const migratedExpense = await finRepository.getEntryById(pendingExpense.id);
    expect(migratedExpense?.status).toBe('paid');
    expect(migratedExpense?.paid_date).toBe('2026-11-10');
    expect(migratedExpense?.paid_amount_cents).toBe(12000);
    expect(migratedExpense?.bill_month).toBe('2026-12');

    const migratedRefund = await finRepository.getEntryById(pendingRefund.id);
    expect(migratedRefund?.status).toBe('paid');
    expect(migratedRefund?.paid_date).toBe('2026-11-12');
    expect(migratedRefund?.paid_amount_cents).toBe(3000);
    expect(migratedRefund?.bill_month).toBe('2026-12');

    const preservedTransfer = await finRepository.getEntryById(transferInCard.id);
    expect(preservedTransfer?.status).toBe('pending');
    expect(preservedTransfer?.paid_date).toBeNull();

    const preservedChecking = await finRepository.getEntryById(checkingPending.id);
    expect(preservedChecking?.status).toBe('pending');
    expect(preservedChecking?.bill_month).toBeNull();
  });

  test('S74-T07: finService.createInstallmentPurchase em cartão cria parcelas como paid com paid_date = data da compra e faturas consecutivas', async () => {
    const card = await finRepository.createAccount({
      name: 'Itaú Card',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 300000,
    });

    const created = await finService.createInstallmentPurchase({
      kind: 'expense',
      totalAmountCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-10',
      accountId: card.id,
      categoryId: 'cat-compras',
      description: 'Monitor',
    });

    expect(created).toHaveLength(3);
    expect(created.every((e) => e.status === 'paid')).toBe(true);
    expect(created.map((e) => e.paid_date)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(created.map((e) => e.paid_amount_cents)).toEqual([10000, 10000, 10000]);
    expect(created.map((e) => e.bill_month)).toEqual(['2026-12', '2027-01', '2027-02']);
  });

  test('S74-T08: mapPluggyTransaction em cartão força status paid e paidDate = dueDate mesmo para PENDING; checking PENDING continua pending', () => {
    const mappedCardPending = mapPluggyTransaction(
      {
        id: 'tx-card-pending',
        description: 'UBER TRIP',
        amount: 42.5,
        date: '2026-11-10T12:00:00Z',
        type: 'DEBIT',
        status: 'PENDING',
        currencyCode: 'BRL',
        accountId: 'pluggy-card',
        createdAt: '2026-11-10T12:00:00Z',
        updatedAt: '2026-11-10T12:00:00Z',
      },
      {
        accountId: 'acc-card',
        accountType: 'card',
        closingDay: 25,
        dueDay: 5,
      }
    );

    expect(mappedCardPending.kind).toBe('expense');
    expect(mappedCardPending.status).toBe('paid');
    expect(mappedCardPending.dueDate).toBe('2026-11-10');
    expect(mappedCardPending.paidDate).toBe('2026-11-10');
    expect(mappedCardPending.paidAmountCents).toBe(4250);
    expect(mappedCardPending.billMonth).toBe('2026-12');

    const mappedCheckingPending = mapPluggyTransaction(
      {
        id: 'tx-chk-pending',
        description: 'PIX AGENDADO',
        amount: -100,
        date: '2026-11-20T12:00:00Z',
        type: 'DEBIT',
        status: 'PENDING',
        currencyCode: 'BRL',
        accountId: 'pluggy-chk',
        createdAt: '2026-11-20T12:00:00Z',
        updatedAt: '2026-11-20T12:00:00Z',
      },
      {
        accountId: 'acc-chk',
        accountType: 'checking',
      }
    );

    expect(mappedCheckingPending.status).toBe('pending');
    expect(mappedCheckingPending.paidDate).toBeNull();
    expect(mappedCheckingPending.billMonth).toBeNull();
  });

  test('S74-T09: statementImportService.commitImport em cartão grava status paid, paid_date = data da compra e bill_month via normalizeCardEntry', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão Import',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
    });

    await statementImportService.commitImport({
      accountId: card.id,
      rows: [
        {
          externalId: 'imp-1',
          date: '2026-11-10',
          description: 'Mercado',
          amountCents: 18500,
          direction: 'out',
          categoryId: 'cat-alimentacao',
          reconcileStatus: 'new',
          installment: undefined,
        },
        {
          externalId: 'imp-2',
          date: '2026-11-26',
          description: 'Farmácia',
          amountCents: 6500,
          direction: 'out',
          categoryId: 'cat-saude',
          reconcileStatus: 'new',
          installment: undefined,
        },
      ],
    });

    const entries = (await finRepository.listAllEntries()).filter((e) => e.account_id === card.id);
    expect(entries).toHaveLength(2);
    const mercado = entries.find((e) => e.description === 'Mercado');
    const farmacia = entries.find((e) => e.description === 'Farmácia');
    expect(mercado?.status).toBe('paid');
    expect(mercado?.paid_date).toBe('2026-11-10');
    expect(mercado?.bill_month).toBe('2026-12');
    expect(farmacia?.status).toBe('paid');
    expect(farmacia?.paid_date).toBe('2026-11-26');
    expect(farmacia?.bill_month).toBe('2027-01');
  });
});
