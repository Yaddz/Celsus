import React from 'react';
import { View } from 'react-native';
import type { SandboxScenarioRecord } from '../../repositories/sandboxRepository';

export interface SandboxHubScreenProps {
  onBack?: () => void;
  onOpenTimeMachine?: (scenario?: SandboxScenarioRecord) => void;
  onOpenContributionSimulator?: () => void;
  onProfilePress?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const SandboxHubScreen: React.FC<SandboxHubScreenProps> = ({ testID = 'sandbox-hub-screen' }) => {
  return <View testID={testID} />;
};

export default SandboxHubScreen;
