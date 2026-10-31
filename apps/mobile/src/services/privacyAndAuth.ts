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

const defaultBiometricProvider: BiometricAuthProvider = {
  async hasHardwareAsync(): Promise<boolean> {
    return true;
  },
  async isEnrolledAsync(): Promise<boolean> {
    return true;
  },
  async authenticateAsync(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  },
};

function formatBrlNumber(num: number, includeSymbol: boolean): string {
  const fixed = Math.abs(num).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = num < 0 ? '-' : '';
  const body = `${sign}${formattedInt},${decPart}`;
  return includeSymbol ? `R$ ${body}` : body;
}

/**
 * S6-T04: Formata ou redige valores monetários quando o Modo Privacidade está ativo.
 */
export function redactCurrencyValue(
  value: string | number,
  isPrivacyModeEnabled: boolean,
  options?: { includeSymbol?: boolean }
): string {
  const includeSymbol = options?.includeSymbol ?? true;

  if (isPrivacyModeEnabled) {
    return includeSymbol ? PRIVACY_CURRENCY_MASK : PRIVACY_MASK;
  }

  if (typeof value === 'number') {
    return formatBrlNumber(value, includeSymbol);
  }

  const trimmed = value.trim();
  if (!includeSymbol) {
    return trimmed.replace(/^R\$\s*/, '');
  }
  return trimmed.startsWith('R$') ? trimmed : `R$ ${trimmed}`;
}

/**
 * S6-T04: Formata ou redige valores percentuais quando o Modo Privacidade está ativo.
 */
export function redactPercentageValue(
  value: string | number,
  isPrivacyModeEnabled: boolean
): string {
  if (isPrivacyModeEnabled) {
    return PRIVACY_PERCENT_MASK;
  }

  if (typeof value === 'number') {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1).replace('.', ',')}%`;
  }

  return value;
}

export class PrivacyAndAuthService {
  private state: PrivacyAndAuthState = {
    isPrivacyModeEnabled: false,
    isBiometricLockEnabled: false,
    isLocked: false,
    lastAuthenticatedAt: null,
  };

  private authProvider: BiometricAuthProvider;

  constructor(authProvider: BiometricAuthProvider = defaultBiometricProvider) {
    this.authProvider = authProvider;
  }

  getState(): PrivacyAndAuthState {
    return { ...this.state };
  }

  setPrivacyMode(enabled: boolean): PrivacyAndAuthState {
    this.state.isPrivacyModeEnabled = enabled;
    return this.getState();
  }

  togglePrivacyMode(): PrivacyAndAuthState {
    this.state.isPrivacyModeEnabled = !this.state.isPrivacyModeEnabled;
    return this.getState();
  }

  setBiometricLockEnabled(enabled: boolean): PrivacyAndAuthState {
    this.state.isBiometricLockEnabled = enabled;
    if (!enabled) {
      this.state.isLocked = false;
    }
    return this.getState();
  }

  lockApp(): PrivacyAndAuthState {
    if (this.state.isBiometricLockEnabled) {
      this.state.isLocked = true;
    }
    return this.getState();
  }

  formatValue(
    value: string | number,
    options?: { includeSymbol?: boolean }
  ): string {
    return redactCurrencyValue(value, this.state.isPrivacyModeEnabled, options);
  }

  formatPercentage(value: string | number): string {
    return redactPercentageValue(value, this.state.isPrivacyModeEnabled);
  }

  async canUseBiometrics(): Promise<boolean> {
    const hasHardware = await this.authProvider.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await this.authProvider.isEnrolledAsync();
    return isEnrolled;
  }

  async authenticateAndUnlock(
    promptMessage = 'Desbloquear Dossiê Celsus'
  ): Promise<BiometricAuthResult> {
    const hasHardware = await this.authProvider.hasHardwareAsync();
    if (!hasHardware) {
      return {
        authenticated: false,
        reason: 'biometric_hardware_unavailable',
      };
    }

    const isEnrolled = await this.authProvider.isEnrolledAsync();
    if (!isEnrolled) {
      return {
        authenticated: false,
        reason: 'biometrics_not_enrolled',
      };
    }

    const result = await this.authProvider.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar PIN',
      disableDeviceFallback: false,
    });

    if (result.success) {
      this.state.isLocked = false;
      this.state.lastAuthenticatedAt = new Date().toISOString();
      return { authenticated: true };
    }

    return {
      authenticated: false,
      reason: result.error || 'authentication_failed',
    };
  }
}

export const privacyAndAuthService = new PrivacyAndAuthService();
