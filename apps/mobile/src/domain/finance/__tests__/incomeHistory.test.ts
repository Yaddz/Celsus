import {
  filterIncomes,
  monthlySeries,
  yearlySeries,
  groupByMonth,
  rankByTicker,
  trailing12m,
  yieldOnCost,
  averagePerMonth,
  bestMonth,
  IncomeHistoryEvent,
} from '../incomeHistory';

describe('Sprint 48 — Domain: incomeHistory', () => {
  // Fixture fiel ao Apêndice C da especificação (proventos da B3 importada)
  const appendixCEvents: IncomeHistoryEvent[] = [
    {
      id: 'inc-1',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-05-15',
      amount: '60.60',
      kind: 'RENDIMENTO',
      quantity: '606',
      unitAmount: '0.10',
    },
    {
      id: 'inc-2',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-06-15',
      amount: '60.60',
      kind: 'RENDIMENTO',
      quantity: '606',
      unitAmount: '0.10',
    },
    {
      id: 'inc-3',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-07-14',
      amount: '72.70',
      kind: 'RENDIMENTO',
      quantity: '727',
      unitAmount: '0.10',
    },
    {
      id: 'inc-4',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-08-14',
      amount: '73.40',
      kind: 'RENDIMENTO',
      quantity: '734',
      unitAmount: '0.10',
    },
    {
      id: 'inc-5',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-08-14',
      amount: '10.08',
      kind: 'RENDIMENTO',
      quantity: '168',
      unitAmount: '0.06',
    },
    {
      id: 'inc-6',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-09-15',
      amount: '63.70',
      kind: 'RENDIMENTO',
      quantity: '637',
      unitAmount: '0.10',
    },
    {
      id: 'inc-7',
      portfolioId: 'port-1',
      ticker: 'MXRF11',
      payDate: '2026-10-15',
      amount: '63.70',
      kind: 'RENDIMENTO',
      quantity: '637',
      unitAmount: '0.10',
    },
  ];

  test('S48-T01: totais e médias batem rigorosamente com o Apêndice C', () => {
    const series = monthlySeries(appendixCEvents, { from: '2026-05', to: '2026-10' });
    expect(series).toHaveLength(6);
    expect(series.map((s) => ({ month: s.month, total: s.total }))).toEqual([
      { month: '2026-05', total: '60.60' },
      { month: '2026-06', total: '60.60' },
      { month: '2026-07', total: '72.70' },
      { month: '2026-08', total: '83.48' },
      { month: '2026-09', total: '63.70' },
      { month: '2026-10', total: '63.70' },
    ]);

    const avg = averagePerMonth(appendixCEvents, { from: '2026-05', to: '2026-10' });
    expect(avg).toBe('67.46'); // 404.78 / 6 = 67.46333333333...

    const best = bestMonth(series);
    expect(best).toEqual({ month: '2026-08', total: '83.48' });

    const ranks = rankByTicker(appendixCEvents);
    expect(ranks).toHaveLength(1);
    expect(ranks[0]).toEqual({
      ticker: 'MXRF11',
      total: '404.78',
      sharePercent: '100.00',
      count: 7,
    });
  });

  test('S48-T02: monthlySeries inclui meses vazios com 0.00 e sem erros de float', () => {
    // Período com meses vazios antes e depois
    const series = monthlySeries(appendixCEvents, { from: '2026-03', to: '2026-12' });
    expect(series).toHaveLength(10); // 03 a 12 = 10 meses
    expect(series[0]).toEqual({ month: '2026-03', total: '0.00', count: 0 });
    expect(series[1]).toEqual({ month: '2026-04', total: '0.00', count: 0 });
    expect(series[2]).toEqual({ month: '2026-05', total: '60.60', count: 1 });
    expect(series[5]).toEqual({ month: '2026-08', total: '83.48', count: 2 });
    expect(series[9]).toEqual({ month: '2026-12', total: '0.00', count: 0 });

    // Teste de precisão sem float: 0.10 + 0.20 = 0.30
    const floatTestEvents: IncomeHistoryEvent[] = [
      { id: 'f1', portfolioId: 'p', ticker: 'TEST', payDate: '2026-01-01', amount: '0.10' },
      { id: 'f2', portfolioId: 'p', ticker: 'TEST', payDate: '2026-01-02', amount: '0.20' },
    ];
    const floatSeries = monthlySeries(floatTestEvents, { from: '2026-01', to: '2026-01' });
    expect(floatSeries[0].total).toBe('0.30');

    // yearlySeries
    const ySeries = yearlySeries(appendixCEvents);
    expect(ySeries).toHaveLength(1);
    expect(ySeries[0]).toEqual({
      year: 2026,
      total: '404.78',
      monthlyAverage: '33.73', // 404.78 / 12 meses do ano = 33.73
      count: 7,
    });
  });

  test('S48-T03: filtros combinados (carteira, período, classe, tipo, ticker)', () => {
    const multiEvents: IncomeHistoryEvent[] = [
      ...appendixCEvents,
      {
        id: 'inc-other',
        portfolioId: 'port-2',
        ticker: 'PETR4',
        payDate: '2026-08-20',
        amount: '120.00',
        kind: 'DIVIDENDO',
      },
      {
        id: 'inc-jcp',
        portfolioId: 'port-1',
        ticker: 'BBDC4',
        payDate: '2026-09-01',
        amount: '50.00',
        kind: 'JCP',
      },
    ];

    const classMap: Record<string, string> = {
      MXRF11: 'FII',
      PETR4: 'STOCK',
      BBDC4: 'STOCK',
    };

    // Filtro por carteira
    const port1Only = filterIncomes(multiEvents, { portfolioIds: ['port-1'] });
    expect(port1Only).toHaveLength(8);

    // Filtro por classe
    const fiisOnly = filterIncomes(multiEvents, { assetClass: 'FII' }, classMap);
    expect(fiisOnly).toHaveLength(7);

    // Filtro por tipo
    const divOnly = filterIncomes(multiEvents, { kind: 'DIVIDENDO' });
    expect(divOnly).toHaveLength(1);
    expect(divOnly[0].ticker).toBe('PETR4');

    // Filtro por período
    const augOnly = filterIncomes(multiEvents, { from: '2026-08-01', to: '2026-08-31' });
    expect(augOnly).toHaveLength(3); // 2 de MXRF11 + 1 de PETR4

    // Filtro por ticker
    const petrOnly = filterIncomes(multiEvents, { ticker: 'petr4' });
    expect(petrOnly).toHaveLength(1);

    // Filtros combinados
    const combined = filterIncomes(
      multiEvents,
      {
        portfolioIds: ['port-1'],
        from: '2026-08-01',
        to: '2026-09-30',
        kind: 'RENDIMENTO',
      },
      classMap
    );
    expect(combined).toHaveLength(3); // MXRF11 em ago e set
  });

  test('S48-T04: ranking com soma 100% via maior resto, trailing12m e yieldOnCost', () => {
    const rankEvents: IncomeHistoryEvent[] = [
      { id: '1', portfolioId: 'p', ticker: 'A', payDate: '2026-01-01', amount: '100.00' },
      { id: '2', portfolioId: 'p', ticker: 'B', payDate: '2026-01-01', amount: '100.00' },
      { id: '3', portfolioId: 'p', ticker: 'C', payDate: '2026-01-01', amount: '100.00' },
    ];
    // 3 ativos iguais: 33.33 + 33.33 + 33.34 = 100.00%
    const ranks = rankByTicker(rankEvents);
    const sumShares = ranks.reduce((acc, r) => acc + parseFloat(r.sharePercent), 0);
    expect(Math.round(sumShares * 100) / 100).toBe(100.00);

    // trailing12m na virada de ano
    const trailingEvents: IncomeHistoryEvent[] = [
      { id: 't1', portfolioId: 'p', ticker: 'A', payDate: '2025-04-10', amount: '50.00' },
      { id: 't2', portfolioId: 'p', ticker: 'A', payDate: '2026-03-20', amount: '70.00' },
      { id: 't3', portfolioId: 'p', ticker: 'A', payDate: '2025-02-15', amount: '100.00' }, // Fora dos 12m de 2026-03
    ];
    const t12m = trailing12m(trailingEvents, '2026-03-31');
    expect(t12m.total).toBe('120.00'); // 50 + 70
    expect(t12m.count).toBe(2);

    // yieldOnCost
    // Com custo = 1000.00 e proventos 12m = 120.00 => 12.00%
    const yoc = yieldOnCost(trailingEvents, '1000.00', '2026-03-31');
    expect(yoc).toBe('12.00');

    // Sem custo (0 ou nulo) => retorna null (nunca "0.00" ou 0%)
    expect(yieldOnCost(trailingEvents, '0', '2026-03-31')).toBeNull();
    expect(yieldOnCost(trailingEvents, 0, '2026-03-31')).toBeNull();
  });

  test('S48-T05: performance com 600 proventos em 40 meses executa sob 50 ms', () => {
    const largeEvents: IncomeHistoryEvent[] = [];
    for (let i = 0; i < 600; i++) {
      const year = 2023 + Math.floor(i / 180);
      const month = String(1 + (Math.floor(i / 15) % 12)).padStart(2, '0');
      const day = String(1 + (i % 28)).padStart(2, '0');
      const ticker = `ASSET${i % 20}`;
      largeEvents.push({
        id: `large-${i}`,
        portfolioId: `port-${i % 3}`,
        ticker,
        payDate: `${year}-${month}-${day}`,
        amount: '25.50',
        kind: i % 2 === 0 ? 'RENDIMENTO' : 'DIVIDENDO',
      });
    }

    const t0 = Date.now();
    const filtered = filterIncomes(largeEvents, { from: '2023-01', to: '2026-04' });
    const series = monthlySeries(filtered, { from: '2023-01', to: '2026-04' });
    const grouped = groupByMonth(filtered);
    const ranks = rankByTicker(filtered, 5);
    const best = bestMonth(series);
    const yoc = yieldOnCost(filtered, '50000.00', '2026-04-30');
    const elapsed = Date.now() - t0;

    expect(series.length).toBeGreaterThan(30);
    expect(grouped.length).toBeGreaterThan(30);
    expect(ranks).toHaveLength(5);
    expect(best).toBeDefined();
    expect(yoc).toBeDefined();
    expect(elapsed).toBeLessThan(50);
  });
});
