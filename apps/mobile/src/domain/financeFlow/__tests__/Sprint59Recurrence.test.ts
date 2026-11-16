import type { FinEntry, FinRecurrence } from '../../../db/schema';
import {
  brToIso,
  generateRecurrenceOccurrences,
  nextOccurrenceIso,
} from '../index';

function makeRecurrence(overrides: Partial<FinRecurrence> = {}): FinRecurrence {
  return {
    id: overrides.id ?? 'rec-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    description: overrides.description ?? 'Aluguel',
    account_id: overrides.account_id ?? 'acc-1',
    category_id: overrides.category_id ?? 'cat-moradia',
    frequency: overrides.frequency ?? 'monthly',
    day_of_month: overrides.day_of_month ?? 15,
    start_date: overrides.start_date ?? '2026-01-15',
    end_date: overrides.end_date ?? null,
    is_subscription: overrides.is_subscription ?? 0,
    active: overrides.active ?? 1,
    generated_until: overrides.generated_until ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
  };
}

function makeEntry(overrides: Partial<FinEntry> = {}): FinEntry {
  return {
    id: overrides.id ?? 'entry-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 10000,
    due_date: overrides.due_date ?? '2026-11-15',
    paid_date: overrides.paid_date ?? null,
    paid_amount_cents: overrides.paid_amount_cents ?? null,
    status: overrides.status ?? 'pending',
    account_id: overrides.account_id ?? 'acc-1',
    category_id: overrides.category_id ?? 'cat-moradia',
    description: overrides.description ?? 'Aluguel',
    recurrence_id: overrides.recurrence_id ?? 'rec-1',
    recurrence_period: overrides.recurrence_period ?? '2026-11',
    installment_group_id: overrides.installment_group_id ?? null,
    installment_number: overrides.installment_number ?? null,
    installment_total: overrides.installment_total ?? null,
    created_at: overrides.created_at ?? '2026-11-01T00:00:00.000Z',
  };
}

describe('Sprint 59 — Domínio de Recorrências, Próxima Cobrança e Datas (Fase A)', () => {
  describe('S59-T01: F2 — Deduplicação por recurrence_period e skippedPeriods', () => {
    it('não recria ocorrência cujo vencimento foi alterado quando recurrence_period já existe', () => {
      const rec = makeRecurrence({ frequency: 'monthly', day_of_month: 15, start_date: '2026-10-15' });
      const existing: FinEntry[] = [
        makeEntry({
          id: 'e-nov',
          due_date: '2026-11-22', // usuário alterou o vencimento do dia 15 para 22
          recurrence_period: '2026-11',
        }),
      ];

      const { occurrences } = generateRecurrenceOccurrences(
        rec,
        '2026-11-01',
        '2026-12-31',
        existing
      );

      expect(occurrences.map((o) => o.dueDate)).toEqual(['2026-12-15']);
      expect(occurrences[0].recurrencePeriod).toBe('2026-12');
    });

    it('não gera ocorrência para períodos presentes em skippedPeriods (mensal e semanal)', () => {
      const monthly = makeRecurrence({ id: 'rec-m', frequency: 'monthly', day_of_month: 10, start_date: '2026-10-10' });
      const monthlyRes = generateRecurrenceOccurrences(
        monthly,
        '2026-11-01',
        '2027-01-31',
        [],
        ['2026-12']
      );
      expect(monthlyRes.occurrences.map((o) => o.dueDate)).toEqual(['2026-11-10', '2027-01-10']);

      const weekly = makeRecurrence({ id: 'rec-w', frequency: 'weekly', day_of_month: 3, start_date: '2026-11-03' });
      const weeklyRes = generateRecurrenceOccurrences(
        weekly,
        '2026-11-01',
        '2026-11-24',
        [],
        ['2026-11-10']
      );
      expect(weeklyRes.occurrences.map((o) => o.dueDate)).toEqual([
        '2026-11-03',
        '2026-11-17',
        '2026-11-24',
      ]);
      expect(weeklyRes.occurrences.map((o) => o.recurrencePeriod)).toEqual([
        '2026-11-03',
        '2026-11-17',
        '2026-11-24',
      ]);
    });
  });

  describe('S59-T02: F8 — nextOccurrenceIso(recurrence, todayIso)', () => {
    it('calcula próxima cobrança mensal ajustando dia 31 em fevereiro (comum e bissexto)', () => {
      const rec = makeRecurrence({ frequency: 'monthly', day_of_month: 31, start_date: '2026-01-31' });
      expect(nextOccurrenceIso(rec, '2026-02-01')).toBe('2026-02-28');
      expect(nextOccurrenceIso(rec, '2028-02-01')).toBe('2028-02-29');
      expect(nextOccurrenceIso(rec, '2026-02-28')).toBe('2026-02-28');
      expect(nextOccurrenceIso(rec, '2026-03-01')).toBe('2026-03-31');
    });

    it('calcula próxima cobrança anual para 29/02 em anos não bissextos e bissextos', () => {
      const rec = makeRecurrence({ frequency: 'yearly', day_of_month: 29, start_date: '2024-02-29' });
      expect(nextOccurrenceIso(rec, '2026-01-10')).toBe('2026-02-28');
      expect(nextOccurrenceIso(rec, '2026-03-01')).toBe('2027-02-28');
      expect(nextOccurrenceIso(rec, '2028-01-10')).toBe('2028-02-29');
    });

    it('calcula próxima cobrança semanal a partir de todayIso', () => {
      const rec = makeRecurrence({ frequency: 'weekly', day_of_month: 3, start_date: '2026-11-03' });
      expect(nextOccurrenceIso(rec, '2026-11-10')).toBe('2026-11-10');
      expect(nextOccurrenceIso(rec, '2026-11-11')).toBe('2026-11-17');
    });

    it('prioriza o menor vencimento pendente >= hoje quando há ocorrências pendentes', () => {
      const rec = makeRecurrence({ id: 'rec-sub', frequency: 'monthly', day_of_month: 15, start_date: '2026-10-15' });
      const pending = [
        makeEntry({ id: 'e-oct', recurrence_id: 'rec-sub', status: 'pending', due_date: '2026-10-15' }),
        makeEntry({ id: 'e-dec', recurrence_id: 'rec-sub', status: 'pending', due_date: '2026-12-15' }),
        makeEntry({ id: 'e-nov', recurrence_id: 'rec-sub', status: 'pending', due_date: '2026-11-18' }),
      ];
      expect(nextOccurrenceIso(rec, '2026-11-13', pending)).toBe('2026-11-18');
    });
  });

  describe('S59-T03: F12 — brToIso no domínio', () => {
    it('converte datas dd/mm/aaaa e ISO válidas e rejeita datas inválidas', () => {
      expect(brToIso('15/11/2026')).toBe('2026-11-15');
      expect(brToIso('2026-11-15')).toBe('2026-11-15');
      expect(brToIso('29/02/2024')).toBe('2024-02-29');
      expect(brToIso('31/02/2026')).toBeNull();
      expect(brToIso('29/02/2026')).toBeNull();
      expect(brToIso('99/99/2026')).toBeNull();
      expect(brToIso('')).toBeNull();
    });
  });
});
