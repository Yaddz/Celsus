import type { FinAccount, FinEntry } from '../../../db/schema';
import {
  billDueDate,
  projectCashflow,
  resolveAccountBalance,
  resolveBillMonth,
} from '../index';

function makeAccount(overrides: Partial<FinAccount>): FinAccount {
  return {
    id: 'acc-1',
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
    account_id: 'acc-1',
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

describe('Sprint 69 — Mês da fatura quando o cartão fecha depois do dia do vencimento', () => {
  test('S69-T01: sem dia de vencimento o comportamento de 2 argumentos é preservado', () => {
    expect(resolveBillMonth('2026-11-09', 10)).toBe('2026-11');
    expect(resolveBillMonth('2026-11-10', 10)).toBe('2026-12');
  });

  test('S69-T02: fechamento ANTES do vencimento no mesmo mês (fecha 3, vence 10) não desloca', () => {
    expect(resolveBillMonth('2026-11-02', 3, 10)).toBe('2026-11');
    expect(resolveBillMonth('2026-11-03', 3, 10)).toBe('2026-12');
    expect(resolveBillMonth('2026-11-20', 3, 10)).toBe('2026-12');
  });

  test('S69-T03: fechamento DEPOIS do dia do vencimento (fecha 28, vence 5) joga para o mês em que a fatura vence', () => {
    // compra 10/11 -> fecha 28/11 -> vence 05/12
    expect(resolveBillMonth('2026-11-10', 28, 5)).toBe('2026-12');
    // compra 28/11 (dia do fechamento) -> fecha 28/12 -> vence 05/01/2027
    expect(resolveBillMonth('2026-11-28', 28, 5)).toBe('2027-01');
    // virada de ano: compra 10/12 -> fecha 28/12 -> vence 05/01/2027
    expect(resolveBillMonth('2026-12-10', 28, 5)).toBe('2027-01');
  });

  test('S69-T04: fechamento igual ao vencimento não desloca', () => {
    expect(resolveBillMonth('2026-11-09', 10, 10)).toBe('2026-11');
    expect(resolveBillMonth('2026-11-10', 10, 10)).toBe('2026-12');
  });

  test('S69-T05: o vencimento da fatura nunca é anterior à data da compra', () => {
    const configs: Array<[number, number]> = [
      [28, 5],
      [25, 1],
      [31, 10],
      [3, 10],
      [1, 8],
      [15, 22],
    ];
    const purchases = [
      '2026-01-01',
      '2026-01-31',
      '2026-02-28',
      '2026-06-15',
      '2026-11-10',
      '2026-12-31',
    ];
    for (const [closing, due] of configs) {
      for (const purchase of purchases) {
        const bm = resolveBillMonth(purchase, closing, due);
        expect(billDueDate(bm, due) >= purchase).toBe(true);
      }
    }
  });
});

describe('Sprint 69 — Saldo de conta vinda do Open Finance', () => {
  test('S69-T06: resolveAccountBalance usa o saldo informado pelo banco em conta OPEN_FINANCE', () => {
    const ofAcc = makeAccount({
      id: 'acc-of',
      source: 'OPEN_FINANCE',
      initial_balance_cents: 0,
      reported_balance_cents: 320050,
    });
    const entries = [
      makeEntry({
        id: 'e-of-1',
        account_id: 'acc-of',
        kind: 'income',
        amount_cents: 100000,
        status: 'paid',
        paid_amount_cents: 100000,
        paid_date: '2026-11-01',
      }),
    ];
    expect(resolveAccountBalance(ofAcc, entries)).toBe(320050);
  });

  test('S69-T07: resolveAccountBalance mantém o cálculo (inicial + pagos) em conta manual e em OF sem saldo informado', () => {
    const manual = makeAccount({ id: 'acc-m', initial_balance_cents: 50000 });
    const ofNoBalance = makeAccount({
      id: 'acc-of2',
      source: 'OPEN_FINANCE',
      initial_balance_cents: 7000,
      reported_balance_cents: null,
    });
    const entries = [
      makeEntry({
        id: 'e-m-1',
        account_id: 'acc-m',
        kind: 'expense',
        amount_cents: 10000,
        status: 'paid',
        paid_amount_cents: 10000,
        paid_date: '2026-11-02',
      }),
      makeEntry({ id: 'e-m-2', account_id: 'acc-m', kind: 'expense', amount_cents: 999 }),
    ];
    expect(resolveAccountBalance(manual, entries)).toBe(40000);
    expect(resolveAccountBalance(ofNoBalance, entries)).toBe(7000);
  });

  test('S69-T08: projectCashflow parte do saldo informado pelo banco nas contas OPEN_FINANCE', () => {
    const ofAcc = makeAccount({
      id: 'acc-of',
      source: 'OPEN_FINANCE',
      initial_balance_cents: 320050,
      reported_balance_cents: 320050,
    });
    const manual = makeAccount({ id: 'acc-m', initial_balance_cents: 50000 });
    const entries = [
      // histórico importado: não pode ser somado de novo ao saldo informado
      makeEntry({
        id: 'e-of-1',
        account_id: 'acc-of',
        kind: 'income',
        amount_cents: 500000,
        status: 'paid',
        paid_amount_cents: 500000,
        paid_date: '2026-10-05',
        due_date: '2026-10-05',
      }),
      makeEntry({
        id: 'e-m-1',
        account_id: 'acc-m',
        kind: 'expense',
        amount_cents: 10000,
        status: 'paid',
        paid_amount_cents: 10000,
        paid_date: '2026-11-02',
        due_date: '2026-11-02',
      }),
    ];
    const projection = projectCashflow([ofAcc, manual], entries, '2026-11-16', '2026-11-20');
    expect(projection.startingBalanceCents).toBe(320050 + 40000);
  });
});
