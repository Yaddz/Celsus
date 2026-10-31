import {
  calculateCDIAccrual,
  calculatePreFixedAccrual,
  calculateIPCAPlusAccrual,
  calculateFixedIncomeCurrentValue,
} from '../fixedIncome';

describe('S3-T05: TestFixedIncomeCDIPercentageCurve', () => {
  it('should calculate exact daily compound accrual for 110% of CDI for a single business day', () => {
    // Principal: R$ 10,000.00
    // Rate: 110% of CDI
    // Daily CDI: 0.00049 (~13.15% a.a.)
    // Effective daily rate: 0.00049 * 1.10 = 0.000539
    // Factor: 1.000539
    // Accrued value: 10000 * 1.000539 = 10005.39
    const result = calculateCDIAccrual('10000.00', 110, [0.00049]);

    expect(Number(result.factor)).toBeCloseTo(1.000539, 6);
    expect(result.currentValue).toBe('10005.39');
  });

  it('should calculate compound accrual across multiple business days for 100% of CDI', () => {
    // Principal: R$ 50,000.00
    // Rate: 100% of CDI
    // Daily CDI rates for 3 business days: [0.00049, 0.00050, 0.00051]
    // Factor: 1.00049 * 1.00050 * 1.00051 = 1.001500735
    // Accrued value: 50000 * 1.001500735 = 50075.04
    const result = calculateCDIAccrual('50000.00', 100, [0.00049, 0.00050, 0.00051]);

    expect(Number(result.factor)).toBeCloseTo(1.001500735, 6);
    expect(result.currentValue).toBe('50075.04');
  });

  it('should calculate compound accrual for 120% of CDI over 5 business days', () => {
    // Principal: R$ 20,000.00
    // Rate: 120% of CDI
    // 5 business days at 0.00048 per day
    // Daily effective rate: 0.00048 * 1.2 = 0.000576
    // Factor: (1.000576)^5 = 1.002883318
    // Accrued value: 20000 * 1.002883318 = 20057.67
    const dailyRates = [0.00048, 0.00048, 0.00048, 0.00048, 0.00048];
    const result = calculateCDIAccrual('20000.00', 120, dailyRates);

    expect(Number(result.factor)).toBeCloseTo(1.002883318, 6);
    expect(result.currentValue).toBe('20057.67');
  });

  it('should return principal with factor 1.000000 when no business days are passed', () => {
    const result = calculateCDIAccrual('15000.00', 110, []);
    expect(result.factor).toBe('1.000000');
    expect(result.currentValue).toBe('15000.00');
  });
});

describe('S3-T06: TestFixedIncomePreAndIPCAPlusAndManualOverride', () => {
  describe('Pre-fixed Accrual (Base 252 Business Days)', () => {
    it('should compute exact pre-fixed accrual for half-year (126 business days) at 12.5% a.a.', () => {
      // Principal: R$ 10,000.00
      // Annual Rate: 12.5% (rate = 12.5)
      // Business days: 126
      // Factor: (1 + 0.125)^(126 / 252) = (1.125)^0.5 = 1.06066017
      // Value: 10000 * 1.06066017 = 10606.60
      const result = calculatePreFixedAccrual('10000.00', 12.5, 126);

      expect(Number(result.factor)).toBeCloseTo(1.06066017, 6);
      expect(result.currentValue).toBe('10606.60');
    });

    it('should compute exact pre-fixed accrual for full financial year (252 business days)', () => {
      // Factor: (1.125)^1 = 1.125000
      // Value: 10000 * 1.125 = 11250.00
      const result = calculatePreFixedAccrual('10000.00', 12.5, 252);

      expect(result.factor).toBe('1.125000');
      expect(result.currentValue).toBe('11250.00');
    });
  });

  describe('Hybrid IPCA + Fixed Spread Accrual', () => {
    it('should compound accumulated IPCA variation with pro-rata fixed coupon on 252 base', () => {
      // Principal: R$ 20,000.00
      // Fixed Spread: 6.0% a.a.
      // Business days: 126 (half year -> (1.06)^0.5 = 1.029563014)
      // IPCA accumulated variation: 0.035 (3.5%)
      // Combined factor: (1 + 0.035) * 1.029563014 = 1.065597719
      // Value: 20000 * 1.065597719 = 21311.95
      const result = calculateIPCAPlusAccrual('20000.00', 6.0, 126, 0.035);

      expect(Number(result.factor)).toBeCloseTo(1.0655977, 5);
      expect(result.currentValue).toBe('21311.95');
    });
  });

  describe('Precedence of manual_price_override', () => {
    it('should prioritize manual_price_override when provided, ignoring theoretical curve', () => {
      // Even if theoretical pre-fixed calculation would give R$ 10,606.60,
      // a manual price override of R$ 10,750.00 must be returned.
      const result = calculateFixedIncomeCurrentValue({
        principal: '10000.00',
        indexer: 'PRE',
        rate: 12.5,
        businessDays: 126,
        manualPriceOverride: '10750.00',
      });

      expect(result.currentValue).toBe('10750.00');
      expect(result.isOverridden).toBe(true);
    });

    it('should fall back to theoretical curve when manual_price_override is null or empty', () => {
      const resultNull = calculateFixedIncomeCurrentValue({
        principal: '10000.00',
        indexer: 'PRE',
        rate: 12.5,
        businessDays: 126,
        manualPriceOverride: null,
      });

      expect(resultNull.currentValue).toBe('10606.60');
      expect(resultNull.isOverridden).toBe(false);

      const resultEmpty = calculateFixedIncomeCurrentValue({
        principal: '10000.00',
        indexer: 'PRE',
        rate: 12.5,
        businessDays: 126,
        manualPriceOverride: '',
      });

      expect(resultEmpty.currentValue).toBe('10606.60');
      expect(resultEmpty.isOverridden).toBe(false);
    });
  });
});
