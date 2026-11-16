import type { FinAccount, FinBudget, FinEntry, FinRecurrence } from '../../../db/schema';
import {
  calculateBudgetUsage,
  projectCashflow,
  suggestBudgetLimit,
} from '../index';

function makeEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: overrides.id ?? 'entry-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    due_date: overrides.due_date ?? '2026-11-10',
    paid_date: overrides.paid_date ?? null,
    paid_amount_cents: overrides.paid_amount_cents ?? null,
    status: overrides.status ?? 'paid',
    account_id: overrides.account_id ?? 'acc-checking',
    category_id: overrides.category_id ?? 'cat-mercado',
    description: overrides.description ?? 'Lançamento',
    recurrence_id: overrides.recurrence_id ?? null,
    recurrence_period: overrides.recurrence_period ?? null,
    installment_group_id: overrides.installment_group_id ?? null,
    installment_number: overrides.installment_number ?? null,
    installment_total: overrides.installment_total ?? null,
    bill_month: overrides.bill_month ?? null,
    transfer_group_id: overrides.transfer_group_id ?? null,
    source: overrides.source ?? null,
    external_id: overrides.external_id ?? null,
    import_batch_id: overrides.import_batch_id ?? null,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  } as FinEntry;
}

function makeBudget(overrides: Partial<FinBudget> = {}): FinBudget {
  return {
    id: overrides.id ?? 'budget-1',
    category_id: overrides.category_id ?? 'cat-mercado',
    year_month: overrides.year_month !== undefined ? overrides.year_month : null,
    limit_cents: overrides.limit_cents ?? 100000,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  };
}

function makeAccount(overrides: Partial<FinAccount> = {}): FinAccount {
  return {
    id: overrides.id ?? 'acc-checking',
    name: overrides.name ?? 'Conta Corrente',
    type: overrides.type ?? 'checking',
    initial_balance_cents: overrides.initial_balance_cents ?? 0,
    color: overrides.color ?? '#0D4A3A',
    archived: overrides.archived ?? 0,
    closing_day: overrides.closing_day ?? null,
    due_day: overrides.due_day ?? null,
    credit_limit_cents: overrides.credit_limit_cents ?? null,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  } as FinAccount;
}

