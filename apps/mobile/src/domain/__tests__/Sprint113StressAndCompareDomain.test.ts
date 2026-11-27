import {
  findWorstDrawdownWindow,
  runStressTest,
} from '../sandbox/stressTest';
import {
  buildComparisonSeries,
  MAX_COMPARE_ASSETS,
} from '../sandbox/compare';

describe('Sprint 113 — Teste de Estresse e Comparação (Domínio)', () => {
  test('S113-T01: runStressTest calcula queda máxima, tempo de recuperação e valor no fundo com patrimônio de hoje', () => {
    const res = runStressTest({
      todayPortfolioValueBRL: 100_000,
      startDate: '2020-01-01',
      endDate: '2020-05-01',
      positions: [
        {
          ticker: 'PETR4',
          weight: 0.5,
          priceSeries: [
            { date: '2020-01-01', close: 100 },
            { date: '2020-02-01', close: 80 },
            { date: '2020-03-01', close: 40 }, // -60%
            { date: '2020-04-01', close: 70 },
            { date: '2020-05-01', close: 100 },
          ],
        },
        {
          ticker: 'VALE3',
          weight: 0.5,
          priceSeries: [
            { date: '2020-01-01', close: 100 },
            { date: '2020-02-01', close: 100 },
            { date: '2020-03-01', close: 80 }, // -20%
            { date: '2020-04-01', close: 90 },
            { date: '2020-05-01', close: 100 },
          ],
        },
      ],
    });

    expect(res.status).toBe('ok');
    // Média ponderada no fundo em 2020-03-01: 0.5*40 + 0.5*80 = 60 => queda de 40%
    expect(res.maxDrawdownPct).toBeCloseTo(40, 2);
    expect(res.peakDate).toBe('2020-01-01');
    expect(res.troughDate).toBe('2020-03-01');
    expect(res.troughValueBRL).toBeCloseTo(60_000, 2);
    expect(res.recovered).toBe(true);
    expect(res.recoveryDate).toBe('2020-05-01');
    // 2020-03-01 até 2020-05-01 = 61 dias corridos (2020 é ano bissexto: mar 31 + abr 30 = 61)
    expect(res.recoveryDays).toBe(61);
    expect(res.warnings).toHaveLength(0);
  });

  test('S113-T02: runStressTest retorna recovered=false e recoveryDays=null quando não recupera na série', () => {
    const res = runStressTest({
      todayPortfolioValueBRL: 50_000,
      startDate: '2022-01-01',
      endDate: '2022-03-01',
      positions: [
        {
          ticker: 'MGLU3',
          weight: 1,
          priceSeries: [
            { date: '2022-01-01', close: 100 },
            { date: '2022-02-01', close: 70 },
            { date: '2022-03-01', close: 50 },
          ],
        },
      ],
    });

    expect(res.status).toBe('ok');
    expect(res.maxDrawdownPct).toBeCloseTo(50, 2);
    expect(res.troughValueBRL).toBeCloseTo(25_000, 2);
    expect(res.recovered).toBe(false);
    expect(res.recoveryDate).toBeNull();
    expect(res.recoveryDays).toBeNull();
  });

  test('S113-T03: ativo sem série na janela é marcado como "sem dado", sai do cálculo com aviso e pesos são renormalizados', () => {
    const res = runStressTest({
      todayPortfolioValueBRL: 100_000,
      startDate: '2020-01-01',
      endDate: '2020-04-01',
      positions: [
        {
          ticker: 'BOVA11',
          weight: 0.6,
          priceSeries: [
            { date: '2020-01-01', close: 100 },
            { date: '2020-02-01', close: 70 },
            { date: '2020-03-01', close: 85 },
            { date: '2020-04-01', close: 100 },
          ],
        },
        {
          ticker: 'NOVO11',
          weight: 0.4,
          priceSeries: [
            // Só existe em 2023 (fora da janela)
            { date: '2023-01-01', close: 10 },
            { date: '2023-02-01', close: 12 },
          ],
        },
      ],
    });

    expect(res.status).toBe('ok');
    // NOVO11 sai, BOVA11 fica com peso 1.0 -> queda máxima de 30%
    expect(res.maxDrawdownPct).toBeCloseTo(30, 2);
    expect(res.troughValueBRL).toBeCloseTo(70_000, 2);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.join(' ')).toContain('NOVO11');

    const novo = res.assets.find((a) => a.ticker === 'NOVO11');
    expect(novo?.status).toBe('missing_data');
    expect(novo?.statusLabel).toBe('sem dado');
    expect(novo?.normalizedWeight).toBe(0);

    const bova = res.assets.find((a) => a.ticker === 'BOVA11');
    expect(bova?.status).toBe('ok');
    expect(bova?.normalizedWeight).toBeCloseTo(1, 4);
  });

  test('S113-T04: runStressTest retorna missing_data quando todos os ativos estão sem série na janela', () => {
    const res = runStressTest({
      todayPortfolioValueBRL: 100_000,
      startDate: '2015-01-01',
      endDate: '2015-06-01',
      positions: [
        {
          ticker: 'HASH11',
          weight: 1,
          priceSeries: [{ date: '2021-05-01', close: 50 }],
        },
      ],
    });

    expect(res.status).toBe('missing_data');
    expect(res.maxDrawdownPct).toBeNull();
    expect(res.troughValueBRL).toBeNull();
    expect(res.assets[0].statusLabel).toBe('sem dado');
  });

  test('S113-T05: findWorstDrawdownWindow encontra dinamicamente a pior queda dos últimos N anos na série IBOV/BOVA11', () => {
    const bovaSeries = [
      { date: '2016-01-01', close: 100 },
      { date: '2016-06-01', close: 40 }, // -60%, mas fora dos últimos 5 anos em relação a 2025-01-01
      { date: '2021-01-01', close: 110 },
      { date: '2022-01-01', close: 120 }, // pico nos últimos 5 anos
      { date: '2022-06-01', close: 90 },  // -25%
      { date: '2023-01-01', close: 130 }, // novo pico
      { date: '2023-06-01', close: 117 }, // -10%
      { date: '2025-01-01', close: 135 },
    ];

    const w5 = findWorstDrawdownWindow(bovaSeries, 5, '2025-01-01');
    expect(w5).not.toBeNull();
    expect(w5?.startDate).toBe('2022-01-01');
    expect(w5?.endDate).toBe('2022-06-01');
    expect(w5?.drawdownPct).toBeCloseTo(25, 2);

    const w10 = findWorstDrawdownWindow(bovaSeries, 10, '2025-01-01');
    expect(w10).not.toBeNull();
    expect(w10?.startDate).toBe('2016-01-01');
    expect(w10?.endDate).toBe('2016-06-01');
    expect(w10?.drawdownPct).toBeCloseTo(60, 2);
  });

  test('S113-T06: buildComparisonSeries normaliza até 4 ativos + CDI + IPCA em 100 no início do período', () => {
    const result = buildComparisonSeries({
      startDate: '2024-01-01',
      endDate: '2024-03-01',
      assets: [
        {
          ticker: 'PETR4',
          priceSeries: [
            { date: '2024-01-01', close: 40 },
            { date: '2024-02-01', close: 44 },
            { date: '2024-03-01', close: 48 },
          ],
        },
        {
          ticker: 'VALE3',
          priceSeries: [
            { date: '2024-01-01', close: 70 },
            { date: '2024-02-01', close: 63 },
            { date: '2024-03-01', close: 77 },
          ],
        },
      ],
      cdi: [
        { date: '2024-01-01', ratePct: 1.0 },
        { date: '2024-02-01', ratePct: 1.0 },
        { date: '2024-03-01', ratePct: 1.0 },
      ],
      ipca: [
        { date: '2024-01-01', ratePct: 0.5 },
        { date: '2024-02-01', ratePct: 0.5 },
        { date: '2024-03-01', ratePct: 0.5 },
      ],
    });

    expect(result.truncatedAssets).toBe(false);
    const petr = result.items.find((i) => i.id === 'PETR4')!;
    expect(petr.status).toBe('ok');
    expect(petr.series[0].value).toBeCloseTo(100, 4);
    expect(petr.series[1].value).toBeCloseTo(110, 4);
    expect(petr.series[2].value).toBeCloseTo(120, 4);
    expect(petr.totalReturnPct).toBeCloseTo(20, 4);

    const vale = result.items.find((i) => i.id === 'VALE3')!;
    expect(vale.series[0].value).toBeCloseTo(100, 4);
    expect(vale.series[1].value).toBeCloseTo(90, 4);
    expect(vale.series[2].value).toBeCloseTo(110, 4);
    expect(vale.totalReturnPct).toBeCloseTo(10, 4);

    const cdi = result.items.find((i) => i.id === 'CDI')!;
    expect(cdi.status).toBe('ok');
    expect(cdi.series[0].value).toBeCloseTo(100, 4);
    // 100 * 1.01 * 1.01 = 102.01
    expect(cdi.finalValue).toBeCloseTo(102.01, 2);
    expect(cdi.totalReturnPct).toBeCloseTo(2.01, 2);

    const ipca = result.items.find((i) => i.id === 'IPCA')!;
    expect(ipca.status).toBe('ok');
    expect(ipca.series[0].value).toBeCloseTo(100, 4);
    // 100 * 1.005 * 1.005 = 101.0025
    expect(ipca.finalValue).toBeCloseTo(101.0025, 2);
  });

  test('S113-T07: buildComparisonSeries limita a 4 ativos e trata ativo sem série na janela', () => {
    const result = buildComparisonSeries({
      startDate: '2024-01-01',
      endDate: '2024-02-01',
      assets: [
        { ticker: 'A1', priceSeries: [{ date: '2024-01-01', close: 10 }, { date: '2024-02-01', close: 11 }] },
        { ticker: 'A2', priceSeries: [{ date: '2024-01-01', close: 10 }, { date: '2024-02-01', close: 12 }] },
        { ticker: 'A3', priceSeries: [{ date: '2024-01-01', close: 10 }, { date: '2024-02-01', close: 13 }] },
        { ticker: 'A4', priceSeries: [] }, // sem dado
        { ticker: 'A5', priceSeries: [{ date: '2024-01-01', close: 10 }, { date: '2024-02-01', close: 15 }] },
      ],
    });

    expect(MAX_COMPARE_ASSETS).toBe(4);
    expect(result.truncatedAssets).toBe(true);
    const assetItems = result.items.filter((i) => i.kind === 'asset');
    expect(assetItems).toHaveLength(4);
    expect(assetItems.find((i) => i.id === 'A5')).toBeUndefined();
    expect(assetItems.find((i) => i.id === 'A4')?.status).toBe('missing_data');
  });
});
