import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { OnboardingFlow } from '../OnboardingFlow';
import { AuthService } from '../../../services/authService';
import { ProfileRepository } from '../../../repositories/profileRepository';
import { sessionStore } from '../../../stores/sessionStore';

describe('S44: OnboardingFlow Specification Tests', () => {
  let mockAuthService: jest.Mocked<AuthService>;
  let mockProfileRepo: jest.Mocked<ProfileRepository>;

  beforeEach(() => {
    sessionStore.setStatus('onboarding');

    mockAuthService = {
      hasPin: jest.fn().mockResolvedValue(false),
      setPin: jest.fn().mockResolvedValue(undefined),
      canUseBiometrics: jest.fn().mockResolvedValue(true),
      isBiometricEnabled: jest.fn().mockResolvedValue(false),
      enableBiometrics: jest.fn().mockResolvedValue({ success: true }),
      disableBiometrics: jest.fn().mockResolvedValue(undefined),
      getAutoLockSeconds: jest.fn().mockResolvedValue(60),
      getLockoutRemainingMs: jest.fn().mockResolvedValue(0),
      resetAll: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockProfileRepo = {
      getProfileName: jest.fn().mockResolvedValue(null),
      setProfileName: jest.fn().mockResolvedValue(undefined),
      isOnboarded: jest.fn().mockResolvedValue(false),
      setOnboarded: jest.fn().mockResolvedValue(undefined),
      getProfile: jest.fn().mockResolvedValue({ name: '', initials: '', onboarded: false }),
    } as any;
  });

  it('S44-T01: Welcome step renders branding, benefits, and advances via Começar without back button', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    expect(getByTestId('onboarding-screen')).toBeDefined();
    expect(getByText('Celsus')).toBeDefined();
    expect(getByText(/100% local/i)).toBeDefined();
    expect(getByText(/metas em dois níveis/i)).toBeDefined();
    expect(getByText(/aportes inteligentes/i)).toBeDefined();

    // No back button on first step
    expect(queryByTestId('onboarding-back')).toBeNull();

    // Progress indicator exists
    expect(getByTestId('onboarding-progress')).toBeDefined();

    // Press Começar (onboarding-next)
    fireEvent.press(getByTestId('onboarding-next'));

    // Should advance to step 2: Name input
    expect(getByTestId('onboarding-name-input')).toBeDefined();
    expect(getByTestId('onboarding-back')).toBeDefined();
  });

  it('S44-T02: Name step validates 2-40 characters, trimming spaces and accepting accents', async () => {
    const { getByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Advance to Name step
    fireEvent.press(getByTestId('onboarding-next'));
    const input = getByTestId('onboarding-name-input');
    const nextBtn = getByTestId('onboarding-next');

    // 1 char: disabled
    fireEvent.changeText(input, 'A');
    expect(nextBtn.props.accessibilityState?.disabled ?? nextBtn.props.disabled).toBe(true);

    // only spaces: disabled
    fireEvent.changeText(input, '   ');
    expect(nextBtn.props.accessibilityState?.disabled ?? nextBtn.props.disabled).toBe(true);

    // 41 chars: disabled or trimmed
    fireEvent.changeText(input, 'A'.repeat(41));
    expect(nextBtn.props.accessibilityState?.disabled ?? nextBtn.props.disabled).toBe(true);

    // 2 chars with accent: enabled
    fireEvent.changeText(input, 'Zélia');
    expect(nextBtn.props.accessibilityState?.disabled ?? nextBtn.props.disabled).toBe(false);

    // Valid full name
    fireEvent.changeText(input, '  João Carlos Silva  ');
    expect(nextBtn.props.accessibilityState?.disabled ?? nextBtn.props.disabled).toBe(false);
  });

  it('S44-T03: Name step renders live avatar preview updating initials dynamically', async () => {
    const { getByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    const input = getByTestId('onboarding-name-input');

    fireEvent.changeText(input, 'Pedro Lima');
    expect(getByTestId('onboarding-avatar-preview')).toBeDefined();
    expect(getByText('PL')).toBeDefined();

    fireEvent.changeText(input, 'Beatriz');
    expect(getByText('B')).toBeDefined();
  });

  it('S44-T04: Navigating back preserves previously entered name and updates progress', async () => {
    const { getByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2
    fireEvent.press(getByTestId('onboarding-next'));
    const input = getByTestId('onboarding-name-input');
    fireEvent.changeText(input, 'Carlos Alberto');

    // Back to Step 1
    fireEvent.press(getByTestId('onboarding-back'));
    expect(getByTestId('onboarding-screen')).toBeDefined();

    // Começar -> back to Step 2: name must be preserved
    fireEvent.press(getByTestId('onboarding-next'));
    const inputAgain = getByTestId('onboarding-name-input');
    expect(inputAgain.props.value).toBe('Carlos Alberto');
  });

  it('S44-T05: PIN step entering 6 digits transitions to confirmation and matching confirmation advances', async () => {
    const { getByTestId, getByText, queryByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2 (Name)
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // Step 3: PIN
    expect(getByTestId('onboarding-pin-hint')).toBeDefined();

    // Enter first PIN: 123890
    '123890'.split('').forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Sub-step: Confirme o seu PIN
    expect(getByText(/confirme/i)).toBeDefined();

    // Enter matching confirmation PIN
    '123890'.split('').forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Successfully advanced to Biometric Step
    expect(getByTestId('onboarding-biometric-enable')).toBeDefined();
  });

  it('S44-T06: PIN step divergent confirmation resets PIN step with error message', async () => {
    const { getByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2 -> Step 3
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // First PIN: 123890
    '123890'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Divergent confirmation PIN: 123899
    '123899'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Error message displayed and returns to first PIN entry
    expect(getByText(/divergem|não conferem|incorreto/i)).toBeDefined();
    expect(getByTestId('onboarding-pin-hint')).toBeDefined();
  });

  it('S44-T07: PIN step trivial PIN displays non-blocking security warning', async () => {
    const { getByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2 -> Step 3
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // Trivial PIN: 123456
    '123456'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Warning appears
    expect(getByTestId('onboarding-pin-warning')).toBeDefined();
    expect(getByText(/fácil de adivinhar|sequencial|trivial/i)).toBeDefined();

    // Non-blocking: confirm with 123456 still works
    '123456'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    expect(getByTestId('onboarding-biometric-enable')).toBeDefined();
  });

  it('S44-T08: PIN step "Agora não" skips PIN AND biometric step, going directly to Done step', async () => {
    const { getByTestId, queryByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2 -> Step 3
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // Press Agora não in PIN step
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    // Should skip Biometrics and land directly on DoneStep
    expect(queryByTestId('onboarding-biometric-enable')).toBeNull();
    expect(getByTestId('onboarding-done-explore')).toBeDefined();
  });

  it('S44-T09: Biometric step automatically skipped if device lacks biometric hardware or enrollment', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(false);

    const { getByTestId, queryByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Step 1 -> Step 2 -> Step 3
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // Set PIN: 135790
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Since canUseBiometrics === false, lands directly on DoneStep
    await waitFor(() => {
      expect(queryByTestId('onboarding-biometric-enable')).toBeNull();
      expect(getByTestId('onboarding-done-explore')).toBeDefined();
    });
  });

  it('S44-T10: Biometric step Ativar executes real enableBiometrics and advances on success', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(true);
    mockAuthService.enableBiometrics.mockResolvedValue({ success: true });

    const { getByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    // Go to PIN step
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    // Enter & confirm PIN
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Biometric step
    expect(getByTestId('onboarding-biometric-enable')).toBeDefined();

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-biometric-enable'));
    });

    expect(mockAuthService.enableBiometrics).toHaveBeenCalled();
    expect(getByTestId('onboarding-done-explore')).toBeDefined();
  });

  it('S44-T11: Biometric step failure does not enable biometric but allows proceeding via Agora não', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(true);
    mockAuthService.enableBiometrics.mockResolvedValue({ success: false, error: 'canceled' });

    const { getByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-biometric-enable'));
    });

    // Still on biometric step or shows skip option
    expect(getByTestId('onboarding-biometric-skip')).toBeDefined();
    fireEvent.press(getByTestId('onboarding-biometric-skip'));
    expect(getByTestId('onboarding-done-explore')).toBeDefined();
  });

  it('S44-T12: Biometric step "Agora não" proceeds to Done step without enabling biometrics', async () => {
    mockAuthService.canUseBiometrics.mockResolvedValue(true);

    const { getByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Silva');
    fireEvent.press(getByTestId('onboarding-next'));

    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '135790'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    fireEvent.press(getByTestId('onboarding-biometric-skip'));
    expect(mockAuthService.enableBiometrics).not.toHaveBeenCalled();
    expect(getByTestId('onboarding-done-explore')).toBeDefined();
  });

  it('S44-T13: Done step displays greeting with name and all 3 action buttons', async () => {
    const { getByTestId, getByText } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Beatriz Lima');
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    expect(getByText(/Tudo certo,\s*Beatriz Lima!/i)).toBeDefined();
    expect(getByTestId('onboarding-done-import')).toBeDefined();
    expect(getByTestId('onboarding-done-create-wallet')).toBeDefined();
    expect(getByTestId('onboarding-done-explore')).toBeDefined();
  });

  it('S44-T14: Done step action "Importar extrato da B3" triggers callback with import_b3', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = await render(
      <OnboardingFlow
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        onComplete={onComplete}
      />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Beatriz');
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-done-import'));
    });

    expect(onComplete).toHaveBeenCalledWith('import_b3');
  });

  it('S44-T15: Done step action "Criar minha primeira carteira" triggers callback with create_wallet', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = await render(
      <OnboardingFlow
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        onComplete={onComplete}
      />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Beatriz');
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-done-create-wallet'));
    });

    expect(onComplete).toHaveBeenCalledWith('create_wallet');
  });

  it('S44-T16: Done step action "Explorar o app" triggers callback with explore', async () => {
    const onComplete = jest.fn();
    const { getByTestId } = await render(
      <OnboardingFlow
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        onComplete={onComplete}
      />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Beatriz');
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-done-explore'));
    });

    expect(onComplete).toHaveBeenCalledWith('explore');
  });

  it('S44-T17: Atomic persistence: abandoning/unmounting before completion does NOT persist anything', async () => {
    const { getByTestId, unmount } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Mariana');
    fireEvent.press(getByTestId('onboarding-next'));

    '123890'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '123890'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    // Unmount before finishing
    unmount();

    expect(mockProfileRepo.setProfileName).not.toHaveBeenCalled();
    expect(mockProfileRepo.setOnboarded).not.toHaveBeenCalled();
    expect(mockAuthService.setPin).not.toHaveBeenCalled();
    expect(sessionStore.getState().status).toBe('onboarding');
  });

  it('S44-T18: Atomic persistence: completing flow saves profile, flag, PIN and unlocks session', async () => {
    const { getByTestId } = await render(
      <OnboardingFlow authService={mockAuthService} profileRepository={mockProfileRepo} />
    );

    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Mariana Costa');
    fireEvent.press(getByTestId('onboarding-next'));

    '123890'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));
    '123890'.split('').forEach((d) => fireEvent.press(getByTestId(`pin-key-${d}`)));

    fireEvent.press(getByTestId('onboarding-biometric-skip'));

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-done-explore'));
    });

    expect(mockProfileRepo.setProfileName).toHaveBeenCalledWith('Mariana Costa');
    expect(mockProfileRepo.setOnboarded).toHaveBeenCalledWith(true);
    expect(mockAuthService.setPin).toHaveBeenCalledWith('123890');
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  it('S44-T19: Migration flow (D9) for existing user starts at Name, no Welcome, and finishes without DoneStep', async () => {
    const onComplete = jest.fn();
    const { getByTestId, queryByTestId, getByText } = await render(
      <OnboardingFlow
        isMigration={true}
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        onComplete={onComplete}
      />
    );

    // In migration mode: shows "Complete seu perfil" directly at Name input
    expect(getByText(/Complete seu perfil/i)).toBeDefined();
    expect(getByTestId('onboarding-name-input')).toBeDefined();
    expect(queryByText(/Boas-vindas|100% local/i)).toBeNull();

    // Fill name
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Pedro Existente');
    fireEvent.press(getByTestId('onboarding-next'));

    // Skip PIN
    fireEvent.press(getByTestId('onboarding-pin-skip'));

    // Should finish immediately without showing Done step
    expect(queryByTestId('onboarding-done-explore')).toBeNull();
    expect(mockProfileRepo.setProfileName).toHaveBeenCalledWith('Pedro Existente');
    expect(mockProfileRepo.setOnboarded).toHaveBeenCalledWith(true);
    expect(sessionStore.getState().status).toBe('unlocked');
    expect(onComplete).toHaveBeenCalled();
  });
});
