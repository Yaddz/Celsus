import { toBrtDate, toBrtMonth } from '../dates';
import {
  computePluggyTruth,
  reconcileAppVsPluggy,
  type AppNumbersResult,
  type PluggyTruthSnapshot,
} from '../pluggyTruth';
import { calculateMonthlySummary, summarizeBill } from '../../financeFlow';
import type { FinEntry } from '../../../db/schema';
import {
  makePluggyAccounts,
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from '../../../services/pluggy/__tests__/pluggyFixtures';
import type { PluggyAccount, PluggyTransaction } from '../../../services/pluggy/types';

function makeCheckingTx(overrides: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id: 'tx-chk-default',
    accountId: 'acc-checking-1',
    description: 'Pix recebido',
    descriptionRaw: 'Pix recebido',
    currencyCode: 'BRL',
    amount: 100,
    amountInAccountCurrency: null,
    date: '2026-11-10T12:00:00.000Z',
    type: 'CREDIT',
    balance: null,
    providerCode: null,
    providerId: null,
    status: 'POSTED',
    category: 'Transfers',
    categoryId: '05000000',
    operationType: 'PIX',
    operationTypeAdditionalInfo: null,
    paymentData: null,
    merchant: null,
    creditCardMetadata: null,
    order: 0,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('Sprint 97 — toBrtDate, computePluggyTruth e reconcileAppVsPluggy', () => {
  it('S97-T01: toBrtDate e toBrtMonth convertem timestamps UTC mantendo datas puras intactas', () => {
    expect(toBrtDate('2026-11-15T00:00:00.000Z')).toBe('2026-11-15');
    expect(toBrtDate('2026-11-15T01:30:00.000Z')).toBe('2026-11-14');
    expect(toBrtDate('2026-11-01T02:59:59.000Z')).toBe('2026-10-31');
    expect(toBrtMonth('2026-11-01T02:59:59.000Z')).toBe('2026-10');
    expect(toBrtDate('2026-11-15')).toBe('2026-11-15');
  });

  it('S97-T05: computePluggyTruth extrai limites e saldo usado do cartão 7ccce4de', () => {
    const card = makeSprint97CardAccount7ccce4de();
    const snapshot: PluggyTruthSnapshot = {
      item: makePluggyItem({ id: 'item-7ccce4de' }),
      accounts: [card],
      transactionsByAccount: { [card.id]: [] },
      billsByAccount: { [card.id]: [] },
    };

    const truth = computePluggyTruth(snapshot, '2026-11-17');
    const cardTruth = truth.cardAccounts[card.id];
    expect(cardTruth).toBeDefined();
    expect(cardTruth.limitCents).toBe(1441023);
    expect(cardTruth.availableCents).toBe(361621);
    expect(cardTruth.usedCents).toBe(1079402);
  });

  it('S97-T06: computePluggyTruth compara soma dos itens da fatura com totalAmount e calcula itemsVsTotalDiffCents', () => {
    const card = makeSprint97CardAccount7ccce4de();
    const bill = makeSprint97RawBill({
      id: 'bill-closed-1',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 140.25,
    });
    const txs: PluggyTransaction[] = [
      makeSprint97RawCardTx({
        id: 'tx-b-1',
        amount: 100.0,
        type: 'DEBIT',
        status: 'POSTED',
        creditCardMetadata: { billId: bill.id },
      }),
      makeSprint97RawCardTx({
        id: 'tx-b-2',
        amount: 50.25,
        type: 'DEBIT',
        status: 'POSTED',
        creditCardMetadata: { billId: bill.id },
      }),
      makeSprint97RawCardTx({
        id: 'tx-b-3',
        amount: -10.0,
        type: 'CREDIT',
        operationType: 'ESTORNO',
        status: 'POSTED',
        creditCardMetadata: { billId: bill.id },
      }),
    ];

    const truthExact = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: { [card.id]: txs },
        billsByAccount: { [card.id]: [bill] },
      },
      '2026-11-17'
    );
    expect(truthExact.cardAccounts[card.id].closedBills[0].totalCents).toBe(14025);
    expect(truthExact.cardAccounts[card.id].closedBills[0].itemsCents).toBe(14025);
    expect(truthExact.cardAccounts[card.id].closedBills[0].itemsVsTotalDiffCents).toBe(0);

    const truthMissing = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: { [card.id]: txs.slice(0, 2) },
        billsByAccount: { [card.id]: [bill] },
      },
      '2026-11-17'
    );
    // 100 + 50.25 = 150.25 vs 140.25 -> +1000; or if missing +10 -> let's test missing 10.00 item (tx-b-2 = 40.25? No, S97-T06 says: 100 + 50.25 - 10 = 140.25; com uma transação faltando => -1000)
    // Wait: if the missing transaction is +10.00 (say bill total 140.25 = 100 + 30.25 + 10, missing 10 => items 130.25, diff -1000).
    // Let's test both: missing a 10.00 purchase gives itemsVsTotalDiffCents = -1000!
    const billMissingPurchase = makeSprint97RawBill({
      id: 'bill-closed-2',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 140.25,
    });
    const truthMissing10 = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: {
          [card.id]: [
            makeSprint97RawCardTx({
              id: 'tx-m-1',
              amount: 100.0,
              type: 'DEBIT',
              status: 'POSTED',
              creditCardMetadata: { billId: billMissingPurchase.id },
            }),
            makeSprint97RawCardTx({
              id: 'tx-m-2',
              amount: 30.25,
              type: 'DEBIT',
              status: 'POSTED',
              creditCardMetadata: { billId: billMissingPurchase.id },
            }),
          ],
        },
        billsByAccount: { [card.id]: [billMissingPurchase] },
      },
      '2026-11-17'
    );
    expect(truthMissing10.cardAccounts[card.id].closedBills[0].itemsVsTotalDiffCents).toBe(-1000);
    expect(truthMissing.cardAccounts[card.id].closedBills[0].itemsVsTotalDiffCents).toBe(1000);
  });

  it('S97-T07: conta bancária separa POSTED por mês BRT de PENDING futuro em scheduled.toPayCents', () => {
    const [checking] = makePluggyAccounts();
    const txs: PluggyTransaction[] = [
      makeCheckingTx({ id: 't1', amount: 5000, type: 'CREDIT', status: 'POSTED', date: '2026-11-05T12:00:00.000Z' }),
      makeCheckingTx({ id: 't2', amount: -33, type: 'DEBIT', status: 'POSTED', date: '2026-11-06T12:00:00.000Z' }),
      makeCheckingTx({ id: 't3', amount: 33, type: 'CREDIT', status: 'POSTED', date: '2026-11-07T12:00:00.000Z' }),
      makeCheckingTx({ id: 't4', amount: -1200.5, type: 'DEBIT', status: 'POSTED', date: '2026-11-08T12:00:00.000Z' }),
      makeCheckingTx({ id: 't5', amount: -300, type: 'DEBIT', status: 'PENDING', date: '2026-11-25T12:00:00.000Z' }),
    ];

    const truth = computePluggyTruth(
      {
        item: makePluggyItem(),
        accounts: [checking],
        transactionsByAccount: { [checking.id]: txs },
        billsByAccount: {},
      },
      '2026-11-17'
    );

    const bankTruth = truth.bankAccounts[checking.id];
    expect(bankTruth.monthlyFlows['2026-11'].inflowCents).toBe(503300);
    expect(bankTruth.monthlyFlows['2026-11'].outflowCents).toBe(123350);
    expect(bankTruth.scheduled.toPayCents).toBe(30000);
    expect(bankTruth.monthlyFlows['2026-11'].count).toBe(4);
  });

  it('S97-T08: reconcileAppVsPluggy detecta APP_RECOMPUTED e retorna lista vazia quando valores batem', () => {
    const card = makeSprint97CardAccount7ccce4de({
      creditData: {
        creditLimit: 14410.23,
        availableCreditLimit: 3616.21,
      },
      balance: 10794.02,
    });
    const bill = makeSprint97RawBill({
      id: 'bill-nov',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 2900.13,
      payments: [
        {
          id: 'pay-nov',
          valueType: 'FULL_PAYMENT',
          paymentDate: '2026-11-06T00:00:00.000Z',
          paymentMode: 'DEBIT_ACCOUNT',
          amount: 2900.13,
          currencyCode: 'BRL',
        },
      ],
    });
    const txs = [
      makeSprint97RawCardTx({
        id: 'tx-match',
        amount: 2900.13,
        type: 'DEBIT',
        status: 'POSTED',
        creditCardMetadata: { billId: bill.id },
      }),
    ];

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: { [card.id]: txs },
        billsByAccount: { [card.id]: [bill] },
      },
      '2026-11-17'
    );

    const appNumbersMismatch: AppNumbersResult = {
      bankBalancesByOfAccountId: {},
      cardsByOfAccountId: {
        [card.id]: {
          usedCents: 1079402,
          availableCents: 361621,
          openBillCents: 0,
          closedBillsByMonth: {
            '2026-11': {
              billMonth: '2026-11',
              totalCents: 0,
              paidCents: 290013,
              status: 'paga',
            },
          },
        },
      },
    };

    const diffs = reconcileAppVsPluggy(truth, appNumbersMismatch);
    const billDiff = diffs.find((d) => d.scope === 'BILL' && d.reason === 'APP_RECOMPUTED');
    expect(billDiff).toBeDefined();
    expect(billDiff?.diffCents).toBe(-290013);

    const appNumbersExact: AppNumbersResult = {
      bankBalancesByOfAccountId: {},
      cardsByOfAccountId: {
        [card.id]: {
          usedCents: 1079402,
          availableCents: 361621,
          openBillCents: 0,
          closedBillsByMonth: {
            '2026-11': {
              billMonth: '2026-11',
              totalCents: 290013,
              paidCents: 290013,
              status: truth.cardAccounts[card.id].closedBills[0].status,
            },
          },
        },
      },
    };
    expect(reconcileAppVsPluggy(truth, appNumbersExact)).toEqual([]);
  });

  it('S97-T09: SIGN_MISMATCH detectado quando transação de conta tem type CREDIT com amount negativo', () => {
    const [checking] = makePluggyAccounts();
    const txMismatch = makeCheckingTx({
      id: 'tx-sign-mismatch',
      type: 'CREDIT',
      amount: -10,
      status: 'POSTED',
    });

    const truth = computePluggyTruth(
      {
        item: makePluggyItem(),
        accounts: [checking],
        transactionsByAccount: { [checking.id]: [txMismatch] },
        billsByAccount: {},
      },
      '2026-11-17'
    );

    expect(truth.signMismatches).toHaveLength(1);
    expect(truth.signMismatches[0].txId).toBe('tx-sign-mismatch');

    const appNumbers: AppNumbersResult = {
      bankBalancesByOfAccountId: { [checking.id]: 452050 },
      cardsByOfAccountId: {},
    };
    const diffs = reconcileAppVsPluggy(truth, appNumbers);
    expect(diffs.some((d) => d.reason === 'SIGN_MISMATCH')).toBe(true);
  });

  it('S97-T12: regressão — calculateMonthlySummary e summarizeBill preservam resultados exatamente iguais', () => {
    const entries: FinEntry[] = [
      {
        id: 'e1',
        kind: 'expense',
        amount_cents: 15000,
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        paid_amount_cents: 15000,
        status: 'paid',
        account_id: 'acc-card',
        category_id: 'cat-alimentacao',
        description: 'Restaurante',
        recurrence_id: null,
        recurrence_period: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
        bill_month: '2026-11',
        transfer_group_id: null,
        source: 'OPEN_FINANCE',
        external_id: 'tx-1',
        import_batch_id: null,
        description_raw: null,
        user_edited_fields: null,
        linked_income_id: null,
        of_removed_at: null,
        of_category_id: null,
        of_class_reason: null,
        created_at: '2026-11-05T12:00:00.000Z',
      },
      {
        id: 'e2',
        kind: 'income',
        amount_cents: 500000,
        due_date: '2026-11-01',
        paid_date: '2026-11-01',
        paid_amount_cents: 500000,
        status: 'paid',
        account_id: 'acc-bank',
        category_id: 'cat-salario',
        description: 'Salário',
        recurrence_id: null,
        recurrence_period: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
        bill_month: null,
        transfer_group_id: null,
        source: 'OPEN_FINANCE',
        external_id: 'tx-2',
        import_batch_id: null,
        description_raw: null,
        user_edited_fields: null,
        linked_income_id: null,
        of_removed_at: null,
        of_category_id: null,
        of_class_reason: null,
        created_at: '2026-11-01T12:00:00.000Z',
      },
    ];

    const monthly = calculateMonthlySummary(entries, '2026-11');
    expect(monthly.totalIncomeCents).toBe(500000);
    expect(monthly.totalExpenseCents).toBe(15000);
    expect(monthly.balanceCents).toBe(485000);

    const bill = summarizeBill(entries, '2026-11', {
      dueDate: '2026-11-10',
      todayIso: '2026-11-17',
      closingDay: 1,
    });
    expect(bill.totalCents).toBe(15000);
    expect(bill.paidCents).toBe(0);
    expect(bill.openCents).toBe(15000);
    expect(bill.status).toBe('atrasada');
  });

  it('S97-T13: totais "como o Meu Pluggy" batem com os números reais do plano §2.2', () => {
    const bankAccounts: PluggyAccount[] = [
      { ...makePluggyAccounts()[0], id: 'b1', balance: 0 },
      { ...makePluggyAccounts()[0], id: 'b2', balance: 0 },
      { ...makePluggyAccounts()[0], id: 'b3', balance: 60.51 },
      { ...makePluggyAccounts()[0], id: 'b4', balance: 14.25 },
      { ...makePluggyAccounts()[0], id: 'b5', balance: 0.34 },
    ];
    const cardNubank = makeSprint97CardAccount7ccce4de({
      id: 'c1',
      balance: 539.62,
      creditData: { creditLimit: 9700, availableCreditLimit: 9160.38 },
    });
    const cardXp = makeSprint97CardAccount7ccce4de({
      id: 'c2',
      balance: 10794.02,
      creditData: { creditLimit: 14410.23, availableCreditLimit: 3616.21 },
    });

    const pendingCardTx1 = makeSprint97RawCardTx({
      id: 'p1',
      accountId: 'c2',
      status: 'PENDING',
      type: 'DEBIT',
      amount: 279.55,
      category: 'Groceries',
    });
    const pendingBankTx = makeCheckingTx({
      id: 'p2',
      accountId: 'b3',
      status: 'PENDING',
      type: 'DEBIT',
      amount: -120.0,
      category: 'Services',
    });

    const truth = computePluggyTruth(
      {
        item: makePluggyItem(),
        accounts: [...bankAccounts, cardNubank, cardXp],
        transactionsByAccount: {
          b1: [],
          b2: [],
          b3: [pendingBankTx],
          b4: [],
          b5: [],
          c1: [],
          c2: [pendingCardTx1],
        },
        billsByAccount: { c1: [], c2: [] },
        investments: [
          {
            id: 'inv-1',
            itemId: 'item-1',
            type: 'EQUITY',
            subtype: 'STOCK',
            balance: 8815.84,
            name: 'Ações',
            currencyCode: 'BRL',
            status: 'ACTIVE',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
          {
            id: 'inv-2',
            itemId: 'item-1',
            type: 'MUTUAL_FUND',
            subtype: 'INVESTMENT_FUND',
            balance: 282.37,
            name: 'Fundo',
            currencyCode: 'BRL',
            status: 'ACTIVE',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
          {
            id: 'inv-withdrawn',
            itemId: 'item-1',
            type: 'EQUITY',
            subtype: 'REAL_ESTATE_FUND',
            balance: 999.99,
            name: 'Recibo encerrado',
            currencyCode: 'BRL',
            status: 'TOTAL_WITHDRAWAL',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-11-17T00:00:00.000Z',
          },
        ],
      },
      '2026-11-17'
    );

    expect(truth.totals.bankTotalCents).toBe(7510);
    expect(truth.totals.cardsDebtCents).toBe(1133364);
    expect(truth.totals.cardsLimitCents).toBe(2411023);
    expect(truth.totals.cardsUsagePct).toBe(47);
    expect(truth.totals.pendingOutflowCents).toBe(39955);
    expect(truth.totals.investmentsCents).toBe(909821);
  });
});
