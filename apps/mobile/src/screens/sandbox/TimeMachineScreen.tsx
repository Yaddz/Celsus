import React from 'react';
import { View } from 'react-native';
import type { SandboxScenarioRecord } from '../../repositories/sandboxRepository';

export interface TimeMachineScreenProps {
  onBack?: () => void;
  initialScenario?: SandboxScenarioRecord | null;
  onScenarioSaved?: (scenario: SandboxScenarioRecord) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  onSwitchModule?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const TimeMachineScreen: React.FC<TimeMachineScreenProps> = ({ testID = 'time-machine-screen' }) => {
  return <View testID={testID} />;
};

export default TimeMachineScreen;
