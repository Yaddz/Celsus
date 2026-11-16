import type { FinAccount, FinEntry } from '../../../db/schema';
import {
  availableLimit,
  billDueDate,
  calculateAccountBalance,
  calculateMonthlySummary,
  detectOverdueAndDueSoonWithBills,
  resolveBillMonth,
  summarizeBill,
} from '../index';

function makeEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: overrides.id ?? 'entry-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    due_date: overrides.due_date ?? '2026-11-05',
    paid_date: overrides.paid_date ?? null,
    paid_amount_cents: overrides.paid_amount_cents ?? null,
    status: overrides.status ?? 'pending',
    account_id: overrides.account_id ?? 'acc-card',
    category_id: overrides.category_id ?? 'cat-mercado',
    description: overrides.description ?? 'Compra',
    recurrence_id: overrides.recurrence_id ?? null,
    recurrence_period: overrides.recurrence_period ?? null,
    installment_group_id: overrides.installment_group_id ?? null,
    installment_number: overrides.installment_number ?? null,
    installment_total: overrides.installment_total ?? null,
    bill_month: overrides.bill_month ?? null,
    transfer_group_id: overrides.transfer_group_id ?? null,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  } as FinEntry;
}

function makeAccount(overrides: Partial<FinAccount> = {}): FinAccount {
  return {
    id: overrides.id ?? 'acc-card',
    name: overrides.name ?? 'Nubank',
    type: overrides.type ?? 'card',
    initial_balance_cents: overrides.initial_balance_cents ?? 0,
    color: overrides.color ?? '#D96628',
    archived: overrides.archived ?? 0,
    closing_day: overrides.closing_day ?? 10,
    due_day: overrides.due_day ?? 17,
    credit_limit_cents: overrides.credit_limit_cents ?? 500000,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  } as FinAccount;
}

