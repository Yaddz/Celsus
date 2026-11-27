import {
  trailingYield,
  requiredCapital,
  currentMonthlyIncome,
  suggestPositions,
  incomeCalendar,
  snowball,
} from '../sandbox/dividendGoal';
import type { Dividend } from '../finance/assetProfile';

function makeMonthlyDividends(
  refYear: number,
  amountPerMonth: number,
  monthsCount = 12
): Dividend[] {
  const result: Dividend[] = [];
  // Gera pagamentos mensais terminando em 2026-11-15
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(refYear, 10 - i, 15)); // mês 10 = novembro
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    result.push({
      date: `${yyyy}-${mm}-${dd}`,
      type: 'RENDIMENTO',
      amount: amountPerMonth,
      currency: 'BRL',
    });
  }
  return result;
}

describe('Sprint 111 — Domínio dividendGoal (R51)', () => {
  const REF_DATE = '2026-11-27';

  test('S111-T01: trailingYield com 12 pagamentos mensais soma os últimos 12 meses e divide pelo preço', () => {
    // 12 pagamentos de R$ 0,80 = R$ 9,60; preço R$ 100,00 => yield 9,6% (0.096)
    const divs: Dividend[] = [
      // Pagamento fora da janela (> 12 meses atrás) não entra na soma
      { date: '2025-11-01', type: 'RENDIMENTO', amount: 0.8 },
      ...makeMonthlyDividends(2026, 0.8, 12),
    ];

    const res = trailingYield(divs, 100, REF_DATE);
    expect(res.shortHistory).toBe(false);
    expect(res.count12m).toBe(12);
    expect(res.total12m).toBeCloseTo(9.6, 4);
    expect(res.yield).toBeCloseTo(0.096, 4);
  });

  test('S111-T02: trailingYield com pagamentos trimestrais (4 no ano) calcula yield sem marcar histórico curto', () => {
    const divs: Dividend[] = [
      { date: '2026-02-15', type: 'DIVIDEND', amount: 0.5 },
      { date: '2026-05-15', type: 'DIVIDEND', amount: 0.5 },
      { date: '2026-08-15', type: 'DIVIDEND', amount: 0.5 },
      { date: '2026-11-15', type: 'DIVIDEND', amount: 0.5 },
    ];
    // Soma 2,00 / preço 25,00 = 8% (0.08)
    const res = trailingYield(divs, 25, REF_DATE);
    expect(res.shortHistory).toBe(false);
    expect(res.count12m).toBe(4);
    expect(res.total12m).toBeCloseTo(2.0, 4);
    expect(res.yield).toBeCloseTo(0.08, 4);
  });

  test('S111-T03: trailingYield com histórico < 12 meses marca shortHistory=true e não retorna yield válido', () => {
    // Apenas 4 meses de histórico (ago..nov/2026)
    const divs = makeMonthlyDividends(2026, 1.0, 4);
    const res = trailingYield(divs, 100, REF_DATE);
    expect(res.shortHistory).toBe(true);
    expect(res.yield).toBeNull();
  });

  test('S111-T04: requiredCapital de R$ 3.000/mês a 8% a.a. resulta em R$ 450.000', () => {
    const cap = requiredCapital(3000, 0.08);
    expect(cap).toBeCloseTo(450000, 2);

    expect(requiredCapital(3000, 0)).toBeNull();
    expect(requiredCapital(0, 0.08)).toBe(0);

    // Verifica currentMonthlyIncome (últimos 12m / 12)
    const monthly = currentMonthlyIncome(
      [
        { pay_date: '2026-03-10', amount: '600.00' },
        { pay_date: '2026-09-10', amount: '600.00' },
        { pay_date: '2025-10-01', amount: '1200.00' }, // fora dos 12m
      ],
      REF_DATE
    );
    expect(monthly).toBeCloseTo(100, 2);
  });

  test('S111-T05: suggestPositions respeita o teto de 20% por ativo', () => {
    const candidates = [
      { ticker: 'MXRF11', assetClass: 'FII', yield: 0.12, price: 10 },
      { ticker: 'HGLG11', assetClass: 'FII', yield: 0.10, price: 150 },
      { ticker: 'XPML11', assetClass: 'FII', yield: 0.095, price: 110 },
      { ticker: 'KNRI11', assetClass: 'FII', yield: 0.09, price: 140 },
      { ticker: 'VISC11', assetClass: 'FII', yield: 0.085, price: 115 },
      { ticker: 'SHORT11', assetClass: 'FII', yield: 0.25, price: 50, shortHistory: true },
    ];
    const gapCents = 10_000_000; // R$ 100.000,00
    const res = suggestPositions({
      mode: 'free',
      candidates,
      maxPerAsset: 0.2,
      minAssets: 4,
      gapCents,
    });

    // Ativo com histórico curto não entra na sugestão automática
    expect(res.items.find((i) => i.ticker === 'SHORT11')).toBeUndefined();

    // Nenhum ativo ultrapassa 20% do gapCents
    for (const item of res.items) {
      expect(item.investedCents).toBeLessThanOrEqual(gapCents * 0.2);
      expect(item.weight).toBeLessThanOrEqual(0.2001);
    }
  });

  test('S111-T06: suggestPositions garante mínimo de 4 ativos quando há candidatos elegíveis', () => {
    const candidates = [
      { ticker: 'TAEE11', assetClass: 'STOCK', yield: 0.11, price: 35, targetWeight: 50 },
      { ticker: 'BBAS3', assetClass: 'STOCK', yield: 0.10, price: 28, targetWeight: 20 },
      { ticker: 'ITSA4', assetClass: 'STOCK', yield: 0.09, price: 10, targetWeight: 10 },
      { ticker: 'EGIE3', assetClass: 'STOCK', yield: 0.08, price: 42, targetWeight: 10 },
      { ticker: 'CPFE3', assetClass: 'STOCK', yield: 0.075, price: 34, targetWeight: 10 },
    ];
    const res = suggestPositions({
      mode: 'follow_targets',
      candidates,
      maxPerAsset: 0.2,
      minAssets: 4,
      gapCents: 5_000_000,
    });

    expect(res.insufficientAssets).toBe(false);
    expect(res.items.length).toBeGreaterThanOrEqual(4);
  });

  test('S111-T07: suggestPositions retorna quantidades inteiras (cotas/ações) e troco exato', () => {
    const candidates = [
      { ticker: 'A1', assetClass: 'FII', yield: 0.10, price: 103.33 },
      { ticker: 'A2', assetClass: 'FII', yield: 0.10, price: 97.5 },
      { ticker: 'A3', assetClass: 'FII', yield: 0.10, price: 141.2 },
      { ticker: 'A4', assetClass: 'FII', yield: 0.10, price: 88.8 },
      { ticker: 'A5', assetClass: 'FII', yield: 0.10, price: 120.0 },
    ];
    const gapCents = 1_000_000; // R$ 10.000,00
    const res = suggestPositions({
      mode: 'free',
      candidates,
      maxPerAsset: 0.2,
      minAssets: 4,
      gapCents,
    });

    let sumInvested = 0;
    for (const item of res.items) {
      expect(Number.isInteger(item.quantity)).toBe(true);
      expect(item.quantity).toBeGreaterThanOrEqual(0);
      expect(item.investedCents).toBe(item.quantity * item.priceCents);
      sumInvested += item.investedCents;
    }
    expect(res.totalInvestedCents).toBe(sumInvested);
    expect(res.changeCents).toBeGreaterThanOrEqual(0);
    expect(res.totalInvestedCents + res.changeCents).toBe(gapCents);
  });

  test('S111-T08: incomeCalendar soma os pagamentos dos últimos 12 meses nos meses certos escalados pela quantidade', () => {
    const dividendsByTicker: Record<string, Dividend[]> = {
      PETR4: [
        { date: '2026-02-20', type: 'DIVIDEND', amount: 1.5 },
        { date: '2026-08-20', type: 'DIVIDEND', amount: 2.0 },
        { date: '2024-02-20', type: 'DIVIDEND', amount: 5.0 }, // antigo (>12m), ignorado
      ],
      MXRF11: [
        { date: '2026-02-15', type: 'RENDIMENTO', amount: 0.1 },
        { date: '2026-05-15', type: 'RENDIMENTO', amount: 0.1 },
      ],
    };
    const quantities = { PETR4: 100, MXRF11: 500 };

    const cal = incomeCalendar(dividendsByTicker, quantities, REF_DATE);
    expect(cal).toHaveLength(12);

    const feb = cal.find((m) => m.month === 2);
    const may = cal.find((m) => m.month === 5);
    const aug = cal.find((m) => m.month === 8);
    const jan = cal.find((m) => m.month === 1);

    // Fev: 100 * 1.50 + 500 * 0.10 = 150 + 50 = 200
    expect(feb?.amountBRL).toBeCloseTo(200, 2);
    // Mai: 500 * 0.10 = 50
    expect(may?.amountBRL).toBeCloseTo(50, 2);
    // Ago: 100 * 2.00 = 200
    expect(aug?.amountBRL).toBeCloseTo(200, 2);
    // Jan: 0
    expect(jan?.amountBRL).toBe(0);
  });

  test('S111-T09: snowball com aporte e reinvestimento bate a conta à mão', () => {
    // Conta à mão:
    // start = R$ 10.000 (1_000_000 cents), aporte = R$ 1.000/mês (100_000 cents),
    // yield = 12% a.a. (1% ao mês), meta = R$ 130/mês (13_000 cents)
    // Mês 1: div = 100,00 -> capital = 11.100,00 -> renda = 111,00
    // Mês 2: div = 111,00 -> capital = 12.211,00 -> renda = 122,11
    // Mês 3: div = 122,11 -> capital = 13.333,11 -> renda = 133,33 >= 130,00
    const res = snowball({
      startCents: 1_000_000,
      monthlyCents: 100_000,
      yield: 0.12,
      monthlyGoalCents: 13_000,
    });

    expect(res.reached).toBe(true);
    expect(res.monthsToGoal).toBe(3);
    expect(res.finalCapitalCents).toBe(1_333_311);
    expect(res.finalMonthlyIncomeCents).toBe(13_333);
    expect(res.timeline).toHaveLength(3);
  });
});
