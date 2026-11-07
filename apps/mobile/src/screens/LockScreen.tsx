import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  TextInput,
  Modal,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PinDots } from '../components/ui/PinDots';
import { PinKeypad } from '../components/ui/PinKeypad';
import { useProfile } from '../stores/profileStore';
import { authService as defaultAuthService, AuthService } from '../services/authService';
import { sessionStore as defaultSessionStore } from '../stores/sessionStore';
import { resetDatabase } from '../db/client';
import { colors, typography } from '../theme/tokens';

export interface LockScreenProps {
  authService?: AuthService;
  themeMode?: 'dark' | 'light';
  onForgotPin?: () => void;
  onResetComplete?: () => void;
  testID?: string;
}

function formatLockoutSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  authService = defaultAuthService,
  themeMode = 'dark',
  onForgotPin,
  onResetComplete,
  testID = 'lock-screen',
}) => {
  const profile = useProfile();
  const isLight = themeMode === 'light';

  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorShake, setIsErrorShake] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);
  const [isForgotModalVisible, setIsForgotModalVisible] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [biometricActive, setBiometricActive] = useState(false);

  const lockoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkLockout = useCallback(async () => {
    const remainingMs = await authService.getLockoutRemainingMs();
    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      setLockoutRemainingSec(seconds);
      setErrorMessage(`Muitas tentativas incorretas.`);
    } else {
      setLockoutRemainingSec(0);
    }
  }, [authService]);

  // Checa lockout e biometria ao montar
  useEffect(() => {
    let mounted = true;

    async function init() {
      await checkLockout();

      const canUse = await authService.canUseBiometrics();
      const isEnabled = await authService.isBiometricEnabled();
      if (!mounted) return;

      setBiometricAvailable(canUse && isEnabled);
      setBiometricActive(isEnabled);

      // Auto-prompt biométrico se disponível e ativo
      if (canUse && isEnabled) {
        const remainingMs = await authService.getLockoutRemainingMs();
        if (remainingMs === 0) {
          const auth = await authService.authenticateBiometric('Autenticar para entrar no Celsus');
          if (auth.success) {
            defaultSessionStore.unlock();
          }
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [authService, checkLockout]);

  // Contagem regressiva do timer de lockout
  useEffect(() => {
    if (lockoutRemainingSec > 0) {
      lockoutTimerRef.current = setInterval(() => {
        setLockoutRemainingSec((prev) => {
          if (prev <= 1) {
            clearInterval(lockoutTimerRef.current!);
            setErrorMessage(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutRemainingSec]);

  const handleDigit = async (digit: string) => {
    if (lockoutRemainingSec > 0) return;
    if (pin.length >= 6) return;

    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMessage(null);
    setIsErrorShake(false);

    if (nextPin.length === 6) {
      // Validar PIN
      const res = await authService.verifyPin(nextPin);
      if (res.ok) {
        setPin('');
        defaultSessionStore.unlock();
      } else {
        Vibration.vibrate(200);
        setIsErrorShake(true);
        setPin('');

        if (res.reason === 'locked') {
          const sec = Math.ceil((res.remainingMs || 30000) / 1000);
          setLockoutRemainingSec(sec);
          setErrorMessage('Muitas tentativas incorretas.');
        } else {
          setErrorMessage('PIN incorreto · 4 tentativas restantes');
        }
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutRemainingSec > 0) return;
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setErrorMessage(null);
      setIsErrorShake(false);
    }
  };

  const handleBackspaceLongPress = () => {
    if (lockoutRemainingSec > 0) return;
    setPin('');
    setErrorMessage(null);
    setIsErrorShake(false);
  };

  const handleBiometricPress = async () => {
    if (lockoutRemainingSec > 0) return;
    const auth = await authService.authenticateBiometric('Autenticar para entrar no Celsus');
    if (auth.success) {
      defaultSessionStore.unlock();
    }
  };

  const handleOpenForgotPin = () => {
    if (onForgotPin) {
      onForgotPin();
      return;
    }
    setIsForgotModalVisible(true);
  };

  const handleConfirmReset = async () => {
    await authService.resetAll();
    try {
      await resetDatabase();
    } catch {}
    setIsForgotModalVisible(false);
    defaultSessionStore.setStatus('onboarding');
    onResetComplete?.();
  };

  const bg = isLight ? '#F4F1EA' : '#111315';
  const fg = isLight ? '#111315' : '#E6DECA';
  const muted = isLight ? '#6E6A63' : '#8A8C90';
  const cardBg = isLight ? '#FFFFFF' : '#1C1E20';

  const isKeypadDisabled = lockoutRemainingSec > 0;

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      {/* Avatar e Boas-Vindas */}
      <View testID="lock-avatar" style={[styles.avatar, { borderColor: colors.primary }]}>
        <Text style={[styles.avatarText, { color: fg }]}>
          {profile.initials || 'C'}
        </Text>
      </View>

      <Text testID="lock-title" style={[styles.title, { color: fg }]}>
        {`Olá, ${profile.name || 'Investidor'}`}
      </Text>

      {/* Subtítulo / Mensagem de Erro */}
      <Text
        testID="lock-error"
        style={[
          styles.subtitle,
          { color: errorMessage ? colors.primary : muted },
        ]}
      >
        {errorMessage || 'Digite seu PIN para entrar'}
      </Text>

      {/* Contador Regressivo de Lockout */}
      {lockoutRemainingSec > 0 && (
        <View style={styles.lockoutRow}>
          <MaterialIcons name="timer" size={16} color={colors.primary} />
          <Text testID="lock-lockout-timer" style={styles.lockoutTimer}>
            {`Tente novamente em ${formatLockoutSeconds(lockoutRemainingSec)}`}
          </Text>
        </View>
      )}

      {/* Pontos do PIN */}
      <PinDots
        filled={pin.length}
        error={isErrorShake}
        themeMode={themeMode}
      />

      {/* Teclado Numérico */}
      <PinKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        onBackspaceLongPress={handleBackspaceLongPress}
        onBiometric={handleBiometricPress}
        biometricAvailable={biometricAvailable}
        disabled={isKeypadDisabled}
        themeMode={themeMode}
      />

      {/* Esqueci o PIN */}
      <TouchableOpacity
        testID="lock-forgot-pin"
        accessibilityRole="button"
        accessibilityLabel="Esqueci o PIN"
        onPress={handleOpenForgotPin}
        style={styles.forgotButton}
      >
        <Text style={[styles.forgotText, { color: muted }]}>Esqueci o PIN</Text>
      </TouchableOpacity>

      {/* Modal / Diálogo de Recuperação de PIN */}
      <Modal
        visible={isForgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsForgotModalVisible(false)}
      >
        <View testID="forgot-pin-dialog" style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
            <Text style={[styles.modalTitle, { color: fg }]}>Esqueci meu PIN</Text>

            {biometricActive && biometricAvailable ? (
              <View style={{ gap: 14 }}>
                <Text style={[styles.modalBody, { color: muted }]}>
                  Sua biometria está configurada. Deseja autenticar com digital ou rosto para desbloquear o app?
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={async () => {
                    const res = await authService.authenticateBiometric('Recuperar acesso ao Celsus');
                    if (res.success) {
                      setIsForgotModalVisible(false);
                      defaultSessionStore.unlock();
                    }
                  }}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.primaryBtnText}>Usar biometria</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={[styles.modalBody, { color: muted }]}>
                  O Celsus é local e soberano: seus dados não saem do aparelho e não há recuperação de conta em nuvem.
                </Text>
                <Text style={[styles.modalBody, { color: colors.primary, fontWeight: '600' }]}>
                  A única alternativa sem a biometria é apagar todos os dados locais e reconfigurar o perfil.
                </Text>
                <Text style={[styles.modalBody, { color: muted, fontSize: 13 }]}>
                  Digite APAGAR abaixo para confirmar:
                </Text>
                <TextInput
                  testID="reset-confirmation-input"
                  style={[
                    styles.input,
                    { color: fg, borderColor: isLight ? '#C5BEB3' : '#33363A' },
                  ]}
                  value={resetConfirmText}
                  onChangeText={setResetConfirmText}
                  placeholder="APAGAR"
                  placeholderTextColor={muted}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  testID="confirm-reset-button"
                  accessibilityRole="button"
                  disabled={resetConfirmText !== 'APAGAR'}
                  onPress={handleConfirmReset}
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor:
                        resetConfirmText === 'APAGAR' ? colors.primary : '#552222',
                      opacity: resetConfirmText === 'APAGAR' ? 1 : 0.5,
                    },
                  ]}
                >
                  <Text style={styles.primaryBtnText}>Apagar tudo e recomeçar</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setIsForgotModalVisible(false)}
              style={styles.cancelBtn}
            >
              <Text style={[styles.cancelBtnText, { color: muted }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily,
    marginBottom: 8,
    textAlign: 'center',
  },
  lockoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  lockoutTimer: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  forgotButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: typography.fontFamily,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  primaryBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
  },
});
