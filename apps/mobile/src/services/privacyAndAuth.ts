export const PRIVACY_MASK = '██████,██';
export const PRIVACY_CURRENCY_MASK = 'R$ ██████,██';
export const PRIVACY_PERCENT_MASK = '████%';

export interface BiometricAuthProvider {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean; error?: string }>;
}

export interface BiometricAuthResult {
  authenticated: boolean;
  reason?: string;
}

export interface PrivacyAndAuthState {
  isPrivacyModeEnabled: boolean;
  isBiometricLockEnabled: boolean;
  isLocked: boolean;
  lastAuthenticatedAt: string | null;
}

/**
 * S6-T04: Formata ou redige valores monetários/percentuais quando o Modo Privacidade está ativo.
 */
export function redactCurrencyValue(
  _value: string | number,
  _isPrivacyModeEnabled: boolean,
  _options?: { includeSymbol?: boolean }
): string {
  throw new Error('Not implemented: redactCurrencyValue');
}

export function redactPercentageValue(
  _value: string | number,
  _isPrivacyModeEnabled: boolean
): string {
  throw new Error('Not implemented: redactPercentageValue');
}

export class PrivacyAndAuthService {
  constructor(_authProvider?: BiometricAuthProvider) {}

  getState(): PrivacyAndAuthState {
    throw new Error('Not implemented: PrivacyAndAuthService.getState');
  }

  setPrivacyMode(_enabled: boolean): PrivacyAndAuthState {
    throw new Error('Not implemented: PrivacyAndAuthService.setPrivacyMode');
  }

  togglePrivacyMode(): PrivacyAndAuthState {
    throw new Error('Not implemented: PrivacyAndAuthService.togglePrivacyMode');
  }

  setBiometricLockEnabled(_enabled: boolean): PrivacyAndAuthState {
    throw new Error('Not implemented: PrivacyAndAuthService.setBiometricLockEnabled');
  }

  lockApp(): PrivacyAndAuthState {
    throw new Error('Not implemented: PrivacyAndAuthService.lockApp');
  }

  formatValue(
    _value: string | number,
    _options?: { includeSymbol?: boolean }
  ): string {
    throw new Error('Not implemented: PrivacyAndAuthService.formatValue');
  }

  formatPercentage(_value: string | number): string {
    throw new Error('Not implemented: PrivacyAndAuthService.formatPercentage');
  }

  async canUseBiometrics(): Promise<boolean> {
    throw new Error('Not implemented: PrivacyAndAuthService.canUseBiometrics');
  }

  async authenticateAndUnlock(_promptMessage?: string): Promise<BiometricAuthResult> {
    throw new Error('Not implemented: PrivacyAndAuthService.authenticateAndUnlock');
  }
}

export const privacyAndAuthService = new PrivacyAndAuthService();
