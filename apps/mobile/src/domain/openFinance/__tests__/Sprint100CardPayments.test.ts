import type { FinBudget, FinEntry } from '../../../db/schema';
import {
  calculateBudgetUsage,
  calculateMonthlySummary,
  summarizeBill,
} from '../../financeFlow';
import {
  classifyOpenFinanceCardEntry,
  isCardBillPayment,
} from '../classification';
import { computePluggyTruth } from '../pluggyTruth';
import {
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawCardTx,
} from '../../../services/pluggy/__tests__/pluggyFixtures';

function makeCardEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: 'ent-card-1',
    kind: 'expense',
    amount_cents: 1990,
    due_date: '2026-11-10',
    paid_date: '2026-11-10',
    paid_amount_cents: 1990,
    status: 'paid',
    account_id: 'acc-card-1',
    category_id: 'cat-alimentacao',
    description: 'Arcos Dourados',
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
    description_raw: 'ARCOS DOURADOS',
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
    created_at: '2026-11-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('Sprint 100 — Pagamento de fatura, estorno, cashback, tarifa e rotativo (R29)', () => {
  it('S100-T01: D26 — crédito -2900.13 "Pgto fatura" sem operationType => transfer_in, CARD_BILL_PAYMENT', () => {
    const tx = makeSprint97RawCardTx({
      id: 'tx-d26',
      description: 'Pgto fatura',
      descriptionRaw: 'Pgto fatura',
      amount: -2900.13,
      type: 'CREDIT',
      status: 'PENDING',
      category: 'Transfers',
      categoryId: '05000000',
      operationType: null,
    });

    const res = classifyOpenFinanceCardEntry(tx);
    expect(res.kind).toBe('transfer_in');
    expect(res.reason).toBe('CARD_BILL_PAYMENT');

    const billSum = summarizeBill(
      [
        makeCardEntry({ amount_cents: 290013, paid_amount_cents: 290013 }),
        makeCardEntry({
          id: 'ent-pay',
          kind: res.kind,
          amount_cents: 290013,
          paid_amount_cents: 290013,
          of_class_reason: res.reason,
        }),
      ],
      '2026-11'
    );
    expect(billSum.totalCents).toBe(290013);
    expect(billSum.paidCents).toBe(290013);

    const monthly = calculateMonthlySummary(
      [
        makeCardEntry({
          id: 'ent-pay',
          kind: res.kind,
          amount_cents: 290013,
          paid_amount_cents: 290013,
          of_class_reason: res.reason,
        }),
      ],
      '2026-11'
    );
    expect(monthly.totalIncomeCents).toBe(0);
  });

  it('S100-T02: variações de descrição de pagamento de fatura vs estorno', () => {
    for (const desc of [
      'PAGTO FATURA',
      'Pagamento recebido',
      'PAGAMENTO EFETUADO',
      'Pag fatura cartao',
    ]) {
      expect(isCardBillPayment({ description: desc, category: null })).toBe(true);
    }
    expect(isCardBillPayment({ description: 'Estorno Uber', category: null })).toBe(false);
  });

  it('S100-T03: operationType PAGAMENTO_FATURA vence descrição genérica "Crédito"', () => {
    const tx = makeSprint97RawCardTx({
      description: 'Crédito',
      descriptionRaw: 'Crédito',
      amount: -500,
      type: 'CREDIT',
      operationType: 'PAGAMENTO_FATURA',
    });
    const res = classifyOpenFinanceCardEntry(tx);
    expect(res.kind).toBe('transfer_in');
    expect(res.reason).toBe('CARD_BILL_PAYMENT');
  });

  it('S100-T04: ESTORNO de 19.90 com compra de 19.90 5 dias antes => income CARD_REFUND na mesma categoria e abate gasto do mês', () => {
    const tx = makeSprint97RawCardTx({
      description: 'Estorno Arcos Dourados',
      descriptionRaw: 'Estorno Arcos Dourados',
      amount: -19.9,
      type: 'CREDIT',
      date: '2026-11-15T00:00:00.000Z',
      operationType: 'ESTORNO',
    });

    const res = classifyOpenFinanceCardEntry(tx, {
      recentCardPurchases: [
        { amountCents: 1990, dueDate: '2026-11-10', categoryId: 'cat-alimentacao' },
      ],
    });
    expect(res.kind).toBe('income');
    expect(res.reason).toBe('CARD_REFUND');
    expect(res.categoryId).toBe('cat-alimentacao');

    const purchase = makeCardEntry({
      id: 'ent-compra',
      kind: 'expense',
      amount_cents: 1990,
      paid_amount_cents: 1990,
      due_date: '2026-11-10',
      category_id: 'cat-alimentacao',
    });
    const refund = makeCardEntry({
      id: 'ent-estorno',
      kind: 'income',
      amount_cents: 1990,
      paid_amount_cents: 1990,
      due_date: '2026-11-15',
      category_id: res.categoryId,
      of_class_reason: res.reason,
    });

    const monthly = calculateMonthlySummary([purchase, refund], '2026-11');
    const foodSpend = monthly.expenseByCategory.find((c) => c.categoryId === 'cat-alimentacao');
    expect(foodSpend?.totalCents ?? 0).toBe(0);
  });

  it('S100-T05: CASHBACK 3.00 => income CARD_CASHBACK em cat-outros-receita', () => {
    const tx = makeSprint97RawCardTx({
      description: 'Cashback',
      amount: -3.0,
      type: 'CREDIT',
      operationType: 'CASHBACK',
    });
    const res = classifyOpenFinanceCardEntry(tx);
    expect(res).toMatchObject({
      kind: 'income',
      categoryId: 'cat-outros-receita',
      reason: 'CARD_CASHBACK',
    });
  });

  it('S100-T06: TARIFA 39.90 com feeType ANNUAL_FEE => expense em Taxas bancárias, CARD_FEE, notes cita ANNUAL_FEE', () => {
    const tx = makeSprint97RawCardTx({
      description: 'Anuidade cartão',
      amount: 39.9,
      type: 'DEBIT',
      operationType: 'TARIFA',
      creditCardMetadata: { feeType: 'ANNUAL_FEE' },
    });
    const res = classifyOpenFinanceCardEntry(tx);
    expect(res.kind).toBe('expense');
    expect(res.categoryId).toBe('cat-taxas-bancarias');
    expect(res.reason).toBe('CARD_FEE');
    expect(res.notes).toContain('ANNUAL_FEE');
  });

  it('S100-T07: OPERACOES_CREDITO_CONTRATADAS_CARTAO BILL_INSTALLMENT => entra na fatura, ignorado em calculateMonthlySummary e orçamento', () => {
    const tx = makeSprint97RawCardTx({
      description: 'Parcelamento fatura 1/3',
      amount: 350.0,
      type: 'DEBIT',
      operationType: 'OPERACOES_CREDITO_CONTRATADAS_CARTAO',
      creditCardMetadata: { otherCreditsType: 'BILL_INSTALLMENT' },
    });
    const res = classifyOpenFinanceCardEntry(tx);
    expect(res.kind).toBe('expense');
    expect(res.reason).toBe('CARD_DEBT_ROLLOVER');

    const rolloverEntry = makeCardEntry({
      id: 'ent-roll-1',
      kind: res.kind,
      amount_cents: 35000,
      paid_amount_cents: 35000,
      category_id: res.categoryId,
      of_class_reason: res.reason,
    });

    expect(summarizeBill([rolloverEntry], '2026-11').totalCents).toBe(35000);
    expect(calculateMonthlySummary([rolloverEntry], '2026-11').totalExpenseCents).toBe(0);

    const budgets: FinBudget[] = [
      {
        id: 'b-1',
        category_id: res.categoryId,
        year_month: null,
        limit_cents: 100000,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    const usage = calculateBudgetUsage([rolloverEntry], budgets, '2026-11');
    expect(usage[0]?.spentCents ?? 0).toBe(0);
  });

  it('S100-T13: D37 — type DEBIT com amount -8.46 no cartão => expense; SIGN_MISMATCH no diagnóstico/truth', () => {
    const card = makeSprint97CardAccount7ccce4de();
    const tx = makeSprint97RawCardTx({
      id: 'tx-invert-card',
      accountId: card.id,
      amount: -8.46,
      type: 'DEBIT',
      operationType: 'PAGAMENTO',
    });

    const classified = classifyOpenFinanceCardEntry(tx);
    expect(classified.kind).toBe('expense');

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [card],
        transactionsByAccount: { [card.id]: [tx] },
        billsByAccount: { [card.id]: [] },
      },
      '2026-11-17'
    );
    expect(truth.signMismatches).toHaveLength(1);
    expect(truth.signMismatches[0].txId).toBe('tx-invert-card');
  });
});