describe('Sprint 61 — Domínio de Cartão de Crédito, Faturas e Transferências', () => {
  test('S61-T01: resolveBillMonth mantém no mês atual quando compra é anterior ao fechamento', () => {
    expect(resolveBillMonth('2026-11-01', 10)).toBe('2026-11');
    expect(resolveBillMonth('2026-11-09', 10)).toBe('2026-11');
  });

  test('S61-T02: resolveBillMonth joga compra NO DIA do fechamento para a fatura do mês seguinte', () => {
    expect(resolveBillMonth('2026-11-10', 10)).toBe('2026-12');
    expect(resolveBillMonth('2026-11-15', 10)).toBe('2026-12');
  });

  test('S61-T03: resolveBillMonth trata virada de mês e ano (dezembro -> janeiro)', () => {
    expect(resolveBillMonth('2026-12-24', 25)).toBe('2026-12');
    expect(resolveBillMonth('2026-12-25', 25)).toBe('2027-01');
    expect(resolveBillMonth('2026-12-31', 25)).toBe('2027-01');
  });

  test('S61-T04: resolveBillMonth trata fechamento dia 31 em fevereiro (ano comum e bissexto)', () => {
    // 2026 não é bissexto -> último dia é 28
    expect(resolveBillMonth('2026-02-27', 31)).toBe('2026-02');
    expect(resolveBillMonth('2026-02-28', 31)).toBe('2026-03');
    // 2024 é bissexto -> último dia é 29
    expect(resolveBillMonth('2024-02-28', 31)).toBe('2024-02');
    expect(resolveBillMonth('2024-02-29', 31)).toBe('2024-03');
  });

  test('S61-T05: billDueDate calcula data de vencimento com clamp em meses curtos', () => {
    expect(billDueDate('2026-11', 17)).toBe('2026-11-17');
    expect(billDueDate('2026-02', 31)).toBe('2026-02-28');
    expect(billDueDate('2024-02', 31)).toBe('2024-02-29');
  });

  test('S61-T06: summarizeBill calcula total com estorno, pagamento parcial, quitação e status', () => {
    const entries: FinEntry[] = [
      makeEntry({ id: 'e1', kind: 'expense', amount_cents: 30000, bill_month: '2026-11' }),
      makeEntry({ id: 'e2', kind: 'expense', amount_cents: 15000, bill_month: '2026-11' }),
      // Estorno no cartão reduz o total da fatura
      makeEntry({ id: 'e3', kind: 'income', amount_cents: 5000, bill_month: '2026-11' }),
      // Pagamento parcial via transfer_in
      makeEntry({
        id: 'p1',
        kind: 'transfer_in',
        status: 'paid',
        amount_cents: 12000,
        paid_amount_cents: 12000,
        bill_month: '2026-11',
      }),
    ];

    // Total = 300 + 150 - 50 = 400 reais (40000); Pago = 12000; Aberto = 28000
    const openSummary = summarizeBill(entries, '2026-11', {
      dueDate: '2026-11-17',
      todayIso: '2026-11-05',
      closingDay: 10,
    });
    expect(openSummary.totalCents).toBe(40000);
    expect(openSummary.paidCents).toBe(12000);
    expect(openSummary.openCents).toBe(28000);
    expect(openSummary.status).toBe('aberta');

    const closedSummary = summarizeBill(entries, '2026-11', {
      dueDate: '2026-11-17',
      todayIso: '2026-11-12',
      closingDay: 10,
    });
    expect(closedSummary.status).toBe('fechada');

    const overdueSummary = summarizeBill(entries, '2026-11', {
      dueDate: '2026-11-17',
      todayIso: '2026-11-18',
      closingDay: 10,
    });
    expect(overdueSummary.status).toBe('atrasada');

    const paidEntries = [
      ...entries,
      makeEntry({
        id: 'p2',
        kind: 'transfer_in',
        status: 'paid',
        amount_cents: 28000,
        paid_amount_cents: 28000,
        bill_month: '2026-11',
      }),
    ];
    const paidSummary = summarizeBill(paidEntries, '2026-11', {
      dueDate: '2026-11-17',
      todayIso: '2026-11-18',
      closingDay: 10,
    });
    expect(paidSummary.openCents).toBe(0);
    expect(paidSummary.status).toBe('paga');
  });

  test('S61-T07: availableLimit retorna null se limite ausente e desconta faturas abertas quando informado', () => {
    expect(availableLimit(null, 50000)).toBeNull();
    expect(availableLimit(undefined, 50000)).toBeNull();
    expect(availableLimit(500000, 120000)).toBe(380000);
  });

  test('S61-T08: calculateMonthlySummary e calculateAccountBalance tratam competência do cartão e ignoram transferências no resumo', () => {
    const entries: FinEntry[] = [
      // Salário na conta corrente
      makeEntry({
        id: 'inc-1',
        kind: 'income',
        status: 'paid',
        amount_cents: 500000,
        paid_amount_cents: 500000,
        due_date: '2026-11-05',
        account_id: 'acc-checking',
        category_id: 'cat-salario',
      }),
      // Compra no cartão em 15/11 (entra na fatura de 12/2026, mas competência 11/2026)
      makeEntry({
        id: 'card-exp-1',
        kind: 'expense',
        status: 'pending',
        amount_cents: 80000,
        due_date: '2026-11-15',
        account_id: 'acc-card',
        category_id: 'cat-mercado',
        bill_month: '2026-12',
      }),
      // Pagamento de fatura anterior (par transfer_out / transfer_in)
      makeEntry({
        id: 'tr-out',
        kind: 'transfer_out',
        status: 'paid',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        due_date: '2026-11-17',
        account_id: 'acc-checking',
        transfer_group_id: 'tg-1',
      }),
      makeEntry({
        id: 'tr-in',
        kind: 'transfer_in',
        status: 'paid',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        due_date: '2026-11-17',
        account_id: 'acc-card',
        bill_month: '2026-11',
        transfer_group_id: 'tg-1',
      }),
    ];

    const summary = calculateMonthlySummary(entries, '2026-11');
    // Transferências NÃO entram em receitas, despesas nem categorias
    expect(summary.totalIncomeCents).toBe(500000);
    expect(summary.totalExpenseCents).toBe(80000);
    expect(summary.expenseByCategory).toEqual([
      { categoryId: 'cat-mercado', amountCents: 80000, percentage: 100 },
    ]);

    // Conta corrente: 0 + 500000 (salário) - 100000 (transfer_out pagamento fatura) = 400000
    // A compra no cartão de 80000 NÃO sai da conta corrente enquanto não for paga!
    expect(calculateAccountBalance(0, entries, 'acc-checking')).toBe(400000);
  });

  test('S61-T09: detectOverdueAndDueSoonWithBills inclui faturas pelo vencimento e ignora compras individuais de cartão', () => {
    const accounts: FinAccount[] = [
      makeAccount({ id: 'acc-checking', name: 'Conta', type: 'checking', closing_day: null, due_day: null, credit_limit_cents: null }),
      makeAccount({ id: 'acc-card', name: 'Nubank', type: 'card', closing_day: 10, due_day: 17, credit_limit_cents: 500000 }),
    ];
    const entries: FinEntry[] = [
      // Compra no cartão dia 05/11 -> fatura 2026-11 vence dia 2026-11-17
      makeEntry({
        id: 'card-1',
        kind: 'expense',
        status: 'pending',
        amount_cents: 45000,
        due_date: '2026-11-05',
        account_id: 'acc-card',
        bill_month: '2026-11',
      }),
      // Despesa comum em conta corrente vencendo em 2026-11-15
      makeEntry({
        id: 'chk-1',
        kind: 'expense',
        status: 'pending',
        amount_cents: 20000,
        due_date: '2026-11-15',
        account_id: 'acc-checking',
      }),
    ];

    // Hoje = 2026-11-12 -> horizonte 7 dias (até 2026-11-19):
    // A compra card-1 (due_date 05/11) NÃO aparece como atrasada individualmente;
    // a fatura 2026-11 (dueDate 17/11) entra em dueSoonBills!
    const res = detectOverdueAndDueSoonWithBills(entries, accounts, '2026-11-12', 7);
    expect(res.overdue).toHaveLength(0);
    expect(res.overdueBills).toHaveLength(0);
    expect(res.dueSoon.map((e) => e.id)).toEqual(['chk-1']);
    expect(res.dueSoonBills).toHaveLength(1);
    expect(res.dueSoonBills[0].billMonth).toBe('2026-11');
    expect(res.dueSoonBills[0].openCents).toBe(45000);
    expect(res.dueSoonPayableCents).toBe(20000 + 45000);
  });
});
