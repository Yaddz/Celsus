import { simulate } from '../sandbox/paperPortfolio';
import * as contributionPlan from '../finance/contributionPlan';

describe('Sprint 110 — Domínio paperPortfolio.simulate (R50)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('S110-T01: 2 ativos 50/50 sem rebalanceamento mantém quantidades iniciais e reflete divergência de preços', () => {
    // Ativo A dobra de 10 -> 20; Ativo B fica em 10.
    // Inicial: R$ 1.000 (500 em A = 50 cotas, 500 em B = 50 cotas).
    // Final: 50*20 + 50*10 = 1500.
    const res = simulate({
      items: [
        { ticker: 'AAAA3', class: 'STOCK', weight: 50 },
        { ticker: 'BBBB3', class: 'STOCK', weight: 50 },
      ],
      start: '2025-01-02',
      end: '2025-07-02',
      initialCents: 100_000,
      monthlyCents: 0,
      rebalance: 'never',
      series: {
        AAAA3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-04-02', close: 15 },
          { date: '2025-07-02', close: 20 },
        ],
        BBBB3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-04-02', close: 10 },
          { date: '2025-07-02', close: 10 },
        ],
      },
    });

    expect(res.investedBRL).toBeCloseTo(1000, 2);
    expect(res.finalValueBRL).toBeCloseTo(1500, 2);
    expect(res.returnPct).toBeCloseTo(50, 2);
    expect(res.dailyCurve.length).toBeGreaterThanOrEqual(3);
    expect(res.byAsset).toHaveLength(2);
    const assetA = res.byAsset.find((a) => a.ticker === 'AAAA3');
    const assetB = res.byAsset.find((a) => a.ticker === 'BBBB3');
    expect(assetA?.finalValueBRL).toBeCloseTo(1000, 2);
    expect(assetB?.finalValueBRL).toBeCloseTo(500, 2);
  });

  test('S110-T02: 2 ativos 50/50 com rebalanceamento semestral (6 meses) ajusta pesos na virada do 6º mês', () => {
    // Em 2025-01-02: A=10, B=10 (R$ 500 cada = 50 cotas cada).
    // Em 2025-07-01 (6 meses depois): A=20, B=10 -> A=1000, B=500, total=1500 -> rebalanceia para 750/750 (A=37.5, B=75).
    // Em 2025-08-01: A=20, B=20 -> A=750, B=1500 -> total=2250 (vs 2000 sem rebalanceamento).
    const res = simulate({
      items: [
        { ticker: 'AAAA3', class: 'STOCK', weight: 50 },
        { ticker: 'BBBB3', class: 'STOCK', weight: 50 },
      ],
      start: '2025-01-02',
      end: '2025-08-01',
      initialCents: 100_000,
      monthlyCents: 0,
      rebalance: 6,
      series: {
        AAAA3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-07-01', close: 20 },
          { date: '2025-08-01', close: 20 },
        ],
        BBBB3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-07-01', close: 10 },
          { date: '2025-08-01', close: 20 },
        ],
      },
    });

    expect(res.finalValueBRL).toBeCloseTo(2250, 2);
  });

  test('S110-T03: aporte mensal on_contribution reutiliza calculateTwoPhaseContribution e direciona para o ativo mais abaixo do peso', () => {
    const spy = jest.spyOn(contributionPlan, 'calculateTwoPhaseContribution');

    // A sobe para 20 em fev, B cai para 10 -> aporte de R$ 1.000 em fev deve ir todo para B!
    const res = simulate({
      items: [
        { ticker: 'AAAA3', class: 'STOCK', weight: 50 },
        { ticker: 'BBBB3', class: 'STOCK', weight: 50 },
      ],
      start: '2025-01-02',
      end: '2025-02-03',
      initialCents: 100_000,
      monthlyCents: 100_000,
      rebalance: 'on_contribution',
      series: {
        AAAA3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-02-03', close: 20 },
        ],
        BBBB3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-02-03', close: 10 },
        ],
      },
    });

    expect(spy).toHaveBeenCalled();
    expect(res.investedBRL).toBeCloseTo(2000, 2);
    const assetB = res.byAsset.find((a) => a.ticker === 'BBBB3');
    // B recebeu o aporte de R$ 1.000 além dos R$ 500 iniciais -> R$ 1.500
    expect(assetB?.finalValueBRL).toBeCloseTo(1500, 2);
  });

  test('S110-T04: drawdown conhecido numa série sintética (pico 120 -> vale 90 = 25%)', () => {
    const res = simulate({
      items: [{ ticker: 'AAAA3', class: 'STOCK', weight: 100 }],
      start: '2025-01-02',
      end: '2025-01-05',
      initialCents: 100_000, // 1000 BRL -> 10 cotas a R$ 100
      monthlyCents: 0,
      rebalance: 'never',
      series: {
        AAAA3: [
          { date: '2025-01-02', close: 100 }, // 1000
          { date: '2025-01-03', close: 120 }, // 1200 (pico)
          { date: '2025-01-04', close: 90 },  // 900 (-25% do pico)
          { date: '2025-01-05', close: 110 }, // 1100
        ],
      },
    });

    expect(res.maxDrawdownPct).toBeCloseTo(25, 2);
  });

  test('S110-T05: ativo sem série no início entra na primeira data com dado e relatório lista em lateStartAssets', () => {
    const res = simulate({
      items: [
        { ticker: 'AAAA3', class: 'STOCK', weight: 50 },
        { ticker: 'LATE3', class: 'STOCK', weight: 50 },
      ],
      start: '2025-01-02',
      end: '2025-03-03',
      initialCents: 100_000,
      monthlyCents: 0,
      rebalance: 'never',
      series: {
        AAAA3: [
          { date: '2025-01-02', close: 10 },
          { date: '2025-02-03', close: 10 },
          { date: '2025-03-03', close: 10 },
        ],
        LATE3: [
          // Sem dado em 2025-01-02; começa só em 2025-02-03
          { date: '2025-02-03', close: 20 },
          { date: '2025-03-03', close: 30 },
        ],
      },
    });

    expect(res.lateStartAssets).toEqual([
      expect.objectContaining({
        ticker: 'LATE3',
        requestedStart: '2025-01-02',
        effectiveStart: '2025-02-03',
      }),
    ]);
    const lateAsset = res.byAsset.find((a) => a.ticker === 'LATE3');
    expect(lateAsset?.effectiveStartDate).toBe('2025-02-03');
    // 500 BRL aplicados em 2025-02-03 a 20 -> 25 cotas -> a 30 = 750 BRL
    expect(lateAsset?.finalValueBRL).toBeCloseTo(750, 2);
  });

  test('S110-T06: pesos diferentes de 100% lançam erro de validação', () => {
    expect(() =>
      simulate({
        items: [
          { ticker: 'AAAA3', class: 'STOCK', weight: 60 },
          { ticker: 'BBBB3', class: 'STOCK', weight: 30 },
        ],
        start: '2025-01-02',
        initialCents: 100_000,
        monthlyCents: 0,
        rebalance: 'never',
        series: {},
      })
    ).toThrow(/100%/);
  });
});
