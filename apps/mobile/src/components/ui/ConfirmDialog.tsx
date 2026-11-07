import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { bento, colors, typography } from '../../theme/tokens';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta o botão de confirmação como ação destrutiva. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
  confirmTestID?: string;
}

/**
 * Diálogo de confirmação centralizado. Fecha (cancela) com Esc, botão voltar do Android e toque
 * fora do diálogo.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
  themeMode = 'dark',
  testID = 'confirm-dialog',
  confirmTestID,
}) => {
  const isLight = themeMode === 'light';
  const surface = isLight ? '#FFFFFF' : '#1C1E20';
  const fg = isLight ? '#111315' : '#E6DECA';
  const muted = isLight ? '#6E6A63' : '#8A8A8E';

  // Esc fecha também na web (o <Modal> do react-native-web já chama onRequestClose; isto cobre
  // navegadores/versões em que o foco não está dentro do modal).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onCancel]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View testID={testID} style={styles.overlay}>
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityLabel="Fechar"
          onPress={onCancel}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        />
        <View accessibilityRole="alert" style={[styles.card, { backgroundColor: surface }]}>
          <Text style={[styles.title, { color: fg }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: muted }]}>{message}</Text> : null}
          <View style={styles.row}>
            <Pressable
              testID={`${testID}-cancel`}
              accessibilityRole="button"
              onPress={onCancel}
              style={[styles.btn, { backgroundColor: isLight ? '#EAE4D7' : '#2A2D30' }]}
            >
              <Text style={[styles.btnText, { color: fg }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              testID={confirmTestID ?? `${testID}-confirm`}
              accessibilityRole="button"
              onPress={onConfirm}
              style={[styles.btn, { backgroundColor: destructive ? '#E05252' : colors.primary }]}
            >
              <Text style={[styles.btnText, { color: destructive ? '#FFFFFF' : '#1A0E08' }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: bento.tileRadius, padding: 22, gap: 10 },
  title: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '700' },
  message: { fontFamily: typography.fontFamily, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: bento.gap, marginTop: 12 },
  btn: { flex: 1, minHeight: 48, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
});
