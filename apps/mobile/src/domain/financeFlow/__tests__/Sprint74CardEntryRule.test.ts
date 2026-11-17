import type { FinAccount, FinBudget, FinEntry } from '../../../db/schema';
import {
  buildInstallmentSchedule,
  calculateBudgetUsage,
  calculateMonthlySummary,
  DEFAULT_CARD_CLOSING_DAY,
  DEFAULT_CARD_DUE_DAY,
  detectOverdueAndDueSoonWithBills,
  getBillPeriod,
  groupBillEntriesByDay,
  hasEstimatedBillDates,
  normalizeCardEntry,
  projectCashflow,
  resolveBillMonth,
} from '../index';

function makeAccount(overrides: Partial<FinAccount> = {}): FinAccount {
  return {
    id: 'acc-card',
    name: 'Cartão Nubank',
    type: 'card',
    initial_balance_cents: 0,
    color: '#820AD1',
    archived: 0,
    closing_day: 25,
    due_day: 5,
    credit_limit_cents: 500000,
    source: 'MANUAL',
    of_account_id: null,
    reported_balance_cents: null,
    reported_balance_at: null,
    masked_number: null,
    owner: null,
    auto_name: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: 'entry-1',
    kind: 'expense',
    amount_cents: 12000,
    due_date: '2026-11-10',
    paid_date: '2026-11-10',
    paid_amount_cents: 12000,
    status: 'paid',
    account_id: 'acc-card',
    category_id: 'cat-alimentacao',
    description: 'Almoço',
    recurrence_id: null,
    recurrence_period: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
    bill_month: '2026-12',
    transfer_group_id: null,
    source: 'MANUAL',
    external_id: null,
    import_batch_id: null,
    description_raw: null,
    user_edited_fields: null,
    created_at: '2026-11-10T10:00:00Z',
    ...overrides,
  };
}

