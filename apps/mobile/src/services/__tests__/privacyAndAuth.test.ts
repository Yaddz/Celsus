import {
  PRIVACY_MASK,
  PRIVACY_CURRENCY_MASK,
  PRIVACY_PERCENT_MASK,
  redactCurrencyValue,
  redactPercentageValue,
  PrivacyAndAuthService,
} from '../privacyAndAuth';

describe('S6-T04: TestPrivacyRedaction', () => {
  describe('Privacy Mode Value Redaction (••••••)', () => {
    it('should redact numeric and formatted BRL values with •••••• when privacy mode is enabled', () => {
      expect(redactCurrencyValue('R$ 32.468,00', true)).toBe(PRIVACY_CURRENCY_MASK);
      expect(redactCurrencyValue(32468.0, true)).toBe(PRIVACY_CURRENCY_MASK);
      expect(
        redactCurrencyValue('32.468,00', true, { includeSymbol: false })
      ).toBe(PRIVACY_MASK);
      expect(PRIVACY_MASK).toBe('••••••');
      expect(PRIVACY_CURRENCY_MASK).toBe('R$ ••••••');
    });

    it('should display formatted BRL values normally when privacy mode is disabled', () => {
      expect(redactCurrencyValue('R$ 32.468,00', false)).toBe('R$ 32.468,00');
      expect(redactCurrencyValue(1500.5, false)).toBe('R$ 1.500,50');
      expect(
        redactCurrencyValue('32.468,00', false, { includeSymbol: false })
      ).toBe('32.468,00');
    });

    it('should redact percentage values when privacy mode is enabled', () => {
      expect(redactPercentageValue('+12,4%', true)).toBe(PRIVACY_PERCENT_MASK);
      expect(redactPercentageValue(12.4, true)).toBe(PRIVACY_PERCENT_MASK);
      expect(redactPercentageValue('+12,4%', false)).toBe('+12,4%');
    });

    it('should toggle privacy mode state in PrivacyAndAuthService and format values accordingly', () => {
      const service = new PrivacyAndAuthService();

      expect(service.getState().isPrivacyModeEnabled).toBe(false);
      expect(service.formatValue('R$ 10.000,00')).toBe('R$ 10.000,00');

      // Enable privacy mode
      const afterToggle = service.togglePrivacyMode();
      expect(afterToggle.isPrivacyModeEnabled).toBe(true);
      expect(service.formatValue('R$ 10.000,00')).toBe('R$ ••••••');
      expect(service.formatValue('10.000,00', { includeSymbol: false })).toBe(
        '••••••'
      );
      expect(service.formatPercentage('+8,5%')).toBe(PRIVACY_PERCENT_MASK);

      // Disable privacy mode
      service.setPrivacyMode(false);
      expect(service.getState().isPrivacyModeEnabled).toBe(false);
      expect(service.formatValue('R$ 10.000,00')).toBe('R$ 10.000,00');
    });
  });
});
