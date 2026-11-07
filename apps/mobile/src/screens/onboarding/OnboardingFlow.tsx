import React from 'react';
import { View, Text } from 'react-native';
import { AuthService, authService as defaultAuthService } from '../../services/authService';
import { ProfileRepository, profileRepository as defaultProfileRepository } from '../../repositories/profileRepository';

export interface OnboardingFlowProps {
  onComplete?: (action?: 'import_b3' | 'create_wallet' | 'explore') => void;
  isMigration?: boolean;
  authService?: AuthService;
  profileRepository?: ProfileRepository;
  themeMode?: 'dark' | 'light';
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
  isMigration = false,
  authService = defaultAuthService,
  profileRepository = defaultProfileRepository,
  themeMode = 'dark',
}) => {
  // Stub Fase A
  return (
    <View testID="onboarding-screen">
      <Text>Onboarding Stub</Text>
    </View>
  );
};
