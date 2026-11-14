import type { FinEntry, FinRecurrence } from '../../../db/schema';
import {
  formatCentsBRL,
  parseBRLToCents,
  isLeapYear,
  clampDayOfMonth,
  generateRecurrenceOccurrences,
  splitInstallments,
  buildInstallmentSchedule,
  calculateAccountBalance,
  calculateMonthlySummary,
  classifyEntryDueStatus,
  detectOverdueAndDueSoon,
  calculateSubscriptionsSummary,
} from '../index';

function makeEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: overrides.id ?? 'entry-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    due_date: overrides.due_date ?? '2026-11-10',
    paid_date: overrides.paid_date ?? null,
    paid_amount_cents: overrides.paid_amount_cents ?? null,
    status: overrides.status ?? 'pending',
    account_id: overrides.account_id ?? 'acc-1',
    category_id: overrides.category_id ?? 'cat-moradia',
    description: overrides.description ?? 'Teste',
    recurrence_id: overrides.recurrence_id ?? null,
    installment_group_id: overrides.installment_group_id ?? null,
    installment_number: overrides.installment_number ?? null,
    installment_total: overrides.installment_total ?? null,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  };
}

function makeRecurrence(overrides: Partial<FinRecurrence> = {}): FinRecurrence {
  return {
    id: overrides.id ?? 'rec-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    description: overrides.description ?? 'Aluguel',
    account_id: overrides.account_id ?? 'acc-1',
    category_id: overrides.category_id ?? 'cat-moradia',
    frequency: overrides.frequency ?? 'monthly',
    day_of_month: overrides.day_of_month ?? 10,
    start_date: overrides.start_date ?? '2026-01-10',
    end_date: overrides.end_date ?? null,
    is_subscription: overrides.is_subscription ?? 0,
    active: overrides.active ?? 1,
    generated_until: overrides.generated_until ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('Sprint 54 — FinanceFlow Pure Domain', () => {
  describe('Formatação BRL e Modo Privacidade', () => {
    it('formata centavos inteiros no padrão pt-BR (R$ 1.234,56) e mascara no modo privacidade', () => {
      expect(formatCentsBRL(123456)).toBe('R$ 1.234,56');
      expect(formatCentsBRL(0)).toBe('R$ 0,00');
      expect(formatCentsBRL(5)).toBe('R$ 0,05');
      expect(formatCentsBRL(-5000)).toBe('-R$ 50,00');
      expect(formatCentsBRL(123456, true)).toBe('R$ ••••••');
      expect(formatCentsBRL(-5000, true)).toBe('R$ ••••••');
    });

    it('converte strings BRL e números em centavos inteiros sem float impreciso', () => {
      expect(parseBRLToCents('1.234,56')).toBe(123456);
      expect(parseBRLToCents('R$ 99,90')).toBe(9990);
      expect(parseBRLToCents('19.99')).toBe(1999);
      expect(parseBRLToCents(19.99)).toBe(1999);
      expect(parseBRLToCents('')).toBe(0);
    });
  });

  describe('Calendário e meses curtos', () => {
    it('identifica anos bissextos e ajusta o último dia válido de cada mês', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(1900)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);

      expect(clampDayOfMonth(2026, 2, 31)).toBe(28);
      expect(clampDayOfMonth(2028, 2, 31)).toBe(29);
      expect(clampDayOfMonth(2026, 4, 31)).toBe(30);
      expect(clampDayOfMonth(2026, 3, 31)).toBe(31);
    });
  });

  describe('Geração de ocorrências de recorrência', () => {
    it('gera recorrência mensal dia 31 ajustando fevereiro (28/29) e meses de 30 dias', () => {
      const rec = makeRecurrence({
        id: 'rec-m31',
        frequency: 'monthly',
        day_of_month: 31,
        start_date: '2026-01-31',
      });

      const res2026 = generateRecurrenceOccurrences(rec, '2026-01-01', '2026-04-30');
      expect(res2026.occurrences.map((o) => o.dueDate)).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
        '2026-04-30',
      ]);
      expect(res2026.generatedUntil).toBe('2026-04-30');

      const resLeap = generateRecurrenceOccurrences(
        makeRecurrence({ id: 'rec-m31-leap', frequency: 'monthly', day_of_month: 31, start_date: '2028-01-31' }),
        '2028-01-01',
        '2028-03-31'
      );
      expect(resLeap.occurrences.map((o) => o.dueDate)).toEqual([
        '2028-01-31',
        '2028-02-29',
        '2028-03-31',
      ]);
    });

    it('gera recorrência anual iniciada em 29/02 usando 28/02 em anos comuns e 29/02 em bissextos', () => {
      const rec = makeRecurrence({
        id: 'rec-anual-leap',
        frequency: 'yearly',
        day_of_month: 29,
        start_date: '2024-02-29',
      });

      const res = generateRecurrenceOccurrences(rec, '2024-01-01', '2028-12-31');
      expect(res.occurrences.map((o) => o.dueDate)).toEqual([
        '2024-02-29',
        '2025-02-28',
        '2026-02-28',
        '2027-02-28',
        '2028-02-29',
      ]);
    });

    it('gera recorrência semanal a cada 7 dias respeitando start_date e end_date opcional', () => {
      const rec = makeRecurrence({
        id: 'rec-semanal',
        frequency: 'weekly',
        day_of_month: 1,
        start_date: '2026-11-01',
        end_date: '2026-11-20',
      });

      const res = generateRecurrenceOccurrences(rec, '2026-10-15', '2026-11-30');
      expect(res.occurrences.map((o) => o.dueDate)).toEqual([
        '2026-11-01',
        '2026-11-08',
        '2026-11-15',
      ]);
      expect(res.generatedUntil).toBe('2026-11-20');
    });

    it('é idempotente ao reexecutar na mesma janela e não gera quando active = 0', () => {
      const rec = makeRecurrence({
        id: 'rec-idemp',
        frequency: 'monthly',
        day_of_month: 15,
        start_date: '2026-01-15',
      });

      const existing = [
        { recurrence_id: 'rec-idemp', due_date: '2026-01-15' },
        { recurrence_id: 'rec-idemp', due_date: '2026-02-15' },
      ];
      const res = generateRecurrenceOccurrences(rec, '2026-01-01', '2026-03-31', existing);
      expect(res.occurrences.map((o) => o.dueDate)).toEqual(['2026-03-15']);

      const inactive = makeRecurrence({ id: 'rec-off', active: 0 });
      const resInactive = generateRecurrenceOccurrences(inactive, '2026-01-01', '2026-03-31');
      expect(resInactive.occurrences).toEqual([]);
    });
  });

  describe('Divisão de parcelas sem perda de centavos', () => {
    it('divide centavos inteiros exatamente colocando o resto na primeira ou última parcela', () => {
      const firstRem = splitInstallments(10000, 3, 'first');
      expect(firstRem).toEqual([3334, 3333, 3333]);
      expect(firstRem.reduce((a, b) => a + b, 0)).toBe(10000);

      const lastRem = splitInstallments(10000, 3, 'last');
      expect(lastRem).toEqual([3333, 3333, 3334]);
      expect(lastRem.reduce((a, b) => a + b, 0)).toBe(10000);

      const sixParts = splitInstallments(1000, 6, 'first');
      expect(sixParts).toEqual([167, 167, 167, 167, 166, 166]);
      expect(sixParts.reduce((a, b) => a + b, 0)).toBe(1000);

      const oddTotal = splitInstallments(125099, 12, 'first');
      expect(oddTotal).toHaveLength(12);
      expect(oddTotal.every(Number.isInteger)).toBe(true);
      expect(oddTotal.reduce((a, b) => a + b, 0)).toBe(125099);
    });

    it('gera cronograma de parcelas preservando o dia-âncora 31 e rótulos N/total', () => {
      const schedule = buildInstallmentSchedule({
        totalCents: 125099,
        installmentTotal: 12,
        firstDueDate: '2026-01-31',
        remainderOn: 'first',
      });

      expect(schedule).toHaveLength(12);
      expect(schedule.reduce((acc, p) => acc + p.amountCents, 0)).toBe(125099);
      expect(schedule[0]).toMatchObject({
        installmentNumber: 1,
        installmentTotal: 12,
        dueDate: '2026-01-31',
        label: '1/12',
      });
      expect(schedule[1].dueDate).toBe('2026-02-28');
      expect(schedule[1].label).toBe('2/12');
      expect(schedule[2].dueDate).toBe('2026-03-31');
      expect(schedule[3].dueDate).toBe('2026-04-30');
      expect(schedule[11].dueDate).toBe('2026-12-31');
      expect(schedule[11].label).toBe('12/12');
    });

    it('rejeita parâmetros inválidos na divisão de parcelas', () => {
      expect(() => splitInstallments(1000, 0)).toThrow();
      expect(() => splitInstallments(0, 3)).toThrow();
      expect(() => splitInstallments(100.5, 2)).toThrow();
    });
  });

  describe('Saldo da conta e totais do mês', () => {
    it('calcula saldo da conta considerando apenas lançamentos pagos com valor real', () => {
      const entries = [
        makeEntry({ id: 'e1', account_id: 'acc-1', kind: 'income', status: 'paid', amount_cents: 500000, paid_amount_cents: 520000 }),
        makeEntry({ id: 'e2', account_id: 'acc-1', kind: 'expense', status: 'paid', amount_cents: 150000, paid_amount_cents: 145000 }),
        makeEntry({ id: 'e3', account_id: 'acc-1', kind: 'expense', status: 'pending', amount_cents: 99900 }),
        makeEntry({ id: 'e4', account_id: 'acc-2', kind: 'expense', status: 'paid', amount_cents: 80000, paid_amount_cents: 80000 }),
      ];

      // 100000 (inicial) + 520000 - 145000 = 475000
      expect(calculateAccountBalance(100000, entries, 'acc-1')).toBe(475000);
    });

    it('calcula totais mensais (realizado, pendente, previsto) e distribuição por categoria', () => {
      const entries = [
        makeEntry({ id: 'm1', kind: 'income', status: 'paid', due_date: '2026-11-05', amount_cents: 600000, paid_amount_cents: 600000, category_id: 'cat-salario' }),
        makeEntry({ id: 'm2', kind: 'expense', status: 'paid', due_date: '2026-11-10', amount_cents: 200000, paid_amount_cents: 200000, category_id: 'cat-moradia' }),
        makeEntry({ id: 'm3', kind: 'expense', status: 'pending', due_date: '2026-11-20', amount_cents: 100000, category_id: 'cat-mercado' }),
        makeEntry({ id: 'm4', kind: 'expense', status: 'paid', due_date: '2026-10-25', amount_cents: 50000, paid_amount_cents: 50000, category_id: 'cat-lazer' }),
      ];

      const summary = calculateMonthlySummary(entries, '2026-11');
      expect(summary.totalIncomeCents).toBe(600000);
      expect(summary.totalExpenseCents).toBe(300000);
      expect(summary.paidIncomeCents).toBe(600000);
      expect(summary.paidExpenseCents).toBe(200000);
      expect(summary.pendingIncomeCents).toBe(0);
      expect(summary.pendingExpenseCents).toBe(100000);
      expect(summary.balanceCents).toBe(400000);
      expect(summary.projectedBalanceCents).toBe(300000);

      expect(summary.expenseByCategory).toHaveLength(2);
      expect(summary.expenseByCategory[0]).toMatchObject({
        categoryId: 'cat-moradia',
        amountCents: 200000,
      });
      const sumPct = summary.expenseByCategory.reduce((s, c) => s + c.percentage, 0);
      expect(Math.round(sumPct)).toBe(100);
    });
  });

  describe('Detecção de atrasadas e a vencer em 7 dias', () => {
    it('classifica corretamente paid, overdue, due_soon (<= 7 dias) e upcoming', () => {
      const today = '2026-11-13';

      expect(classifyEntryDueStatus(makeEntry({ status: 'paid', due_date: '2026-11-01' }), today)).toBe('paid');
      expect(classifyEntryDueStatus(makeEntry({ status: 'pending', due_date: '2026-11-12' }), today)).toBe('overdue');
      expect(classifyEntryDueStatus(makeEntry({ status: 'pending', due_date: '2026-11-13' }), today)).toBe('due_soon');
      expect(classifyEntryDueStatus(makeEntry({ status: 'pending', due_date: '2026-11-20' }), today)).toBe('due_soon');
      expect(classifyEntryDueStatus(makeEntry({ status: 'pending', due_date: '2026-11-21' }), today)).toBe('upcoming');
    });

    it('agrupa lançamentos atrasados e a vencer em 7 dias somando totais', () => {
      const today = '2026-11-13';
      const entries = [
        makeEntry({ id: 'o1', kind: 'expense', status: 'pending', due_date: '2026-11-10', amount_cents: 15000 }),
        makeEntry({ id: 'd1', kind: 'expense', status: 'pending', due_date: '2026-11-15', amount_cents: 25000 }),
        makeEntry({ id: 'd2', kind: 'income', status: 'pending', due_date: '2026-11-19', amount_cents: 50000 }),
        makeEntry({ id: 'u1', kind: 'expense', status: 'pending', due_date: '2026-11-25', amount_cents: 80000 }),
        makeEntry({ id: 'p1', kind: 'expense', status: 'paid', due_date: '2026-11-01', amount_cents: 99000 }),
      ];

      const result = detectOverdueAndDueSoon(entries, today, 7);
      expect(result.overdue.map((e) => e.id)).toEqual(['o1']);
      expect(result.dueSoon.map((e) => e.id)).toEqual(['d1', 'd2']);
      expect(result.upcoming.map((e) => e.id)).toEqual(['u1']);
      expect(result.overduePayableCents).toBe(15000);
      expect(result.dueSoonPayableCents).toBe(25000);
      expect(result.dueSoonTotalCents).toBe(75000);
    });
  });

  describe('Resumo de assinaturas (mensal e anual)', () => {
    it('calcula total mensal e anual apenas para assinaturas ativas', () => {
      const recs = [
        makeRecurrence({ id: 's1', is_subscription: 1, active: 1, frequency: 'monthly', amount_cents: 5000 }), // 50/mês, 600/ano
        makeRecurrence({ id: 's2', is_subscription: 1, active: 1, frequency: 'yearly', amount_cents: 120000 }), // 100/mês, 1200/ano
        makeRecurrence({ id: 's3', is_subscription: 1, active: 0, frequency: 'monthly', amount_cents: 9900 }), // pausada: ignorar
        makeRecurrence({ id: 'r1', is_subscription: 0, active: 1, frequency: 'monthly', amount_cents: 200000 }), // recorrência comum: ignorar
      ];

      const summary = calculateSubscriptionsSummary(recs);
      expect(summary.activeCount).toBe(2);
      expect(summary.pausedCount).toBe(1);
      expect(summary.monthlyTotalCents).toBe(15000);
      expect(summary.annualTotalCents).toBe(180000);
    });
  });
});
