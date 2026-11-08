import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AnimatedModalSheet } from './AnimatedModalSheet';
import { TextField } from './TextField';
import { typography } from '../../theme/tokens';

export const DANGER_COLOR = '#E05252';

export interface DangerConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  /** Palavra que precisa ser digitada exatamente para liberar a confirmação. */
  confirmWord?: string;
  confirmLabel?: string;
  themeMode?: 'dark' | 'light';
  /** testID do conteúdo do sheet. */
  testID?: string;
  inputTestID?: string;
  confirmTestID?: string;
  cancelTestID?: string;
  /** Conteúdo extra acima do campo (ex.: alternativa por biometria). */
  children?: React.ReactNode;
}

/**
 * Confirmação de ação destrutiva em bottom sheet (mesma animação dos sheets do app): ícone de alerta,
 * explicação, campo para digitar a palavra de confirmação e botões Cancelar / Confirmar.
 */
export const DangerConfirmSheet: React.FC<DangerConfirmSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmWord = 'APAGAR',
  confirmLabel = 'Apagar tudo',
  themeMode = 'dark',
  testID = 'danger-confirm-sheet',
  inputTestID = 'danger-confirm-input',
  confirmTestID = 'danger-confirm-btn',
  cancelTestID = 'danger-cancel-btn',
  children,
}) => {
  const isLight = themeMode === 'light';
  const fg = isLight ? '#111315' : '#E6DECA';
  const muted = isLight ? '#6E6A63' : '#8A8A8E';
  const [text, setText] = React.useState('');

  const close = () => {
    setText('');
    onClose();
  };

  const enabled = text === confirmWord;

  return (
    <AnimatedModalSheet visible={visible} onClose={close} themeMode={themeMode} testID={`${testID}-sheet`}>
      <View testID={testID} style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: DANGER_COLOR + '1F' }]}>
          <MaterialIcons name="warning-amber" size={26} color={DANGER_COLOR} />
        </View>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        <Text style={[styles.message, { color: muted }]}>{message}</Text>

        {children}

        <Text style={[styles.hint, { color: muted }]}>
          Para confirmar, digite <Text style={{ color: fg, fontWeight: '700' }}>{confirmWord}</Text>
        </Text>
        <TextField
          testID={inputTestID}
          value={text}
          onChangeText={setText}
          placeholder={confirmWord}
          autoCapitalize="characters"
          autoCorrect={false}
          compact
          themeMode={themeMode}
        />

        <View style={styles.actions}>
          <Pressable
            testID={cancelTestID}
            accessibilityRole="button"
            onPress={close}
            style={[styles.btn, { backgroundColor: isLight ? '#EAE4D7' : '#2A2D30' }]}
          >
            <Text style={[styles.btnText, { color: fg }]}>Cancelar</Text>
          </Pressable>
          <Pressable
            testID={confirmTestID}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={onConfirm}
            style={[styles.btn, { backgroundColor: DANGER_COLOR, opacity: enabled ? 1 : 0.4 }]}
          >
            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  body: { gap: 12, paddingTop: 4 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  hint: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
});
