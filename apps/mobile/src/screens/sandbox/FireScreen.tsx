import React from 'react';
import { View, Text } from 'react-native';

export interface FireScreenProps {
  onBack?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  referenceDateIso?: string;
  testID?: string;
}

export const FireScreen: React.FC<FireScreenProps> = ({
  testID = 'fire-screen',
}) => (
  <View testID={testID}>
    <Text>Independência financeira (Stub)</Text>
  </View>
);

export default FireScreen;
