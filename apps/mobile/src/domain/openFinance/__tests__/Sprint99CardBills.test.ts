import type { FinAccount, FinBill, FinEntry } from '../../../db/schema';
import {
  detectOverdueAndDueSoonWithBills,
  projectCashflow,
  resolveBillMonth,
} from '../../financeFlow';
import {
  assignBillMonth,
  assignPaymentBillMonth,
  deriveCardCalendar,
  inferForecastOffset,
  summarizeOpenFinanceBill,
} from '../cardBills';
import {
  collectAppNumbers,
  computePluggyTruth,
  reconcileAppVsPluggy,
} from '../pluggyTruth';
import {
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from '../../../services/pluggy/__tests__/pluggyFixtures';
import type { PluggyBill, PluggyTransaction } from '../../../services/pluggy/types';

function makeFinBill(overrides: Partial<FinBill> = {}): FinBill {
  return {
    id: 'fin-bill-1',
    account_id: 'acc-card-1',
    external_id: 'bill-ext-1',
    bill_month: '2026-11',
    closing_date: '2026-11-03',
    due_date: '2026-11-10',
    total_amount_cents: 50000,
    minimum_payment_cents: 7500,
    payments_json: null,
    payments_total_cents: null,
    finance_charges_json: null,
    chargeable_charges_cents: 0,
    allows_installments: 1,
    created_at: '2026-11-03T12:00:00.000Z',
    updated_at: '2026-11-03T12:00:00.000Z',
    ...overrides,
  };
}

function makeFinEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: 'ent-1',
    kind: 'expense',
    amount_cents: 10000,
    due_date: '2026-11-01',
    paid_date: '2026-11-01',
    paid_amount_cents: 10000,
    status: 'paid',
    account_id: 'acc-card-1',
    category_id: 'cat-compras',
    description: 'Compra',
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
    description_raw: 'COMPRA',
    user_edited_fields: null,
    linked_income_id: null,
    of_removed_at: null,
    of_category_id: null,
    of_class_reason: null,
    of_provider_id: null,
    of_bill_id: null,
    of_bill_forecast_month: null,
    of_bill_post_date: null,
    of_operation_type: null,
    of_raw_status: null,
    of_raw_type: null,
    of_raw_amount_cents: null,
    of_created_at: null,
    of_installment_number: null,
    of_installment_total: null,
    of_bill_month_source: null,
    created_at: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeCardAccount(overrides: Partial<FinAccount> = {}): FinAccount {
  return {
    id: 'acc-card-1',
    name: 'Cartão XP',
    type: 'card',
    initial_balance_cents: 0,
    color: '#000',
    archived: 0,
    closing_day: 3,
    due_day: 10,
    credit_limit_cents: 1441023,
    of_account_id: 'acc-xp-card-7ccce4de',
    source: 'OPEN_FINANCE',
    reported_balance_cents: 1079402,
    reported_balance_at: '2026-11-17T09:00:00.000Z',
    masked_number: '8297',
    owner: null,
    auto_name: 'Cartão XP',
    of_linked_at: '2025-11-01T00:00:00.000Z',
    closing_balance_cents: null,
    auto_invested_cents: null,
    credit_used_cents: 1079402,
    of_available_limit_cents: 361621,
    of_minimum_payment_cents: null,
    of_balance_due_date: '2026-12-10',
    of_overdraft_used_cents: null,
    of_reserved_cents: null,
    calendar_source: 'PLUGGY_BILLS',
    created_at: '2025-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Sprint 99 — Faturas do cartão pela Pluggy (R25, R26, R27, R28)', () => {
  it('S99-T01: assignBillMonth com billId retorna mês do dueDate da fatura e source BILL_ID', () => {
    const bill = makeSprint97RawBill({
      id: 'bill-nov',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
    });
    const tx = makeSprint97RawCardTx({
      creditCardMetadata: { billId: 'bill-nov', billForecastDate: '2026-10' },
    });

    const res = assignBillMonth(tx, { bills: [bill], closingDay: 3, dueDay: 10 });
    expect(res).toEqual({ billMonth: '2026-11', source: 'BILL_ID' });
  });

  it('S99-T02: inferForecastOffset infere 0 quando casa com dueDate, +1 quando casa com closingDate, e 0 com < 5 amostras', () => {
    const bill = makeSprint97RawBill({
      id: 'bill-offset',
      billClosingDate: '2026-10-28T00:00:00.000Z',
      dueDate: '2026-11-05T00:00:00.000Z',
    });

    const sixDue = Array.from({ length: 6 }, (_, i) =>
      makeSprint97RawCardTx({
        id: `tx-due-${i}`,
        creditCardMetadata: { billId: bill.id, billForecastDate: '2026-11' },
      })
    );
    expect(inferForecastOffset(sixDue, [bill])).toBe(0);

    const sixClosing = Array.from({ length: 6 }, (_, i) =>
      makeSprint97RawCardTx({
        id: `tx-close-${i}`,
        creditCardMetadata: { billId: bill.id, billForecastDate: '2026-10' },
      })
    );
    expect(inferForecastOffset(sixClosing, [bill])).toBe(1);

    expect(inferForecastOffset(sixClosing.slice(0, 3), [bill])).toBe(0);
  });

  it('S99-T03: assignBillMonth sem billId e com billForecastDate 2026-12 (offset 0) => 2026-12, source FORECAST', () => {
    const tx = makeSprint97RawCardTx({
      creditCardMetadata: { billId: null, billForecastDate: '2026-12' },
    });
    const res = assignBillMonth(tx, { bills: [], closingDay: 3, dueDay: 10, forecastOffset: 0 });
    expect(res).toEqual({ billMonth: '2026-12', source: 'FORECAST' });
  });

  it('S99-T04: sem billId e sem forecast, com billPostDate 2026-12-13 e calendário 3/10 => 2027-01, source POST_DATE', () => {
    const tx = makeSprint97RawCardTx({
      date: '2026-12-01T00:00:00.000Z',
      creditCardMetadata: { billId: null, billForecastDate: null, billPostDate: '2026-12-13' },
    });
    const res = assignBillMonth(tx, { bills: [], closingDay: 3, dueDay: 10 });
    expect(res).toEqual({ billMonth: '2027-01', source: 'POST_DATE' });
  });

  it('S99-T05: deriveCardCalendar extrai closingDay/dueDay das faturas, usa mediana sem billClosingDate e retorna null sem faturas', () => {
    const bills: PluggyBill[] = [
      makeSprint97RawBill({
        id: 'b1',
        dueDate: '2026-10-10T00:00:00.000Z',
        billClosingDate: '2026-10-03T00:00:00.000Z',
      }),
      makeSprint97RawBill({
        id: 'b2',
        dueDate: '2026-11-10T00:00:00.000Z',
        billClosingDate: '2026-11-03T00:00:00.000Z',
      }),
    ];
    expect(deriveCardCalendar(bills)).toEqual({ closingDay: 3, dueDay: 10 });

    const billsNoClose = bills.map((b) => ({ ...b, billClosingDate: null }));
    expect(deriveCardCalendar(billsNoClose)).toEqual({ closingDay: 3, dueDay: 10 });
    expect(deriveCardCalendar([])).toBeNull();
  });

  it('S99-T06: D28 — compra de 2026-11-02 cai em 2026-12 no padrão 1/10 e em 2026-11 com calendário 3/10', () => {
    expect(resolveBillMonth('2026-11-02', 1, 10)).toBe('2026-12');
    const tx = makeSprint97RawCardTx({
      date: '2026-11-02T00:00:00.000Z',
      creditCardMetadata: null,
    });
    const res = assignBillMonth(tx, { bills: [], closingDay: 3, dueDay: 10 });
    expect(res).toEqual({ billMonth: '2026-11', source: 'CALENDAR' });
  });

  it('S99-T07: R27 (pagamento na fatura seguinte) — paga, parcial e atrasada', () => {
    const billN = makeFinBill({
      id: 'bill-n',
      bill_month: '2026-10',
      closing_date: '2026-10-03',
      due_date: '2026-10-10',
      total_amount_cents: 50000,
    });
    const billN1Paid = makeFinBill({
      id: 'bill-n1',
      bill_month: '2026-11',
      closing_date: '2026-11-03',
      due_date: '2026-11-10',
      total_amount_cents: 20000,
      chargeable_charges_cents: 701,
      payments_json: JSON.stringify([
        { id: 'p1', paymentDate: '2026-10-10T00:00:00.000Z', amount: 507.01, valueType: 'FULL_PAYMENT', paymentMode: 'DEBIT_ACCOUNT' },
      ]),
      payments_total_cents: 50701,
    });

    const paid = summarizeOpenFinanceBill(billN, billN1Paid, [], '2026-11-17');
    expect(paid.status).toBe('paga');
    expect(paid.paidSource).toBe('NEXT_BILL_PAYMENTS');
    expect(paid.paidCents).toBe(50701);

    const billN1Partial = {
      ...billN1Paid,
      payments_json: JSON.stringify([
        { id: 'p1', paymentDate: '2026-10-08T00:00:00.000Z', amount: 400.0, valueType: 'OTHER_PAYMENT', paymentMode: 'PIX' },
      ]),
      payments_total_cents: 40000,
    };
    const parcial = summarizeOpenFinanceBill(billN, billN1Partial, [], '2026-10-09');
    expect(parcial.status).toBe('parcial');
    const atrasada = summarizeOpenFinanceBill(billN, billN1Partial, [], '2026-10-15');
    expect(atrasada.status).toBe('atrasada');
  });

  it('S99-T08: R27 (pagamento na própria fatura mais recente) — SAME_BILL_PAYMENTS', () => {
    const billRecent = makeFinBill({
      id: 'bill-nov',
      bill_month: '2026-11',
      closing_date: '2026-11-03',
      due_date: '2026-11-10',
      total_amount_cents: 290013,
      payments_json: JSON.stringify([
        { id: 'p-same', paymentDate: '2026-11-06T00:00:00.000Z', amount: 2900.13, valueType: 'FULL_PAYMENT', paymentMode: 'DEBIT_ACCOUNT' },
      ]),
      payments_total_cents: 290013,
    });

    const summary = summarizeOpenFinanceBill(billRecent, null, [], '2026-11-17');
    expect(summary.status).toBe('paga');
    expect(summary.paidSource).toBe('SAME_BILL_PAYMENTS');
    expect(summary.paidCents).toBe(290013);
  });

  it('S99-T11: R25/R28 — parcelas futuras Panini 6/12..12/12 somam 59.22 fora da fatura atual', () => {
    const card = makeSprint97CardAccount7ccce4de();
    const closedBill = makeSprint97RawBill({
      id: 'bill-nov',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
    });
    const futureTxs: PluggyTransaction[] = Array.from({ length: 7 }, (_, idx) => {
      const m = 12 + idx;
      const year = m > 12 ? 2027 : 2026;
      const month = m > 12 ? m - 12 : m;
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      return makeSprint97RawCardTx({
        id: `panini-${idx + 6}`,
        accountId: card.id,
        description: `Panini Brasil Ltda ${idx + 6}/12`,
        amount: 8.46,
        date: `${ym}-13T00:00:00.000Z`,
        status: 'PENDING',
        creditCardMetadata: {
          billId: null,
          billForecastDate: ym,
          installmentNumber: idx + 6,
          totalInstallments: 12,
        },
      });
    });

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: { [card.id]: futureTxs },
        billsByAccount: { [card.id]: [closedBill] },
      },
      '2026-11-17'
    );

    expect(truth.cardAccounts[card.id].openBill).toBe(0);
    const futureSum = truth.cardAccounts[card.id].futureBills.reduce(
      (s, b) => s + b.totalCents,
      0
    );
    expect(futureSum).toBe(5922);
  });

  it('S99-T12: projectCashflow usa total - pago da fin_bill fechada no vencimento', () => {
    const card = makeCardAccount({ id: 'acc-card-cf', closing_day: 18, due_day: 25 });
    const bank: FinAccount = {
      ...card,
      id: 'acc-bank-cf',
      type: 'checking',
      initial_balance_cents: 500000,
      reported_balance_cents: 500000,
      closing_day: null,
      due_day: null,
      credit_limit_cents: null,
      credit_used_cents: null,
      of_available_limit_cents: null,
      of_balance_due_date: null,
    };
    const bill = makeFinBill({
      id: 'bill-cf-1',
      account_id: card.id,
      bill_month: '2026-11',
      closing_date: '2026-11-18',
      due_date: '2026-11-25',
      total_amount_cents: 125035,
    });
    const entry = makeFinEntry({
      account_id: card.id,
      due_date: '2026-11-05',
      amount_cents: 100000,
      paid_amount_cents: 100000,
      bill_month: '2026-11',
    });

    const projection = projectCashflow([bank, card], [entry], '2026-11-17', '2026-11-30', {
      bills: [bill],
    });
    const onDue = projection.find((p) => p.date === '2026-11-25');
    expect(onDue).toBeDefined();
    expect(onDue?.deltaCents).toBe(-125035);
    const onPurchase = projection.find((p) => p.date === '2026-11-05');
    expect(onPurchase).toBeUndefined();
  });

  it('S99-T14: conferência Pluggy x app sem diferença em faturas fechadas, limite usado/disponível e openBill', () => {
    const rawCard = makeSprint97CardAccount7ccce4de();
    const rawBill = makeSprint97RawBill({
      id: 'bill-conf-1',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 2900.13,
      payments: [
        {
          id: 'p1',
          paymentDate: '2026-11-06T00:00:00.000Z',
          amount: 2900.13,
          valueType: 'FULL_PAYMENT',
          paymentMode: 'DEBIT_ACCOUNT',
        },
      ],
    });
    const rawTx = makeSprint97RawCardTx({
      id: 'tx-conf-1',
      accountId: rawCard.id,
      amount: 2900.13,
      type: 'DEBIT',
      status: 'POSTED',
      creditCardMetadata: { billId: rawBill.id, billForecastDate: '2026-11' },
    });

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [rawCard],
        transactionsByAccount: { [rawCard.id]: [rawTx] },
        billsByAccount: { [rawCard.id]: [rawBill] },
      },
      '2026-11-17'
    );

    const localCard = makeCardAccount({ of_account_id: rawCard.id });
    const localBill = makeFinBill({
      account_id: localCard.id,
      external_id: rawBill.id,
      bill_month: '2026-11',
      closing_date: '2026-11-03',
      due_date: '2026-11-10',
      total_amount_cents: 290013,
      payments_json: JSON.stringify(rawBill.payments),
      payments_total_cents: 290013,
    });
    const localEntry = makeFinEntry({
      account_id: localCard.id,
      amount_cents: 290013,
      paid_amount_cents: 290013,
      bill_month: '2026-11',
    });

    const appNums = collectAppNumbers({
      accounts: [localCard],
      entries: [localEntry],
      bills: [localBill],
      todayIso: '2026-11-17',
    });
    expect(reconcileAppVsPluggy(truth, appNums)).toEqual([]);
  });

  it('S99-T15: D38 — faturas antigas pagas (ou sem dados antes da 1ª sync) ficam fora de Atrasadas no Resumo', () => {
    const card = makeCardAccount({ id: 'acc-d38', of_linked_at: '2026-10-01T00:00:00.000Z' });
    const totals = [60400, 60934, 76656, 22240, 16491, 28315, 101453, 98120];
    const bills: FinBill[] = totals.map((tot, idx) => {
      const m = idx + 1;
      const ym = `2026-${String(m).padStart(2, '0')}`;
      const prevPayments =
        idx > 0
          ? JSON.stringify([
              { id: `p-${idx}`, paymentDate: `${ym}-10T00:00:00.000Z`, amount: totals[idx - 1] / 100 },
            ])
          : null;
      return makeFinBill({
        id: `b-d38-${m}`,
        account_id: card.id,
        bill_month: ym,
        closing_date: `${ym}-03`,
        due_date: `${ym}-10`,
        total_amount_cents: tot,
        payments_json: prevPayments,
        payments_total_cents: idx > 0 ? totals[idx - 1] : null,
      });
    });
    // Fatura seguinte (set/2026) paga a de ago/2026
    bills.push(
      makeFinBill({
        id: 'b-d38-9',
        account_id: card.id,
        bill_month: '2026-09',
        closing_date: '2026-09-03',
        due_date: '2026-09-10',
        total_amount_cents: 10000,
        payments_json: JSON.stringify([
          { id: 'p-8', paymentDate: '2026-09-10T00:00:00.000Z', amount: totals[7] / 100 },
        ]),
        payments_total_cents: totals[7],
      })
    );
    // Fatura 10 (out/2026) paga a de set/2026
    bills.push(
      makeFinBill({
        id: 'b-d38-10',
        account_id: card.id,
        bill_month: '2026-10',
        closing_date: '2026-10-03',
        due_date: '2026-10-10',
        total_amount_cents: 0,
        payments_json: JSON.stringify([
          { id: 'p-9', paymentDate: '2026-10-10T00:00:00.000Z', amount: 100 },
        ]),
        payments_total_cents: 10000,
      })
    );

    const entries = totals.map((tot, idx) =>
      makeFinEntry({
        id: `e-d38-${idx}`,
        account_id: card.id,
        amount_cents: tot,
        paid_amount_cents: tot,
        due_date: `2026-${String(idx + 1).padStart(2, '0')}-01`,
        bill_month: `2026-${String(idx + 1).padStart(2, '0')}`,
      })
    );

    const resPaid = detectOverdueAndDueSoonWithBills(entries, [card], '2026-11-17', 7, { bills });
    expect(resPaid.overdueBills).toHaveLength(0);
    expect(resPaid.overdueTotalCents).toBe(0);

    // Mesmas faturas sem nenhuma fonte de pagamento e vencimento anterior à 1ª sync
    const billsNoPay = bills.slice(0, 8).map((b) => ({
      ...b,
      payments_json: null,
      payments_total_cents: null,
    }));
    const sNoPay = summarizeOpenFinanceBill(billsNoPay[0], billsNoPay[1], [], '2026-11-17', {
      firstSyncIso: '2026-10-01',
    });
    expect(sNoPay.status).toBe('sem dados de pagamento');
    const resNoPay = detectOverdueAndDueSoonWithBills(entries, [card], '2026-11-17', 7, {
      bills: billsNoPay,
    });
    expect(resNoPay.overdueBills).toHaveLength(0);
  });

  it('S99-T16: D39 — pagamento de 06/11 vai só para fatura N (nov) e nunca conta na fatura de dezembro', () => {
    const bills = [
      { bill_month: '2026-11', closing_date: '2026-11-03', due_date: '2026-11-10' },
      { bill_month: '2026-12', closing_date: '2026-12-03', due_date: '2026-12-10' },
    ];
    expect(assignPaymentBillMonth('2026-11-06', bills)).toBe('2026-11');

    const billNov = makeFinBill({
      id: 'b-nov',
      bill_month: '2026-11',
      closing_date: '2026-11-03',
      due_date: '2026-11-10',
      total_amount_cents: 290013,
      payments_json: JSON.stringify([
        { id: 'p-nov', paymentDate: '2026-11-06T00:00:00.000Z', amount: 2900.13 },
      ]),
      payments_total_cents: 290013,
    });
    const payEntry = makeFinEntry({
      id: 'e-pay',
      kind: 'transfer_in',
      amount_cents: 290013,
      paid_amount_cents: 290013,
      due_date: '2026-11-06',
      bill_month: '2026-11',
      of_class_reason: 'CARD_BILL_PAYMENT',
    });

    const novSummary = summarizeOpenFinanceBill(billNov, null, [payEntry], '2026-11-17');
    expect(novSummary.paidCents).toBe(290013);
    expect(novSummary.status).toBe('paga');
  });
});
