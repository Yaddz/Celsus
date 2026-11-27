import { priceAt, valueInBRL, type PriceSeriesPoint } from '../priceAt';
import { minInRange, maxInRange } from '../extremes';
import { estimateTax, getTaxRulesVersion, regressiveFixedIncomeRate } from '../taxRules';
import { runScenario } from '../backtest';

describe('Sprint 108 — Sandbox Domain: priceAt, extremes, taxRules e backtest (R47, R48, R49)', () => {
  const synthB3Series: PriceSeriesPoint[] = [
    { date: '2024-03-27', close: 35.1, currency: 'BRL' }, // quarta
    { date: '2024-03-28', close: 35.4, currency: 'BRL' }, // quinta (antes da Sexta-feira Santa)
    // 2024-03-29 sexta-feira Santa (feriado), 30 sáb, 31 dom
    { date: '2024-04-01', close: 36.0, currency: 'BRL' }, // segunda
    // lacuna > 7 dias até 2024-04-15
    { date: '2024-04-15', close: 37.5, currency: 'BRL' },
  ];

  // S108-T01..T04 priceAt
  test('S108-T01: priceAt em dia útil com pregão exato retorna o fechamento do próprio dia', () => {
    const res = priceAt(synthB3Series, '2024-03-28');
    expect(res).toEqual({
      price: 35.4,
      effectiveDate: '2024-03-28',
      currency: 'BRL',
    });
  });

  test('S108-T02: priceAt em fim de semana retorna o último pregão ≤ D', () => {
    // 2024-03-30 é sábado; último pregão foi quinta 2024-03-28 (2 dias corridos)
    const sat = priceAt(synthB3Series, '2024-03-30');
    expect(sat).toEqual({
      price: 35.4,
      effectiveDate: '2024-03-28',
      currency: 'BRL',
    });
  });

  test('S108-T03: priceAt em feriado retorna o pregão anterior dentro de 7 dias corridos', () => {
    // 2024-03-29 é feriado (sexta); último pregão foi 2024-03-28 (1 dia corrido)
    const holiday = priceAt(synthB3Series, '2024-03-29');
    expect(holiday).toEqual({
      price: 35.4,
      effectiveDate: '2024-03-28',
      currency: 'BRL',
    });
  });

  test('S108-T04: priceAt com lacuna > 7 dias corridos retorna null (nunca interpola) e valueInBRL propaga null', () => {
    // 2024-04-01 -> 2024-04-09 são 8 dias corridos sem pregão
    expect(priceAt(synthB3Series, '2024-04-09')).toBeNull();
    // 2024-04-08 são exatos 7 dias corridos -> ainda válido
    expect(priceAt(synthB3Series, '2024-04-08')).toEqual({
      price: 36.0,
      effectiveDate: '2024-04-01',
      currency: 'BRL',
    });

    const usdSeries: PriceSeriesPoint[] = [{ date: '2024-04-01', close: 100, currency: 'USD' }];
    const fxSeries: PriceSeriesPoint[] = [{ date: '2024-04-08', close: 5.05, currency: 'BRL' }];
    expect(valueInBRL(usdSeries, fxSeries, '2024-04-08')).toEqual({
      valueBRL: 505,
      assetPrice: 100,
      assetEffectiveDate: '2024-04-01',
      fxRate: 5.05,
      fxEffectiveDate: '2024-04-08',
    });
    expect(valueInBRL(usdSeries, fxSeries, '2024-04-09')).toBeNull();
  });

  // S108-T05..T06 extremes
  test('S108-T05: minInRange e maxInRange retornam mínima e máxima exatas no intervalo', () => {
    const series: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 20 },
      { date: '2024-01-03', close: 15 },
      { date: '2024-01-04', close: 28 },
      { date: '2024-01-05', close: 10 }, // fora do intervalo [01-02, 01-04]
    ];
    expect(minInRange(series, '2024-01-02', '2024-01-04')).toEqual({ date: '2024-01-03', price: 15 });
    expect(maxInRange(series, '2024-01-02', '2024-01-04')).toEqual({ date: '2024-01-04', price: 28 });
  });

  test('S108-T06: minInRange e maxInRange em empate escolhem a primeira ocorrência cronológica', () => {
    // Série deliberadamente fora de ordem para garantir que ordena cronologicamente
    const series: PriceSeriesPoint[] = [
      { date: '2024-02-05', close: 12 },
      { date: '2024-02-02', close: 12 },
      { date: '2024-02-06', close: 30 },
      { date: '2024-02-03', close: 30 },
    ];
    expect(minInRange(series, '2024-02-01', '2024-02-10')).toEqual({ date: '2024-02-02', price: 12 });
    expect(maxInRange(series, '2024-02-01', '2024-02-10')).toEqual({ date: '2024-02-03', price: 30 });
  });

  // S108-T07 dólar
  test('S108-T07: dólar R$ 10.000 a 4,99 vendido a 5,80 confere quantidade, valor final e ganho à mão', () => {
    const fxSeries: PriceSeriesPoint[] = [
      { date: '2024-01-10', close: 4.99, currency: 'BRL' },
      { date: '2024-11-20', close: 5.8, currency: 'BRL' },
    ];
    const res = runScenario({
      legs: [
        {
          ticker: 'USDBRL',
          assetClass: 'FX',
          investedBRL: 10000,
          buyDate: '2024-01-10',
          sellDate: '2024-11-20',
          priceSeries: fxSeries,
        },
      ],
      options: { reinvestDividends: true, taxEnabled: false },
    });

    const expectedQty = 10000 / 4.99; // 2004.0080160320642
    const expectedFinal = expectedQty * 5.8; // 11623.246492985972
    const expectedGain = expectedFinal - 10000; // 1623.246492985972

    expect(res.status).toBe('ok');
    expect(res.legs[0].quantity).toBeCloseTo(expectedQty, 6);
    expect(res.legs[0].finalValueBRL).toBeCloseTo(expectedFinal, 4);
    expect(res.legs[0].gainBRL).toBeCloseTo(expectedGain, 4);
    expect(res.total.finalValueBRL).toBeCloseTo(expectedFinal, 4);
    expect(res.total.gainBRL).toBeCloseTo(expectedGain, 4);
  });

  // S108-T08 ação dos EUA
  test('S108-T08: ação dos EUA com preço US$ e câmbio diferentes na compra e venda (ganho BRL ≠ ganho US$)', () => {
    const usPriceSeries: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 50, currency: 'USD' },
      { date: '2024-07-02', close: 60, currency: 'USD' }, // +20% em USD
    ];
    const fxSeries: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 5.0, currency: 'BRL' },
      { date: '2024-07-02', close: 5.5, currency: 'BRL' }, // +10% no câmbio
    ];
    // Investido R$ 10.000 -> US$ 2.000 -> 40 ações a US$ 50
    // Venda: 40 * US$ 60 * 5,50 = R$ 13.200 (+32% em BRL vs +20% em USD)
    const res = runScenario({
      legs: [
        {
          ticker: 'SYNUS',
          assetClass: 'US_STOCK',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-07-02',
          priceSeries: usPriceSeries,
          fxSeries,
        },
      ],
      options: { reinvestDividends: false, taxEnabled: false },
    });

    expect(res.status).toBe('ok');
    expect(res.legs[0].quantity).toBeCloseTo(40, 6);
    expect(res.legs[0].finalValueBRL).toBeCloseTo(13200, 2);
    expect(res.legs[0].gainBRL).toBeCloseTo(3200, 2);
    expect(res.legs[0].gainPct).toBeCloseTo(32, 2);
    expect(res.legs[0].gainPctUSD).toBeCloseTo(20, 2);
    expect(res.legs[0].gainPct).not.toBeCloseTo(res.legs[0].gainPctUSD!, 1);
  });

  // S108-T09..T10 proventos reinvestidos vs caixa e retenção 30% US_STOCK
  test('S108-T09: proventos reinvestidos compram novas cotas vs proventos em caixa somam sem recomprar', () => {
    const b3Series: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 10, currency: 'BRL' },
      { date: '2024-03-01', close: 10, currency: 'BRL' },
      { date: '2024-06-03', close: 15, currency: 'BRL' },
    ];
    const dividends = [{ date: '2024-03-01', amountPerUnit: 1, currency: 'BRL' }];

    // Investido R$ 1.000 = 100 cotas. Provento R$ 100 em 03-01.
    // Reinvestido a R$ 10 -> +10 cotas = 110 cotas * R$ 15 = R$ 1.650
    const reinvested = runScenario({
      legs: [
        {
          ticker: 'SYNF11',
          assetClass: 'FII',
          investedBRL: 1000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
          priceSeries: b3Series,
          dividends,
        },
      ],
      options: { reinvestDividends: true, taxEnabled: false },
    });

    // Em caixa: 100 cotas * R$ 15 = R$ 1.500 + R$ 100 caixa = R$ 1.600
    const inCash = runScenario({
      legs: [
        {
          ticker: 'SYNF11',
          assetClass: 'FII',
          investedBRL: 1000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
          priceSeries: b3Series,
          dividends,
        },
      ],
      options: { reinvestDividends: false, taxEnabled: false },
    });

    expect(reinvested.legs[0].quantity).toBeCloseTo(110, 6);
    expect(reinvested.legs[0].finalValueBRL).toBeCloseTo(1650, 2);
    expect(inCash.legs[0].quantity).toBeCloseTo(100, 6);
    expect(inCash.legs[0].finalValueBRL).toBeCloseTo(1600, 2);
    expect(reinvested.legs[0].dividendsNetBRL).toBeCloseTo(100, 2);
  });

  test('S108-T10: US_STOCK aplica retenção de 30% na fonte sobre dividendos (em caixa e reinvestido)', () => {
    const usSeries: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 100, currency: 'USD' },
      { date: '2024-04-01', close: 100, currency: 'USD' },
      { date: '2024-07-01', close: 100, currency: 'USD' },
    ];
    const fxSeries: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 5, currency: 'BRL' },
      { date: '2024-04-01', close: 5, currency: 'BRL' },
      { date: '2024-07-01', close: 5, currency: 'BRL' },
    ];
    // R$ 5.000 = US$ 1.000 = 10 ações. Dividendo bruto: US$ 10/ação = US$ 100 = R$ 500.
    // Retenção 30%: R$ 150 retido, R$ 350 líquido.
    const res = runScenario({
      legs: [
        {
          ticker: 'SYNDIV',
          assetClass: 'US_STOCK',
          investedBRL: 5000,
          buyDate: '2024-01-02',
          sellDate: '2024-07-01',
          priceSeries: usSeries,
          fxSeries,
          dividends: [{ date: '2024-04-01', amountPerUnit: 10, currency: 'USD' }],
        },
      ],
      options: { reinvestDividends: false, taxEnabled: false },
    });

    expect(res.legs[0].dividendsGrossBRL).toBeCloseTo(500, 2);
    expect(res.legs[0].dividendsWithheldBRL).toBeCloseTo(150, 2);
    expect(res.legs[0].dividendsNetBRL).toBeCloseTo(350, 2);
    expect(res.legs[0].finalValueBRL).toBeCloseTo(5350, 2);
  });

  // S108-T11..T16 IR (R49)
  test('S108-T11: taxRules versionado por validFrom e ação B3 isenta quando vendas no mês ≤ R$ 20.000', () => {
    const rules = getTaxRulesVersion('2026-11-27');
    expect(rules.validFrom).toBeTruthy();

    const exempt = estimateTax(
      { assetClass: 'STOCK', gainBRL: 3000, saleAmountBRL: 18000 },
      { totalStockSalesInMonthBRL: 18000, taxEnabled: true }
    );
    expect(exempt.isExempt).toBe(true);
    expect(exempt.taxBRL).toBe(0);
    expect(exempt.label.toLowerCase()).toContain('estimativa');
  });

  test('S108-T12: ação B3 tributada em 15% quando vendas no mês > R$ 20.000', () => {
    const taxed = estimateTax(
      { assetClass: 'STOCK', gainBRL: 4000, saleAmountBRL: 25000 },
      { totalStockSalesInMonthBRL: 25000, taxEnabled: true }
    );
    expect(taxed.isExempt).toBe(false);
    expect(taxed.effectiveRate).toBeCloseTo(0.15, 4);
    expect(taxed.taxBRL).toBeCloseTo(600, 2);
  });

  test('S108-T13: FII tributado em 20% sobre ganho de capital sem isenção mesmo abaixo de R$ 20.000', () => {
    const fiiTax = estimateTax(
      { assetClass: 'FII', gainBRL: 1000, saleAmountBRL: 6000 },
      { taxEnabled: true }
    );
    expect(fiiTax.isExempt).toBe(false);
    expect(fiiTax.effectiveRate).toBeCloseTo(0.2, 4);
    expect(fiiTax.taxBRL).toBeCloseTo(200, 2);
  });

  test('S108-T14: US_STOCK tributado em 15% sobre ganho em BRL (Lei 14.754/2023) sem isenção', () => {
    const usTax = estimateTax(
      { assetClass: 'US_STOCK', gainBRL: 2000, saleAmountBRL: 12000 },
      { taxEnabled: true }
    );
    expect(usTax.isExempt).toBe(false);
    expect(usTax.effectiveRate).toBeCloseTo(0.15, 4);
    expect(usTax.taxBRL).toBeCloseTo(300, 2);
  });

  test('S108-T15: cripto (exchange nacional) isenta ≤ R$ 35.000 no mês e tributada em 15% acima', () => {
    const exempt = estimateTax(
      { assetClass: 'CRYPTO', gainBRL: 5000, saleAmountBRL: 30000 },
      { totalCryptoSalesInMonthBRL: 35000, taxEnabled: true }
    );
    expect(exempt.isExempt).toBe(true);
    expect(exempt.taxBRL).toBe(0);

    const taxed = estimateTax(
      { assetClass: 'CRYPTO', gainBRL: 5000, saleAmountBRL: 36000 },
      { totalCryptoSalesInMonthBRL: 36000, taxEnabled: true }
    );
    expect(taxed.isExempt).toBe(false);
    expect(taxed.effectiveRate).toBeCloseTo(0.15, 4);
    expect(taxed.taxBRL).toBeCloseTo(750, 2);
  });

  test('S108-T16: taxEnabled=false zera IR estimado e mantém rótulo explícito de estimativa', () => {
    const series: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 100, currency: 'BRL' },
      { date: '2024-06-03', close: 120, currency: 'BRL' },
    ];
    const res = runScenario({
      legs: [
        {
          ticker: 'SYNF11',
          assetClass: 'FII',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
          priceSeries: series,
        },
      ],
      options: { reinvestDividends: false, taxEnabled: false },
    });

    expect(res.legs[0].estimatedTaxBRL).toBe(0);
    expect(res.total.estimatedTaxBRL).toBe(0);
    expect(res.total.netFinalValueBRL).toBeCloseTo(12000, 2);
    expect(res.total.taxLabel.toLowerCase()).toContain('estimativa');
  });

  // S108-T17..T18 benchmarks CDI (com regressiva) e poupança
  test('S108-T17: benchmark CDI aplica tabela regressiva (22,5%/20%/17,5%/15%) quando taxEnabled=true', () => {
    expect(regressiveFixedIncomeRate(180)).toBeCloseTo(0.225, 4);
    expect(regressiveFixedIncomeRate(360)).toBeCloseTo(0.2, 4);
    expect(regressiveFixedIncomeRate(720)).toBeCloseTo(0.175, 4);
    expect(regressiveFixedIncomeRate(721)).toBeCloseTo(0.15, 4);

    // Período de 100 dias (<= 180d -> alíquota 22,5%)
    const series: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 10, currency: 'BRL' },
      { date: '2024-04-11', close: 11, currency: 'BRL' },
    ];
    const res = runScenario({
      legs: [
        {
          ticker: 'SYN3',
          assetClass: 'STOCK',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-04-11',
          priceSeries: series,
        },
      ],
      macro: {
        cdi: [
          { date: '2024-02-01', ratePct: 1.0 },
          { date: '2024-03-01', ratePct: 1.0 },
          { date: '2024-04-01', ratePct: 1.0 },
        ],
      },
      options: { reinvestDividends: false, taxEnabled: true },
    });

    // 10000 * 1.01^3 = 10303.01 -> ganho 303.01 -> IR 22.5% = 68.17725
    const grossCdi = 10000 * Math.pow(1.01, 3);
    const gainCdi = grossCdi - 10000;
    const expectedTax = gainCdi * 0.225;

    expect(res.benchmarks.cdi.status).toBe('ok');
    expect(res.benchmarks.cdi.finalValueBRL).toBeCloseTo(grossCdi, 2);
    expect(res.benchmarks.cdi.estimatedTaxBRL).toBeCloseTo(expectedTax, 2);
    expect(res.benchmarks.cdi.netFinalValueBRL).toBeCloseTo(grossCdi - expectedTax, 2);
  });

  test('S108-T18: benchmark poupança calcula rendimento no mesmo período e é sempre isento de IR', () => {
    const series: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 10, currency: 'BRL' },
      { date: '2024-04-11', close: 11, currency: 'BRL' },
    ];
    const res = runScenario({
      legs: [
        {
          ticker: 'SYN3',
          assetClass: 'STOCK',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-04-11',
          priceSeries: series,
        },
      ],
      macro: {
        poupanca: [
          { date: '2024-02-01', ratePct: 0.5 },
          { date: '2024-03-01', ratePct: 0.5 },
        ],
      },
      options: { reinvestDividends: false, taxEnabled: true },
    });

    const expectedPoupanca = 10000 * 1.005 * 1.005;
    expect(res.benchmarks.poupanca.status).toBe('ok');
    expect(res.benchmarks.poupanca.finalValueBRL).toBeCloseTo(expectedPoupanca, 2);
    expect(res.benchmarks.poupanca.estimatedTaxBRL).toBe(0);
    expect(res.benchmarks.poupanca.netFinalValueBRL).toBeCloseTo(expectedPoupanca, 2);
  });

  // S108-T19 perna sem dado
  test('S108-T19: perna sem dado marca status missing_data e o total não fecha (retorna null, nunca parcial)', () => {
    const okSeries: PriceSeriesPoint[] = [
      { date: '2024-01-02', close: 20, currency: 'BRL' },
      { date: '2024-06-03', close: 25, currency: 'BRL' },
    ];
    const missingSeries: PriceSeriesPoint[] = [
      { date: '2024-06-03', close: 50, currency: 'BRL' }, // sem preço na compra 2024-01-02
    ];

    const res = runScenario({
      legs: [
        {
          ticker: 'OKAY3',
          assetClass: 'STOCK',
          investedBRL: 5000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
          priceSeries: okSeries,
        },
        {
          ticker: 'MISS3',
          assetClass: 'STOCK',
          investedBRL: 5000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
          priceSeries: missingSeries,
        },
      ],
      options: { reinvestDividends: false, taxEnabled: true },
    });

    expect(res.status).toBe('missing_data');
    expect(res.legs[0].status).toBe('ok');
    expect(res.legs[1].status).toBe('missing_data');
    expect(res.legs[1].finalValueBRL).toBeNull();
    expect(res.total.finalValueBRL).toBeNull();
    expect(res.total.gainBRL).toBeNull();
    expect(res.total.gainPct).toBeNull();
    expect(res.total.netFinalValueBRL).toBeNull();
  });
});
