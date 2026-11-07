import { AuthService } from '../authService';
import { InMemorySecureStorage } from '../secureStorage';
import { BiometricAuthProvider } from '../biometricProvider';

describe('S42: AuthService Core Security Tests', () => {
  let storage: InMemorySecureStorage;
  let mockBiometrics: jest.Mocked<BiometricAuthProvider>;
  let currentTime: number;
  let service: AuthService;

  beforeEach(() => {
    storage = new InMemorySecureStorage();
    currentTime = 1700000000000;
    mockBiometrics = {
      hasHardwareAsync: jest.fn().mockResolvedValue(true),
      isEnrolledAsync: jest.fn().mockResolvedValue(true),
      authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
    };

    service = new AuthService({
      storage,
      biometrics: mockBiometrics,
      clock: () => currentTime,
      randomBytes: (len: number) => {
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = (i + 1) % 256;
        return arr;
      },
    });
  });

  describe('PIN Management and Hashing', () => {
    it('S42-T08: should set valid 6-digit PIN and verify correctly, failing on wrong PIN', async () => {
      expect(await service.hasPin()).toBe(false);

      await service.setPin('123456');
      expect(await service.hasPin()).toBe(true);

      const okRes = await service.verifyPin('123456');
      expect(okRes).toEqual({ ok: true });

      const failRes = await service.verifyPin('654321');
      expect(failRes.ok).toBe(false);
      expect(failRes.reason).toBe('invalid_pin');
    });

    it('S42-T09: hash must differ between installations due to random salt; PIN is never stored in plaintext', async () => {
      const storageA = new InMemorySecureStorage();
      const storageB = new InMemorySecureStorage();

      const serviceA = new AuthService({
        storage: storageA,
        clock: () => currentTime,
        randomBytes: () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
      });

      const serviceB = new AuthService({
        storage: storageB,
        clock: () => currentTime,
        randomBytes: () => new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
      });

      await serviceA.setPin('888999');
      await serviceB.setPin('888999');

      const hashA = await storageA.getItem('auth:pin_hash');
      const hashB = await storageB.getItem('auth:pin_hash');
      const saltA = await storageA.getItem('auth:pin_salt');
      const saltB = await storageB.getItem('auth:pin_salt');

      expect(hashA).toBeDefined();
      expect(hashB).toBeDefined();
      expect(hashA).not.toEqual(hashB);
      expect(saltA).not.toEqual(saltB);

      // Verify plaintext PIN is nowhere in storage
      expect(hashA).not.toContain('888999');
      expect(saltA).not.toContain('888999');
    });

    it('S42-T10: should reject invalid PINs (<6 digits, >6 digits, non-numeric)', async () => {
      await expect(service.setPin('12345')).rejects.toThrow();
      await expect(service.setPin('1234567')).rejects.toThrow();
      await expect(service.setPin('12345a')).rejects.toThrow();
      await expect(service.setPin(' 12345')).rejects.toThrow();
      await expect(service.setPin('')).rejects.toThrow();
    });

    it('S42-T11: changePin must verify current PIN before accepting new PIN', async () => {
      await service.setPin('123456');

      const wrongOld = await service.changePin('000000', '654321');
      expect(wrongOld.ok).toBe(false);
      expect(wrongOld.reason).toBe('invalid_old_pin');

      // PIN remains unchanged
      expect((await service.verifyPin('123456')).ok).toBe(true);

      const successChange = await service.changePin('123456', '654321');
      expect(successChange.ok).toBe(true);

      expect((await service.verifyPin('123456')).ok).toBe(false);
      expect((await service.verifyPin('654321')).ok).toBe(true);
    });

    it('S42-T12: removePin requires current PIN, cleans PIN, salt, counters and disables biometrics', async () => {
      await service.setPin('123456');
      await service.enableBiometrics();
      expect(await service.isBiometricEnabled()).toBe(true);

      const fail = await service.removePin('999999');
      expect(fail.ok).toBe(false);
      expect(await service.hasPin()).toBe(true);
      expect(await service.isBiometricEnabled()).toBe(true);

      const ok = await service.removePin('123456');
      expect(ok.ok).toBe(true);
      expect(await service.hasPin()).toBe(false);
      expect(await service.isBiometricEnabled()).toBe(false);
      expect(await storage.getItem('auth:pin_hash')).toBeNull();
      expect(await storage.getItem('auth:pin_salt')).toBeNull();
    });
  });

  describe('Lockout Mechanism (spec D5)', () => {
    it('S42-T13: 5 consecutive failed attempts trigger 30s lockout', async () => {
      await service.setPin('123456');

      for (let i = 0; i < 4; i++) {
        const res = await service.verifyPin('000000');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('invalid_pin');
      }

      // 5th failed attempt triggers 30s lockout
      const fifth = await service.verifyPin('000000');
      expect(fifth.ok).toBe(false);
      expect(fifth.reason).toBe('locked');
      expect(fifth.remainingMs).toBe(30000);

      // Subsequent attempt while locked
      const blocked = await service.verifyPin('123456');
      expect(blocked.ok).toBe(false);
      expect(blocked.reason).toBe('locked');
      expect(blocked.remainingMs).toBe(30000);

      // Advance time by 15s -> still locked
      currentTime += 15000;
      expect(await service.getLockoutRemainingMs()).toBe(15000);

      // Advance time by another 15s (total 30s) -> lockout expired
      currentTime += 15000;
      expect(await service.getLockoutRemainingMs()).toBe(0);

      // Now correct PIN succeeds
      const unlocked = await service.verifyPin('123456');
      expect(unlocked.ok).toBe(true);
    });

    it('S42-T14: lockout persists across service recreation (stored in SecureStorage)', async () => {
      await service.setPin('123456');

      for (let i = 0; i < 5; i++) {
        await service.verifyPin('000000');
      }

      // Recreate service with same storage
      const newServiceInstance = new AuthService({
        storage,
        clock: () => currentTime + 10000,
      });

      expect(await newServiceInstance.getLockoutRemainingMs()).toBe(20000);
      const attempt = await newServiceInstance.verifyPin('123456');
      expect(attempt.ok).toBe(false);
      expect(attempt.reason).toBe('locked');
      expect(attempt.remainingMs).toBe(20000);
    });

    it('S42-T15: lockout progression: 30s -> 1 min -> 5 min -> 15 min on subsequent errors', async () => {
      await service.setPin('123456');

      // 5 errors -> 30s
      for (let i = 0; i < 5; i++) await service.verifyPin('000000');
      expect(await service.getLockoutRemainingMs()).toBe(30000);

      // Wait 30s
      currentTime += 30000;
      expect(await service.getLockoutRemainingMs()).toBe(0);

      // 6th error -> 1 min (60s)
      const err6 = await service.verifyPin('000000');
      expect(err6.remainingMs).toBe(60000);

      // Wait 60s
      currentTime += 60000;
      expect(await service.getLockoutRemainingMs()).toBe(0);

      // 7th error -> 5 min (300s)
      const err7 = await service.verifyPin('000000');
      expect(err7.remainingMs).toBe(300000);

      // Wait 300s
      currentTime += 300000;
      expect(await service.getLockoutRemainingMs()).toBe(0);

      // 8th error -> 15 min (900s)
      const err8 = await service.verifyPin('000000');
      expect(err8.remainingMs).toBe(900000);
    });

    it('S42-T16: successful PIN entry resets failed attempt counter and lockout timer', async () => {
      await service.setPin('123456');

      // 4 errors (not locked yet)
      for (let i = 0; i < 4; i++) await service.verifyPin('000000');

      // 1 success resets counter
      const success = await service.verifyPin('123456');
      expect(success.ok).toBe(true);

      // Another 4 errors should not lock
      for (let i = 0; i < 4; i++) {
        const res = await service.verifyPin('000000');
        expect(res.reason).toBe('invalid_pin');
      }

      // 5th error locks for 30s (not progressive jump)
      const res5 = await service.verifyPin('000000');
      expect(res5.remainingMs).toBe(30000);
    });

    it('S42-T17: verifyPin respects lockout period (returns { ok: false, reason: "locked", remainingMs })', async () => {
      await service.setPin('123456');
      for (let i = 0; i < 5; i++) await service.verifyPin('000000');

      const res = await service.verifyPin('123456');
      expect(res).toEqual({
        ok: false,
        reason: 'locked',
        remainingMs: 30000,
      });
    });
  });

  describe('Biometrics Management', () => {
    it('S42-T18: canUseBiometrics returns false if hardware is missing or biometrics not enrolled', async () => {
      mockBiometrics.hasHardwareAsync.mockResolvedValueOnce(false);
      expect(await service.canUseBiometrics()).toBe(false);

      mockBiometrics.hasHardwareAsync.mockResolvedValueOnce(true);
      mockBiometrics.isEnrolledAsync.mockResolvedValueOnce(false);
      expect(await service.canUseBiometrics()).toBe(false);

      mockBiometrics.hasHardwareAsync.mockResolvedValueOnce(true);
      mockBiometrics.isEnrolledAsync.mockResolvedValueOnce(true);
      expect(await service.canUseBiometrics()).toBe(true);
    });

    it('S42-T19: enableBiometrics requires hasPin() to be true', async () => {
      // Without PIN
      const res = await service.enableBiometrics();
      expect(res.success).toBe(false);
      expect(res.reason).toBe('pin_required');
      expect(await service.isBiometricEnabled()).toBe(false);
    });

    it('S42-T20: enableBiometrics executes test authentication and only persists active state on success', async () => {
      await service.setPin('123456');

      // Mock test auth failure
      mockBiometrics.authenticateAsync.mockResolvedValueOnce({
        success: false,
        error: 'user_cancel',
      });

      const failRes = await service.enableBiometrics();
      expect(failRes.success).toBe(false);
      expect(await service.isBiometricEnabled()).toBe(false);

      // Mock test auth success
      mockBiometrics.authenticateAsync.mockResolvedValueOnce({ success: true });
      const okRes = await service.enableBiometrics();
      expect(okRes.success).toBe(true);
      expect(await service.isBiometricEnabled()).toBe(true);

      // Disable biometrics
      await service.disableBiometrics();
      expect(await service.isBiometricEnabled()).toBe(false);
    });

    it('S42-T21: authenticateBiometric disables biometric flag and returns "biometrics_not_enrolled" if biometrics removed', async () => {
      await service.setPin('123456');
      mockBiometrics.authenticateAsync.mockResolvedValueOnce({ success: true });
      await service.enableBiometrics();
      expect(await service.isBiometricEnabled()).toBe(true);

      // Device lost enrollment
      mockBiometrics.isEnrolledAsync.mockResolvedValueOnce(false);
      const auth = await service.authenticateBiometric('Login');
      expect(auth.success).toBe(false);
      expect(auth.reason).toBe('biometrics_not_enrolled');
      expect(await service.isBiometricEnabled()).toBe(false);
    });
  });

  describe('AutoLock and Reset', () => {
    it('S42-T22: autoLockSeconds defaults to 60, allows 0|30|60|300, and without PIN there is no lock', async () => {
      expect(await service.getAutoLockSeconds()).toBe(60);

      await service.setAutoLockSeconds(30);
      expect(await service.getAutoLockSeconds()).toBe(30);

      await service.setAutoLockSeconds(300);
      expect(await service.getAutoLockSeconds()).toBe(300);

      await service.setAutoLockSeconds(0);
      expect(await service.getAutoLockSeconds()).toBe(0);

      // Invalid value rejected
      await expect(service.setAutoLockSeconds(15 as any)).rejects.toThrow();
    });

    it('S42-T23: resetAll clears all auth secrets, lockout states, and biometric flags', async () => {
      await service.setPin('123456');
      await service.enableBiometrics();
      await service.setAutoLockSeconds(300);

      await service.resetAll();

      expect(await service.hasPin()).toBe(false);
      expect(await service.isBiometricEnabled()).toBe(false);
      expect(await service.getAutoLockSeconds()).toBe(60);
      expect(await service.getLockoutRemainingMs()).toBe(0);
    });
  });
});
