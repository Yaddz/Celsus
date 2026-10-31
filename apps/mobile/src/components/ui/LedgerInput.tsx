import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardTypeOptions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { colors, typography, spacing, borders } from '../../theme/tokens';

export interface LedgerInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const LedgerInput: React.FC<LedgerInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder = '0,00',
  prefix,
  suffix,
  keyboardType = 'numeric',
  style,
  testID,
}) => {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}

      <View style={styles.inputRow}>
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(213, 202, 168, 0.35)"
          keyboardType={keyboardType}
          style={styles.input}
        />

        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>

      <View style={styles.baseline} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusLg,
    padding: spacing.md,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    marginVertical: spacing.xs,
  },
  label: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.tertiary,
    opacity: 0.8,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: spacing.xs,
  },
  affix: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    color: colors.primary,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineMd.fontSize + 2,
    fontWeight: '700',
    color: colors.parchmentPale,
    padding: 0,
  },
  suffix: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.tertiary,
    opacity: 0.7,
    marginLeft: spacing.xs,
  },
  baseline: {
    height: 1.5,
    backgroundColor: colors.tertiary,
    marginTop: 6,
    opacity: 0.5,
  },
});

export default LedgerInput;
