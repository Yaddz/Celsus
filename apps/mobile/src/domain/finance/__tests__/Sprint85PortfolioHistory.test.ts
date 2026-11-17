import { calculateDailyPatrimonyCurve } from '../portfolioHistory';

describe('Sprint 85 — Histórico patrimonial Open Finance (Fase A)', () => {
  it('S85-T08: histórico de CDB não aplica balance de hoje às datas passadas; 1º ponto rentab < 2% e último = balance (D1, R6)', () => {
    const curve = calculateDailyPatrimonyCurve({
      assets: [
        {
          id: 'cdb-1',
          ticker: 'CDB BTG',
          assetClass: 'FIXED_INCOME',
          rfIndexer: 'CDI',
          rfRate: 100,
          manualPositionValue: '4500.00',
          ofReportedValue: '4500.00',
          ofReportedAt: '2026-03-01',
          valueSource: 'INSTITUTION',
        } as any,
      ],
      transactions: [
        { id: 't1', assetId: 'cdb-1', type: 'BUY', tradeDate: '2026-01-02', quantity: '1', unitPrice: '1000.00' },
        { id: 't2', assetId: 'cdb-1', type: 'BUY', tradeDate: '2026-02-02', quantity: '1', unitPrice: '1500.00' },
        { id: 't3', assetId: 'cdb-1', type: 'BUY', tradeDate: '2026-03-01', quantity: '1', unitPrice: '1500.00' },
      ],
      dates: ['2026-01-02', '2026-02-02', '2026-03-01'],
      macroRates: {
        dailyCDI: {
          '2026-01-02': 0.0004,
          '2026-02-02': 0.0004,
          '2026-03-01': 0.0004,
        },
      },
    });

    expect(curve).toHaveLength(3);
    // 1o ponto: investido 1000, não deve usar 4500 (que daria 350% de rentabilidade)
    expect(parseFloat(curve[0].profitPercentage)).toBeLessThan(2);
    // Último ponto (na data ofReportedAt): valor de mercado = balance reportado
    expect(curve[2].marketValue).toBe('4500.00');
  });

  it('S85-T09: ativo OF sem transações reais aparece no histórico a partir da OPENING_BALANCE (D2, R6)', () => {
    const curve = calculateDailyPatrimonyCurve({
      assets: [
        {
          id: 'fundo-1',
          ticker: 'FMM',
          assetClass: 'FUNDS',
          manualPositionValue: '5500.00',
          ofReportedValue: '5500.00',
          ofReportedAt: '2026-06-01',
          valueSource: 'INSTITUTION',
        } as any,
      ],
      transactions: [
        {
          id: 'open-1',
          assetId: 'fundo-1',
          type: 'BUY',
          tradeDate: '2025-06-01',
          quantity: '100',
          unitPrice: '50.00000000',
        },
      ],
      dates: ['2025-06-01', '2026-06-01'],
    });

    expect(curve).toHaveLength(2);
    expect(curve[0].investedCapital).toBe('5000.00');
    expect(curve[0].marketValue).toBe('5000.00');
    expect(curve[1].marketValue).toBe('5500.00');
  });
});
