import type { FinAccount, FinEntry } from '../../../db/schema';
import type { PluggyTransaction } from '../../../services/pluggy/types';
import { calculateMonthlySummary, projectCashflow } from '../../financeFlow';
import { mapPluggyTransaction, reconcilePluggyTransactions } from '../index';

function makeTx(overrides: Partial<PluggyTransaction>): PluggyTransaction {
  return {
    id: 'tx-1',
    description: 'Movimento',
    currencyCode: 'BRL',
    amount: 0,
    date: '2026-11-10T12:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    accountId: 'pg-1',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    ...overrides,
  } as PluggyTransaction;
}

const CARD_OPTIONS = {
  accountId: 'acc-card',
  accountType: 'card' as const,
  closingDay: 3,
  dueDay: 10,
  bills: [],
  rules: [],
};

const CHECKING_OPTIONS = {
  accountId: 'acc-chk',
  accountType: 'checking' as const,
  rules: [],
};

function makeAccount(overrides: Partial<FinAccount>): FinAccount {
  return {
    id: 'acc-chk',
    name: 'Conta',
    type: 'checking',
    initial_balance_cents: 0,
    color: '#D96628',
    archived: 0,
    closing_day: null,
    due_day: null,
    credit_limit_cents: null,
    of_account_id: null,
    source: 'MANUAL',
    reported_balance_cents: null,
    reported_balance_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FinAccount;
}

function makeEntry(overrides: Partial<FinEntry>): FinEntry {
  return {
    id: 'e-1',
    kind: 'expense',
    amount_cents: 1000,
    due_date: '2026-11-10',
    paid_date: null,
    paid_amount_cents: null,
    status: 'pending',
    account_id: 'acc-chk',
    category_id: 'cat-outros-despesa',
    description: 'Lançamento',
    recurrence_id: null,
    recurrence_period: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
    bill_month: null,
    transfer_group_id: null,
    source: 'MANUAL',
    external_id: null,
    import_batch_id: null,
    description_raw: null,
    user_edited_fields: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FinEntry;
}

describe('Sprint 70 — Pagamento de fatura vindo do Open Finance', () => {
  test('S70-T01: crédito no cartão descrito como pagamento de fatura vira transferência recebida, não receita', () => {
    const descriptions = [
      'Pagamento recebido',
      'PAGAMENTO DE FATURA',
      'Pagto fatura cartão',
      'Pagamento efetuado',
    ];
    for (const description of descriptions) {
      const mapped = mapPluggyTransaction(
        makeTx({ id: `pay-${description}`, description, amount: -1500, type: 'CREDIT' }),
        CARD_OPTIONS
      );
      expect(mapped.kind).toBe('transfer_in');
      expect(mapped.amountCents).toBe(150000);
      expect(mapped.categoryId).toBe('cat-outros-receita');
    }
  });

  test('S70-T02: a categoria da Pluggy "Credit card payment" também identifica o pagamento', () => {
    const mapped = mapPluggyTransaction(
      makeTx({
        id: 'pay-cat',
        description: 'ITAU UNIBANCO',
        category: 'Credit card payment',
        amount: -800,
        type: 'CREDIT',
      }),
      CARD_OPTIONS
    );
    expect(mapped.kind).toBe('transfer_in');
  });

  test('S70-T03: estorno no cartão continua sendo receita e compra continua sendo despesa', () => {
    const refund = mapPluggyTransaction(
      makeTx({ id: 'refund', description: 'Estorno Loja X', amount: -50, type: 'CREDIT' }),
      CARD_OPTIONS
    );
    expect(refund.kind).toBe('income');

    const purchase = mapPluggyTransaction(
      makeTx({ id: 'buy', description: 'Supermercado', amount: 230.4, type: 'DEBIT' }),
      CARD_OPTIONS
    );
    expect(purchase.kind).toBe('expense');
  });

  test('S70-T04: em conta corrente a descrição "pagamento" não muda o tipo', () => {
    const mapped = mapPluggyTransaction(
      makeTx({ id: 'chk-in', description: 'Pagamento recebido', amount: 900, type: 'CREDIT' }),
      CHECKING_OPTIONS
    );
    expect(mapped.kind).toBe('income');
  });

  test('S70-T05: pagamento de fatura casa com a saída da conta corrente e forma um par de transferência', () => {
    const out = mapPluggyTransaction(
      makeTx({ id: 'chk-out', description: 'PAG FATURA CARTAO', amount: -1500, type: 'DEBIT' }),
      CHECKING_OPTIONS
    );
    const pay = mapPluggyTransaction(
      makeTx({ id: 'card-pay', description: 'Pagamento recebido', amount: -1500, type: 'CREDIT' }),
      CARD_OPTIONS
    );

    const result = reconcilePluggyTransactions([out, pay], [], {
      accountTypesById: { 'acc-chk': 'checking', 'acc-card': 'card' },
    });

    expect(result.transferPairs).toHaveLength(1);
    expect(result.transferPairs[0].isBillPayment).toBe(true);
    const outRow = result.transactions.find((t) => t.externalId === 'chk-out');
    const inRow = result.transactions.find((t) => t.externalId === 'card-pay');
    expect(outRow?.transferRole).toBe('transfer_out');
    expect(inRow?.transferRole).toBe('transfer_in');
    expect(outRow?.transferGroupId).toBe(inRow?.transferGroupId);
  });

  test('S70-T06: pagamento sem a conta pagadora conectada não infla a receita do mês', () => {
    const pay = mapPluggyTransaction(
      makeTx({ id: 'card-pay', description: 'Pagamento recebido', amount: -3000, type: 'CREDIT' }),
      CARD_OPTIONS
    );
    const result = reconcilePluggyTransactions([pay], [], {
      accountTypesById: { 'acc-card': 'card' },
    });
    expect(result.transferPairs).toHaveLength(0);
    const row = result.transactions[0];
    expect(row.action).toBe('create');
    expect(row.transferRole ?? row.kind).toBe('transfer_in');

    const summary = calculateMonthlySummary(
      [
        makeEntry({
          id: 'e-pay',
          kind: row.transferRole ?? row.kind,
          amount_cents: row.amountCents,
          status: 'paid',
          paid_amount_cents: row.amountCents,
          paid_date: row.dueDate,
          due_date: row.dueDate,
          account_id: 'acc-card',
        }),
      ],
      '2026-11'
    );
    expect(summary.totalIncomeCents).toBe(0);
    expect(summary.totalExpenseCents).toBe(0);
  });
});

describe('Sprint 70 — Previsão de caixa considera o que está atrasado', () => {
  test('S70-T07: pendentes vencidos de conta que não é cartão entram na previsão no dia de hoje', () => {
    const account = makeAccount({ initial_balance_cents: 100000 });
    const entries = [
      makeEntry({ id: 'late-bill', kind: 'expense', amount_cents: 30000, due_date: '2026-11-10' }),
      makeEntry({ id: 'late-income', kind: 'income', amount_cents: 5000, due_date: '2026-10-28' }),
      makeEntry({ id: 'future', kind: 'expense', amount_cents: 10000, due_date: '2026-11-18' }),
    ];

    const projection = projectCashflow([account], entries, '2026-11-16', '2026-11-20');

    expect(projection.startingBalanceCents).toBe(100000);
    expect(projection.days[0].date).toBe('2026-11-16');
    expect(projection.days[0].deltaCents).toBe(-25000);
    expect(projection.days[0].balanceCents).toBe(75000);
    expect(projection.endBalanceCents).toBe(65000);
  });

  test('S70-T08: transferências e lançamentos pagos vencidos não são contados de novo', () => {
    const account = makeAccount({ initial_balance_cents: 100000 });
    const entries = [
      makeEntry({
        id: 'paid-late',
        kind: 'expense',
        amount_cents: 20000,
        due_date: '2026-11-05',
        status: 'paid',
        paid_amount_cents: 20000,
        paid_date: '2026-11-05',
      }),
      makeEntry({ id: 'tr', kind: 'transfer_out', amount_cents: 7000, due_date: '2026-11-08' }),
    ];
    const projection = projectCashflow([account], entries, '2026-11-16', '2026-11-18');
    expect(projection.startingBalanceCents).toBe(80000);
    expect(projection.days[0].deltaCents).toBe(0);
    expect(projection.endBalanceCents).toBe(80000);
  });
});
