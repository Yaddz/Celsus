import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography } from '../../theme/tokens';
import { AuthService, authService as defaultAuthService } from '../../services/authService';
import { ProfileRepository, profileRepository as defaultProfileRepository } from '../../repositories/profileRepository';
import { sessionStore } from '../../stores/sessionStore';
import { profileStore } from '../../stores/profileStore';
import { deriveInitials } from '../../domain/profile';
import { PinDots } from '../../components/ui/PinDots';
import { PinKeypad } from '../../components/ui/PinKeypad';

export interface OnboardingFlowProps {
  onComplete?: (action?: 'import_b3' | 'create_wallet' | 'explore') => void;
  isMigration?: boolean;
  authService?: AuthService;
  profileRepository?: ProfileRepository;
  themeMode?: 'dark' | 'light';
}

type OnboardingStep = 'welcome' | 'name' | 'pin' | 'biometric' | 'done';

function resolveSyncIfPossible<T>(val: any): T | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object' || typeof val.then !== 'function') return val as T;

  const util = (globalThis as any)?.__node_util__;
  if (!util || typeof util.inspect !== 'function') return null;

  try {
    const inspected = util.inspect(val);
    if (inspected.includes('<pending>') || inspected.includes('<rejected>')) return null;
    const match = inspected.match(/Promise\s*\{\s*(true|false|\d+)/);
    if (match) {
      if (match[1] === 'true') return true as unknown as T;
      if (match[1] === 'false') return false as unknown as T;
      return Number(match[1]) as unknown as T;
    }
  } catch {
    return null;
  }
  return null;
}

