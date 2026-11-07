import * as LocalAuthentication from 'expo-local-authentication';

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

export class ExpoBiometricProvider implements BiometricAuthProvider {
  async hasHardwareAsync(): Promise<boolean> {
    return LocalAuthentication.hasHardwareAsync();
  }

  async isEnrolledAsync(): Promise<boolean> {
    return LocalAuthentication.isEnrolledAsync();
  }

  async authenticateAsync(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: options?.promptMessage ?? 'Autenticar acesso ao Celsus',
      cancelLabel: options?.cancelLabel ?? 'Cancelar',
      fallbackLabel: options?.fallbackLabel ?? 'Usar PIN',
      disableDeviceFallback: options?.disableDeviceFallback ?? false,
    });

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.error || 'authentication_failed' };
  }
}
