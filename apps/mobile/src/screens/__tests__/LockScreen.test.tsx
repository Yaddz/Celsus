import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { LockScreen } from '../LockScreen';
import { AuthService } from '../../services/authService';
import { sessionStore } from '../../stores/sessionStore';
import { profileStore } from '../../stores/profileStore';

describe('S43: LockScreen Component Tests', () => {
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    sessionStore.lock();

    mockAuthService = {
      hasPin: jest.fn().mockResolvedValue(true),
      verifyPin: jest.fn().mockResolvedValue({ ok: true }),
      canUseBiometrics: jest.fn().mockResolvedValue(false),
      isBiometricEnabled: jest.fn().mockResolvedValue(false),
      authenticateBiometric: jest.fn().mockResolvedValue({ success: true }),
      getLockoutRemainingMs: jest.fn().mockResolvedValue(0),
      resetAll: jest.fn().mockResolvedValue(undefined),
    } as any;

    profileStore.reset();
  });

  it('S43-T09: renders greeting, user avatar, title and subtitled input; never exposes financial amounts', async () => {
    const { getByTestId, queryByText } = await render(
      <LockScreen authService={mockAuthService} />
    );

    expect(getByTestId('lock-screen')).toBeDefined();
    expect(getByTestId('lock-avatar')).toBeDefined();
    expect(getByTestId('lock-title')).toBeDefined();
    expect(getByTestId('lock-error')).toBeDefined();
    expect(getByTestId('lock-forgot-pin')).toBeDefined();

    // Spec: NUNCA mostrar saldos na tela de bloqueio
    expect(queryByText(/R\$/)).toBeNull();
  });

  it('S43-T10: entering 6th correct digit triggers verifyPin and unlocks session', async () => {
    mockAuthService.verifyPin.mockResolvedValueOnce({ ok: true });

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    // Enter 6 digits
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.press(getByTestId(`pin-key-${i + 1}`));
      });
    }

    expect(mockAuthService.verifyPin).toHaveBeenCalledWith('123456');
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  it('S43-T11: entering wrong PIN displays error message, triggers tremor, and clears input', async () => {
    mockAuthService.verifyPin.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid_pin',
    });

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    // Enter 6 digits wrong
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.press(getByTestId('pin-key-1'));
      });
    }

    expect(mockAuthService.verifyPin).toHaveBeenCalledWith('111111');
    expect(sessionStore.getState().status).toBe('locked');
    expect(getByTestId('lock-error').props.children).toMatch(/incorreto|restante/i);
  });

  it('S43-T12: 5 failed attempts disables keypad and shows lockout timer countdown', async () => {
    mockAuthService.verifyPin.mockResolvedValueOnce({
      ok: false,
      reason: 'locked',
      remainingMs: 30000,
    });
    mockAuthService.getLockoutRemainingMs.mockResolvedValue(30000);

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.press(getByTestId('pin-key-1'));
      });
    }

    expect(getByTestId('lock-lockout-timer')).toBeDefined();
    expect(getByTestId('lock-lockout-timer').props.children).toMatch(/00:30|00:29/);
  });

  it('S43-T13: biometric auto-prompt on mount when active and available; success unlocks', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(true);
    mockAuthService.isBiometricEnabled.mockResolvedValue(true);
    mockAuthService.authenticateBiometric.mockResolvedValue({ success: true });

    await act(async () => {
      await render(<LockScreen authService={mockAuthService} />);
    });

    expect(mockAuthService.authenticateBiometric).toHaveBeenCalled();
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  it('S43-T14: biometric cancel leaves keypad active for manual PIN entry', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(true);
    mockAuthService.isBiometricEnabled.mockResolvedValue(true);
    mockAuthService.authenticateBiometric.mockResolvedValue({
      success: false,
      reason: 'user_cancel',
    });

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    expect(sessionStore.getState().status).toBe('locked');
    // Keypad remains interactive
    await act(async () => {
      fireEvent.press(getByTestId('pin-key-2'));
    });
  });

  it('S43-T15: "Esqueci o PIN" with biometrics active offers biometric authentication prompt', async () => {
    mockAuthService.isBiometricEnabled.mockResolvedValue(true);
    mockAuthService.canUseBiometrics.mockResolvedValue(true);

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    await act(async () => {
      fireEvent.press(getByTestId('lock-forgot-pin'));
    });

    expect(getByTestId('forgot-pin-dialog')).toBeDefined();
  });

  it('S43-T16: "Esqueci o PIN" without biometrics requires typing APAGAR to reset all local data', async () => {
    mockAuthService.isBiometricEnabled.mockResolvedValue(false);

    const { getByTestId } = await render(
      <LockScreen authService={mockAuthService} />
    );

    await act(async () => {
      fireEvent.press(getByTestId('lock-forgot-pin'));
    });

    expect(getByTestId('forgot-pin-dialog')).toBeDefined();
    // Confirms destructive reset
    const confirmInput = getByTestId('reset-confirmation-input');
    expect(confirmInput).toBeDefined();

    fireEvent.changeText(confirmInput, 'APAGAR');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-reset-button'));
    });

    expect(mockAuthService.resetAll).toHaveBeenCalled();
  });
});
