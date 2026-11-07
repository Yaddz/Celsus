import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { bento, colors, typography } from '../../theme/tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'editable'> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  prefix?: string;
  suffix?: string;
  /** Mensagem de erro: pinta a borda de vermelho e aparece abaixo do campo. */
  error?: string | null;
  /** Texto de apoio abaixo do campo (some quando há erro). */
  helper?: string;
  disabled?: boolean;
  /** Altura reduzida para campos dentro de linhas de lista (mesmo estilo, só mais baixo). */
  compact?: boolean;
  themeMode?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** testID do contêiner externo (o `testID` vai no próprio TextInput, para tocar/digitar direto). */
  containerTestID?: string;
  suffixTestID?: string;
  /** Elemento à esquerda do texto (ex.: ícone de busca ou botão de calendário). */
  leftAdornment?: React.ReactNode;
  /** Elemento à direita do texto (ex.: botão de limpar). */
  rightAdornment?: React.ReactNode;
}

export const FIELD_HEIGHT = 56;
export const FIELD_HEIGHT_COMPACT = 44;

/**
 * Campo de texto ÚNICO do app (texto, número, textarea via `multiline`): mesma altura, raio, borda,
 * fundo, padding, tipografia e placeholder em todas as telas, com estados de foco, erro e
 * desabilitado. Selects (opções) usam chips/segmentos do app e não têm campo próprio.
 */
export const TextField: React.FC<TextFieldProps> = ({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  error,
  helper,
  disabled = false,
  compact = false,
  multiline = false,
  themeMode = 'dark',
  style,
  inputStyle,
  containerTestID,
  suffixTestID,
  leftAdornment,
  rightAdornment,
  placeholder,
  keyboardType,
  onFocus,
  onBlur,
  ...rest
}) => {
  const isLight = themeMode === 'light';
  const [focused, setFocused] = useState(false);
  const palette = isLight ? light : dark;
  const borderColor = error ? '#E05252' : focused ? colors.primary : palette.border;

  return (
    <View style={[disabled && styles.disabled, style]} testID={containerTestID}>
      {label ? <Text style={[styles.label, { color: palette.label }]}>{label.toUpperCase()}</Text> : null}
      <View
        style={[
          styles.box,
          {
            backgroundColor: palette.bg,
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            minHeight: multiline ? 96 : compact ? FIELD_HEIGHT_COMPACT : FIELD_HEIGHT,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? 12 : 0,
          },
        ]}
      >
        {leftAdornment ? <View style={styles.adornment}>{leftAdornment}</View> : null}
        {prefix ? <Text style={[styles.affix, { color: colors.primary }]}>{prefix}</Text> : null}
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.placeholder}
          keyboardType={keyboardType ?? 'default'}
          editable={!disabled}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          accessibilityState={{ disabled }}
          style={[
            styles.input,
            { color: palette.text, textAlignVertical: multiline ? 'top' : 'center' },
            multiline && { minHeight: 70 },
            inputStyle,
          ]}
        />
        {rightAdornment ? <View style={styles.rightAdornment}>{rightAdornment}</View> : null}
        {suffix ? (
          <Text testID={suffixTestID} style={[styles.suffix, { color: palette.label }]}>
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[styles.helper, { color: palette.label }]}>{helper}</Text>
      ) : null}
    </View>
  );
};

const dark = { bg: '#16181A', border: '#34383C', text: colors.parchmentPale, label: '#8A8A8E', placeholder: 'rgba(213, 202, 168, 0.35)' };
const light = { bg: '#F4F1EA', border: '#D6CFBF', text: '#111315', label: '#6E6A63', placeholder: 'rgba(30, 30, 30, 0.35)' };

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
  label: { fontFamily: typography.fontFamily, fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
  box: { flexDirection: 'row', borderRadius: bento.innerRadius, paddingHorizontal: 14 },
  adornment: { marginRight: 8 },
  rightAdornment: { marginLeft: 8 },
  affix: { fontFamily: typography.fontFamily, fontSize: 16, fontWeight: '700', marginRight: 8 },
  input: { flex: 1, minWidth: 0, fontFamily: typography.fontFamily, fontSize: 16, fontWeight: '700', padding: 0 },
  suffix: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700', marginLeft: 8 },
  error: { fontFamily: typography.fontFamily, fontSize: 11, color: '#E05252', marginTop: 4 },
  helper: { fontFamily: typography.fontFamily, fontSize: 11, marginTop: 4 },
});

export default TextField;
