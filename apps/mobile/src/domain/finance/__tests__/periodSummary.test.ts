import {
  filterCurveByPeriod,
  calculatePeriodSummary,
  HistoricalPricePoint,
  HistoricalTransactionInput,
  PeriodFilter,
  PeriodSummary,
} from '../portfolioHistory';

describe('S11-T01: TestPeriodFilterAndPeriodSummaryCalculation', () => {
  // Amostra de curva diária cobrindo de 2020 a 2026
  const sampleCurve: HistoricalPricePoint[] = [
    { date: '2020-01-01', investedCapital: '5000.00', marketValue: '5000.00', profit: '0.00', profitPercentage: '0.00' },
    { date: '2021-06-30', investedCapital: '10000.00', marketValue: '12000.00', profit: '2000.00', profitPercentage: '20.00' },
    { date: '2023-01-01', investedCapital: '20000.00', marketValue: '26000.00', profit: '6000.00', profitPercentage: '30.00' },
    { date: '2025-06-30', investedCapital: '30000.00', marketValue: '42000.00', profit: '12000.00', profitPercentage: '40.00' },
    { date: '2026-05-30', investedCapital: '35000.00', marketValue: '48000.00', profit: '13000.00', profitPercentage: '37.14' },
    { date: '2026-06-25', investedCapital: '38000.00', marketValue: '51500.00', profit: '13500.00', profitPercentage: '35.53' },
    { date: '2026-06-28', investedCapital: '40000.00', marketValue: '53000.00', profit: '13000.00', profitPercentage: '32.50' },
    { date: '2026-06-30', investedCapital: '40000.00', marketValue: '54200.00', profit: '14200.00', profitPercentage: '35.50' },
  ];

  const refDate = '2026-06-30';

  describe('Historical Curve Period Filtering (5D, 1M, 1Y, 5Y, ALL)', () => {
    it('should return points within 5 days for 5D filter', () => {
      const filtered = filterCurveByPeriod(sampleCurve, '5D', refDate);

      // Deve incluir apenas datas a partir de 2026-06-25 até 2026-06-30
      expect(filtered.length).toBe(3);
      expect(filtered[0].date).toBe('2026-06-25');
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should return points within 1 month (30 days) for 1M filter', () => {
      const filtered = filterCurveByPeriod(sampleCurve, '1M', refDate);

      // Deve incluir datas a partir de 2026-05-30
      expect(filtered.length).toBe(4);
      expect(filtered[0].date).toBe('2026-05-30');
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should return points within 1 year for 1Y filter', () => {
      const filtered = filterCurveByPeriod(sampleCurve, '1Y', refDate);

      // Deve incluir datas a partir de 2025-06-30
      expect(filtered.length).toBe(5);
      expect(filtered[0].date).toBe('2025-06-30');
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should return points within 5 years for 5Y filter', () => {
      const filtered = filterCurveByPeriod(sampleCurve, '5Y', refDate);

      // Deve incluir datas a partir de 2021-06-30 (5 anos antes de 2026-06-30)
      expect(filtered.length).toBe(7);
      expect(filtered[0].date).toBe('2021-06-30');
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should return all points without filtering for ALL filter', () => {
      const filtered = filterCurveByPeriod(sampleCurve, 'ALL', refDate);

      expect(filtered.length).toBe(sampleCurve.length);
      expect(filtered[0].date).toBe('2020-01-01');
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should use the latest curve point date as default referenceDate if omitted', () => {
      const filtered = filterCurveByPeriod(sampleCurve, '5D');

      expect(filtered.length).toBe(3);
      expect(filtered[filtered.length - 1].date).toBe('2026-06-30');
    });

    it('should return empty array if input curve is empty', () => {
      const filtered = filterCurveByPeriod([], '1M', refDate);
      expect(filtered).toEqual([]);
    });
  });

  describe('Period Financial Summary Calculation (calculatePeriodSummary)', () => {
    it('should calculate summary accurately when there are no new contributions in the period', () => {
      // Período de 2026-06-28 a 2026-06-30 (investedCapital constante de 40000.00)
      const periodSlice: HistoricalPricePoint[] = [
        { date: '2026-06-28', investedCapital: '40000.00', marketValue: '53000.00', profit: '13000.00', profitPercentage: '32.50' },
        { date: '2026-06-30', investedCapital: '40000.00', marketValue: '54200.00', profit: '14200.00', profitPercentage: '35.50' },
      ];

      const summary = calculatePeriodSummary(periodSlice);

      expect(summary.initialPatrimony).toBe('53000.00');
      expect(summary.finalPatrimony).toBe('54200.00');
      expect(summary.netContributions).toBe('0.00');
      // Rendimento = 54200 - 53000 - 0 = 1200.00
      expect(summary.yieldAmount).toBe('1200.00');
      // Rentabilidade = (1200 / 53000) * 100 = 2.264... -> 2.26%
      expect(summary.yieldPercentage).toBe('2.26');
    });

    it('should calculate summary accurately with new contributions during the period using transactions', () => {
      // Inicial: 48000.00; Final: 54200.00
      const periodSlice: HistoricalPricePoint[] = [
        { date: '2026-05-30', investedCapital: '35000.00', marketValue: '48000.00', profit: '13000.00', profitPercentage: '37.14' },
        { date: '2026-06-30', investedCapital: '40000.00', marketValue: '54200.00', profit: '14200.00', profitPercentage: '35.50' },
      ];

      const txs: HistoricalTransactionInput[] = [
        { assetId: 'a1', type: 'BUY', tradeDate: '2026-06-10', quantity: '50', unitPrice: '60.00', fees: '0' }, // +3000.00
        { assetId: 'a2', type: 'BUY', tradeDate: '2026-06-20', quantity: '40', unitPrice: '50.00', fees: '0' }, // +2000.00
      ];

      const summary = calculatePeriodSummary(periodSlice, txs);

      expect(summary.initialPatrimony).toBe('48000.00');
      expect(summary.finalPatrimony).toBe('54200.00');
      expect(summary.netContributions).toBe('5000.00');
      // Rendimento = 54200 - 48000 - 5000 = 1200.00
      expect(summary.yieldAmount).toBe('1200.00');
      // Rentabilidade = (1200 / (48000 + 5000)) * 100 = (1200 / 53000) * 100 = 2.26%
      expect(summary.yieldPercentage).toBe('2.26');
    });

    it('should compute netContributions from investedCapital diff when transactions are omitted', () => {
      const periodSlice: HistoricalPricePoint[] = [
        { date: '2026-05-30', investedCapital: '35000.00', marketValue: '48000.00', profit: '13000.00', profitPercentage: '37.14' },
        { date: '2026-06-30', investedCapital: '40000.00', marketValue: '54200.00', profit: '14200.00', profitPercentage: '35.50' },
      ];

      const summary = calculatePeriodSummary(periodSlice);

      expect(summary.initialPatrimony).toBe('48000.00');
      expect(summary.finalPatrimony).toBe('54200.00');
      expect(summary.netContributions).toBe('5000.00'); // 40000 - 35000
      expect(summary.yieldAmount).toBe('1200.00');
      expect(summary.yieldPercentage).toBe('2.26');
    });

    it('should handle negative yield / drawdown correctly', () => {
      const periodSlice: HistoricalPricePoint[] = [
        { date: '2026-01-01', investedCapital: '20000.00', marketValue: '25000.00', profit: '5000.00', profitPercentage: '25.00' },
        { date: '2026-03-31', investedCapital: '20000.00', marketValue: '23000.00', profit: '3000.00', profitPercentage: '15.00' },
      ];

      const summary = calculatePeriodSummary(periodSlice);

      expect(summary.initialPatrimony).toBe('25000.00');
      expect(summary.finalPatrimony).toBe('23000.00');
      expect(summary.netContributions).toBe('0.00');
      // Rendimento = 23000 - 25000 = -2000.00
      expect(summary.yieldAmount).toBe('-2000.00');
      // Rentabilidade = (-2000 / 25000) * 100 = -8.00%
      expect(summary.yieldPercentage).toBe('-8.00');
    });

    it('should return all 0.00 for empty curve', () => {
      const summary = calculatePeriodSummary([]);

      expect(summary.initialPatrimony).toBe('0.00');
      expect(summary.finalPatrimony).toBe('0.00');
      expect(summary.netContributions).toBe('0.00');
      expect(summary.yieldAmount).toBe('0.00');
      expect(summary.yieldPercentage).toBe('0.00');
    });
  });
});
