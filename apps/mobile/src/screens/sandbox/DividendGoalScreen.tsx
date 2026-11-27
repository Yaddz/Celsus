import React from 'react';
import { View } from 'react-native';
import type { SandboxScenarioRecord } from '../../repositories/sandboxRepository';

export const R51_DISCLAIMER_TEXT =
  'Baseado nos proventos pagos nos últimos 12 meses. Não é promessa de renda futura.';

export interface DividendGoalScreenProps {
  onBack?: () => void;
  onOpenContributionSimulator?: (initialAmountBRL: number) => void;
  initialScenario?: SandboxScenarioRecord | null;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const DividendGoalScreen: React.FC<DividendGoalScreenProps> = ({
  testID = 'dividend-goal-screen',
}) => {
  return <View testID={testID} />;
};
