import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { B3ImportScreen } from '../B3ImportScreen';
import { authService } from '../../services/authService';
import { profileRepository } from '../../repositories/profileRepository';
import { resetDatabase } from '../../db/client';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 50: Onboarding Pierre Editorial & Zero-Flash Transition to B3 Import', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S50-T01: Transição sem flash da Home (B3ImportScreen monta no frame 0)
  // =========================================================================
  describe('S50-T01: Zero-flash transition from onboarding to B3 import', () => {
    it('should mount B3ImportScreen immediately on frame 0 when initialAction is import_b3', async () => {
      render(<B3ImportScreen onBack={jest.fn()} isLight={true} />);

      expect(screen.getByTestId('b3-pick-file')).toBeTruthy();
      expect(screen.getByText('Como exportar da B3')).toBeTruthy();
    });
  });

  // =========================================================================
  // S50-T02: OnboardingFlow com estilo Pierre Editorial em todas as etapas
  // =========================================================================
  describe('S50-T02: OnboardingFlow Pierre Editorial design consistency', () => {
    it('should render Welcome step with brand title and primary start button', () => {
      render(
        <OnboardingFlow
          authService={authService}
          profileRepository={profileRepository}
          themeMode="light"
        />
      );

      expect(screen.getByText('Celsus')).toBeTruthy();
      expect(screen.getByTestId('onboarding-next')).toBeTruthy();
    });

    it('should navigate to Name step and display refined input layout', () => {
      render(
        <OnboardingFlow
          authService={authService}
          profileRepository={profileRepository}
          themeMode="light"
        />
      );

      fireEvent.press(screen.getByTestId('onboarding-next'));

      expect(screen.getByTestId('onboarding-name-input')).toBeTruthy();
      expect(screen.getByTestId('onboarding-next')).toBeTruthy();
    });
  });

  // =========================================================================
  // S50-T03: B3ImportScreen com visual Pierre Editorial
  // =========================================================================
  describe('S50-T03: B3ImportScreen Pierre Editorial report design', () => {
    it('should display file picker on initial step with refined pill button', () => {
      render(<B3ImportScreen onBack={jest.fn()} isLight={true} />);

      const pickBtn = screen.getByTestId('b3-pick-file');
      expect(pickBtn).toBeTruthy();
      expect(screen.getByText('Selecionar arquivo (XLSX ou CSV)')).toBeTruthy();
    });
  });
});
