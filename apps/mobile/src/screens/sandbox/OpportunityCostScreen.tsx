import React from 'react';
import { View, Text } from 'react-native';

export interface OpportunityCostScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  onOpenSubscriptions?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

export const OpportunityCostScreen: React.FC<OpportunityCostScreenProps> = ({
  testID = 'opportunity-cost-screen',
}) => (
  <View testID={testID}>
    <Text>Custo de oportunidade (Stub)</Text>
  </View>
);

export default OpportunityCostScreen;
