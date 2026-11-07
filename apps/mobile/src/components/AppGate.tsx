import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, AppState } from 'react-native';
import { useSession, sessionStore as defaultSessionStore } from '../stores/sessionStore';
import { profileRepository as defaultProfileRepository, ProfileRepository } from '../repositories/profileRepository';
import { authService as defaultAuthService, AuthService } from '../services/authService';
import { LockScreen } from '../screens/LockScreen';
import { OnboardingPlaceholder } from './OnboardingPlaceholder';

export interface AppGateProps {
  children: React.ReactNode;
  authService?: AuthService;
  profileRepository?: ProfileRepository;
  clock?: () => number;
  themeMode?: 'dark' | 'light';
}

export function useAppLock(deps: {
  authService?: AuthService;
  profileRepo?: ProfileRepository;
  clock?: () => number;
} = {}) {
  // Stub Fase A
  return {
    status: 'loading' as const,
    isBackgrounded: false,
    hasPin: false,
  };
}

export const AppGate: React.FC<AppGateProps> = ({
  children,
  authService = defaultAuthService,
  profileRepository = defaultProfileRepository,
  clock = () => Date.now(),
  themeMode = 'dark',
}) => {
  // Stub Fase A
  return <View testID="app-gate-loading"><Text>Carregando...</Text></View>;
};

const styles = StyleSheet.create({
  privacyCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111315',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
