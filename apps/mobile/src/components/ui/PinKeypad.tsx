import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { JellyPressable } from './JellyPressable';

export interface PinKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onBackspaceLongPress?: () => void;
  onBiometric?: () => void;
  biometricAvailable?: boolean;
  disabled?: boolean;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

export const PinKeypad: React.FC<PinKeypadProps> = ({
  onDigit,
  onBackspace,
  onBackspaceLongPress,
  onBiometric,
  biometricAvailable = false,
  disabled = false,
  themeMode = 'dark',
  testID = 'pin-keypad',
}) => {
  // Stub Fase A
  return (
    <View testID={testID} style={styles.container}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <JellyPressable
          key={n}
          testID={`pin-key-${n}`}
          accessibilityLabel={`Dígito ${n}`}
          disabled={disabled}
          onPress={() => onDigit(String(n))}
        >
          <Text>{n}</Text>
        </JellyPressable>
      ))}
      {biometricAvailable && (
        <JellyPressable
          testID="pin-key-biometric"
          accessibilityLabel="Autenticar com biometria"
          disabled={disabled}
          onPress={onBiometric}
        >
          <Text>BIO</Text>
        </JellyPressable>
      )}
      <JellyPressable
        testID="pin-key-0"
        accessibilityLabel="Dígito 0"
        disabled={disabled}
        onPress={() => onDigit('0')}
      >
        <Text>0</Text>
      </JellyPressable>
      <JellyPressable
        testID="pin-key-backspace"
        accessibilityLabel="Apagar dígito"
        disabled={disabled}
        onPress={onBackspace}
        onLongPress={onBackspaceLongPress}
      >
        <Text>DEL</Text>
      </JellyPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
});
