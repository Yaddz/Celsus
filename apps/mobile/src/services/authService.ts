import * as Crypto from 'expo-crypto';
import { SecureStorage, getSecureStorage } from './secureStorage';
import { BiometricAuthProvider, ExpoBiometricProvider } from './biometricProvider';

export interface VerifyPinResult {
  ok: boolean;
  reason?: 'invalid_pin' | 'locked' | 'no_pin_set';
  remainingMs?: number;
}

export interface ChangePinResult {
  ok: boolean;
  reason?: 'invalid_old_pin' | 'invalid_new_pin' | 'locked';
  remainingMs?: number;
}

export interface BiometricResult {
  success: boolean;
  reason?: string;
}

export type AutoLockSeconds = 0 | 30 | 60 | 300;

export interface AuthServiceDependencies {
  storage?: SecureStorage;
  biometrics?: BiometricAuthProvider;
  clock?: () => number;
  randomBytes?: (length: number) => Uint8Array | Promise<Uint8Array>;
}

const STORAGE_KEYS = {
  PIN_HASH: 'auth:pin_hash',
  PIN_SALT: 'auth:pin_salt',
  LOCKOUT_ATTEMPTS: 'auth:lockout_attempts',
  LOCKOUT_UNTIL: 'auth:lockout_until',
  BIOMETRICS_ENABLED: 'auth:biometrics_enabled',
  AUTOLOCK_SECONDS: 'auth:autolock_seconds',
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function calculateLockoutDelayMs(attempts: number): number {
  if (attempts < 5) return 0;
  if (attempts === 5) return 30 * 1000; // 30s
  if (attempts === 6) return 60 * 1000; // 1 min
  if (attempts === 7) return 5 * 60 * 1000; // 5 min
  return 15 * 60 * 1000; // 15 min (8 ou mais)
}

export class AuthService {
  private storage: SecureStorage;
  private biometrics: BiometricAuthProvider;
  private clock: () => number;
  private randomBytes: (length: number) => Uint8Array | Promise<Uint8Array>;

  private _cachedHasPin: boolean | null = null;
  private _cachedBioEnabled: boolean | null = null;
  private _cachedAutoLock: number | null = null;

  constructor(deps: AuthServiceDependencies = {}) {
    this.storage = deps.storage ?? getSecureStorage();
    this.biometrics = deps.biometrics ?? new ExpoBiometricProvider();
    this.clock = deps.clock ?? (() => Date.now());
    this.randomBytes = deps.randomBytes ?? ((n) => Crypto.getRandomBytes(n));
  }

  hasPinSync(): boolean | null {
    return this._cachedHasPin;
  }

  isBiometricEnabledSync(): boolean | null {
    return this._cachedBioEnabled;
  }

  getAutoLockSecondsSync(): number | null {
    return this._cachedAutoLock;
  }

  private validatePinFormat(pin: string): void {
    if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
      throw new Error('PIN inválido: deve conter exatamente 6 dígitos numéricos.');
    }
  }

  private async hashPinWithSalt(pin: string, salt: string): Promise<string> {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + pin);
  }

  async setPin(pin: string): Promise<void> {
    this.validatePinFormat(pin);

    const rawSalt = await this.randomBytes(16);
    const salt = bytesToHex(rawSalt);
    const hash = await this.hashPinWithSalt(pin, salt);

    await this.storage.setItem(STORAGE_KEYS.PIN_SALT, salt);
    await this.storage.setItem(STORAGE_KEYS.PIN_HASH, hash);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    this._cachedHasPin = true;
  }

  async hasPin(): Promise<boolean> {
    const hash = await this.storage.getItem(STORAGE_KEYS.PIN_HASH);
    const res = hash !== null && hash.length > 0;
    this._cachedHasPin = res;
    return res;
  }

  async getLockoutRemainingMs(): Promise<number> {
    const rawUntil = await this.storage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    if (!rawUntil) return 0;
    const until = Number(rawUntil);
    const now = this.clock();
    if (now < until) {
      return until - now;
    }
    return 0;
  }

  async verifyPin(pin: string): Promise<VerifyPinResult> {
    const remainingMs = await this.getLockoutRemainingMs();
    if (remainingMs > 0) {
      return { ok: false, reason: 'locked', remainingMs };
    }

    const salt = await this.storage.getItem(STORAGE_KEYS.PIN_SALT);
    const storedHash = await this.storage.getItem(STORAGE_KEYS.PIN_HASH);

    if (!salt || !storedHash) {
      return { ok: false, reason: 'no_pin_set' };
    }

    const computedHash = await this.hashPinWithSalt(pin, salt);
    if (computedHash === storedHash) {
      // PIN correto -> zera tentativas e lockout
      await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS);
      await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      return { ok: true };
    }

    // PIN incorreto -> incrementa tentativas e avalia lockout
    const rawAttempts = await this.storage.getItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS);
    const attempts = (rawAttempts ? Number(rawAttempts) : 0) + 1;
    await this.storage.setItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS, String(attempts));

    const lockoutDelay = calculateLockoutDelayMs(attempts);
    if (lockoutDelay > 0) {
      const lockoutUntil = this.clock() + lockoutDelay;
      await this.storage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, String(lockoutUntil));
      return { ok: false, reason: 'locked', remainingMs: lockoutDelay };
    }

    return { ok: false, reason: 'invalid_pin' };
  }

  async changePin(oldPin: string, newPin: string): Promise<ChangePinResult> {
    const remainingMs = await this.getLockoutRemainingMs();
    if (remainingMs > 0) {
      return { ok: false, reason: 'locked', remainingMs };
    }

    if (!/^\d{6}$/.test(newPin)) {
      return { ok: false, reason: 'invalid_new_pin' };
    }

    const verify = await this.verifyPin(oldPin);
    if (!verify.ok) {
      return { ok: false, reason: 'invalid_old_pin' };
    }

    await this.setPin(newPin);
    return { ok: true };
  }

  async removePin(currentPin: string): Promise<{ ok: boolean; reason?: string }> {
    const verify = await this.verifyPin(currentPin);
    if (!verify.ok) {
      return { ok: false, reason: verify.reason || 'invalid_pin' };
    }

    await this.storage.deleteItem(STORAGE_KEYS.PIN_HASH);
    await this.storage.deleteItem(STORAGE_KEYS.PIN_SALT);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    await this.disableBiometrics();
    this._cachedHasPin = false;
    this._cachedBioEnabled = false;
    return { ok: true };
  }

  async resetAll(): Promise<void> {
    await this.storage.deleteItem(STORAGE_KEYS.PIN_HASH);
    await this.storage.deleteItem(STORAGE_KEYS.PIN_SALT);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_ATTEMPTS);
    await this.storage.deleteItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    await this.storage.deleteItem(STORAGE_KEYS.BIOMETRICS_ENABLED);
    await this.storage.deleteItem(STORAGE_KEYS.AUTOLOCK_SECONDS);
    this._cachedHasPin = false;
    this._cachedBioEnabled = false;
    this._cachedAutoLock = 60;
  }

  async canUseBiometrics(): Promise<boolean> {
    const hasHw = await this.biometrics.hasHardwareAsync();
    if (!hasHw) return false;
    return this.biometrics.isEnrolledAsync();
  }

  async enableBiometrics(): Promise<BiometricResult> {
    const hasPin = await this.hasPin();
    if (!hasPin) {
      return { success: false, reason: 'pin_required' };
    }

    const canUse = await this.canUseBiometrics();
    if (!canUse) {
      return { success: false, reason: 'biometrics_unavailable' };
    }

    const auth = await this.biometrics.authenticateAsync({
      promptMessage: 'Confirmar biometria para ativar acesso',
    });

    if (auth.success) {
      await this.storage.setItem(STORAGE_KEYS.BIOMETRICS_ENABLED, 'true');
      this._cachedBioEnabled = true;
      return { success: true };
    }

    return { success: false, reason: auth.error || 'authentication_failed' };
  }

  async disableBiometrics(): Promise<void> {
    await this.storage.setItem(STORAGE_KEYS.BIOMETRICS_ENABLED, 'false');
    this._cachedBioEnabled = false;
  }

  async isBiometricEnabled(): Promise<boolean> {
    const val = await this.storage.getItem(STORAGE_KEYS.BIOMETRICS_ENABLED);
    const res = val === 'true';
    this._cachedBioEnabled = res;
    return res;
  }

  async authenticateBiometric(prompt?: string): Promise<BiometricResult> {
    const enrolled = await this.biometrics.isEnrolledAsync();
    if (!enrolled) {
      await this.disableBiometrics();
      return { success: false, reason: 'biometrics_not_enrolled' };
    }

    const auth = await this.biometrics.authenticateAsync({
      promptMessage: prompt ?? 'Autenticar acesso ao Celsus',
    });

    if (auth.success) {
      return { success: true };
    }

    if (auth.error && /not_enrolled/i.test(auth.error)) {
      await this.disableBiometrics();
      return { success: false, reason: 'biometrics_not_enrolled' };
    }

    return { success: false, reason: auth.error || 'authentication_failed' };
  }

  async getAutoLockSeconds(): Promise<AutoLockSeconds> {
    const val = await this.storage.getItem(STORAGE_KEYS.AUTOLOCK_SECONDS);
    let num = 60;
    if (val && [0, 30, 60, 300].includes(Number(val))) {
      num = Number(val);
    }
    this._cachedAutoLock = num;
    return num as AutoLockSeconds;
  }

  async setAutoLockSeconds(seconds: AutoLockSeconds): Promise<void> {
    if (![0, 30, 60, 300].includes(seconds)) {
      throw new Error('Valor inválido para autoLockSeconds. Permitidos: 0, 30, 60, 300.');
    }
    await this.storage.setItem(STORAGE_KEYS.AUTOLOCK_SECONDS, String(seconds));
    this._cachedAutoLock = seconds;
  }
}

export const authService = new AuthService();
