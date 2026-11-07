export const PRIVACY_MASK = '••••••';
export const PRIVACY_CURRENCY_MASK = 'R$ ••••••';
export const PRIVACY_PERCENT_MASK = '••••••';
export const PRIVACY_ASTERISK_MASK = 'R$ ••••••';

/**
 * S12 & S26: Redige valores substituindo por bullets 'R$ ••••••' quando o Modo Privacidade está ativo.
 */
export function redactWithAsterisks(
  value: string | number,
  isPrivacyModeEnabled: boolean
): string {
  if (isPrivacyModeEnabled) {
    return PRIVACY_ASTERISK_MASK;
  }
  return typeof value === 'number' ? String(value) : value;
}

export interface PrivacyState {
  isPrivacyModeEnabled: boolean;
}

export type PrivacyAndAuthState = PrivacyState;

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
  private state: PrivacyState = {
    isPrivacyModeEnabled: false,
  };

  private listeners: Set<(state: PrivacyState) => void> = new Set();

  subscribe(listener: (state: PrivacyState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = this.getState();
    this.listeners.forEach((l) => l(current));
  }

  getState(): PrivacyState {
    return { ...this.state };
  }

  setPrivacyMode(enabled: boolean): PrivacyState {
    this.state.isPrivacyModeEnabled = enabled;
    this.notify();
    return this.getState();
  }

  togglePrivacyMode(): PrivacyState {
    this.state.isPrivacyModeEnabled = !this.state.isPrivacyModeEnabled;
    this.notify();
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
}

export const privacyAndAuthService = new PrivacyAndAuthService();
