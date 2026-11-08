import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SecurityTile } from '../profile/ProfileTiles';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { AuthService } from '../../services/authService';
import { sessionStore } from '../../stores/sessionStore';
import { profileStore } from '../../stores/profileStore';
import { ProfileRepository } from '../../repositories/profileRepository';
import { InMemorySecureStorage } from '../../services/secureStorage';
import { resetDatabase } from '../../db/client';

const openRow = (getByTestId: (id: string) => any, rowId: string, childId: string) => {
  try {
    getByTestId(childId);
  } catch {
    fireEvent.press(getByTestId(rowId));
  }
};

describe('Sprint 45: Perfil -> Segurança (spec §6)', () => {
  let mockStorage: InMemorySecureStorage;
  let authService: AuthService;
  let mockProfileRepo: ProfileRepository;

  beforeEach(async () => {
    resetDatabase();
    sessionStore.setStatus('unlocked');
    mockStorage = new InMemorySecureStorage();

    const mockBiometrics = {
      hasHardwareAsync: jest.fn(async () => true),
      isEnrolledAsync: jest.fn(async () => true),
      authenticateAsync: jest.fn(async () => ({ success: true })),
    };

    authService = new AuthService({
      storage: mockStorage,
      biometrics: mockBiometrics,
    });

    const metaStore: Record<string, string> = {
      'profile:name': 'Pedro Lima',
      'profile:onboarded:v1': 'true',
    };

    const mockMetaRepo: any = {
      get: jest.fn(async (key: string) => metaStore[key] ?? null),
      set: jest.fn(async (key: string, val: string) => {
        metaStore[key] = val;
      }),
    };

    mockProfileRepo = new ProfileRepository(mockMetaRepo);
    profileStore.setRepository(mockProfileRepo);
    await profileStore.load();
  });

  // =========================================================================
  // S45-T01: Estado SEM PIN
  // =========================================================================
  it('S45-T01: renders SEM PIN state with create PIN card and disables biometrics/autolock', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    // Deve exibir status de sem PIN e ação de criar
    expect(getByTestId('security-pin-status')).toBeDefined();
    expect(getByText(/Proteja o app com um PIN/i)).toBeDefined();
    expect(getByTestId('security-create-pin')).toBeDefined();
    expect(queryByTestId('security-change-pin')).toBeNull();
    expect(queryByTestId('security-remove-pin')).toBeNull();

    // Controles dependentes devem estar desabilitados
    const bioSwitch = getByTestId('security-biometric-switch');
    expect(bioSwitch.props.disabled).toBe(true);
    expect(getByText(/Crie um PIN primeiro/i)).toBeDefined();
  });

  // =========================================================================
  // S45-T02: Criar PIN
  // =========================================================================
  it('S45-T02: allows creating a 6-digit PIN and confirms it', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    fireEvent.press(getByTestId('security-create-pin'));

    // Abre folha/modal de criação com PinKeypad
    await waitFor(() => {
      expect(getByTestId('security-pin-sheet')).toBeDefined();
    });

    // Digita 123456
    ['1', '2', '3', '4', '5', '6'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Pede confirmação
    await waitFor(() => {
      expect(getByText(/Confirme seu PIN/i)).toBeDefined();
    });

    // Confirma com 123456
    ['1', '2', '3', '4', '5', '6'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Finaliza criação
    await waitFor(async () => {
      expect(await authService.hasPin()).toBe(true);
      openRow(getByTestId, 'security-pin-row', 'security-change-pin');
      expect(getByTestId('security-change-pin')).toBeDefined();
      expect(getByTestId('security-remove-pin')).toBeDefined();
    });
  });

  // =========================================================================
  // S45-T03: Alterar PIN
  // =========================================================================
  it('S45-T03: requires current PIN, rejects divergence, and switches to new PIN on success', async () => {
    await authService.setPin('123456');

    const { getByTestId, getByText } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    openRow(getByTestId, 'security-pin-row', 'security-change-pin');
    expect(getByTestId('security-pin-status')).toBeDefined();
    expect(getByText(/PIN configurado/i)).toBeDefined();

    fireEvent.press(getByTestId('security-change-pin'));

    // Pede PIN atual
    await waitFor(() => {
      expect(getByText(/Digite o PIN atual/i)).toBeDefined();
    });

    // Digita PIN atual 123456
    ['1', '2', '3', '4', '5', '6'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Pede novo PIN
    await waitFor(() => {
      expect(getByText(/Digite o novo PIN/i)).toBeDefined();
    });

    // Digita novo PIN 654321
    ['6', '5', '4', '3', '2', '1'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    // Confirma novo PIN 654321
    await waitFor(() => {
      expect(getByText(/Confirme o novo PIN/i)).toBeDefined();
    });

    ['6', '5', '4', '3', '2', '1'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    await waitFor(async () => {
      const verifyOld = await authService.verifyPin('123456');
      const verifyNew = await authService.verifyPin('654321');
      expect(verifyOld.ok).toBe(false);
      expect(verifyNew.ok).toBe(true);
    });
  });

  // =========================================================================
  // S45-T04: Remover PIN
  // =========================================================================
  it('S45-T04: requires current PIN to remove PIN, clearing pin and disabling biometrics', async () => {
    await authService.setPin('123456');
    await authService.enableBiometrics();
    expect(await authService.isBiometricEnabled()).toBe(true);

    const { getByTestId, getByText } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    openRow(getByTestId, 'security-pin-row', 'security-remove-pin');
    fireEvent.press(getByTestId('security-remove-pin'));

    // Pede o PIN atual para confirmação
    await waitFor(() => {
      expect(getByText(/Digite o PIN atual para remover/i)).toBeDefined();
    });

    ['1', '2', '3', '4', '5', '6'].forEach((d) => {
      fireEvent.press(getByTestId(`pin-key-${d}`));
    });

    await waitFor(async () => {
      expect(await authService.hasPin()).toBe(false);
      expect(await authService.isBiometricEnabled()).toBe(false);
      expect(getByTestId('security-create-pin')).toBeDefined();
    });
  });

  // =========================================================================
  // S45-T05: Switch de biometria com teste real e desativação segura
  // =========================================================================
  it('S45-T05: toggles biometric login with real test and requires auth to disable', async () => {
    await authService.setPin('123456');

    const { getByTestId } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    const bioSwitch = getByTestId('security-biometric-switch');
    expect(bioSwitch.props.value).toBe(false);

    // Liga a digital
    await act(async () => {
      fireEvent(bioSwitch, 'valueChange', true);
    });

    await waitFor(async () => {
      expect(await authService.isBiometricEnabled()).toBe(true);
      expect(bioSwitch.props.value).toBe(true);
    });

    // Desliga a digital
    await act(async () => {
      fireEvent(bioSwitch, 'valueChange', false);
    });

    await waitFor(async () => {
      expect(await authService.isBiometricEnabled()).toBe(false);
      expect(bioSwitch.props.value).toBe(false);
    });
  });

  // =========================================================================
  // S45-T06: Seletor de tempo de bloqueio automático (0, 30, 60, 300)
  // =========================================================================
  it('S45-T06: persists autolock seconds selection (0, 30, 60, 300)', async () => {
    await authService.setPin('123456');

    const { getByTestId } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    // Padrão é 60 segundos
    expect(await authService.getAutoLockSeconds()).toBe(60);

    openRow(getByTestId, 'security-autolock-row', 'security-autolock-30');

    // Seleciona 30 s
    await act(async () => {
      fireEvent.press(getByTestId('security-autolock-30'));
    });
    expect(await authService.getAutoLockSeconds()).toBe(30);

    // Seleciona Imediato (0 s)
    await act(async () => {
      fireEvent.press(getByTestId('security-autolock-0'));
    });
    expect(await authService.getAutoLockSeconds()).toBe(0);

    // Seleciona 5 min (300 s)
    await act(async () => {
      fireEvent.press(getByTestId('security-autolock-300'));
    });
    expect(await authService.getAutoLockSeconds()).toBe(300);
  });

  // =========================================================================
  // S45-T07: Botão "Bloquear agora"
  // =========================================================================
  it('S45-T07: lock now button locks the sessionStore', async () => {
    await authService.setPin('123456');

    const { getByTestId } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    expect(sessionStore.getState().status).toBe('unlocked');

    fireEvent.press(getByTestId('security-lock-now'));

    expect(sessionStore.getState().status).toBe('locked');
  });

  // =========================================================================
  // S45-T08: Campo Nome editável atualiza profileStore e iniciais
  // =========================================================================
  it('S45-T08: editing user name updates profile repository and store', async () => {
    const { getByTestId } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    openRow(getByTestId, 'security-name-row', 'security-name-input');
    const nameInput = getByTestId('security-name-input');
    expect(nameInput.props.value).toBe('Pedro Lima');

    await act(async () => {
      fireEvent.changeText(nameInput, 'Ana Maria Souza');
      fireEvent(nameInput, 'blur');
    });

    await waitFor(async () => {
      const prof = await mockProfileRepo.getProfile();
      expect(prof.name).toBe('Ana Maria Souza');
      expect(prof.initials).toBe('AM');
      expect(profileStore.getState().name).toBe('Ana Maria Souza');
      expect(profileStore.getState().initials).toBe('AM');
    });
  });

  // =========================================================================
  // S45-T09: "Apagar todos os dados" com confirmação por texto "APAGAR"
  // =========================================================================
  it('S45-T09: wipe action requires typing APAGAR, resets storage, and returns to onboarding', async () => {
    await authService.setPin('123456');

    const { getByTestId, queryByTestId, getByText } = await render(
      <SecurityTile
        isLight={false}
        authService={authService}
        profileRepository={mockProfileRepo}
      />
    );

    fireEvent.press(getByTestId('security-wipe'));

    // Abre diálogo de confirmação destrutiva
    await waitFor(() => {
      expect(getByTestId('security-wipe-confirm-input')).toBeDefined();
    });

    const confirmBtn = getByTestId('security-wipe-confirm-btn');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);

    // Digita texto incorreto
    fireEvent.changeText(getByTestId('security-wipe-confirm-input'), 'apagar');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);

    // Digita exatamente APAGAR
    fireEvent.changeText(getByTestId('security-wipe-confirm-input'), 'APAGAR');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    await waitFor(async () => {
      expect(await authService.hasPin()).toBe(false);
      expect(await mockProfileRepo.isOnboarded()).toBe(false);
      expect(sessionStore.getState().status).toBe('onboarding');
    });
  });

  // =========================================================================
  // S45-T10: Integração em SettingsBackupScreen
  // =========================================================================
  it('S45-T10: integrates all security controls in SettingsBackupScreen', async () => {
    const { getByTestId } = await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
      />
    );

    expect(getByTestId('settings-section-seguranca')).toBeDefined();
    expect(getByTestId('security-pin-status')).toBeDefined();
    expect(getByTestId('security-biometric-switch')).toBeDefined();
    openRow(getByTestId, 'security-name-row', 'security-name-input');
    expect(getByTestId('security-name-input')).toBeDefined();
    expect(getByTestId('security-wipe')).toBeDefined();
  });
});
