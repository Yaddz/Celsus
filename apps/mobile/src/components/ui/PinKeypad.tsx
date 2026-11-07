import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { JellyPressable } from './JellyPressable';
import { colors, typography } from '../../theme/tokens';

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
  const isLight = themeMode === 'light';

  const keyBg = isLight ? '#EAE4D7' : '#1C1E20';
  const textFg = isLight ? '#111315' : '#E6DECA';
  const iconColor = isLight ? '#111315' : '#E6DECA';

  const renderDigitKey = (num: number) => (
    <View key={num} style={styles.keyWrapper}>
      <JellyPressable
        testID={`pin-key-${num}`}
        accessibilityRole="button"
        accessibilityLabel={`Dígito ${num}`}
        disabled={disabled}
        onPress={() => onDigit(String(num))}
        style={[
          styles.keyCircle,
          { backgroundColor: keyBg },
          disabled && styles.disabledKey,
        ]}
      >
        <Text style={[styles.digitText, { color: textFg }]}>{num}</Text>
      </JellyPressable>
    </View>
  );

  return (
    <View testID={testID} style={styles.container}>
      {/* Linha 1 */}
      <View style={styles.row}>
        {renderDigitKey(1)}
        {renderDigitKey(2)}
        {renderDigitKey(3)}
      </View>

      {/* Linha 2 */}
      <View style={styles.row}>
        {renderDigitKey(4)}
        {renderDigitKey(5)}
        {renderDigitKey(6)}
      </View>

      {/* Linha 3 */}
      <View style={styles.row}>
        {renderDigitKey(7)}
        {renderDigitKey(8)}
        {renderDigitKey(9)}
      </View>

      {/* Linha 4 */}
      <View style={styles.row}>
        <View style={styles.keyWrapper}>
          {biometricAvailable ? (
            <JellyPressable
              testID="pin-key-biometric"
              accessibilityRole="button"
              accessibilityLabel="Autenticar com biometria"
              disabled={disabled}
              onPress={onBiometric}
              style={[
                styles.keyCircle,
                { backgroundColor: keyBg },
                disabled && styles.disabledKey,
              ]}
            >
              <MaterialIcons name="fingerprint" size={30} color={iconColor} />
            </JellyPressable>
          ) : (
            <View style={styles.emptyPlaceholder} />
          )}
        </View>

        {renderDigitKey(0)}

        <View style={styles.keyWrapper}>
          <JellyPressable
            testID="pin-key-backspace"
            accessibilityRole="button"
            accessibilityLabel="Apagar dígito"
            disabled={disabled}
            onPress={onBackspace}
            onLongPress={onBackspaceLongPress}
            delayLongPress={400}
            style={[
              styles.keyCircle,
              { backgroundColor: keyBg },
              disabled && styles.disabledKey,
            ]}
          >
            <MaterialIcons name="backspace" size={24} color={iconColor} />
          </JellyPressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    gap: 16,
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyWrapper: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  disabledKey: {
    opacity: 0.35,
  },
  emptyPlaceholder: {
    width: 72,
    height: 72,
  },
});
