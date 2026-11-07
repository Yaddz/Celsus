import { sessionStore } from '../sessionStore';

describe('S42: SessionStore Tests', () => {
  beforeEach(() => {
    sessionStore.setStatus('loading');
    sessionStore.markBackgrounded(0);
  });

  it('S42-T24: should track initial status and transitions', () => {
    expect(sessionStore.getState().status).toBe('loading');

    sessionStore.setStatus('onboarding');
    expect(sessionStore.getState().status).toBe('onboarding');

    sessionStore.setStatus('unlocked');
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  it('S42-T25: lock() and unlock() should transition status correctly', () => {
    sessionStore.lock();
    expect(sessionStore.getState().status).toBe('locked');

    sessionStore.unlock();
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  describe('shouldLockOnResume', () => {
    const BASE_TIME = 1000000;

    it('S42-T26: shouldLockOnResume calculates lockout based on backgroundedAt and autoLockSeconds', () => {
      // backgrounded at BASE_TIME
      sessionStore.markBackgrounded(BASE_TIME);

      // autoLockSeconds = 60s (default)
      // 59s elapsed -> should NOT lock
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 59000, 60, true)).toBe(false);
      // 60s elapsed -> SHOULD lock
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 60000, 60, true)).toBe(true);
      // 61s elapsed -> SHOULD lock
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 61000, 60, true)).toBe(true);

      // autoLockSeconds = 0s (imediato) -> qualquer retomada deve bloquear
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 100, 0, true)).toBe(true);

      // autoLockSeconds = 30s
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 29000, 30, true)).toBe(false);
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 30000, 30, true)).toBe(true);

      // autoLockSeconds = 300s (5 min)
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 299000, 300, true)).toBe(false);
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 300000, 300, true)).toBe(true);
    });

    it('S42-T27: shouldLockOnResume returns false if user has no PIN (spec D2: sem PIN não há bloqueio)', () => {
      sessionStore.markBackgrounded(BASE_TIME);

      // Mesmo após 1 hora em segundo plano, sem PIN nunca bloqueia
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 3600000, 60, false)).toBe(false);
      expect(sessionStore.shouldLockOnResume(BASE_TIME + 3600000, 0, false)).toBe(false);
    });
  });
});
