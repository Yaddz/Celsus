import React from 'react';
import { View, Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { AppGate } from '../../../components/AppGate';
import { sessionStore } from '../../../stores/sessionStore';
import { AuthService } from '../../../services/authService';
import { ProfileRepository } from '../../../repositories/profileRepository';
import { PortfolioRepository } from '../../../repositories/portfolioRepository';

describe('S44: AppGate Onboarding Integration Tests', () => {
  let mockAuthService: jest.Mocked<AuthService>;
  let mockProfileRepo: jest.Mocked<ProfileRepository>;
  let mockPortfolioRepo: jest.Mocked<PortfolioRepository>;

  beforeEach(() => {
    sessionStore.setStatus('loading');

    mockAuthService = {
      hasPin: jest.fn().mockResolvedValue(false),
      setPin: jest.fn().mockResolvedValue(undefined),
      getAutoLockSeconds: jest.fn().mockResolvedValue(60),
      canUseBiometrics: jest.fn().mockResolvedValue(false),
      isBiometricEnabled: jest.fn().mockResolvedValue(false),
      getLockoutRemainingMs: jest.fn().mockResolvedValue(0),
    } as any;

    mockProfileRepo = {
      isOnboarded: jest.fn().mockResolvedValue(false),
      getProfileName: jest.fn().mockResolvedValue(null),
      setProfileName: jest.fn().mockResolvedValue(undefined),
      setOnboarded: jest.fn().mockResolvedValue(undefined),
      getProfile: jest.fn().mockResolvedValue({ name: '', initials: '', onboarded: false }),
    } as any;

    mockPortfolioRepo = {
      listPortfolios: jest.fn().mockResolvedValue([]),
    } as any;
  });

  it('S44-T20: AppGate mounts OnboardingFlow for new user and transitions to main app upon completion', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(false);
    mockPortfolioRepo.listPortfolios.mockResolvedValue([]);

    const { getByTestId, queryByTestId, queryByText } = await render(
      <AppGate
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        portfolioRepository={mockPortfolioRepo}
      >
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    // Should mount onboarding flow, not placeholder and not main app
    expect(getByTestId('onboarding-screen')).toBeDefined();
    expect(queryByTestId('onboarding-placeholder')).toBeNull();
    expect(queryByTestId('main-app-content')).toBeNull();

    // Walk through onboarding and complete
    fireEvent.press(getByTestId('onboarding-next')); // Welcome -> Name
    fireEvent.changeText(getByTestId('onboarding-name-input'), 'Ana Souza');
    fireEvent.press(getByTestId('onboarding-next')); // Name -> PIN
    fireEvent.press(getByTestId('onboarding-pin-skip')); // Skip PIN -> Done

    await act(async () => {
      fireEvent.press(getByTestId('onboarding-done-explore'));
    });

    // AppGate should now render main app
    expect(sessionStore.getState().status).toBe('unlocked');
    expect(getByTestId('main-app-content')).toBeDefined();
    expect(queryByTestId('onboarding-screen')).toBeNull();
  });

  it('S44-T21: AppGate detects existing user with portfolios (D9) and triggers migration flow', async () => {
    mockProfileRepo.isOnboarded.mockResolvedValue(false);
    // User already has a portfolio from pre-Sprint 44
    mockPortfolioRepo.listPortfolios.mockResolvedValue([
      { id: 'port-1', name: 'Carteira Principal', is_default: 1, created_at: 100 } as any,
    ]);

    const { getByTestId, getByText, queryByText } = await render(
      <AppGate
        authService={mockAuthService}
        profileRepository={mockProfileRepo}
        portfolioRepository={mockPortfolioRepo}
      >
        <View testID="main-app-content">
          <Text testID="xp-minimal-header">Celsus Home</Text>
        </View>
      </AppGate>
    );

    // Renders Onboarding in migration mode: "Complete seu perfil"
    expect(getByTestId('onboarding-screen')).toBeDefined();
    expect(getByText(/Complete seu perfil/i)).toBeDefined();
    expect(getByTestId('onboarding-name-input')).toBeDefined();
    expect(queryByText(/100% local/i)).toBeNull();
  });
});
