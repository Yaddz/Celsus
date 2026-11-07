import {
  calculateGoalProgress,
  projectMonthsToGoal,
  requiredMonthlyContribution,
  buildClassSummary,
  summarizeIncome,
  calculateTwoPhaseContribution,
} from '..';

describe('goal', () => {
  it('calcula progresso e falta da meta de 100k', () => {
    const p = calculateGoalProgress('48320.75', '100000');
    expect(p.progressPercent).toBe('48.32');
    expect(p.remaining).toBe('51679.25');
    expect(p.reached).toBe(false);
  });
  it('limita a 100% e sem meta retorna zero', () => {
    expect(calculateGoalProgress(120000, 100000).progressPercent).toBe('100.00');
    expect(calculateGoalProgress(120000, 100000).reached).toBe(true);
    expect(calculateGoalProgress(10, null).progressPercent).toBe('0.00');
  });
  it('projeta meses sem retorno e com retorno', () => {
    expect(projectMonthsToGoal(0, 1000, 100, 0)).toBe(10);
    expect(projectMonthsToGoal(2000, 1000, 100)).toBe(0);
    expect(projectMonthsToGoal(0, 1000, 0, 0)).toBeNull();
    expect(projectMonthsToGoal(0, 10000, 100, 12)!).toBeLessThan(100);
  });
  it('aporte mensal necessário', () => {
    expect(requiredMonthlyContribution(0, 1200, 12, 0)).toBe('100.00');
  });
});

describe('classSummary (aba Resumo)', () => {
  it('valor-alvo, falta e aporte só entre classes que recebem', () => {
    const s = buildClassSummary(
      [
        { assetClass: 'FII', targetPercentage: 25, currentValue: 1000, receivesContribution: true },
        { assetClass: 'STOCK', targetPercentage: 30, currentValue: 3000, receivesContribution: true },
        { assetClass: 'FIXED_INCOME', targetPercentage: 45, currentValue: 0, receivesContribution: false },
      ],
      '935.42'
    );
    expect(s.totalValue).toBe('4000.00');
    expect(s.rows[0].targetValue).toBe('1000.00');
    expect(s.rows[1].gap).toBe('-1800.00');
    expect(s.rows[2].contributionShare).toBe('0.00');
    expect(s.rows[0].contributionShare).toBe('425.19'); // 935.42*25/55
    expect(s.rows[1].contributionShare).toBe('510.23');
  });
});

describe('income', () => {
  it('total do ano, média mensal e por ano', () => {
    const r = summarizeIncome(
      [
        { date: '2025-06-10', amount: 459.85 },
        { date: '2026-05-20', amount: 60.6 },
        { date: '2026-07-01', amount: 72.7 },
        { date: '2026-10-05', amount: 63.7 },
      ],
      '2026-10-28'
    );
    expect(r.totalYear).toBe('197.00');
    expect(r.monthlyAverage).toBe('32.83'); // 6 meses: mai-out
    expect(r.byYear['2025']).toBe('459.85');
  });
});

describe('aporte em 2 fases (aba Aporte)', () => {
  const classes = [{ assetClass: 'FII' as const, targetPercentage: 50, receivesContribution: true }];
  const assets = [
    { ticker: 'AAA11', assetClass: 'FII' as const, price: 10, currentValue: 0, targetInClassPercent: 60 },
    { ticker: 'BBB11', assetClass: 'FII' as const, price: 7, currentValue: 0, targetInClassPercent: 40 },
  ];
  it('compra cotas inteiras e distribui o troco por maior gap', () => {
    const p = calculateTwoPhaseContribution(100, classes, assets);
    // alvo: AAA 60, BBB 40. cotas: AAA 6 (60), BBB floor(40/7)=5 (35) => sobra 5 < 7 e < 10
    expect(p.items[0].baseQuantity).toBe('6');
    expect(p.items[1].baseQuantity).toBe('5');
    expect(p.change).toBe('5.00');
    expect(p.items.every((i) => !i.extraShare)).toBe(true);
  });
  it('troco cobre cota extra do ativo com maior gap', () => {
    const p = calculateTwoPhaseContribution(104, classes, assets);
    // alvo AAA 62.4 -> 6 cotas (gap 2.4); BBB 41.6 -> 5 cotas (gap 6.6): troco 104-95=9 => BBB +1 (7), sobra 2
    expect(p.items[1].extraShare).toBe(true);
    expect(p.items[1].quantity).toBe('6');
    expect(p.items[0].extraShare).toBe(false);
    expect(p.change).toBe('2.00');
    expect(p.totalSpent).toBe('102.00');
  });
  it('classe que não recebe aporte não compra nada', () => {
    const p = calculateTwoPhaseContribution(
      100,
      [{ assetClass: 'FII', targetPercentage: 50, receivesContribution: false }],
      assets
    );
    expect(p.totalSpent).toBe('0.00');
    expect(p.change).toBe('100.00');
  });
});

import { planToRebalanceResult } from '..';
describe('planToRebalanceResult', () => {
  it('mapeia plano para RebalanceResult', () => {
    const plan = calculateTwoPhaseContribution(
      104,
      [{ assetClass: 'FII', targetPercentage: 50, receivesContribution: true }],
      [
        { ticker: 'AAA11', assetClass: 'FII', price: 10, currentValue: 0, targetInClassPercent: 60 },
        { ticker: 'BBB11', assetClass: 'FII', price: 7, currentValue: 0, targetInClassPercent: 40 },
      ]
    );
    const r = planToRebalanceResult(plan, 104, 0);
    expect(r.totalAllocated).toBe('102.00');
    expect(r.remainingCash).toBe('2.00');
    expect(r.extraShareTickers).toEqual(['BBB11']);
    expect(r.suggestions[1].suggestedQuantity).toBe('6');
  });
});
