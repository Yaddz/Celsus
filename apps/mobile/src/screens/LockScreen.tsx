import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { PinDots } from '../components/ui/PinDots';
import { PinKeypad } from '../components/ui/PinKeypad';
import { useProfile } from '../stores/profileStore';
import { authService as defaultAuthService, AuthService } from '../services/authService';
import { sessionStore as defaultSessionStore } from '../stores/sessionStore';

export interface LockScreenProps {
  authService?: AuthService;
  themeMode?: 'dark' | 'light';
  onForgotPin?: () => void;
  onResetComplete?: () => void;
  testID?: string;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  authService = defaultAuthService,
  themeMode = 'dark',
  onForgotPin,
  onResetComplete,
  testID = 'lock-screen',
}) => {
  const profile = useProfile();

  // Stub Fase A
  return (
    <View testID={testID} style={styles.container}>
      <View testID="lock-avatar">
        <Text>{profile.initials || 'C'}</Text>
      </View>
      <Text testID="lock-title">{`Olá, ${profile.name || 'Investidor'}`}</Text>
      <Text testID="lock-error">Digite seu PIN para entrar</Text>
      <PinDots filled={0} error={false} themeMode={themeMode} />
      <PinKeypad
        onDigit={() => {}}
        onBackspace={() => {}}
        themeMode={themeMode}
      />
      <TouchableOpacity testID="lock-forgot-pin" onPress={onForgotPin}>
        <Text>Esqueci o PIN</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