describe('Sprint 67 — Domínio de Orçamento Mensal e Previsão de Saldo', () => {
  test('S67-T01: calculateBudgetUsage calcula gasto, %, estado (ok/atencao/estourado) e ritmo em meses de 28, 29, 30 e 31 dias', () => {
    const budgets: FinBudget[] = [
      makeBudget({ id: 'b-ok', category_id: 'cat-lazer', limit_cents: 100000 }),
      makeBudget({ id: 'b-warn', category_id: 'cat-mercado', limit_cents: 100000 }),
      makeBudget({ id: 'b-over', category_id: 'cat-restaurante', limit_cents: 50000 }),
    ];

    // Fevereiro não bissexto (28 dias) — dia 14 = metade do mês
    const febEntries: FinEntry[] = [
      makeEntry({ id: 'f1', category_id: 'cat-lazer', amount_cents: 30000, due_date: '2026-02-05' }),
      makeEntry({ id: 'f2', category_id: 'cat-mercado', amount_cents: 80000, due_date: '2026-02-10' }), // exatamente 80% -> atencao
      makeEntry({ id: 'f3', category_id: 'cat-restaurante', amount_cents: 50000, due_date: '2026-02-12' }), // exatamente 100% -> estourado
      // Transferência não entra no orçamento
      makeEntry({ id: 'f-tr', kind: 'transfer_out', category_id: 'cat-lazer', amount_cents: 90000, due_date: '2026-02-10' }),
    ];

    const febUsage = calculateBudgetUsage(febEntries, budgets, '2026-02', { todayIso: '2026-02-14' });
    const febLazer = febUsage.find((u) => u.categoryId === 'cat-lazer')!;
    const febMercado = febUsage.find((u) => u.categoryId === 'cat-mercado')!;
    const febRest = febUsage.find((u) => u.categoryId === 'cat-restaurante')!;

    expect(febLazer.spentCents).toBe(30000);
    expect(febLazer.percentage).toBe(30);
    expect(febLazer.status).toBe('ok');
    // 300,00 em 14 dias de 28 -> projeta 600,00
    expect(febLazer.projectedEndOfMonthCents).toBe(60000);
    expect(febLazer.paceText).toBe('no ritmo atual termina o mês em R$ 600,00');

    expect(febMercado.percentage).toBe(80);
    expect(febMercado.status).toBe('atencao');

    expect(febRest.percentage).toBe(100);
    expect(febRest.status).toBe('estourado');

    // Fevereiro bissexto (29 dias)
    const leapEntries: FinEntry[] = [
      makeEntry({ id: 'l1', category_id: 'cat-lazer', amount_cents: 29000, due_date: '2024-02-10' }),
    ];
    const leapUsage = calculateBudgetUsage(leapEntries, budgets, '2024-02', { todayIso: '2024-02-10' });
    // 29000 / 10 * 29 = 84100
    expect(leapUsage.find((u) => u.categoryId === 'cat-lazer')?.projectedEndOfMonthCents).toBe(84100);

    // Mês de 30 dias (novembro)
    const novEntries: FinEntry[] = [
      makeEntry({ id: 'n1', category_id: 'cat-lazer', amount_cents: 15000, due_date: '2026-11-10' }),
    ];
    const novUsage = calculateBudgetUsage(novEntries, budgets, '2026-11', { todayIso: '2026-11-10' });
    // 15000 / 10 * 30 = 45000
    expect(novUsage.find((u) => u.categoryId === 'cat-lazer')?.projectedEndOfMonthCents).toBe(45000);

    // Mês de 31 dias (janeiro)
    const janEntries: FinEntry[] = [
      makeEntry({ id: 'j1', category_id: 'cat-lazer', amount_cents: 10000, due_date: '2026-01-10' }),
    ];
    const janUsage = calculateBudgetUsage(janEntries, budgets, '2026-01', { todayIso: '2026-01-10' });
    // 10000 / 10 * 31 = 31000
    expect(janUsage.find((u) => u.categoryId === 'cat-lazer')?.projectedEndOfMonthCents).toBe(31000);
  });

  test('S67-T02: calculateBudgetUsage dá precedência ao orçamento específico do mês sobre o recorrente (year_month nulo)', () => {
    const budgets: FinBudget[] = [
      makeBudget({ id: 'b-global', category_id: 'cat-mercado', year_month: null, limit_cents: 100000 }),
      makeBudget({ id: 'b-nov', category_id: 'cat-mercado', year_month: '2026-11', limit_cents: 150000 }),
      makeBudget({ id: 'b-oct', category_id: 'cat-mercado', year_month: '2026-10', limit_cents: 80000 }),
    ];
    const entries: FinEntry[] = [
      makeEntry({ id: 'e1', category_id: 'cat-mercado', amount_cents: 120000, due_date: '2026-11-12' }),
    ];

    const nov = calculateBudgetUsage(entries, budgets, '2026-11', { todayIso: '2026-11-15' });
    const item = nov.find((u) => u.categoryId === 'cat-mercado')!;
    expect(item.budgetId).toBe('b-nov');
    expect(item.limitCents).toBe(150000);
    expect(item.isMonthlySpecific).toBe(true);
    expect(item.percentage).toBe(80);
    expect(item.status).toBe('atencao');

    // Em dezembro (sem específico), volta para o recorrente (100000)
    const dec = calculateBudgetUsage([], budgets, '2026-12', { todayIso: '2026-12-05' });
    const decItem = dec.find((u) => u.categoryId === 'cat-mercado')!;
    expect(decItem.budgetId).toBe('b-global');
    expect(decItem.limitCents).toBe(100000);
    expect(decItem.isMonthlySpecific).toBe(false);
  });

  test('S67-T03: calculateBudgetUsage trata orçamento sem gasto e gasto sem orçamento', () => {
    const budgets: FinBudget[] = [
      makeBudget({ id: 'b-unused', category_id: 'cat-educacao', year_month: null, limit_cents: 40000 }),
    ];
    const entries: FinEntry[] = [
      makeEntry({ id: 'e-nobudget', category_id: 'cat-transporte', amount_cents: 25000, due_date: '2026-11-08' }),
    ];

    const usage = calculateBudgetUsage(entries, budgets, '2026-11', { todayIso: '2026-11-10' });

    const unused = usage.find((u) => u.categoryId === 'cat-educacao')!;
    expect(unused.spentCents).toBe(0);
    expect(unused.limitCents).toBe(40000);
    expect(unused.percentage).toBe(0);
    expect(unused.status).toBe('ok');
    expect(unused.remainingCents).toBe(40000);

    const noBudget = usage.find((u) => u.categoryId === 'cat-transporte')!;
    expect(noBudget.spentCents).toBe(25000);
    expect(noBudget.limitCents).toBeNull();
    expect(noBudget.percentage).toBeNull();
    expect(noBudget.status).toBeNull();
    expect(noBudget.budgetId).toBeNull();
  });

  test('S67-T04: calculateBudgetUsage usa competência no cartão (data da compra) e ignora pagamento de fatura', () => {
    const budgets: FinBudget[] = [
      makeBudget({ id: 'b-merc', category_id: 'cat-mercado', year_month: null, limit_cents: 100000 }),
    ];
    const entries: FinEntry[] = [
      // Compra no cartão em 15/11 que vai para a fatura de dezembro (bill_month 2026-12)
      makeEntry({
        id: 'card-nov',
        kind: 'expense',
        status: 'pending',
        account_id: 'acc-card',
        category_id: 'cat-mercado',
        amount_cents: 60000,
        due_date: '2026-11-15',
        bill_month: '2026-12',
      }),
      // Pagamento de fatura de outubro feito em novembro -> transferência, não entra no orçamento
      makeEntry({
        id: 'bill-pay-out',
        kind: 'transfer_out',
        status: 'paid',
        account_id: 'acc-checking',
        category_id: 'cat-mercado',
        amount_cents: 90000,
        paid_amount_cents: 90000,
        due_date: '2026-11-10',
        transfer_group_id: 'tg-1',
      }),
      makeEntry({
        id: 'bill-pay-in',
        kind: 'transfer_in',
        status: 'paid',
        account_id: 'acc-card',
        category_id: 'cat-mercado',
        amount_cents: 90000,
        paid_amount_cents: 90000,
        due_date: '2026-11-10',
        bill_month: '2026-10',
        transfer_group_id: 'tg-1',
      }),
    ];

    const novUsage = calculateBudgetUsage(entries, budgets, '2026-11', { todayIso: '2026-11-16' });
    expect(novUsage.find((u) => u.categoryId === 'cat-mercado')?.spentCents).toBe(60000);

    // Em dezembro, essa compra de novembro NÃO é duplicada no orçamento de dezembro
    const decUsage = calculateBudgetUsage(entries, budgets, '2026-12', { todayIso: '2026-12-05' });
    expect(decUsage.find((u) => u.categoryId === 'cat-mercado')?.spentCents).toBe(0);
  });

  test('S67-T05: suggestBudgetLimit calcula média dos últimos 3 meses ignorando transferências', () => {
    const entries: FinEntry[] = [
      // 2026-08: 30000
      makeEntry({ id: 'm1', category_id: 'cat-mercado', amount_cents: 30000, due_date: '2026-08-10' }),
      // 2026-09: 45000
      makeEntry({ id: 'm2', category_id: 'cat-mercado', amount_cents: 45000, due_date: '2026-09-12' }),
      // 2026-10: 60000 (+ transferência ignorada)
      makeEntry({ id: 'm3', category_id: 'cat-mercado', amount_cents: 60000, due_date: '2026-10-20' }),
      makeEntry({ id: 'm3-tr', kind: 'transfer_out', category_id: 'cat-mercado', amount_cents: 120000, due_date: '2026-10-21' }),
      // 2026-11 (mês atual não entra na média dos últimos 3)
      makeEntry({ id: 'm4', category_id: 'cat-mercado', amount_cents: 99900, due_date: '2026-11-05' }),
    ];

    // (30000 + 45000 + 60000) / 3 = 45000
    expect(suggestBudgetLimit(entries, 'cat-mercado', '2026-11')).toBe(45000);
    expect(suggestBudgetLimit(entries, 'cat-sem-historico', '2026-11')).toBe(0);
  });

  test('S67-T06: projectCashflow projeta saldo dia a dia, identifica menor saldo/data e sinaliza saldo negativo', () => {
    const accounts: FinAccount[] = [
      makeAccount({ id: 'acc-checking', type: 'checking', initial_balance_cents: 100000 }), // R$ 1.000,00
    ];
    const entries: FinEntry[] = [
      // Já pago antes de hoje: -200,00 -> saldo inicial em 2026-11-16 = 800,00 (80000)
      makeEntry({ id: 'p0', status: 'paid', amount_cents: 20000, paid_amount_cents: 20000, due_date: '2026-11-05' }),
      // Pendente a pagar dia 20/11: -1.000,00 -> saldo cai para -200,00 (-20000)
      makeEntry({ id: 'p1', kind: 'expense', status: 'pending', amount_cents: 100000, due_date: '2026-11-20' }),
      // Pendente a receber dia 25/11: +500,00 -> saldo sobe para +300,00 (30000)
      makeEntry({ id: 'p2', kind: 'income', status: 'pending', amount_cents: 50000, due_date: '2026-11-25' }),
    ];

    const projection = projectCashflow(accounts, entries, '2026-11-16', '2026-11-30');
    expect(projection.startingBalanceCents).toBe(80000);
    expect(projection.days.length).toBe(15); // 16..30 inclusive
    expect(projection.days[0]).toEqual({ date: '2026-11-16', balanceCents: 80000, deltaCents: 0 });
    expect(projection.minBalanceCents).toBe(-20000);
    expect(projection.minBalanceDate).toBe('2026-11-20');
    expect(projection.endBalanceCents).toBe(30000);
    expect(projection.isNegativeAlert).toBe(true);
  });

  test('S67-T07: projectCashflow considera pendentes, recorrências, parcelas e faturas de cartão pelo vencimento', () => {
    const accounts: FinAccount[] = [
      makeAccount({ id: 'acc-checking', type: 'checking', initial_balance_cents: 500000 }),
      makeAccount({
        id: 'acc-card',
        name: 'Nubank',
        type: 'card',
        initial_balance_cents: 0,
        closing_day: 10,
        due_day: 22,
        credit_limit_cents: 400000,
      }),
    ];

    const entries: FinEntry[] = [
      // Duas compras no cartão na fatura 2026-11 (vence 2026-11-22) -> soma 120000 no vencimento 22/11
      makeEntry({
        id: 'c1',
        kind: 'expense',
        status: 'pending',
        account_id: 'acc-card',
        amount_cents: 70000,
        due_date: '2026-11-04',
        bill_month: '2026-11',
      }),
      makeEntry({
        id: 'c2',
        kind: 'expense',
        status: 'pending',
        account_id: 'acc-card',
        amount_cents: 50000,
        due_date: '2026-11-08',
        bill_month: '2026-11',
      }),
      // Parcela na conta corrente vencendo dia 28/11
      makeEntry({
        id: 'inst-2',
        kind: 'expense',
        status: 'pending',
        account_id: 'acc-checking',
        amount_cents: 30000,
        due_date: '2026-11-28',
        installment_group_id: 'ig-1',
        installment_number: 2,
        installment_total: 3,
      }),
    ];

    const recurrences: FinRecurrence[] = [
      {
        id: 'rec-internet',
        kind: 'expense',
        amount_cents: 10000,
        account_id: 'acc-checking',
        category_id: 'cat-moradia',
        description: 'Internet',
        frequency: 'monthly',
        day_of_month: 25,
        start_date: '2026-01-25',
        end_date: null,
        generated_until: null,
        is_subscription: 1,
        variable_amount: 0,
        active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ];

    const projection = projectCashflow(accounts, entries, '2026-11-16', '2026-11-30', {
      recurrences,
      skips: [],
    });

    // Dia 22/11: -120000 (fatura do cartão) -> 500000 - 120000 = 380000
    const day22 = projection.days.find((d) => d.date === '2026-11-22')!;
    expect(day22.deltaCents).toBe(-120000);
    expect(day22.balanceCents).toBe(380000);

    // Dia 25/11: -10000 (recorrência Internet) -> 370000
    const day25 = projection.days.find((d) => d.date === '2026-11-25')!;
    expect(day25.deltaCents).toBe(-10000);
    expect(day25.balanceCents).toBe(370000);

    // Dia 28/11: -30000 (parcela) -> 340000
    const day28 = projection.days.find((d) => d.date === '2026-11-28')!;
    expect(day28.deltaCents).toBe(-30000);
    expect(day28.balanceCents).toBe(340000);

    expect(projection.endBalanceCents).toBe(340000);
    expect(projection.isNegativeAlert).toBe(false);
  });
});
