import Decimal from 'decimal.js';
import {
  PRUDENT_ANNUAL_RETURN_MAX,
  PRUDENT_ANNUAL_RETURN_MIN,
  calculateGoalValue,
  calculateNetWorth,
  clampPrudentAnnualReturn,
  decimalReaisToCents,
  evaluateGoal,
  validatePortfolioShareSlices,
  type FinGoalInput,
  type FinGoalSourceInput,
} from '../goal';

describe('Sprint 68 — Domínio: Metas unificadas e Patrimônio líquido', () => {
  it('S68-T01: decimalReaisToCents converte Decimal/string/number para centavos num único ponto', () => {
    expect(decimalReaisToCents(new Decimal('48320.75'))).toBe(4832075);
    expect(decimalReaisToCents('1234.565')).toBe(123457);
    expect(decimalReaisToCents('0.10')).toBe(10);
    expect(decimalReaisToCents(0)).toBe(0);
    expect(decimalReaisToCents(100000)).toBe(10000000);
  });

  it('S68-T02: calculateGoalValue com origem manual soma apenas aportes da meta', () => {
    const goal: FinGoalInput = {
      id: 'g-manual',
      name: 'Reserva de emergência',
      icon: 'savings',
      color: '#4F9A65',
      target_cents: 1000000, // R$ 10.000,00
      source_type: 'manual',
    };
    const val = calculateGoalValue(goal, [], {
      accounts: [],
      portfolios: [],
      contributions: [
        { goal_id: 'g-manual', amount_cents: 150000, date: '2026-10-01' },
        { goal_id: 'g-manual', amount_cents: 250000, date: '2026-11-01' },
        { goal_id: 'other-goal', amount_cents: 999900, date: '2026-11-01' },
      ],
    });
    expect(val).toBe(400000);
  });

  it('S68-T03: calculateGoalValue com origem account soma saldos de uma ou mais contas com fatia', () => {
    const goal: FinGoalInput = {
      id: 'g-acc',
      name: 'Viagem',
      icon: 'flight',
      color: '#D4A83B',
      target_cents: 800000,
      source_type: 'account',
    };
    const sources: FinGoalSourceInput[] = [
      { goal_id: 'g-acc', ref_type: 'account', ref_id: 'acc-1', share_percent: 100 },
      { goal_id: 'g-acc', ref_type: 'account', ref_id: 'acc-2', share_percent: 50 },
    ];
    const val = calculateGoalValue(goal, sources, {
      accounts: [
        { id: 'acc-1', balance_cents: 200000 },
        { id: 'acc-2', balance_cents: 300000 },
        { id: 'acc-3', balance_cents: 900000 },
      ],
      portfolios: [],
    });
    expect(val).toBe(350000);
  });

  it('S68-T04: calculateGoalValue com origem portfolio suporta carteira inteira, classe específica e múltiplas carteiras', () => {
    const goalFull: FinGoalInput = {
      id: 'g-port-full',
      name: 'Aposentadoria',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 50000000,
      source_type: 'portfolio',
    };
    const goalClass: FinGoalInput = {
      id: 'g-port-rf',
      name: 'Renda Fixa Curto Prazo',
      icon: 'shield',
      color: '#AECDC5',
      target_cents: 10000000,
      source_type: 'portfolio',
    };

    const portfolios = [
      {
        id: 'p-1',
        name: 'Carteira Aposentadoria',
        total_cents: 10000000, // R$ 100k
        by_class_cents: { FIXED_INCOME: 6000000, STOCK: 4000000 },
        annual_return_percent: 10,
      },
      {
        id: 'p-2',
        name: 'Carteira Internacional',
        total_cents: 5000000, // R$ 50k
        by_class_cents: { STOCK: 5000000 },
        annual_return_percent: 8,
      },
    ];

    const valFull = calculateGoalValue(
      goalFull,
      [
        { goal_id: 'g-port-full', ref_type: 'portfolio', ref_id: 'p-1', share_percent: 100 },
        { goal_id: 'g-port-full', ref_type: 'portfolio', ref_id: 'p-2', share_percent: 100 },
      ],
      { accounts: [], portfolios }
    );
    expect(valFull).toBe(15000000);

    const valClass = calculateGoalValue(
      goalClass,
      [
        {
          goal_id: 'g-port-rf',
          ref_type: 'portfolio',
          ref_id: 'p-1',
          asset_class: 'FIXED_INCOME',
          share_percent: 50,
        },
      ],
      { accounts: [], portfolios }
    );
    expect(valClass).toBe(3000000);
  });

  it('S68-T05: calculateGoalValue com origem net_worth usa patrimônio líquido total', () => {
    const goal: FinGoalInput = {
      id: 'g-nw',
      name: 'Primeiro Milhão',
      icon: 'trending-up',
      color: '#D96628',
      target_cents: 100000000,
      source_type: 'net_worth',
    };
    const val = calculateGoalValue(goal, [], {
      accounts: [],
      portfolios: [],
      netWorthCents: 24500050,
    });
    expect(val).toBe(24500050);
  });

  it('S68-T06: carteira dividida entre duas metas valida soma <= 100% e rejeita > 100%', () => {
    const validSplit: FinGoalSourceInput[] = [
      { goal_id: 'g1', ref_type: 'portfolio', ref_id: 'p1', share_percent: 60 },
      { goal_id: 'g2', ref_type: 'portfolio', ref_id: 'p1', share_percent: 40 },
    ];
    expect(validatePortfolioShareSlices(validSplit)).toEqual({
      valid: true,
      offendingPortfolioIds: [],
    });

    const invalidSplit: FinGoalSourceInput[] = [
      { goal_id: 'g1', ref_type: 'portfolio', ref_id: 'p1', share_percent: 60 },
      { goal_id: 'g2', ref_type: 'portfolio', ref_id: 'p1', share_percent: 50 },
    ];
    expect(validatePortfolioShareSlices(invalidSplit)).toEqual({
      valid: false,
      offendingPortfolioIds: ['p1'],
    });

    // Meta arquivada não entra na soma
    expect(validatePortfolioShareSlices(invalidSplit, new Set(['g2']))).toEqual({
      valid: true,
      offendingPortfolioIds: [],
    });

    // Valores fora de 1–100 também são inválidos
    expect(
      validatePortfolioShareSlices([
        { goal_id: 'g1', ref_type: 'portfolio', ref_id: 'p1', share_percent: 0 },
      ]).valid
    ).toBe(false);
  });

  it('S68-T07: evaluateGoal trata meta com data alvo, meta sem data e meta inalcançável', () => {
    // 1) Meta com data alvo e aporte mensal
    const datedGoal: FinGoalInput = {
      id: 'g-dated',
      name: 'Entrada do imóvel',
      icon: 'home',
      color: '#4F9A65',
      target_cents: 1200000, // R$ 12.000
      target_date: '2027-11-16', // 12 meses a partir de 2026-11-16
      source_type: 'manual',
      monthly_contribution_cents: 100000, // R$ 1.000/mês
    };
    const evalDated = evaluateGoal(
      datedGoal,
      [],
      {
        accounts: [],
        portfolios: [],
        contributions: [{ goal_id: 'g-dated', amount_cents: 0, date: '2026-11-01' }],
      },
      { referenceDateIso: '2026-11-16' }
    );
    expect(evalDated.monthsToGoal).toBe(12);
    expect(evalDated.requiredMonthlyCents).toBe(100000);
    expect(evalDated.unreachable).toBe(false);
    expect(evalDated.projectedYearMonth).toBe('2027-11');

    // 2) Meta sem data alvo -> requiredMonthlyCents null
    const undatedGoal: FinGoalInput = {
      ...datedGoal,
      id: 'g-undated',
      target_date: null,
    };
    const evalUndated = evaluateGoal(
      undatedGoal,
      [],
      { accounts: [], portfolios: [], contributions: [] },
      { referenceDateIso: '2026-11-16' }
    );
    expect(evalUndated.requiredMonthlyCents).toBeNull();
    expect(evalUndated.monthsToGoal).toBe(12);

    // 3) Meta inalcançável (aporte 0 e retorno 0)
    const unreachableGoal: FinGoalInput = {
      ...undatedGoal,
      id: 'g-unreachable',
      monthly_contribution_cents: 0,
    };
    const evalUnreachable = evaluateGoal(
      unreachableGoal,
      [],
      { accounts: [], portfolios: [], contributions: [] },
      { referenceDateIso: '2026-11-16' }
    );
    expect(evalUnreachable.unreachable).toBe(true);
    expect(evalUnreachable.monthsToGoal).toBeNull();
    expect(evalUnreachable.projectedYearMonth).toBeNull();
  });

  it('S68-T08: meta ligada a carteira usa rentabilidade histórica limitada à faixa prudente e marcada como estimativa', () => {
    expect(clampPrudentAnnualReturn(42)).toBe(PRUDENT_ANNUAL_RETURN_MAX);
    expect(clampPrudentAnnualReturn(-12)).toBe(PRUDENT_ANNUAL_RETURN_MIN);
    expect(clampPrudentAnnualReturn(9.5)).toBe(9.5);

    const goal: FinGoalInput = {
      id: 'g-p',
      name: 'Aposentadoria',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 20000000,
      source_type: 'portfolio',
      monthly_contribution_cents: 200000,
    };
    const res = evaluateGoal(
      goal,
      [{ goal_id: 'g-p', ref_type: 'portfolio', ref_id: 'p-1', asset_class: 'FIXED_INCOME', share_percent: 100 }],
      {
        accounts: [],
        portfolios: [
          {
            id: 'p-1',
            name: 'Carteira Aposentadoria',
            total_cents: 10000000,
            by_class_cents: { FIXED_INCOME: 6000000 },
            annual_return_percent: 45, // acima do teto prudente
          },
        ],
      },
      { referenceDateIso: '2026-11-16' }
    );
    expect(res.isReturnEstimated).toBe(true);
    expect(res.annualReturnUsed).toBe(PRUDENT_ANNUAL_RETURN_MAX);
    expect(res.sourceSummary).toContain('Carteira Aposentadoria');
    expect(res.sourceSummary).toContain('Renda fixa');
  });

  it('S68-T09: meta atingida reporta reached = true, 100% e remainingCents = 0', () => {
    const goal: FinGoalInput = {
      id: 'g-done',
      name: 'Notebook',
      icon: 'laptop',
      color: '#4F9A65',
      target_cents: 500000,
      source_type: 'manual',
    };
    const res = evaluateGoal(
      goal,
      [],
      {
        accounts: [],
        portfolios: [],
        contributions: [{ goal_id: 'g-done', amount_cents: 550000, date: '2026-11-10' }],
      },
      { referenceDateIso: '2026-11-16' }
    );
    expect(res.reached).toBe(true);
    expect(res.progressPercent).toBe(100);
    expect(res.remainingCents).toBe(0);
    expect(res.monthsToGoal).toBe(0);
  });

  it('S68-T10: calculateNetWorth soma contas (sem cartão) + investimentos − dívida de cartão', () => {
    const result = calculateNetWorth(
      [
        { id: 'c1', type: 'checking', balance_cents: 350000, archived: 0 }, // R$ 3.500
        { id: 'c2', type: 'cash', balance_cents: 50000, archived: 0 }, // R$ 500
        { id: 'card1', type: 'card', balance_cents: -120000, archived: 0 }, // ignorado em contas
        { id: 'arch', type: 'checking', balance_cents: 999999, archived: 1 }, // arquivada ignorada
      ],
      [
        { id: 'p1', totalValueReais: new Decimal('48320.75'), is_archived: 0 },
        { id: 'p2', totalValueReais: '1000.25', is_archived: 0 },
        { id: 'p-arch', totalValueReais: '50000.00', is_archived: 1 },
      ],
      180000 // R$ 1.800 de faturas abertas
    );
    expect(result.accountsCents).toBe(400000);
    expect(result.investmentsCents).toBe(4932100);
    expect(result.cardDebtCents).toBe(180000);
    expect(result.totalCents).toBe(400000 + 4932100 - 180000);
  });
});
