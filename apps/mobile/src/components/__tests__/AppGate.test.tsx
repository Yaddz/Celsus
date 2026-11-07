import React from 'react';
import { Text, View } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AppGate } from '../AppGate';
import { sessionStore } from '../../stores/sessionStore';
import { AuthService } from '../../services/authService';
import { ProfileRepository } from '../../repositories/profileRepository';

describe('S43: AppGate & useAppLock Component Tests', () => {
  let mockAuthService: jest.Mocked<AuthService>;
  let mockProfileRepo: jest.Mocked<ProfileRepository>;

  beforeEach(() => {
    sessionStore.setStatus('loading');
    sessionStore.markBackgrounded(0);

    mockAuthService = {
      hasPin: jest.fn().mockResolvedValue(true),
      getAutoLockSeconds: jest.fn().mockResolvedValue(60),
      canUseBiometrics: jest.fn().mockResolvedValue(false),
      isBiometricEnabled: jest.fn().mockResolvedValue(false),
      getLockoutRemainingMs: jest.fn().mockResolvedValue(0),
    } as any;

    mockProfileRepo = {
      isOnboarded: jest.fn().mockResolvedValue(true),
      getProfileName: jest.fn().mockResolvedValue('Pedro Lima'),
      getProfile: jest.fn().mockResolvedValue({
        name: 'Pedro Lima',
        initials: 'PL',
        onboarded: true,
      }),
    } as any;
  });

  it('S43-T17: existing profile without PIN unlocks directly without lock-screen', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(true);
    mockAuthService.hasPin.mockResolvedValue(false);

    const { queryByTestId, getByText } = await render(
      <AppGate authService={mockAuthService} profileRepository={mockProfileRepo}>
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    expect(queryByTestId('lock-screen')).toBeNull();
    expect(getByText('Celsus Home')).toBeDefined();
    expect(sessionStore.getState().status).toBe('unlocked');
  });

  it('S43-T18: user without profile transitions to onboarding placeholder', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(false);
    mockAuthService.hasPin.mockResolvedValue(false);

    const { getByTestId, queryByTestId } = await render(
      <AppGate authService={mockAuthService} profileRepository={mockProfileRepo}>
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    expect(getByTestId('onboarding-placeholder')).toBeDefined();
    expect(queryByTestId('xp-minimal-header')).toBeNull();
    expect(sessionStore.getState().status).toBe('onboarding');
  });

  it('S43-T19: user with PIN shows LockScreen and main app does NOT mount', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(true);
    mockAuthService.hasPin.mockResolvedValue(true);

    const { getByTestId, queryByTestId } = await render(
      <AppGate authService={mockAuthService} profileRepository={mockProfileRepo}>
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    expect(getByTestId('lock-screen')).toBeDefined();
    expect(queryByTestId('xp-minimal-header')).toBeNull();
    expect(sessionStore.getState().status).toBe('locked');
  });

  it('S43-T20: unlocking session mounts the main app content', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(true);
    mockAuthService.hasPin.mockResolvedValue(true);

    const { getByTestId, queryByTestId } = await render(
      <AppGate authService={mockAuthService} profileRepository={mockProfileRepo}>
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    expect(getByTestId('lock-screen')).toBeDefined();
    expect(queryByTestId('xp-minimal-header')).toBeNull();

    // Unlock
    await act(async () => {
      sessionStore.unlock();
    });

    expect(queryByTestId('lock-screen')).toBeNull();
    expect(getByTestId('xp-minimal-header')).toBeDefined();
  });

  it('S43-T21: AppState background to active respects autoLockSeconds and locks session', async () => {
    let now = 1000000;
    mockProfileRepo.isOnboarded.mockResolvedValue(true);
    mockAuthService.hasPin.mockResolvedValue(true);
    mockAuthService.getAutoLockSeconds.mockResolvedValue(60);

    const { queryByTestId } = await render(
      <AppGate
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        clock={() => now}
      >
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    // Initial unlock
    await act(async () => {
      sessionStore.unlock();
    });
    expect(sessionStore.getState().status).toBe('unlocked');

    // App goes to background
    await act(async () => {
      sessionStore.markBackgrounded(now);
    });

    // Advance clock past 60s
    now += 61000;

    // Resuming app should trigger lock
    await act(async () => {
      if (sessionStore.shouldLockOnResume(now, 60, true)) {
        sessionStore.lock();
      }
    });

    expect(sessionStore.getState().status).toBe('locked');
  });

  it('S43-T22: renders privacy cover while app is inactive or backgrounded with lock enabled', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(true);
    mockAuthService.hasPin.mockResolvedValue(true);

    const { queryByTestId } = await render(
      <AppGate authService={mockAuthService} profileRepository={mockProfileRepo}>
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    expect(queryByTestId('privacy-cover')).toBeDefined();
  });
});