describe('Sprint 74 — Regra centralizada de lançamento em cartão (Fase A)', () => {
  test('S74-T01: normalizeCardEntry força status paid, paid_date = data da compra e bill_month para expense/income em cartão; preserva transfers e contas não-cartão', () => {
    const card = makeAccount({ type: 'card', closing_day: 25, due_day: 5 });
    const checking = makeAccount({ id: 'acc-chk', type: 'checking', closing_day: null, due_day: null });

    const normalizedExpense = normalizeCardEntry(
      {
        kind: 'expense',
        dueDate: '2026-11-10',
        amountCents: 15000,
        status: 'pending',
      },
      card
    );
    expect(normalizedExpense).toEqual({
      due_date: '2026-11-10',
      status: 'paid',
      paid_date: '2026-11-10',
      paid_amount_cents: 15000,
      bill_month: '2026-12',
    });

    const normalizedRefund = normalizeCardEntry(
      {
        kind: 'income',
        dueDate: '2026-11-12',
        amountCents: 4500,
        status: 'pending',
      },
      card
    );
    expect(normalizedRefund).toEqual({
      due_date: '2026-11-12',
      status: 'paid',
      paid_date: '2026-11-12',
      paid_amount_cents: 4500,
      bill_month: '2026-12',
    });

    const transferOnCard = normalizeCardEntry(
      {
        kind: 'transfer_in',
        dueDate: '2026-12-05',
        amountCents: 15000,
        status: 'paid',
        paidDate: '2026-12-05',
        paidAmountCents: 15000,
        billMonth: '2026-12',
      },
      card
    );
    expect(transferOnCard).toEqual({
      due_date: '2026-12-05',
      status: 'paid',
      paid_date: '2026-12-05',
      paid_amount_cents: 15000,
      bill_month: '2026-12',
    });

    const checkingPending = normalizeCardEntry(
      {
        kind: 'expense',
        dueDate: '2026-11-20',
        amountCents: 9000,
        status: 'pending',
      },
      checking
    );
    expect(checkingPending).toEqual({
      due_date: '2026-11-20',
      status: 'pending',
      paid_date: null,
      paid_amount_cents: null,
      bill_month: null,
    });
  });

  test('S74-T02: viradas de mês/ano, fechamento depois do vencimento e cartão sem datas (padrões 1 e 10)', () => {
    const cardFecha25Vence5 = makeAccount({ closing_day: 25, due_day: 5 });
    // Antes do fechamento (10/11 < 25/11): fecha em 25/11, vence em 05/12 -> 2026-12
    expect(resolveBillMonth('2026-11-10', 25, 5)).toBe('2026-12');
    // No dia do fechamento (25/11 >= 25/11): fecha em 25/12, vence em 05/01/2027 -> 2027-01
    expect(resolveBillMonth('2026-11-25', 25, 5)).toBe('2027-01');
    // Depois do fechamento (28/12 >= 25/12): fecha em 25/01/2027, vence em 05/02/2027 -> 2027-02
    expect(
      normalizeCardEntry(
        { kind: 'expense', dueDate: '2026-12-28', amountCents: 5000 },
        cardFecha25Vence5
      ).bill_month
    ).toBe('2027-02');

    const cardSemDatas = makeAccount({ closing_day: null, due_day: null });
    expect(DEFAULT_CARD_CLOSING_DAY).toBe(1);
    expect(DEFAULT_CARD_DUE_DAY).toBe(10);
    expect(hasEstimatedBillDates(cardSemDatas)).toBe(true);
    expect(hasEstimatedBillDates(cardFecha25Vence5)).toBe(false);
    expect(hasEstimatedBillDates(makeAccount({ closing_day: 25, due_day: null }))).toBe(true);

    const semDatasNorm = normalizeCardEntry(
      { kind: 'expense', dueDate: '2026-11-15', amountCents: 8000 },
      cardSemDatas
    );
    expect(semDatasNorm.status).toBe('paid');
    expect(semDatasNorm.bill_month).toBe('2026-12');
  });

  test('S74-T03: compra parcelada em 3x no cartão gera 3 lançamentos em faturas consecutivas, todos paid', () => {
    const card = makeAccount({ closing_day: 25, due_day: 5 });
    const schedule = buildInstallmentSchedule({
      totalCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-10',
    });

    const normalized = schedule.map((part) =>
      normalizeCardEntry(
        {
          kind: 'expense',
          dueDate: part.dueDate,
          amountCents: part.amountCents,
        },
        card
      )
    );

    expect(normalized.map((n) => n.bill_month)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(normalized.every((n) => n.status === 'paid')).toBe(true);
    expect(normalized.map((n) => n.paid_date)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
  });

  test('S74-T04: getBillPeriod e groupBillEntriesByDay calculam período de compras, fechamento, vencimento e agrupam por dia', () => {
    // Cartão fecha 25, vence 5: fatura 2026-12 fecha em 2026-11-25 e vence em 2026-12-05.
    // Compras incluídas: de 2026-10-25 até 2026-11-24.
    const period = getBillPeriod('2026-12', 25, 5);
    expect(period).toEqual({
      startIso: '2026-10-25',
      endIso: '2026-11-24',
      closingIso: '2026-11-25',
      dueIso: '2026-12-05',
    });

    // Cartão fecha 10, vence 17: fatura 2026-11 fecha em 2026-11-10 e vence em 2026-11-17.
    // Compras incluídas: de 2026-10-10 até 2026-11-09.
    const sameMonthPeriod = getBillPeriod('2026-11', 10, 17);
    expect(sameMonthPeriod).toEqual({
      startIso: '2026-10-10',
      endIso: '2026-11-09',
      closingIso: '2026-11-10',
      dueIso: '2026-11-17',
    });

    const entries = [
      makeEntry({ id: 'e1', due_date: '2026-11-10', kind: 'expense', amount_cents: 5000 }),
      makeEntry({ id: 'e2', due_date: '2026-11-12', kind: 'expense', amount_cents: 8000 }),
      makeEntry({ id: 'e3', due_date: '2026-11-10', kind: 'income', amount_cents: 1200 }),
      makeEntry({ id: 'pay', due_date: '2026-12-05', kind: 'transfer_in', amount_cents: 11800 }),
    ];

    const grouped = groupBillEntriesByDay(entries.filter((e) => e.kind !== 'transfer_in'));
    expect(grouped.map((g) => g.dateIso)).toEqual(['2026-11-12', '2026-11-10']);
    expect(grouped[0].entries.map((e) => e.id)).toEqual(['e2']);
    expect(grouped[1].entries.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  test('S74-T05: competência no mês da compra para resumo/orçamento e caixa no vencimento da fatura em projectCashflow', () => {
    const checking = makeAccount({
      id: 'acc-chk',
      type: 'checking',
      initial_balance_cents: 100000,
      closing_day: null,
      due_day: null,
      credit_limit_cents: null,
    });
    const card = makeAccount({ id: 'acc-card', type: 'card', closing_day: 25, due_day: 5 });

    const purchase = makeEntry({
      id: 'c1',
      account_id: 'acc-card',
      kind: 'expense',
      amount_cents: 30000,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 30000,
      status: 'paid',
      bill_month: '2026-12',
    });
    const salary = makeEntry({
      id: 's1',
      account_id: 'acc-chk',
      kind: 'income',
      amount_cents: 200000,
      due_date: '2026-11-05',
      paid_date: '2026-11-05',
      paid_amount_cents: 200000,
      status: 'paid',
      bill_month: null,
    });

    const novSummary = calculateMonthlySummary([salary, purchase], '2026-11');
    expect(novSummary.totalExpenseCents).toBe(30000);
    expect(novSummary.totalIncomeCents).toBe(200000);

    const budgets: FinBudget[] = [
      {
        id: 'b1',
        category_id: 'cat-alimentacao',
        year_month: '2026-11',
        limit_cents: 50000,
        created_at: '2026-11-01T00:00:00Z',
      },
    ];
    const novBudget = calculateBudgetUsage([purchase], budgets, '2026-11', {
      todayIso: '2026-11-15',
    });
    expect(novBudget[0].spentCents).toBe(30000);

    const cashflow = projectCashflow([checking, card], [salary, purchase], '2026-11-15', '2026-12-10');
    const dec04 = cashflow.days.find((d) => d.date === '2026-12-04');
    const dec05 = cashflow.days.find((d) => d.date === '2026-12-05');
    expect(dec04?.balanceCents).toBe(300000);
    expect(dec05?.balanceCents).toBe(270000);

    const alerts = detectOverdueAndDueSoonWithBills([salary, purchase], [checking, card], '2026-12-01', 7);
    expect(alerts.dueSoon).toHaveLength(0);
    expect(alerts.dueSoonBills).toHaveLength(1);
    expect(alerts.dueSoonBills[0].billMonth).toBe('2026-12');
    expect(alerts.dueSoonBills[0].dueDate).toBe('2026-12-05');
  });
});
