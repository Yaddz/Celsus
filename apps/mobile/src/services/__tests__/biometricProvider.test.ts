import * as LocalAuthentication from 'expo-local-authentication';
import { ExpoBiometricProvider } from '../biometricProvider';

describe('S42: BiometricProvider Services', () => {
  let provider: ExpoBiometricProvider;

  beforeEach(() => {
    provider = new ExpoBiometricProvider();
    jest.clearAllMocks();
  });

  it('S42-T06: should query hardware and enrollment capabilities via expo-local-authentication', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValueOnce(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValueOnce(false);

    expect(await provider.hasHardwareAsync()).toBe(true);
    expect(await provider.isEnrolledAsync()).toBe(false);
  });

  it('S42-T07: should execute authentication and map success or failure error', async () => {
    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValueOnce({
      success: true,
    });

    const resSuccess = await provider.authenticateAsync({
      promptMessage: 'Confirmar biometria',
    });
    expect(resSuccess).toEqual({ success: true });
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: 'Confirmar biometria',
      })
    );

    (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'user_cancel',
    });
    const resFail = await provider.authenticateAsync();
    expect(resFail).toEqual({
      success: false,
      error: 'user_cancel',
    });
  });
});
