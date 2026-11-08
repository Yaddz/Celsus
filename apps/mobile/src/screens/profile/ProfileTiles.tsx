import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View, TextInput, Modal } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoTile, DirectiveButton } from '../../components/ui';
import { PinDots } from '../../components/ui/PinDots';
import { PinKeypad } from '../../components/ui/PinKeypad';
import { bento, BentoVariant, colors, typography } from '../../theme/tokens';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { BackupImportMode, ExportArchiveResult } from '../../services/backupService';
import { authService as defaultAuthService, AuthService } from '../../services/authService';
import { profileRepository as defaultProfileRepository, ProfileRepository } from '../../repositories/profileRepository';
import { sessionStore } from '../../stores/sessionStore';
import { profileStore } from '../../stores/profileStore';
import { resetDatabase } from '../../db/client';
import { LocalWalletSummary, StatusBanner } from './useProfileSettings';

/** Cores de texto de um tile conforme o tema (reaproveita os tokens do bento). */
const useTileColors = (isLight: boolean) => {
  const variant: BentoVariant = isLight ? 'light' : 'dark';
  return { variant, fg: bento.variants[variant].foreground, muted: bento.variants[variant].muted };
};

const SectionTitle: React.FC<{ icon: keyof typeof MaterialIcons.glyphMap; label: string; fg: string }> = ({ icon, label, fg }) => (
  <View style={s.sectionTitleRow}>
    <MaterialIcons name={icon} size={18} color={colors.primary} />
    <Text style={[s.sectionTitle, { color: fg }]}>{label}</Text>
  </View>
);

const formatBRL = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------

export const StatusBannerTile: React.FC<{ banner: StatusBanner; isLight: boolean }> = ({ banner, isLight }) => {
  const { variant, fg, muted } = useTileColors(isLight);
  const icon = banner.type === 'error' ? 'gpp-bad' : banner.type === 'success' ? 'verified-user' : 'info';
  const accent = banner.type === 'error' ? colors.primary : banner.type === 'success' ? '#2E4A44' : colors.tertiary;
  return (
    <BentoTile variant={variant} testID="settings-status-banner" style={{ borderWidth: 1, borderColor: accent }}>
      <View style={s.sectionTitleRow}>
        <MaterialIcons name={icon} size={18} color={accent} />
        <Text style={[s.sectionTitle, { color: fg }]}>{banner.title}</Text>
      </View>
      <Text style={[s.body, { color: muted }]}>{banner.message}</Text>
    </BentoTile>
  );
};

// ---------------------------------------------------------------------------------------------

export interface IdentityTileProps {
  isLight: boolean;
  userName?: string;
  userInitials?: string;
  walletCount: number;
  assetCount: number;
  onClose?: () => void;
}