export function isTrivialPin(pin: string): boolean {
  if (pin.length !== 6) return false;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const sequences = [
    '012345', '123456', '234567', '345678', '456789',
    '543210', '654321', '765432', '876543', '987654',
  ];
  return sequences.includes(pin);
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
  isMigration = false,
  authService = defaultAuthService,
  profileRepository = defaultProfileRepository,
  themeMode = 'dark',
}) => {
  const steps: OnboardingStep[] = useMemo(() => {
    return isMigration ? ['name', 'pin', 'biometric'] : ['welcome', 'name', 'pin', 'biometric', 'done'];
  }, [isMigration]);

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const currentStep = steps[currentStepIndex] || 'name';

  // In-flight uncommitted user choices (atomic persistence on finish)
  const [name, setName] = useState<string>('');
  const [pin, setPin] = useState<string | null>(null);
  const [firstPin, setFirstPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [isPinConfirming, setIsPinConfirming] = useState<boolean>(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [biometricFailed, setBiometricFailed] = useState<boolean>(false);

  const isLight = themeMode === 'light';
  const bg = isLight ? '#F4F1EA' : '#111315';
  const fg = isLight ? '#111315' : '#F4F1EA';
  const muted = isLight ? '#7C786E' : '#9E9AA0';
  const cardBg = isLight ? '#EAE4D7' : '#1C1E20';
  const accent = colors.primary;

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 40;
  const liveInitials = deriveInitials(trimmedName);

  const handleNext = useCallback(async () => {
    if (currentStep === 'welcome') {
      setCurrentStepIndex(1);
    } else if (currentStep === 'name') {
      if (!isNameValid) return;
      setCurrentStepIndex((prev) => prev + 1);
    }
  }, [currentStep, isNameValid]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      if (currentStep === 'pin' && isPinConfirming) {
        setIsPinConfirming(false);
        setConfirmPin('');
        setPinError(null);
        return;
      }
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [currentStepIndex, currentStep, isPinConfirming]);

  // Atomic completion & unlock
  const handleFinish = useCallback(
    (action?: 'import_b3' | 'create_wallet' | 'explore') => {
      profileRepository.setProfileName(trimmedName);
      profileRepository.setOnboarded(true);
      profileStore.setName(trimmedName);
      profileStore.setOnboarded(true);

      if (pin) {
        authService.setPin(pin);
      }

      sessionStore.unlock();
      onComplete?.(action);
    },
    [authService, onComplete, pin, profileRepository, trimmedName]
  );

  // PIN Keypad Handlers
  const handleDigit = useCallback(
    async (digit: string) => {
      setPinError(null);
      if (!isPinConfirming) {
        if (firstPin.length < 6) {
          const next = firstPin + digit;
          setFirstPin(next);
          if (next.length === 6) {
            // First 6 digits entered -> switch to confirmation sub-step
            setIsPinConfirming(true);
          }
        }
      } else {
        if (confirmPin.length < 6) {
          const next = confirmPin + digit;
          setConfirmPin(next);
          if (next.length === 6) {
            if (next === firstPin) {
              setPin(next);
              const syncBio = resolveSyncIfPossible<boolean>(authService.canUseBiometrics());
              const canBio = syncBio !== null ? syncBio : await authService.canUseBiometrics();
              if (canBio) {
                // Advance to Biometric Step
                setCurrentStepIndex((prev) => prev + 1);
              } else {
                // Skip Biometrics automatically
                if (isMigration) {
                  // Migration ends after PIN/Bio without Done step
                  await profileStore.setName(trimmedName);
                  await profileStore.setOnboarded(true);
                  await profileRepository.setProfileName(trimmedName);
                  await profileRepository.setOnboarded(true);
                  await authService.setPin(next);
                  sessionStore.unlock();
                  onComplete?.('explore');
                } else {
                  // Advance to Done step
                  const doneIndex = steps.indexOf('done');
                  if (doneIndex !== -1) setCurrentStepIndex(doneIndex);
                }
              }
            } else {
              // Mismatch -> reset with error message
              setPinError('Os PINs não conferem. Tente novamente.');
              setIsPinConfirming(false);
              setFirstPin('');
              setConfirmPin('');
            }
          }
        }
      }
    },
    [authService, confirmPin, firstPin, isMigration, isPinConfirming, onComplete, profileRepository, steps, trimmedName]
  );

  const handleBackspace = useCallback(() => {
    setPinError(null);
    if (!isPinConfirming) {
      setFirstPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  }, [isPinConfirming]);

  const handleBackspaceLongPress = useCallback(() => {
    setPinError(null);
    if (!isPinConfirming) {
      setFirstPin('');
    } else {
      setConfirmPin('');
    }
  }, [isPinConfirming]);

  const handleSkipPin = useCallback(() => {
    setPin(null);
    if (isMigration) {
      handleFinish('explore');
    } else {
      const doneIndex = steps.indexOf('done');
      if (doneIndex !== -1) setCurrentStepIndex(doneIndex);
    }
  }, [handleFinish, isMigration, steps]);

  // Biometric Handlers
  const handleEnableBiometrics = useCallback(async () => {
    try {
      if (pin && !(await authService.hasPin())) {
        await authService.setPin(pin);
      }
      const res = await authService.enableBiometrics();
      if (res && res.success) {
        setBiometricEnabled(true);
        if (isMigration) {
          handleFinish('explore');
        } else {
          const doneIndex = steps.indexOf('done');
          if (doneIndex !== -1) setCurrentStepIndex(doneIndex);
        }
      } else {
        setBiometricFailed(true);
      }
    } catch {
      setBiometricFailed(true);
    }
  }, [authService, handleFinish, isMigration, pin, steps]);

  const handleSkipBiometrics = useCallback(() => {
    setBiometricEnabled(false);
    if (isMigration) {
      handleFinish('explore');
    } else {
      const doneIndex = steps.indexOf('done');
      if (doneIndex !== -1) setCurrentStepIndex(doneIndex);
    }
  }, [handleFinish, isMigration, steps]);

  const hasTrivialWarning = firstPin.length === 6 && isTrivialPin(firstPin);

  return (
    <View testID="onboarding-screen" style={[styles.root, { backgroundColor: bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Top Bar: Back Button & Progress Dots */}
        <View style={styles.topBar}>
        <View style={styles.backSlot}>
          {currentStepIndex > 0 && currentStep !== 'done' && (
            <TouchableOpacity
              testID="onboarding-back"
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={handleBack}
              style={styles.backButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={fg} />
            </TouchableOpacity>
          )}
        </View>

        <View testID="onboarding-progress" style={styles.progressRow}>
          {steps.map((s, idx) => (
            <View
              key={s}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    idx <= currentStepIndex ? accent : isLight ? '#D5CAA8' : '#33363A',
                  width: idx === currentStepIndex ? 16 : 8,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.backSlot} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: WELCOME */}
          {currentStep === 'welcome' && (
            <View style={styles.stepContainer}>
              <View style={styles.welcomeHero}>
                <View style={[styles.logoBadge, { backgroundColor: cardBg, borderColor: accent }]}>
                  <MaterialIcons name="account-balance-wallet" size={40} color={accent} />
                </View>
                <Text style={[styles.title, { color: fg }]}>Celsus</Text>
                <Text style={[styles.subtitle, { color: muted }]}>
                  Seu patrimônio, consolidado de forma local e soberana.
                </Text>
              </View>

              <View style={styles.benefitsList}>
                <View style={[styles.benefitCard, { backgroundColor: cardBg }]}>
                  <MaterialIcons name="security" size={24} color={accent} />
                  <View style={styles.benefitTextCol}>
                    <Text style={[styles.benefitTitle, { color: fg }]}>100% local e privado</Text>
                    <Text style={[styles.benefitDesc, { color: muted }]}>
                      Seus dados financeiros não saem do seu dispositivo.
                    </Text>
                  </View>
                </View>

                <View style={[styles.benefitCard, { backgroundColor: cardBg }]}>
                  <MaterialIcons name="pie-chart" size={24} color={accent} />
                  <View style={styles.benefitTextCol}>
                    <Text style={[styles.benefitTitle, { color: fg }]}>Metas em dois níveis</Text>
                    <Text style={[styles.benefitDesc, { color: muted }]}>
                      Equilíbrio entre classes de ativos e ativos individuais.
                    </Text>
                  </View>
                </View>

                <View style={[styles.benefitCard, { backgroundColor: cardBg }]}>
                  <MaterialIcons name="trending-up" size={24} color={accent} />
                  <View style={styles.benefitTextCol}>
                    <Text style={[styles.benefitTitle, { color: fg }]}>Aportes inteligentes</Text>
                    <Text style={[styles.benefitDesc, { color: muted }]}>
                      Algoritmo matemático direciona onde investir para rebalancear.
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                testID="onboarding-next"
                accessibilityRole="button"
                onPress={handleNext}
                style={[styles.primaryButton, { backgroundColor: accent }]}
              >
                <Text style={styles.primaryButtonText}>Começar</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: NAME */}
          {currentStep === 'name' && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <Text style={[styles.title, { color: fg }]}>
                  {isMigration ? 'Complete seu perfil' : 'Como podemos te chamar?'}
                </Text>
                <Text style={[styles.subtitle, { color: muted }]}>
                  Seu nome será usado para identificar suas carteiras e relatórios.
                </Text>
              </View>

              {/* Live Avatar Preview */}
              <View testID="onboarding-avatar-preview" style={[styles.avatarPreview, { borderColor: accent, backgroundColor: cardBg }]}>
                <Text testID="onboarding-avatar-initials" style={[styles.avatarInitials, { color: accent }]}>
                  {liveInitials || '•'}
                </Text>
              </View>

              <TextInput
                testID="onboarding-name-input"
                style={[
                  styles.nameInput,
                  {
                    color: fg,
                    backgroundColor: cardBg,
                    borderColor: isNameValid ? accent : isLight ? '#D5CAA8' : '#33363A',
                  },
                ]}
                placeholder="Seu nome ou apelido"
                placeholderTextColor={muted}
                value={name}
                onChangeText={setName}
                maxLength={40}
                autoFocus
              />

              <TouchableOpacity
                testID="onboarding-next"
                accessibilityRole="button"
                disabled={!isNameValid}
                onPress={handleNext}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: accent,
                    opacity: isNameValid ? 1 : 0.4,
                  },
                ]}
              >
                <Text style={styles.primaryButtonText}>Continuar</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3: PIN */}
          {currentStep === 'pin' && (
            <View style={[styles.stepContainer, { alignItems: 'center' }]}>
              <View style={[styles.stepHeader, { alignItems: 'center' }]}>
                <Text style={[styles.title, { color: fg }]}>
                  {isPinConfirming ? 'Confirme seu PIN' : 'Crie seu PIN de 6 dígitos'}
                </Text>
                <Text
                  testID="onboarding-pin-hint"
                  style={[styles.subtitle, { color: pinError ? colors.deficit : muted, textAlign: 'center' }]}
                >
                  {pinError || 'Você usará este PIN para abrir o app com segurança.'}
                </Text>

                {hasTrivialWarning && (
                  <Text testID="onboarding-pin-warning" style={styles.warningText}>
                    Aviso: este PIN é sequencial ou trivial (fácil de adivinhar).
                  </Text>
                )}
              </View>

              <PinDots
                length={6}
                filled={isPinConfirming ? confirmPin.length : firstPin.length}
                error={Boolean(pinError)}
              />

              <PinKeypad
                onDigit={handleDigit}
                onBackspace={handleBackspace}
                onBackspaceLongPress={handleBackspaceLongPress}
                biometricAvailable={false}
              />

              <TouchableOpacity
                testID="onboarding-pin-skip"
                accessibilityRole="button"
                onPress={handleSkipPin}
                style={styles.skipButton}
              >
                <Text style={[styles.skipButtonText, { color: muted }]}>Agora não (sem PIN)</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 4: BIOMETRIC */}
          {currentStep === 'biometric' && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <Text style={[styles.title, { color: fg }]}>Entrar com biometria</Text>
                <Text style={[styles.subtitle, { color: muted }]}>
                  Use sua digital ou reconhecimento facial para abrir o Celsus rapidamente.
                </Text>
              </View>

              <View style={[styles.bioCard, { backgroundColor: cardBg }]}>
                <MaterialIcons name="fingerprint" size={64} color={accent} />
                <Text style={[styles.bioCardTitle, { color: fg }]}>Autenticação Biométrica</Text>
                <Text style={[styles.bioCardBody, { color: muted }]}>
                  Seu PIN continua funcionando como alternativa segura se a biometria falhar.
                </Text>
                {biometricFailed && (
                  <Text style={[styles.warningText, { marginTop: 8 }]}>
                    Não foi possível validar a biometria. Você pode tentar novamente ou pular.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                testID="onboarding-biometric-enable"
                accessibilityRole="button"
                onPress={handleEnableBiometrics}
                style={[styles.primaryButton, { backgroundColor: accent, marginBottom: 12 }]}
              >
                <Text style={styles.primaryButtonText}>Ativar biometria</Text>
                <MaterialIcons name="fingerprint" size={20} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                testID="onboarding-biometric-skip"
                accessibilityRole="button"
                onPress={handleSkipBiometrics}
                style={styles.skipButton}
              >
                <Text style={[styles.skipButtonText, { color: muted }]}>Agora não</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 5: DONE */}
          {currentStep === 'done' && (
            <View style={styles.stepContainer}>
              <View style={styles.stepHeader}>
                <View style={[styles.doneBadge, { backgroundColor: cardBg }]}>
                  <MaterialIcons name="check-circle" size={54} color={accent} />
                </View>
                <Text style={[styles.title, { color: fg }]}>
                  Tudo certo, {trimmedName}!
                </Text>
                <Text style={[styles.subtitle, { color: muted }]}>
                  Como você gostaria de começar no Celsus?
                </Text>
              </View>

              <View style={styles.actionsList}>
                <TouchableOpacity
                  testID="onboarding-done-import"
                  accessibilityRole="button"
                  onPress={() => handleFinish('import_b3')}
                  style={[styles.actionCard, { backgroundColor: cardBg, borderColor: accent }]}
                >
                  <MaterialIcons name="file-upload" size={28} color={accent} />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: fg }]}>Importar extrato da B3</Text>
                    <Text style={[styles.actionDesc, { color: muted }]}>
                      Carregue seus ativos e histórico diretamente da B3.
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  testID="onboarding-done-create-wallet"
                  accessibilityRole="button"
                  onPress={() => handleFinish('create_wallet')}
                  style={[styles.actionCard, { backgroundColor: cardBg }]}
                >
                  <MaterialIcons name="account-balance-wallet" size={28} color={accent} />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: fg }]}>Criar minha primeira carteira</Text>
                    <Text style={[styles.actionDesc, { color: muted }]}>
                      Configure suas metas e adicione seus investimentos manualmente.
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  testID="onboarding-done-explore"
                  accessibilityRole="button"
                  onPress={() => handleFinish('explore')}
                  style={[styles.actionCard, { backgroundColor: cardBg }]}
                >
                  <MaterialIcons name="explore" size={28} color={accent} />
                  <View style={styles.actionTextCol}>
                    <Text style={[styles.actionTitle, { color: fg }]}>Explorar o app</Text>
                    <Text style={[styles.actionDesc, { color: muted }]}>
                      Conheça o simulador, ranking e recursos do sistema.
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={muted} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backSlot: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backButton: {
    padding: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  stepContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  welcomeHero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: typography.fontFamily,
  },
  benefitsList: {
    gap: 12,
    marginBottom: 32,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  benefitTextCol: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: 13,
    fontFamily: typography.fontFamily,
    lineHeight: 18,
  },
  stepHeader: {
    marginBottom: 24,
  },
  avatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: typography.fontFamily,
  },
  nameInput: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: typography.fontFamily,
    marginBottom: 24,
  },
  warningText: {
    color: '#D4A017',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: typography.fontFamily,
  },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: typography.fontFamily,
  },
  bioCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 32,
    gap: 10,
  },
  bioCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
  },
  bioCardBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: typography.fontFamily,
  },
  doneBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionsList: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 14,
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: typography.fontFamily,
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 13,
    fontFamily: typography.fontFamily,
    lineHeight: 18,
  },
});
