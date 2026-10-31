import {
  PRIVACY_MASK,
  PRIVACY_CURRENCY_MASK,
  PRIVACY_PERCENT_MASK,
  redactCurrencyValue,
  redactPercentageValue,
  PrivacyAndAuthService,
  BiometricAuthProvider,
} from '../privacyAndAuth';

describe('S6-T04: TestPrivacyRedactionAndBiometricLock', () => {
  describe('Privacy Mode Value Redaction (██████,██)', () => {
    it('should redact numeric and formatted BRL values with ██████,██ when privacy mode is enabled', () => {
      expect(redactCurrencyValue('R$ 32.468,00', true)).toBe(PRIVACY_CURRENCY_MASK);
      expect(redactCurrencyValue(32468.0, true)).toBe(PRIVACY_CURRENCY_MASK);
      expect(
        redactCurrencyValue('32.468,00', true, { includeSymbol: false })
      ).toBe(PRIVACY_MASK);
      expect(PRIVACY_MASK).toBe('██████,██');
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
      expect(service.formatValue('R$ 10.000,00')).toBe('R$ ██████,██');
      expect(service.formatValue('10.000,00', { includeSymbol: false })).toBe(
        '██████,██'
      );
      expect(service.formatPercentage('+8,5%')).toBe(PRIVACY_PERCENT_MASK);

      // Disable privacy mode
      service.setPrivacyMode(false);
      expect(service.getState().isPrivacyModeEnabled).toBe(false);
      expect(service.formatValue('R$ 10.000,00')).toBe('R$ 10.000,00');
    });
  });

  describe('Biometric Lock & Native Authentication Trigger', () => {
    let mockAuthProvider: jest.Mocked<BiometricAuthProvider>;

    beforeEach(() => {
      mockAuthProvider = {
        hasHardwareAsync: jest.fn().mockResolvedValue(true),
        isEnrolledAsync: jest.fn().mockResolvedValue(true),
        authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
      };
    });

    it('should lock the app when biometric lock is enabled and unlock upon successful biometric authentication', async () => {
      const service = new PrivacyAndAuthService(mockAuthProvider);

      // Enable biometric lock and lock the app
      service.setBiometricLockEnabled(true);
      const lockedState = service.lockApp();
      expect(lockedState.isBiometricLockEnabled).toBe(true);
      expect(lockedState.isLocked).toBe(true);

      // Trigger biometric authentication
      const authResult = await service.authenticateAndUnlock(
        'Desbloquear Dossiê Celsus'
      );

      expect(mockAuthProvider.hasHardwareAsync).toHaveBeenCalled();
      expect(mockAuthProvider.isEnrolledAsync).toHaveBeenCalled();
      expect(mockAuthProvider.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          promptMessage: 'Desbloquear Dossiê Celsus',
        })
      );
      expect(authResult.authenticated).toBe(true);
      expect(service.getState().isLocked).toBe(false);
      expect(service.getState().lastAuthenticatedAt).not.toBeNull();
    });

    it('should keep app locked when biometric authentication fails or is cancelled by user', async () => {
      mockAuthProvider.authenticateAsync.mockResolvedValueOnce({
        success: false,
        error: 'user_cancel',
      });

      const service = new PrivacyAndAuthService(mockAuthProvider);
      service.setBiometricLockEnabled(true);
      service.lockApp();

      const authResult = await service.authenticateAndUnlock();

      expect(authResult.authenticated).toBe(false);
      expect(authResult.reason).toBe('user_cancel');
      expect(service.getState().isLocked).toBe(true);
    });

    it('should report biometric availability accurately when hardware or enrollment is missing', async () => {
      mockAuthProvider.hasHardwareAsync.mockResolvedValueOnce(false);
      const service = new PrivacyAndAuthService(mockAuthProvider);

      const available = await service.canUseBiometrics();
      expect(available).toBe(false);
    });

    it('should return failure with reason when attempting to unlock if biometrics are not enrolled on device', async () => {
      mockAuthProvider.isEnrolledAsync.mockResolvedValueOnce(false);
      const service = new PrivacyAndAuthService(mockAuthProvider);
      service.setBiometricLockEnabled(true);
      service.lockApp();

      const authResult = await service.authenticateAndUnlock();
      expect(authResult.authenticated).toBe(false);
      expect(authResult.reason).toMatch(/not_enrolled|unavailable/i);
      expect(service.getState().isLocked).toBe(true);
    });
  });
});
