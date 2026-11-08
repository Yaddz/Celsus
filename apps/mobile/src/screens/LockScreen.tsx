import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PinDots } from '../components/ui/PinDots';
import { PinKeypad } from '../components/ui/PinKeypad';
import { AnimatedModalSheet } from '../components/ui/AnimatedModalSheet';
import { DangerConfirmSheet, DANGER_COLOR } from '../components/ui/DangerConfirmSheet';
import { useProfile, profileStore } from '../stores/profileStore';
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

  // Contagem regressiva do timer de lockout: um único intervalo enquanto durar o bloqueio
  // (antes o intervalo era desfeito e recriado a cada segundo, pois dependia do próprio contador).
  const isLockedOut = lockoutRemainingSec > 0;
  useEffect(() => {
    if (isLockedOut) {
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
  }, [isLockedOut]);

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
          const left = res.attemptsRemaining;
          setErrorMessage(
            typeof left === 'number'
              ? `PIN incorreto · ${left} ${left === 1 ? 'tentativa restante' : 'tentativas restantes'}`
              : 'PIN incorreto'
          );
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
    profileStore.reset();
    setIsForgotModalVisible(false);
    defaultSessionStore.setStatus('onboarding');
    onResetComplete?.();
  };

  const bg = isLight ? '#F4F1EA' : '#111315';
  const fg = isLight ? '#111315' : '#E6DECA';
  const muted = isLight ? '#6E6A63' : '#8A8A8E';

  const isKeypadDisabled = lockoutRemainingSec > 0;
  const firstName = (profile.name || '').trim().split(/\s+/)[0];
  const [isResetSheetVisible, setIsResetSheetVisible] = useState(false);

  // Entrada da tela: saudação desce e aparece suavemente enquanto o teclado sobe em cascata.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [enter]);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
  };
  const canRecoverWithBiometrics = biometricActive && biometricAvailable;

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <Text style={styles.brand}>CELSUS</Text>

      <Animated.View style={[styles.header, enterStyle]}>
        <View testID="lock-avatar" style={styles.avatar}>
          {profile.initials ? (
            <Text style={styles.avatarText}>{profile.initials}</Text>
          ) : (
            <MaterialIcons name="lock-outline" size={30} color="#1A0E08" />
          )}
        </View>

        <Text testID="lock-title" style={[styles.title, { color: fg }]}>
          {firstName ? `Olá, ${firstName}` : 'Bem-vindo de volta'}
        </Text>

        <Text testID="lock-error" style={[styles.subtitle, { color: errorMessage ? colors.primary : muted }]}>
          {errorMessage || 'Digite seu PIN para entrar'}
        </Text>

        {lockoutRemainingSec > 0 && (
          <View style={[styles.lockoutRow, { backgroundColor: colors.primary + '1F' }]}>
            <MaterialIcons name="timer" size={16} color={colors.primary} />
            <Text testID="lock-lockout-timer" style={styles.lockoutTimer}>
              {`Tente novamente em ${formatLockoutSeconds(lockoutRemainingSec)}`}
            </Text>
          </View>
        )}

        <PinDots filled={pin.length} error={isErrorShake} themeMode={themeMode} />
      </Animated.View>

      <PinKeypad
        onDigit={handleDigit}
        onBackspace={handleBackspace}
        onBackspaceLongPress={handleBackspaceLongPress}
        onBiometric={handleBiometricPress}
        biometricAvailable={biometricAvailable}
        disabled={isKeypadDisabled}
        themeMode={themeMode}
      />

      <TouchableOpacity
        testID="lock-forgot-pin"
        accessibilityRole="button"
        accessibilityLabel="Esqueci o PIN"
        onPress={handleOpenForgotPin}
        style={styles.forgotButton}
      >
        <Text style={styles.forgotText}>Esqueci o PIN</Text>
      </TouchableOpacity>

      {/* Esqueci o PIN com digital ativa: recuperar pela digital ou apagar os dados */}
      <AnimatedModalSheet
        visible={isForgotModalVisible && canRecoverWithBiometrics}
        onClose={() => setIsForgotModalVisible(false)}
        themeMode={themeMode}
        testID="forgot-pin-sheet"
      >
        <View testID="forgot-pin-dialog" style={styles.sheetBody}>
          <View style={[styles.sheetIcon, { backgroundColor: colors.primary + '1F' }]}>
            <MaterialIcons name="fingerprint" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.sheetTitle, { color: fg }]}>Esqueceu o PIN?</Text>
          <Text style={[styles.sheetText, { color: muted }]}>
            Sua digital está ativa. Use-a para entrar e depois troque o PIN em Perfil → Proteção.
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
            <Text style={styles.primaryBtnText}>Usar digital</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setIsForgotModalVisible(false);
              setIsResetSheetVisible(true);
            }}
            style={styles.linkBtn}
          >
            <Text style={[styles.linkText, { color: DANGER_COLOR }]}>Apagar dados e recomeçar</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModalSheet>

      {/* Sem digital: a única saída é apagar os dados locais */}
      <DangerConfirmSheet
        visible={(isForgotModalVisible && !canRecoverWithBiometrics) || isResetSheetVisible}
        onClose={() => {
          setIsForgotModalVisible(false);
          setIsResetSheetVisible(false);
        }}
        onConfirm={handleConfirmReset}
        title="Apagar dados e recomeçar?"
        message="O Celsus guarda tudo só neste aparelho e não tem recuperação em nuvem. Sem o PIN, a saída é apagar os dados locais e configurar o perfil de novo."
        confirmLabel="Apagar tudo"
        themeMode={themeMode}
        testID={canRecoverWithBiometrics ? 'forgot-pin-reset-dialog' : 'forgot-pin-dialog'}
        inputTestID="reset-confirmation-input"
        confirmTestID="confirm-reset-button"
      />
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
  brand: {
    position: 'absolute',
    top: 56,
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.primary,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
    color: '#1A0E08',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily,
    textAlign: 'center',
  },
  lockoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  lockoutTimer: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
    fontFamily: typography.fontFamily,
  },
  forgotButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
    color: colors.primary,
  },
  sheetBody: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
  },
  sheetText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#1A0E08',
    fontWeight: '700',
    fontSize: 15,
    fontFamily: typography.fontFamily,
  },
  linkBtn: {
    paddingVertical: 10,
  },
  linkText: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
});
