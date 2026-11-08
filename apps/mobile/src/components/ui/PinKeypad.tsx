import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, View, ViewStyle, Text, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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


/**
 * Tecla do teclado de PIN com feedback de toque bem visível: encolhe e acende um halo laranja ao
 * encostar e volta com mola ao soltar. Mesmo num toque rápido a volta dura ~250 ms, então o retorno
 * aparece. Só transform/opacity com driver nativo.
 */
const KeypadKey: React.FC<
  Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; reduced: boolean; children?: React.ReactNode }
> = ({ style, reduced, children, disabled, onPressIn, onPressOut, ...rest }) => {
  const pressed = useRef(new Animated.Value(0)).current;
  const pressIn = () => {
    pressed.stopAnimation();
    Animated.timing(pressed, { toValue: 1, duration: reduced ? 1 : 70, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    if (reduced) {
      Animated.timing(pressed, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(pressed, { toValue: 0, damping: 11, stiffness: 220, mass: 0.7, useNativeDriver: true }).start();
  };
  const scale = reduced ? 1 : pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] });
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressOut();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.halo, { opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }) }]}
        />
        {children}
      </Animated.View>
    </Pressable>
  );
};

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
  const reduced = useReducedMotion();

  // Entrada do teclado: as 4 linhas sobem e aparecem em cascata (só transform/opacity, driver nativo).
  const rows = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced) {
      rows.forEach((v) => v.setValue(1));
      return;
    }
    Animated.stagger(
      45,
      rows.map((v) => Animated.spring(v, { toValue: 1, damping: 16, stiffness: 180, mass: 0.8, useNativeDriver: true }))
    ).start();
  }, [reduced, rows]);
  const rowStyle = (i: number) => ({
    opacity: rows[i],
    transform: [{ translateY: rows[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  const keyBg = isLight ? '#FFFFFF' : '#191B1D';
  const keyBorder = isLight ? '#EAE4D7' : '#26292C';
  const textFg = isLight ? '#111315' : '#E6DECA';
  const iconColor = isLight ? '#111315' : '#E6DECA';

  const renderDigitKey = (num: number) => (
    <View key={num} style={styles.keyWrapper}>
      <KeypadKey
        reduced={reduced}
        testID={`pin-key-${num}`}
        accessibilityRole="button"
        accessibilityLabel={`Dígito ${num}`}
        disabled={disabled}
        onPress={() => onDigit(String(num))}
        style={[
          styles.keyCircle,
          { backgroundColor: keyBg, borderColor: keyBorder },
          disabled && styles.disabledKey,
        ]}
      >
        <Text style={[styles.digitText, { color: textFg }]}>{num}</Text>
      </KeypadKey>
    </View>
  );

  return (
    <View testID={testID} style={styles.container}>
      {/* Linha 1 */}
      <Animated.View style={[styles.row, rowStyle(0)]}>
        {renderDigitKey(1)}
        {renderDigitKey(2)}
        {renderDigitKey(3)}
      </Animated.View>

      {/* Linha 2 */}
      <Animated.View style={[styles.row, rowStyle(1)]}>
        {renderDigitKey(4)}
        {renderDigitKey(5)}
        {renderDigitKey(6)}
      </Animated.View>

      {/* Linha 3 */}
      <Animated.View style={[styles.row, rowStyle(2)]}>
        {renderDigitKey(7)}
        {renderDigitKey(8)}
        {renderDigitKey(9)}
      </Animated.View>

      {/* Linha 4 */}
      <Animated.View style={[styles.row, rowStyle(3)]}>
        <View style={styles.keyWrapper}>
          {biometricAvailable ? (
            <KeypadKey
        reduced={reduced}
              testID="pin-key-biometric"
              accessibilityRole="button"
              accessibilityLabel="Autenticar com biometria"
              disabled={disabled}
              onPress={onBiometric}
              style={[
                styles.keyCircle,
                { backgroundColor: keyBg, borderColor: keyBorder },
                disabled && styles.disabledKey,
              ]}
            >
              <MaterialIcons name="fingerprint" size={30} color={iconColor} />
            </KeypadKey>
          ) : (
            <View style={styles.emptyPlaceholder} />
          )}
        </View>

        {renderDigitKey(0)}

        <View style={styles.keyWrapper}>
          <KeypadKey
        reduced={reduced}
            testID="pin-key-backspace"
            accessibilityRole="button"
            accessibilityLabel="Apagar dígito"
            disabled={disabled}
            onPress={onBackspace}
            onLongPress={onBackspaceLongPress}
            delayLongPress={400}
            style={[
              styles.keyCircle,
              { backgroundColor: keyBg, borderColor: keyBorder },
              disabled && styles.disabledKey,
            ]}
          >
            <MaterialIcons name="backspace" size={24} color={iconColor} />
          </KeypadKey>
        </View>
      </Animated.View>
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
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitText: {
    fontSize: 26,
    fontWeight: '500',
    fontFamily: typography.fontFamily,
  },
  disabledKey: {
    opacity: 0.35,
  },
  halo: {
    borderRadius: 36,
    backgroundColor: colors.primary,
  },
  emptyPlaceholder: {
    width: 72,
    height: 72,
  },
});
