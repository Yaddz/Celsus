import type { FinEntry } from '../../db/schema';
import { monthSummary, type MonthSummaryR43 } from '../financeFlow/monthSummary';
import {
  averageMonthlyExpense,
  fireNumber,
  projectToFire,
} from '../sandbox/fire';
import {
  annualizeCdi12m,
  futureValueOfSeries,
} from '../sandbox/opportunityCost';

function makeEntry(
  overrides: Partial<FinEntry> & Pick<FinEntry, 'id' | 'kind' | 'amount_cents' | 'due_date'>
): FinEntry {
  return {
    account_id: 'acc-checking',
    category_id: 'cat-geral',
    description: 'Lançamento',
    status: 'paid',
    paid_amount_cents: overrides.amount_cents,
    paid_at: overrides.due_date,
    installment_group_id: null,
    installment_index: null,
    installment_total: null,
    recurrence_id: null,
    transfer_group_id: null,
    card_bill_month: null,
    linked_transaction_id: null,
    linked_income_id: null,
    of_id: null,
    of_class_reason: null,
    of_removed_at: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Sprint 112 — Domínio FIRE & Custo de Oportunidade (R52, R53)', () => {
  test('S112-T01: averageMonthlyExpense ignora transferências e investment_* ao partir dos resumos R43', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    const entries: FinEntry[] = [
      // Mês 1: 5.000 de despesa + 2.000 transfer_out + 1.500 investment_buy + 300 investment_income
      makeEntry({ id: 'e1', kind: 'expense', amount_cents: 500_000, due_date: '2026-08-10' }),
      makeEntry({ id: 't1', kind: 'transfer_out', amount_cents: 200_000, due_date: '2026-08-12', transfer_group_id: 'tg1' }),
      makeEntry({ id: 'b1', kind: 'investment_buy', amount_cents: 150_000, due_date: '2026-08-15', linked_transaction_id: 'tx1' }),
      makeEntry({ id: 'i1', kind: 'investment_income', amount_cents: 30_000, due_date: '2026-08-20', linked_transaction_id: 'tx2' }),
      // Mês 2: 6.000 de despesa + 1.000 investment_sell
      makeEntry({ id: 'e2', kind: 'expense', amount_cents: 600_000, due_date: '2026-09-10' }),
      makeEntry({ id: 's2', kind: 'investment_sell', amount_cents: 100_000, due_date: '2026-09-18', linked_transaction_id: 'tx3' }),
      // Mês 3: 7.000 de despesa + 500 transfer_in
      makeEntry({ id: 'e3', kind: 'expense', amount_cents: 700_000, due_date: '2026-10-10' }),
      makeEntry({ id: 't3', kind: 'transfer_in', amount_cents: 50_000, due_date: '2026-10-11', transfer_group_id: 'tg2' }),
    ];

    const summaries = months.map((ym) => monthSummary(entries, ym));
    // Média de 500.000, 600.000 e 700.000 = 600.000 centavos (R$ 6.000)
    expect(averageMonthlyExpense(summaries, 12)).toBe(600_000);
  });

  test('S112-T02: averageMonthlyExpense usa apenas os últimos N meses quando há mais meses disponíveis', () => {
    const summaries: Array<Pick<MonthSummaryR43, 'yearMonth' | 'expenseCents'>> = [
      { yearMonth: '2026-01', expenseCents: 100_000 },
      { yearMonth: '2026-02', expenseCents: 200_000 },
      { yearMonth: '2026-03', expenseCents: 400_000 },
      { yearMonth: '2026-04', expenseCents: 500_000 },
      { yearMonth: '2026-05', expenseCents: 600_000 },
    ];
    // Últimos 3 meses (mar, abr, mai): (400k + 500k + 600k) / 3 = 500k
    expect(averageMonthlyExpense(summaries, 3)).toBe(500_000);
    // Todos os 5 meses (n=12): (100k + 200k + 400k + 500k + 600k) / 5 = 360k
    expect(averageMonthlyExpense(summaries, 12)).toBe(360_000);
  });

  test('S112-T03: averageMonthlyExpense retorna null com menos de 3 meses', () => {
    const twoMonths: Array<Pick<MonthSummaryR43, 'yearMonth' | 'expenseCents'>> = [
      { yearMonth: '2026-09', expenseCents: 500_000 },
      { yearMonth: '2026-10', expenseCents: 600_000 },
    ];
    expect(averageMonthlyExpense(twoMonths, 12)).toBeNull();
    expect(averageMonthlyExpense([], 12)).toBeNull();
  });

  test('S112-T04: fireNumber de R$ 6.850/mês a 4% resulta em R$ 2.055.000', () => {
    // Em centavos: 685.000 * 12 / 0,04 = 205.500.000 centavos (R$ 2.055.000,00)
    expect(fireNumber(685_000, 0.04)).toBe(205_500_000);
    expect(fireNumber(685_000, 0)).toBeNull();
    expect(fireNumber(685_000, -0.02)).toBeNull();
  });

  test('S112-T05: projectToFire calcula série mensal e data de chegada quando atinge a meta', () => {
    const res = projectToFire({
      investedCents: 100_000_00, // R$ 100.000
      monthlyCents: 500_000, // R$ 5.000/mês
      realReturn: 0.06, // 6% a.a. real
      target: 200_000_00, // R$ 200.000
      startYearMonth: '2026-11',
    });

    expect(res.reached).toBe(true);
    expect(res.arrivalMonths).not.toBeNull();
    expect(res.arrivalMonths!).toBeGreaterThan(0);
    expect(res.arrivalMonths!).toBeLessThanOrEqual(24);
    expect(res.arrivalDate).toMatch(/^\d{4}-\d{2}$/);
    expect(res.series.length).toBeGreaterThan(res.arrivalMonths!);
    expect(res.series[0].balanceCents).toBe(100_000_00);
    expect(res.series[res.arrivalMonths!].balanceCents).toBeGreaterThanOrEqual(200_000_00);
  });

  test('S112-T06: projectToFire retorna arrivalMonths=null e arrivalDate=null se não chega em 60 anos', () => {
    const res = projectToFire({
      investedCents: 10_000_00, // R$ 10.000
      monthlyCents: 10_000, // R$ 100/mês
      realReturn: 0.02, // 2% a.a.
      target: 500_000_000, // R$ 5.000.000
      startYearMonth: '2026-11',
    });

    expect(res.reached).toBe(false);
    expect(res.arrivalMonths).toBeNull();
    expect(res.arrivalDate).toBeNull();
    expect(res.series.length).toBe(721); // mês 0 até mês 720 (60 anos)
  });

  test('S112-T07: futureValueOfSeries com taxa conhecida bate com conta à mão e annualizeCdi12m anualiza série CDI', () => {
    // R$ 100,00/mês (10.000 centavos) a 12% a.a. por 5 anos (60 meses)
    // Taxa mensal equivalente i = (1 + 0,12)^(1/12) - 1 = 0,009488792934583046
    // FV = 10000 * ((1 + i)^60 - 1) / i
    const monthlyCents = 10_000;
    const annualRate = 0.12;
    const years = 5;
    const i = Math.pow(1 + annualRate, 1 / 12) - 1;
    const expectedTotal = Math.round(monthlyCents * ((Math.pow(1 + i, 60) - 1) / i));
    const expectedContributed = monthlyCents * 60;
    const expectedInterest = expectedTotal - expectedContributed;

    const fv = futureValueOfSeries(monthlyCents, annualRate, years);
    expect(fv.contributedCents).toBe(expectedContributed);
    expect(fv.totalCents).toBe(expectedTotal);
    expect(fv.interestCents).toBe(expectedInterest);

    // 12 pontos mensais de 0,9% a.m. => (1.009^12 - 1) ≈ 11,35% a.a.
    const macro = Array.from({ length: 12 }, (_, idx) => ({
      date: `2026-${String(idx + 1).padStart(2, '0')}-01`,
      ratePct: 0.9,
    }));
    const cdiAnnual = annualizeCdi12m(macro);
    expect(cdiAnnual).not.toBeNull();
    expect(cdiAnnual!).toBeCloseTo(Math.pow(1.009, 12) - 1, 4);
    expect(annualizeCdi12m([])).toBeNull();
  });

  test('S112-T08: futureValueOfSeries com taxa 0 retorna apenas o total aportado e juros 0', () => {
    const fv = futureValueOfSeries(25_000, 0, 10); // R$ 250/mês * 120 meses = R$ 30.000
    expect(fv.contributedCents).toBe(3_000_000);
    expect(fv.totalCents).toBe(3_000_000);
    expect(fv.interestCents).toBe(0);
  });
});