/** Identidade do usuário e resumo real dos dados no aparelho (sem valores de exemplo). */
export const IdentityTile: React.FC<IdentityTileProps> = ({ isLight, userName, userInitials, walletCount, assetCount, onClose }) => {
  const { variant, fg, muted } = useTileColors(isLight);
  return (
    <BentoTile variant={variant} testID="investor-profile-card">
      <View style={s.identityRow}>
        <View style={[s.avatar, { borderColor: colors.primary }]}>
          {userInitials ? (
            <Text style={[s.avatarText, { color: fg }]}>{userInitials}</Text>
          ) : (
            <MaterialIcons name="person" size={26} color={muted} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {userName ? <Text style={[s.name, { color: fg }]}>{userName}</Text> : null}
          <Text testID="profile-local-summary" style={[s.body, { color: muted }]}>
            {`${walletCount} ${walletCount === 1 ? 'carteira' : 'carteiras'} · ${assetCount} ${assetCount === 1 ? 'ativo' : 'ativos'} neste aparelho`}
          </Text>
        </View>
        {onClose ? (
          <TouchableOpacity
            testID="close-settings-btn"
            accessibilityRole="button"
            accessibilityLabel="Fechar perfil"
            onPress={onClose}
            style={[s.closeBtn, { backgroundColor: isLight ? '#EAE4D7' : '#2A2D30' }]}
          >
            <MaterialIcons name="close" size={20} color={fg} />
          </TouchableOpacity>
        ) : null}
      </View>
    </BentoTile>
  );
};

// ---------------------------------------------------------------------------------------------

export const WalletsTile: React.FC<{ isLight: boolean; isPrivacyMode: boolean; wallets: LocalWalletSummary[] }> = ({
  isLight,
  isPrivacyMode,
  wallets,
}) => {
  const { variant, fg, muted } = useTileColors(isLight);
  return (
    <BentoTile variant={variant} testID="wallets-summary-section">
      <SectionTitle icon="account-balance-wallet" label="CARTEIRAS NESTE APARELHO" fg={fg} />
      {wallets.length === 0 ? (
        <Text testID="wallets-empty-state" style={[s.body, { color: muted }]}>
          Nenhuma carteira cadastrada ainda.
        </Text>
      ) : (
        wallets.map((w, i) => (
          <View
            key={w.id}
            testID={`wallet-summary-${w.id}`}
            style={[s.walletRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: muted + '55' }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: fg }]}>{w.name}</Text>
              <Text style={[s.body, { color: muted }]}>
                {`${w.assetCount} ${w.assetCount === 1 ? 'ativo' : 'ativos'}`}
              </Text>
            </View>
            {w.patrimonyGoal ? (
              <Text style={[s.body, { color: fg }]}>
                {`Meta ${isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatBRL(w.patrimonyGoal)}`}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </BentoTile>
  );
};

// ---------------------------------------------------------------------------------------------

export const AppearanceTile: React.FC<{ isLight: boolean; mode: 'dark' | 'light'; onSelect: (m: 'dark' | 'light') => void }> = ({
  isLight,
  mode,
  onSelect,
}) => {
  const { variant, fg, muted } = useTileColors(isLight);
  const options: Array<{ id: 'dark' | 'light'; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
    { id: 'dark', label: 'Escuro', icon: 'dark-mode' },
    { id: 'light', label: 'Claro', icon: 'light-mode' },
  ];
  return (
    <BentoTile variant={variant} testID="settings-section-personalizacao">
      <SectionTitle icon="tune" label="APARÊNCIA" fg={fg} />
      <View style={s.optionRow}>
        {options.map((o) => {
          const active = mode === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              testID={`theme-option-${o.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(o.id)}
              activeOpacity={0.8}
              style={[s.option, { borderColor: active ? colors.primary : muted + '55' }, active && { backgroundColor: colors.primary + '22' }]}
            >
              <MaterialIcons name={o.icon} size={20} color={active ? colors.primary : muted} />
              <Text style={[s.optionLabel, { color: active ? fg : muted }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </BentoTile>
  );
};

// ---------------------------------------------------------------------------------------------

export interface SecurityTileProps {
  isLight: boolean;
  authService?: AuthService;
  profileRepository?: ProfileRepository;
  isBiometricEnabled?: boolean;
  isAppLocked?: boolean;
  onToggleBiometrics?: (v: boolean) => void;
  onTestBiometrics?: () => void;
}

export const SecurityTile: React.FC<SecurityTileProps> = ({
  isLight,
  authService = defaultAuthService,
  profileRepository = defaultProfileRepository,
}) => {
  const { variant, fg, muted } = useTileColors(isLight);
  const theme = isLight ? 'light' : 'dark';

  const syncHasPin = typeof (authService as any).hasPinSync === 'function' ? (authService as any).hasPinSync() : null;
  const syncBio = typeof (authService as any).isBiometricEnabledSync === 'function' ? (authService as any).isBiometricEnabledSync() : null;
  const syncLock = typeof (authService as any).getAutoLockSecondsSync === 'function' ? (authService as any).getAutoLockSecondsSync() : null;
  const initialName = profileStore.getState().name || '';

  const [hasPin, setHasPin] = React.useState<boolean>(syncHasPin ?? false);
  const [isBioEnabled, setIsBioEnabled] = React.useState<boolean>(syncBio ?? false);
  const [canBio, setCanBio] = React.useState<boolean>(true);
  const [autoLockSeconds, setAutoLockSeconds] = React.useState<number>(syncLock ?? 60);
  const [userName, setUserName] = React.useState<string>(initialName);
  const userNameRef = React.useRef<string>(initialName);

  // Sheet / Modal state for PIN operations
  const [pinMode, setPinMode] = React.useState<'none' | 'create' | 'change' | 'remove'>('none');
  const [pinStep, setPinStep] = React.useState<number>(1);
  const [pinInput, setPinInput] = React.useState<string>('');
  const [firstPin, setFirstPin] = React.useState<string>('');
  const [currentPin, setCurrentPin] = React.useState<string>('');
  const [pinError, setPinError] = React.useState<string | null>(null);

  // Wipe confirmation dialog
  const [isWipeOpen, setIsWipeOpen] = React.useState<boolean>(false);
  const [wipeText, setWipeText] = React.useState<string>('');

  React.useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const p = await authService.hasPin();
        const bio = await authService.isBiometricEnabled();
        const can = await authService.canUseBiometrics();
        const lockSec = await authService.getAutoLockSeconds();
        const prof = await profileRepository.getProfile();
        if (!active) return;
        setHasPin(p);
        setIsBioEnabled((curr) => (curr ? true : bio));
        setCanBio(can);
        setAutoLockSeconds(lockSec);
        setUserName((curr) => (userNameRef.current ? userNameRef.current : prof.name));
      } catch {}
    }
    loadData();
    return () => {
      active = false;
    };
  }, [authService, profileRepository]);

  const handleDigit = async (d: string) => {
    if (pinInput.length >= 6) return;
    const next = pinInput + d;
    setPinInput(next);
    setPinError(null);

    if (next.length === 6) {
      if (pinMode === 'create') {
        if (pinStep === 1) {
          setFirstPin(next);
          setPinInput('');
          setPinStep(2);
        } else if (pinStep === 2) {
          if (next === firstPin) {
            await authService.setPin(next);
            setHasPin(true);
            setPinMode('none');
            setPinInput('');
            setFirstPin('');
          } else {
            setPinError('PINs não coincidem');
            setPinInput('');
            setPinStep(1);
          }
        }
      } else if (pinMode === 'change') {
        if (pinStep === 1) {
          const verify = await authService.verifyPin(next);
          if (verify.ok) {
            setCurrentPin(next);
            setPinInput('');
            setPinStep(2);
          } else {
            setPinError('PIN atual incorreto');
            setPinInput('');
          }
        } else if (pinStep === 2) {
          setFirstPin(next);
          setPinInput('');
          setPinStep(3);
        } else if (pinStep === 3) {
          if (next === firstPin) {
            const res = await authService.changePin(currentPin, next);
            if (res.ok) {
              setPinMode('none');
              setPinInput('');
              setCurrentPin('');
              setFirstPin('');
            } else {
              setPinError('Erro ao alterar PIN');
              setPinInput('');
              setPinStep(2);
            }
          } else {
            setPinError('PINs não coincidem');
            setPinInput('');
            setPinStep(2);
          }
        }
      } else if (pinMode === 'remove') {
        const res = await authService.removePin(next);
        if (res.ok) {
          setHasPin(false);
          setIsBioEnabled(false);
          setPinMode('none');
          setPinInput('');
        } else {
          setPinError('PIN incorreto');
          setPinInput('');
        }
      }
    }
  };

  const handleBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleToggleBio = async (val: boolean) => {
    if (val) {
      const res = await authService.enableBiometrics();
      if (res.success) {
        setIsBioEnabled(true);
      }
    } else {
      await authService.disableBiometrics();
      setIsBioEnabled(false);
    }
  };

  const handleSelectAutolock = async (sec: number) => {
    await authService.setAutoLockSeconds(sec);
    setAutoLockSeconds(sec);
  };

  const handleNameBlur = async () => {
    const clean = (userNameRef.current || userName).trim();
    if (clean.length >= 2) {
      await profileRepository.setProfileName(clean);
      await profileStore.load();
    }
  };

  const handleConfirmWipe = async () => {
    if (wipeText !== 'APAGAR') return;
    await authService.resetAll();
    await profileRepository.setOnboarded(false);
    resetDatabase();
    sessionStore.setStatus('onboarding');
    setIsWipeOpen(false);
    setWipeText('');
  };

  const autolockOptions = [
    { sec: 0, label: 'Imediato' },
    { sec: 30, label: '30 s' },
    { sec: 60, label: '1 min' },
    { sec: 300, label: '5 min' },
  ];

  const getPinSheetTitle = () => {
    if (pinMode === 'create') {
      return pinStep === 1 ? 'Digite seu PIN de 6 dígitos' : 'Confirme seu PIN';
    }
    if (pinMode === 'change') {
      if (pinStep === 1) return 'Digite o PIN atual';
      if (pinStep === 2) return 'Digite o novo PIN';
      return 'Confirme o novo PIN';
    }
    if (pinMode === 'remove') {
      return 'Digite o PIN atual para remover';
    }
    return '';
  };

  return (
    <BentoTile variant={variant} testID="settings-section-seguranca">
      <SectionTitle icon="security" label="SEGURANÇA" fg={fg} />

      {/* Nome de usuário */}
      <View style={{ marginBottom: 14 }}>
        <Text style={[s.rowTitle, { color: fg, marginBottom: 4 }]}>Nome do Perfil</Text>
        <TextInput
          testID="security-name-input"
          value={userName}
          onChangeText={(t) => {
            userNameRef.current = t;
            setUserName(t);
          }}
          onBlur={handleNameBlur}
          placeholder="Seu nome"
          placeholderTextColor={muted}
          style={[
            s.textInput,
            {
              backgroundColor: isLight ? '#EAE4D7' : '#1C1E20',
              color: fg,
              borderColor: muted + '44',
            },
          ]}
        />
      </View>

      {/* Status do PIN */}
      <View style={[s.card, { backgroundColor: isLight ? '#EAE4D7' : '#1C1E20', borderColor: muted + '33' }]}>
        <View style={{ flex: 1 }}>
          <Text testID="security-pin-status" style={[s.rowTitle, { color: fg }]}>
            {hasPin ? 'PIN configurado' : 'Proteja o app com um PIN'}
          </Text>
          <Text style={[s.body, { color: muted }]}>
            {hasPin
              ? 'PIN de 6 dígitos ativo para proteção de acesso.'
              : 'Defina um PIN de 6 dígitos para bloquear o app.'}
          </Text>
        </View>

        {!hasPin ? (
          <DirectiveButton
            testID="security-create-pin"
            label="Criar PIN"
            variant="primary"
            materialIcon="pin"
            onPress={() => {
              setPinMode('create');
              setPinStep(1);
              setPinInput('');
              setPinError(null);
            }}
            themeMode={theme}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <DirectiveButton
              testID="security-change-pin"
              label="Alterar PIN"
              variant="secondary"
              materialIcon="edit"
              onPress={() => {
                setPinMode('change');
                setPinStep(1);
                setPinInput('');
                setPinError(null);
              }}
              themeMode={theme}
            />
            <DirectiveButton
              testID="security-remove-pin"
              label="Remover PIN"
              variant="danger"
              materialIcon="delete"
              onPress={() => {
                setPinMode('remove');
                setPinStep(1);
                setPinInput('');
                setPinError(null);
              }}
              themeMode={theme}
            />
          </View>
        )}
      </View>

      {/* Switch de Biometria */}
      <View style={[s.switchRow, { marginTop: 14 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: hasPin && canBio ? fg : muted }]}>Entrar com digital</Text>
          <Text style={[s.body, { color: muted }]}>
            {!hasPin
              ? 'Crie um PIN primeiro'
              : !canBio
              ? 'Sensor biométrico não disponível'
              : 'Desbloqueie com rapidez usando biometria.'}
          </Text>
        </View>
        <Switch
          testID="security-biometric-switch"
          disabled={!hasPin}
          value={hasPin && isBioEnabled}
          onValueChange={handleToggleBio}
          trackColor={{ false: isLight ? '#D5CFBE' : '#2A2D30', true: colors.secondary }}
          thumbColor={isBioEnabled ? colors.primary : isLight ? '#C5BEB3' : '#8A8C90'}
        />
      </View>

      {/* Seletor Bloquear Após */}
      <View style={{ marginTop: 14 }}>
        <Text style={[s.rowTitle, { color: hasPin ? fg : muted, marginBottom: 6 }]}>Bloquear após</Text>
        {!hasPin && (
          <Text style={[s.body, { color: muted, marginBottom: 4 }]}>Configure um PIN para ativar o bloqueio automático</Text>
        )}
        <View style={s.optionRow}>
          {autolockOptions.map((opt) => {
            const active = autoLockSeconds === opt.sec;
            return (
              <TouchableOpacity
                key={opt.sec}
                testID={`security-autolock-${opt.sec}`}
                disabled={!hasPin}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !hasPin }}
                onPress={() => handleSelectAutolock(opt.sec)}
                style={[
                  s.option,
                  {
                    borderColor: active ? colors.primary : muted + '44',
                    backgroundColor: active ? colors.primary + '22' : 'transparent',
                    opacity: hasPin ? 1 : 0.4,
                  },
                ]}
              >
                <Text style={[s.optionLabel, { color: active ? colors.primary : muted }]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Botão Bloquear Agora */}
      <View style={{ marginTop: 14 }}>
        <DirectiveButton
          testID="security-lock-now"
          disabled={!hasPin}
          label="Bloquear agora"
          variant="secondary"
          materialIcon="lock"
          onPress={() => sessionStore.lock()}
          themeMode={theme}
        />
      </View>

      {/* Ação Destrutiva Apagar Dados */}
      <View style={{ marginTop: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: muted + '44' }}>
        <DirectiveButton
          testID="security-wipe"
          label="Apagar todos os dados"
          variant="danger"
          materialIcon="warning"
          onPress={() => {
            setWipeText('');
            setIsWipeOpen(true);
          }}
          themeMode={theme}
        />
      </View>

      {/* Folha / Modal para digitar PIN */}
      {pinMode !== 'none' && (
        <View testID="security-pin-sheet" style={[s.pinSheetOverlay, { backgroundColor: isLight ? '#F4F1EA' : '#111315' }]}>
          <View style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
            <Text style={[s.sheetTitle, { color: fg }]}>{getPinSheetTitle()}</Text>
            {pinError && <Text style={s.pinErrorText}>{pinError}</Text>}

            <View style={{ marginVertical: 20 }}>
              <PinDots length={6} filled={pinInput.length} error={Boolean(pinError)} />
            </View>

            <PinKeypad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              biometricAvailable={false}
              themeMode={theme}
            />

            <TouchableOpacity
              onPress={() => {
                setPinMode('none');
                setPinInput('');
                setPinError(null);
              }}
              style={s.cancelButton}
            >
              <Text style={[s.body, { color: colors.primary, fontWeight: '700' }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Diálogo de Confirmação de Wipe */}
      {isWipeOpen && (
        <View testID="security-wipe-dialog" style={[s.pinSheetOverlay, { backgroundColor: isLight ? '#F4F1EAEE' : '#111315EE' }]}>
          <View style={[s.card, { width: '100%', maxWidth: 360, backgroundColor: isLight ? '#EAE4D7' : '#1C1E20', borderColor: colors.primary }]}>
            <Text style={[s.sheetTitle, { color: colors.primary, marginBottom: 8 }]}>Apagar todos os dados</Text>
            <Text style={[s.body, { color: fg, marginBottom: 12 }]}>
              Esta ação excluirá permanentemente todas as suas carteiras, transações e configurações locais. Para confirmar, digite APAGAR abaixo:
            </Text>
            <TextInput
              testID="security-wipe-confirm-input"
              value={wipeText}
              onChangeText={setWipeText}
              placeholder="Digite APAGAR"
              placeholderTextColor={muted}
              autoCapitalize="characters"
              style={[
                s.textInput,
                {
                  backgroundColor: isLight ? '#F4F1EA' : '#111315',
                  color: fg,
                  borderColor: muted + '44',
                  marginBottom: 16,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DirectiveButton
                testID="security-wipe-cancel-btn"
                label="Cancelar"
                variant="secondary"
                onPress={() => {
                  setIsWipeOpen(false);
                  setWipeText('');
                }}
                themeMode={theme}
              />
              <DirectiveButton
                testID="security-wipe-confirm-btn"
                label="APAGAR DEFINITIVAMENTE"
                variant="danger"
                disabled={wipeText !== 'APAGAR'}
                onPress={handleConfirmWipe}
                themeMode={theme}
              />
            </View>
          </View>
        </View>
      )}
    </BentoTile>
  );
};

// ---------------------------------------------------------------------------------------------

export interface BackupTileProps {
  isLight: boolean;
  importMode: BackupImportMode;
  onChangeImportMode: (m: BackupImportMode) => void;
  lastExport: ExportArchiveResult | null;
  onExport: () => void;
  onImport: () => void;
  onImportSpreadsheet: () => void;
}

export const BackupTile: React.FC<BackupTileProps> = ({
  isLight,
  importMode,
  onChangeImportMode,
  lastExport,
  onExport,
  onImport,
  onImportSpreadsheet,
}) => {
  const { variant, fg, muted } = useTileColors(isLight);
  const theme = isLight ? 'light' : 'dark';
  const modes: Array<{ id: BackupImportMode; testID: string; title: string; sub: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
    { id: 'MERGE', testID: 'import-mode-merge', title: 'MESCLAR', sub: 'Mantém os dados atuais e inclui só o que for novo', icon: 'merge-type' },
    { id: 'RESTORE', testID: 'import-mode-restore', title: 'RESTAURAR', sub: 'Substitui tudo pelo conteúdo do backup', icon: 'settings-backup-restore' },
  ];
  return (
    <BentoTile variant={variant} testID="settings-section-gestao-dados">
      <SectionTitle icon="folder-zip" label="BACKUP E DADOS" fg={fg} />
      <Text style={[s.body, { color: muted }]}>
        Backup seguro (.celsus.zip) com carteiras, ativos e movimentações. A integridade é verificada antes de importar.
      </Text>

      <View style={{ marginTop: 12 }}>
        <DirectiveButton testID="export-dossier-btn" label="Exportar backup .celsus.zip" variant="primary" materialIcon="file-download" onPress={onExport} themeMode={theme} />
      </View>

      {lastExport ? (
        <View style={[s.manifest, { borderColor: muted + '55' }]}>
          <Text style={[s.rowTitle, { color: fg }]}>{lastExport.fileName}</Text>
          {(['portfolios.csv', 'assets.csv', 'transactions.csv'] as const).map((f) => (
            <Text key={f} style={[s.mono, { color: muted }]}>
              {`${f}: ${lastExport.manifest.files[f].rows} linhas · SHA-256 ${lastExport.manifest.files[f].sha256.slice(0, 16)}…`}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={s.optionRow}>
        {modes.map((m) => {
          const active = importMode === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              testID={m.testID}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              activeOpacity={0.8}
              onPress={() => onChangeImportMode(m.id)}
              style={[s.option, s.modeOption, { borderColor: active ? colors.primary : muted + '55' }, active && { backgroundColor: colors.primary + '22' }]}
            >
              <MaterialIcons name={m.icon} size={18} color={active ? colors.primary : muted} />
              <Text style={[s.optionLabel, { color: active ? fg : muted }]}>{m.title}</Text>
              <Text style={[s.mono, { color: muted, textAlign: 'center' }]}>{m.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 12, gap: 10 }}>
        <DirectiveButton
          testID="import-dossier-btn"
          label={importMode === 'MERGE' ? 'Importar e mesclar dados' : 'Restaurar e substituir dados'}
          variant="secondary"
          materialIcon="file-upload"
          onPress={onImport}
          themeMode={theme}
        />
        <DirectiveButton testID="import-spreadsheet-btn" label="Importar dados da planilha" variant="primary" materialIcon="table-chart" onPress={onImportSpreadsheet} themeMode={theme} />
      </View>
    </BentoTile>
  );
};

const s = StyleSheet.create({
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  body: { fontFamily: typography.fontFamily, fontSize: 12, lineHeight: 18 },
  mono: { fontFamily: typography.fontFamilyMono, fontSize: 10, marginTop: 2 },
  rowTitle: { fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '700' },
  name: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '700' },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '700' },
  closeBtn: { padding: 8, borderRadius: 14 },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionRow: { flexDirection: 'row', gap: bento.gap, marginTop: 6 },
  option: { flex: 1, borderWidth: 1, borderRadius: bento.innerRadius, padding: 12, alignItems: 'center', gap: 6 },
  modeOption: { paddingVertical: 14 },
  optionLabel: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  manifest: { borderWidth: 1, borderRadius: bento.innerRadius, padding: 12, marginTop: 12 },
  card: { borderWidth: 1, borderRadius: bento.innerRadius, padding: 14, marginTop: 8 },
  textInput: { borderWidth: 1, borderRadius: bento.innerRadius, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: typography.fontFamily },
  pinSheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheetTitle: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  pinErrorText: { fontFamily: typography.fontFamily, fontSize: 13, color: colors.primary, textAlign: 'center', marginBottom: 8 },
  cancelButton: { marginTop: 16, padding: 10, alignItems: 'center' },
});
