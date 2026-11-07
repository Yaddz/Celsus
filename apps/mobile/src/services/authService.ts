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

export class AuthService {
  private storage: SecureStorage;
  private biometrics: BiometricAuthProvider;
  private clock: () => number;
  private randomBytes: (length: number) => Uint8Array | Promise<Uint8Array>;

  constructor(deps: AuthServiceDependencies = {}) {
    this.storage = deps.storage ?? getSecureStorage();
    this.biometrics = deps.biometrics ?? new ExpoBiometricProvider();
    this.clock = deps.clock ?? (() => Date.now());
    this.randomBytes = deps.randomBytes ?? ((n) => new Uint8Array(n));
  }

  async setPin(pin: string): Promise<void> {
    // Stub Fase A
  }

  async hasPin(): Promise<boolean> {
    // Stub Fase A
    return false;
  }

  async verifyPin(pin: string): Promise<VerifyPinResult> {
    // Stub Fase A
    return { ok: false };
  }

  async changePin(oldPin: string, newPin: string): Promise<ChangePinResult> {
    // Stub Fase A
    return { ok: false };
  }

  async removePin(currentPin: string): Promise<{ ok: boolean; reason?: string }> {
    // Stub Fase A
    return { ok: false };
  }

  async resetAll(): Promise<void> {
    // Stub Fase A
  }

  async getLockoutRemainingMs(): Promise<number> {
    // Stub Fase A
    return 0;
  }

  async canUseBiometrics(): Promise<boolean> {
    // Stub Fase A
    return false;
  }

  async enableBiometrics(): Promise<BiometricResult> {
    // Stub Fase A
    return { success: false };
  }

  async disableBiometrics(): Promise<void> {
    // Stub Fase A
  }

  async isBiometricEnabled(): Promise<boolean> {
    // Stub Fase A
    return false;
  }

  async authenticateBiometric(prompt?: string): Promise<BiometricResult> {
    // Stub Fase A
    return { success: false };
  }

  async getAutoLockSeconds(): Promise<AutoLockSeconds> {
    // Stub Fase A
    return 60;
  }

  async setAutoLockSeconds(seconds: AutoLockSeconds): Promise<void> {
    // Stub Fase A
  }
}

export const authService = new AuthService();
