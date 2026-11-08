import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoTile } from '../../components/ui';
import { PinDots } from '../../components/ui/PinDots';
import { PinKeypad } from '../../components/ui/PinKeypad';
import { AnimatedModalSheet } from '../../components/ui/AnimatedModalSheet';
import { CircleIconButton } from '../../components/ui/CircleIconButton';
import { DangerConfirmSheet, DANGER_COLOR } from '../../components/ui/DangerConfirmSheet';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { TextField } from '../../components/ui/TextField';
import { bento, BentoVariant, colors, typography } from '../../theme/tokens';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { BackupImportMode, ExportArchiveResult } from '../../services/backupService';
import { authService as defaultAuthService, AuthService } from '../../services/authService';
import { profileRepository as defaultProfileRepository, ProfileRepository } from '../../repositories/profileRepository';
import { sessionStore } from '../../stores/sessionStore';
import { profileStore } from '../../stores/profileStore';
import { resetDatabase } from '../../db/client';
import { LocalWalletSummary, StatusBanner } from './useProfileSettings';

// ---------------------------------------------------------------------------------------------
// Cores e peças compartilhadas do Perfil
// ---------------------------------------------------------------------------------------------

/** Paleta do Perfil derivada dos tokens do bento (cartão, texto, apoio, rebaixado e divisória). */
const usePalette = (isLight: boolean) => {
  const variant: BentoVariant = isLight ? 'light' : 'dark';
  return {
    variant,
    theme: (isLight ? 'light' : 'dark') as 'light' | 'dark',
    fg: bento.variants[variant].foreground,
    muted: bento.variants[variant].muted,
    inset: isLight ? '#F6F2EA' : '#161819',
    divider: isLight ? '#ECE6DA' : '#2A2D30',
  };
};

const formatBRL = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const GroupLabel: React.FC<{ label: string; isLight: boolean; testID?: string }> = ({ label, isLight, testID }) => (
  <Text testID={testID} accessibilityRole="header" style={[s.groupLabel, { color: usePalette(isLight).muted }]}>
    {label}
  </Text>
);

interface ListRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  isLight: boolean;
  first?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  titleTestID?: string;
  subtitleTestID?: string;
  right?: React.ReactNode;
  value?: string;
  expanded?: boolean;
  children?: React.ReactNode;
}

/** Linha de lista do Perfil: ícone em pastilha, título, subtítulo, valor e chevron. */
const ListRow: React.FC<ListRowProps> = ({
  icon,
  title,
  subtitle,
  isLight,
  first,
  danger,
  disabled,
  onPress,
  testID,
  titleTestID,
  subtitleTestID,
  right,
  value,
  expanded,
  children,
}) => {
  const p = usePalette(isLight);
  const tint = danger ? DANGER_COLOR : colors.primary;
  const row = (
    <View style={[s.listRow, disabled && { opacity: 0.45 }]}>
      <View style={[s.iconChip, { backgroundColor: tint + (isLight ? '1A' : '24') }]}>
        <MaterialIcons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text testID={titleTestID} style={[s.rowTitle, { color: danger ? DANGER_COLOR : p.fg }]}>{title}</Text>
        {subtitle ? (
          <Text testID={subtitleTestID} style={[s.rowSubtitle, { color: p.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (
        <>
          {value ? <Text style={[s.rowValue, { color: p.muted }]} numberOfLines={1}>{value}</Text> : null}
          {onPress ? (
            <MaterialIcons name={expanded ? 'expand-less' : 'chevron-right'} size={22} color={p.muted} />
          ) : null}
        </>
      )}
    </View>
  );
  return (
    <View style={!first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }}>
      {onPress ? (
        <TouchableOpacity
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ disabled: !!disabled, expanded }}
          disabled={disabled}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {row}
        </TouchableOpacity>
      ) : (
        <View testID={testID}>{row}</View>
      )}
      {children}
    </View>
  );
};

/** Linha que abre um painel rebaixado logo abaixo (carteiras, aparência, horários, backup…). */
const ExpandableRow: React.FC<
  Omit<ListRowProps, 'expanded' | 'onPress' | 'children'> & { content: React.ReactNode; rowTestID?: string }
> = ({ content, rowTestID, isLight, ...rest }) => {
  const [open, setOpen] = React.useState(false);
  const p = usePalette(isLight);
  return (
    <ListRow {...rest} isLight={isLight} testID={rowTestID} expanded={open} onPress={() => setOpen((o) => !o)}>
      {open ? <View style={[s.panel, { backgroundColor: p.inset }]}>{content}</View> : null}
    </ListRow>
  );
};

/** Linha de ação dentro de um painel (ícone, rótulo, chevron). */
const PanelAction: React.FC<{
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  isLight: boolean;
  testID?: string;
  first?: boolean;
  danger?: boolean;
}> = ({ icon, label, onPress, isLight, testID, first, danger }) => {
  const p = usePalette(isLight);
  const tint = danger ? DANGER_COLOR : colors.primary;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.7}
      style={[s.panelAction, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }]}
    >
      <MaterialIcons name={icon} size={18} color={tint} />
      <Text style={[s.panelActionText, { color: danger ? DANGER_COLOR : p.fg }]}>{label}</Text>
      <MaterialIcons name="chevron-right" size={20} color={p.muted} />
    </TouchableOpacity>
  );
};

const appSwitch = (isLight: boolean, value: boolean) => ({
  trackColor: { false: isLight ? '#D5CFBE' : '#2A2D30', true: colors.primary + '88' },
  thumbColor: value ? colors.primary : isLight ? '#FFFFFF' : '#8A8C90',
});

// ---------------------------------------------------------------------------------------------

export const StatusBannerTile: React.FC<{ banner: StatusBanner; isLight: boolean }> = ({ banner, isLight }) => {
  const p = usePalette(isLight);
  const icon = banner.type === 'error' ? 'error-outline' : banner.type === 'success' ? 'check-circle-outline' : 'info-outline';
  const accent = banner.type === 'error' ? DANGER_COLOR : banner.type === 'success' ? '#3F8F6B' : colors.primary;
  return (
    <BentoTile variant={p.variant} testID="settings-status-banner" style={[s.groupCard, { flexDirection: 'row', gap: 12, padding: 14 }]}>
      <MaterialIcons name={icon} size={20} color={accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowTitle, { color: p.fg }]}>{banner.title}</Text>
        <Text style={[s.rowSubtitle, { color: p.muted }]}>{banner.message}</Text>
      </View>
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
  /** Mostra o botão voltar no topo (mesmo botão redondo do header das outras telas). */
  onClose?: () => void;
  /** Estado de proteção exibido como chips sob o nome (opcional). */
  hasPin?: boolean;
  biometricEnabled?: boolean;
}

const StatusChip: React.FC<{ testID: string; icon: keyof typeof MaterialIcons.glyphMap; label: string; active: boolean; isLight: boolean }> = ({
  testID,
  icon,
  label,
  active,
  isLight,
}) => {
  const p = usePalette(isLight);
  return (
    <View testID={testID} style={[s.chip, { backgroundColor: isLight ? '#FFFFFF' : '#1C1E20', borderColor: p.divider }]}>
      <MaterialIcons name={icon} size={14} color={active ? colors.primary : p.muted} />
      <Text style={[s.chipText, { color: active ? p.fg : p.muted }]}>{label}</Text>
    </View>
  );
};

/** Topo do Perfil: voltar, avatar, nome, resumo real dos dados e chips de proteção. Sem cartão. */
export const IdentityTile: React.FC<IdentityTileProps> = ({
  isLight,
  userName,
  userInitials,
  walletCount,
  assetCount,
  onClose,
  hasPin,
  biometricEnabled,
}) => {
  const p = usePalette(isLight);
  return (
    <View testID="investor-profile-card">
      {onClose ? (
        <View style={s.topBar}>
          <CircleIconButton
            testID="close-settings-btn"
            icon="arrow-back"
            accessibilityLabel="Voltar"
            onPress={onClose}
            themeMode={p.theme}
          />
        </View>
      ) : null}
      <View style={s.heroCol}>
        <View style={[s.avatarHero, { backgroundColor: colors.primary }]}>
          {userInitials ? (
            <Text style={s.avatarHeroText}>{userInitials}</Text>
          ) : (
            <MaterialIcons name="person" size={34} color="#1A0E08" />
          )}
        </View>
        {userName ? <Text style={[s.name, { color: p.fg }]}>{userName}</Text> : null}
        <Text testID="profile-local-summary" style={[s.rowSubtitle, { color: p.muted, textAlign: 'center' }]}>
          {`${walletCount} ${walletCount === 1 ? 'carteira' : 'carteiras'} · ${assetCount} ${assetCount === 1 ? 'ativo' : 'ativos'} neste aparelho`}
        </Text>
        {hasPin !== undefined ? (
          <View style={s.chipRow}>
            <StatusChip testID="profile-chip-pin" icon="lock-outline" label={hasPin ? 'PIN ativo' : 'Sem PIN'} active={hasPin} isLight={isLight} />
            {hasPin ? (
              <StatusChip
                testID="profile-chip-biometric"
                icon="fingerprint"
                label={biometricEnabled ? 'Digital' : 'Sem digital'}
                active={!!biometricEnabled}
                isLight={isLight}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------------------------

export const WalletsTile: React.FC<{ isLight: boolean; isPrivacyMode: boolean; wallets: LocalWalletSummary[]; first?: boolean }> = ({
  isLight,
  isPrivacyMode,
  wallets,
  first,
}) => {
  const p = usePalette(isLight);
  return (
    <View testID="wallets-summary-section">
      <ExpandableRow
        icon="account-balance-wallet"
        title="Carteiras"
        value={String(wallets.length)}
        isLight={isLight}
        first={first}
        rowTestID="wallets-row"
        content={
          wallets.length === 0 ? (
            <Text testID="wallets-empty-state" style={[s.rowSubtitle, { color: p.muted, paddingVertical: 4 }]}>
              Nenhuma carteira cadastrada ainda.
            </Text>
          ) : (
            wallets.map((w, i) => (
              <View
                key={w.id}
                testID={`wallet-summary-${w.id}`}
                style={[s.walletRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.panelActionText, { color: p.fg }]}>{w.name}</Text>
                  <Text style={[s.rowSubtitle, { color: p.muted }]}>{`${w.assetCount} ${w.assetCount === 1 ? 'ativo' : 'ativos'}`}</Text>
                </View>
                {w.patrimonyGoal ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.caption, { color: p.muted }]}>Meta</Text>
                    <Text style={[s.panelActionText, { color: p.fg }]}>
                      {isPrivacyMode ? PRIVACY_CURRENCY_MASK : formatBRL(w.patrimonyGoal)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ))
          )
        }
      />
    </View>
  );
};

// ---------------------------------------------------------------------------------------------

export const AppearanceTile: React.FC<{ isLight: boolean; mode: 'dark' | 'light'; onSelect: (m: 'dark' | 'light') => void }> = ({
  isLight,
  mode,
  onSelect,
}) => (
  <View testID="settings-section-personalizacao">
    <ExpandableRow
      icon="palette"
      title="Aparência"
      value={mode === 'dark' ? 'Escuro' : 'Claro'}
      isLight={isLight}
      rowTestID="appearance-row"
      content={
        <SegmentedControl
          value={mode}
          onChange={onSelect}
          themeMode={isLight ? 'light' : 'dark'}
          options={[
            { id: 'dark', label: 'Escuro', icon: 'dark-mode', testID: 'theme-option-dark' },
            { id: 'light', label: 'Claro', icon: 'light-mode', testID: 'theme-option-light' },
          ]}
        />
      }
    />
  </View>
);

export const PrivacyRow: React.FC<{ isLight: boolean; enabled: boolean; onToggle: (v: boolean) => void }> = ({ isLight, enabled, onToggle }) => (
  <ListRow
    icon={enabled ? 'visibility-off' : 'visibility'}
    title="Modo privacidade"
    subtitle="Oculta os valores em reais"
    isLight={isLight}
    right={<Switch testID="privacy-mode-switch" value={enabled} onValueChange={onToggle} {...appSwitch(isLight, enabled)} />}
  />
);

// ---------------------------------------------------------------------------------------------

/** Nome do perfil: linha com o nome atual que abre o campo de edição (salva ao sair do campo). */
export const ProfileNameRow: React.FC<{
  isLight: boolean;
  profileRepository?: ProfileRepository;
  first?: boolean;
}> = ({ isLight, profileRepository = defaultProfileRepository, first }) => {
  const initialName = profileStore.getState().name || '';
  const [userName, setUserName] = React.useState<string>(initialName);
  const userNameRef = React.useRef<string>(initialName);
  const lastSavedRef = React.useRef<string>(initialName.trim());
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let active = true;
    profileRepository
      .getProfile()
      .then((prof) => {
        if (!active || userNameRef.current) return;
        userNameRef.current = prof.name;
        lastSavedRef.current = prof.name.trim();
        setUserName(prof.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profileRepository]);

  // Salva sozinho: ao parar de digitar (0,6 s), ao sair do campo e ao fechar a linha/tela. Antes só
  // salvava no blur, que não acontece quando o campo some (fechar a linha ou voltar).

  const save = React.useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const clean = userNameRef.current.trim();
    if (clean.length < 2 || clean === lastSavedRef.current) return;
    lastSavedRef.current = clean;
    await profileRepository.setProfileName(clean);
    await profileStore.load();
  }, [profileRepository]);

  React.useEffect(
    () => () => {
      if (timerRef.current) save().catch(() => {});
    },
    [save]
  );

  const handleChange = (t: string) => {
    userNameRef.current = t;
    setUserName(t);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save().catch(() => {});
    }, 600);
  };

  return (
    <ExpandableRow
      icon="person-outline"
      title="Nome do perfil"
      value={userName || undefined}
      isLight={isLight}
      first={first}
      rowTestID="security-name-row"
      content={
        <TextField
          testID="security-name-input"
          value={userName}
          onChangeText={handleChange}
          onBlur={() => {
            save().catch(() => {});
          }}
          onSubmitEditing={() => {
            save().catch(() => {});
          }}
          returnKeyType="done"
          autoCapitalize="words"
          placeholder="Seu nome"
          helper="Entre 2 e 40 caracteres. Salva automaticamente."
          maxLength={40}
          compact
          themeMode={isLight ? 'light' : 'dark'}
        />
      }
    />
  );
};

// ---------------------------------------------------------------------------------------------

/** "Apagar todos os dados": linha vermelha que abre a confirmação em bottom sheet. */
export const WipeDataRow: React.FC<{
  isLight: boolean;
  authService?: AuthService;
  profileRepository?: ProfileRepository;
  first?: boolean;
}> = ({ isLight, authService = defaultAuthService, profileRepository = defaultProfileRepository, first }) => {
  const [open, setOpen] = React.useState(false);

  const handleConfirm = async () => {
    await authService.resetAll();
    await profileRepository.setOnboarded(false);
    resetDatabase();
    profileStore.reset();
    sessionStore.setStatus('onboarding');
    setOpen(false);
  };

  return (
    <View>
      <ListRow
        icon="delete-outline"
        isLight={isLight}
        first={first}
        danger
        testID="security-wipe"
        title="Apagar todos os dados"
        onPress={() => setOpen(true)}
      />
      <DangerConfirmSheet
        visible={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Apagar todos os dados?"
        message="Carteiras, movimentações, proventos e configurações deste aparelho serão excluídos para sempre. Faça um backup antes, se quiser guardar uma cópia."
        confirmLabel="Apagar tudo"
        themeMode={isLight ? 'light' : 'dark'}
        testID="security-wipe-dialog"
        inputTestID="security-wipe-confirm-input"
        confirmTestID="security-wipe-confirm-btn"
        cancelTestID="security-wipe-cancel-btn"
      />
    </View>
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
  /** Exibe a linha 'Apagar todos os dados' dentro da Segurança (o Perfil a coloca em Dados). */
  showWipe?: boolean;
  /** Exibe a linha de nome dentro da Segurança (o Perfil a coloca em Conta). */
  showName?: boolean;
  /** Notifica o Perfil quando o estado de PIN/digital muda (chips do topo). */
  onStatusChange?: (status: { hasPin: boolean; biometricEnabled: boolean }) => void;
}

const AUTOLOCK_OPTIONS = [
  { id: 0, label: 'Imediato', testID: 'security-autolock-0' },
  { id: 30, label: '30 s', testID: 'security-autolock-30' },
  { id: 60, label: '1 min', testID: 'security-autolock-60' },
  { id: 300, label: '5 min', testID: 'security-autolock-300' },
];

export const SecurityTile: React.FC<SecurityTileProps> = ({
  isLight,
  authService = defaultAuthService,
  profileRepository = defaultProfileRepository,
  onToggleBiometrics,
  onStatusChange,
  showWipe = true,
  showName = true,
}) => {
  const p = usePalette(isLight);

  const syncHasPin = typeof (authService as any).hasPinSync === 'function' ? (authService as any).hasPinSync() : null;
  const syncBio = typeof (authService as any).isBiometricEnabledSync === 'function' ? (authService as any).isBiometricEnabledSync() : null;
  const syncLock = typeof (authService as any).getAutoLockSecondsSync === 'function' ? (authService as any).getAutoLockSecondsSync() : null;

  const [hasPin, setHasPin] = React.useState<boolean>(syncHasPin ?? false);
  const [isBioEnabled, setIsBioEnabled] = React.useState<boolean>(syncBio ?? false);
  const [canBio, setCanBio] = React.useState<boolean>(true);
  const [autoLockSeconds, setAutoLockSeconds] = React.useState<number>(syncLock ?? 60);

  // Sheet de PIN (criar / alterar / remover)
  const [pinMode, setPinMode] = React.useState<'none' | 'create' | 'change' | 'remove'>('none');
  const [pinStep, setPinStep] = React.useState<number>(1);
  const [pinInput, setPinInput] = React.useState<string>('');
  const [firstPin, setFirstPin] = React.useState<string>('');
  const [currentPin, setCurrentPin] = React.useState<string>('');
  const [pinError, setPinError] = React.useState<string | null>(null);

  React.useEffect(() => {
    onStatusChange?.({ hasPin, biometricEnabled: hasPin && isBioEnabled });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin, isBioEnabled]);

  React.useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const pin = await authService.hasPin();
        const bio = await authService.isBiometricEnabled();
        const can = await authService.canUseBiometrics();
        const lockSec = await authService.getAutoLockSeconds();
        if (!active) return;
        setHasPin(pin);
        setIsBioEnabled((curr) => (curr ? true : bio));
        setCanBio(can);
        setAutoLockSeconds(lockSec);
      } catch {}
    }
    loadData();
    return () => {
      active = false;
    };
  }, [authService]);

  const openPin = (mode: 'create' | 'change' | 'remove') => {
    setPinMode(mode);
    setPinStep(1);
    setPinInput('');
    setFirstPin('');
    setCurrentPin('');
    setPinError(null);
  };

  const closePin = () => {
    setPinMode('none');
    setPinInput('');
    setPinError(null);
  };

  const handleDigit = async (d: string) => {
    if (pinInput.length >= 6) return;
    const next = pinInput + d;
    setPinInput(next);
    setPinError(null);

    if (next.length < 6) return;
    if (pinMode === 'create') {
      if (pinStep === 1) {
        setFirstPin(next);
        setPinInput('');
        setPinStep(2);
      } else if (next === firstPin) {
        await authService.setPin(next);
        setHasPin(true);
        closePin();
        setFirstPin('');
      } else {
        setPinError('Os PINs não coincidem. Tente de novo.');
        setPinInput('');
        setPinStep(1);
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
      } else if (next === firstPin) {
        const res = await authService.changePin(currentPin, next);
        if (res.ok) {
          closePin();
          setCurrentPin('');
          setFirstPin('');
        } else {
          setPinError('Não foi possível alterar o PIN');
          setPinInput('');
          setPinStep(2);
        }
      } else {
        setPinError('Os PINs não coincidem. Tente de novo.');
        setPinInput('');
        setPinStep(2);
      }
    } else if (pinMode === 'remove') {
      const res = await authService.removePin(next);
      if (res.ok) {
        setHasPin(false);
        setIsBioEnabled(false);
        closePin();
      } else {
        setPinError('PIN incorreto');
        setPinInput('');
      }
    }
  };

  const handleBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  const handleToggleBio = async (val: boolean) => {
    if (onToggleBiometrics) {
      onToggleBiometrics(val);
      setIsBioEnabled(val);
      return;
    }
    if (val) {
      const res = await authService.enableBiometrics();
      if (res.success) setIsBioEnabled(true);
    } else {
      await authService.disableBiometrics();
      setIsBioEnabled(false);
    }
  };

  const handleSelectAutolock = async (sec: number) => {
    await authService.setAutoLockSeconds(sec as any);
    setAutoLockSeconds(sec);
  };

  const pinTitle = (() => {
    if (pinMode === 'create') return pinStep === 1 ? 'Digite seu PIN de 6 dígitos' : 'Confirme seu PIN';
    if (pinMode === 'change') {
      if (pinStep === 1) return 'Digite o PIN atual';
      if (pinStep === 2) return 'Digite o novo PIN';
      return 'Confirme o novo PIN';
    }
    if (pinMode === 'remove') return 'Digite o PIN atual para remover';
    return '';
  })();
  const pinSubtitle =
    pinMode === 'remove'
      ? 'Sem PIN, o app abre direto e a digital é desligada.'
      : 'Use 6 números que você não esqueça. Evite sequências.';

  return (
    <View testID="settings-section-seguranca">
      {showName ? <ProfileNameRow isLight={isLight} profileRepository={profileRepository} first /> : null}

      {hasPin ? (
        <ExpandableRow
          icon="lock-outline"
          isLight={isLight}
          first={!showName}
          title="PIN de acesso"
          subtitle="PIN configurado"
          subtitleTestID="security-pin-status"
          value="Gerenciar"
          rowTestID="security-pin-row"
          content={
            <View>
              <PanelAction first icon="edit" label="Alterar PIN" isLight={isLight} testID="security-change-pin" onPress={() => openPin('change')} />
              <PanelAction icon="lock-open" label="Remover PIN" danger isLight={isLight} testID="security-remove-pin" onPress={() => openPin('remove')} />
            </View>
          }
        />
      ) : (
        <ListRow
          icon="lock-outline"
          isLight={isLight}
          first={!showName}
          testID="security-create-pin"
          title="PIN de acesso"
          subtitle="Proteja o app com um PIN"
          subtitleTestID="security-pin-status"
          value="Criar"
          onPress={() => openPin('create')}
        />
      )}

      <ListRow
        icon="fingerprint"
        isLight={isLight}
        disabled={!hasPin || !canBio}
        title="Entrar com digital"
        subtitle={!hasPin ? 'Crie um PIN primeiro' : !canBio ? 'Sensor biométrico não disponível' : 'Desbloqueie sem digitar o PIN'}
        right={
          <Switch
            testID="security-biometric-switch"
            disabled={!hasPin}
            value={hasPin && isBioEnabled}
            onValueChange={handleToggleBio}
            {...appSwitch(isLight, hasPin && isBioEnabled)}
          />
        }
      />

      {hasPin ? (
        <>
          <ExpandableRow
            icon="schedule"
            isLight={isLight}
            title="Bloquear após"
            subtitle="Tempo em segundo plano"
            value={AUTOLOCK_OPTIONS.find((o) => o.id === autoLockSeconds)?.label}
            rowTestID="security-autolock-row"
            content={
              <SegmentedControl
                value={autoLockSeconds}
                onChange={handleSelectAutolock}
                themeMode={p.theme}
                options={AUTOLOCK_OPTIONS}
              />
            }
          />
          <ListRow
            icon="lock-clock"
            isLight={isLight}
            testID="security-lock-now"
            title="Bloquear agora"
            onPress={() => sessionStore.lock()}
          />
        </>
      ) : null}

      {showWipe ? <WipeDataRow isLight={isLight} authService={authService} profileRepository={profileRepository} /> : null}

      <AnimatedModalSheet visible={pinMode !== 'none'} onClose={closePin} themeMode={p.theme} testID="security-pin-modal" maxHeight={0.92}>
        {pinMode !== 'none' ? (
          <View testID="security-pin-sheet" style={s.pinSheet}>
            <View style={[s.pinIcon, { backgroundColor: colors.primary + '1F' }]}>
              <MaterialIcons name={pinMode === 'remove' ? 'lock-open' : 'lock-outline'} size={24} color={colors.primary} />
            </View>
            <Text style={[s.sheetTitle, { color: p.fg }]}>{pinTitle}</Text>
            <Text style={[s.sheetSubtitle, { color: pinError ? DANGER_COLOR : p.muted }]}>{pinError ?? pinSubtitle}</Text>
            <PinDots length={6} filled={pinInput.length} error={Boolean(pinError)} themeMode={p.theme} />
            <PinKeypad onDigit={handleDigit} onBackspace={handleBackspace} biometricAvailable={false} themeMode={p.theme} />
            <TouchableOpacity accessibilityRole="button" onPress={closePin} style={s.cancelButton}>
              <Text style={[s.cancelText, { color: p.muted }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </AnimatedModalSheet>
    </View>
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
  onImportB3?: () => void;
  /** Linhas extras no fim do grupo (ex.: apagar dados). */
  footer?: React.ReactNode;
}

export const BackupTile: React.FC<BackupTileProps> = ({
  isLight,
  importMode,
  onChangeImportMode,
  lastExport,
  onExport,
  onImport,
  onImportSpreadsheet,
  onImportB3,
  footer,
}) => {
  const p = usePalette(isLight);
  return (
    <View testID="settings-section-gestao-dados">
      {onImportB3 ? (
        <ListRow
          icon="account-balance"
          isLight={isLight}
          first
          testID="import-b3-btn"
          title="Importar extrato B3"
          subtitle="Planilha da Área do Investidor"
          onPress={onImportB3}
        />
      ) : null}
      <ExpandableRow
        icon="inventory-2"
        title="Backup e restauração"
        subtitle="Arquivo .celsus.zip"
        isLight={isLight}
        first={!onImportB3}
        rowTestID="backup-row"
        content={
          <View style={{ gap: 12 }}>
            <Text style={[s.rowSubtitle, { color: p.muted }]}>
              Carteiras, ativos e movimentações num arquivo só. A integridade é conferida antes de importar.
            </Text>

            <View style={[s.panelGroup, { backgroundColor: isLight ? '#FFFFFF' : '#1C1E20', borderColor: p.divider }]}>
              <PanelAction first icon="file-download" label="Exportar backup" isLight={isLight} testID="export-dossier-btn" onPress={onExport} />
            </View>
            {lastExport ? (
              <View style={{ gap: 2 }}>
                <Text style={[s.caption, { color: p.fg }]}>{lastExport.fileName}</Text>
                {(['portfolios.csv', 'assets.csv', 'transactions.csv'] as const).map((f) => (
                  <Text key={f} style={[s.mono, { color: p.muted }]}>
                    {`${f}: ${lastExport.manifest.files[f].rows} linhas · SHA-256 ${lastExport.manifest.files[f].sha256.slice(0, 12)}…`}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={[s.panelLabel, { color: p.muted }]}>Ao importar</Text>
            <SegmentedControl
              value={importMode}
              onChange={onChangeImportMode}
              themeMode={p.theme}
              options={[
                { id: 'MERGE', label: 'Mesclar', icon: 'merge-type', testID: 'import-mode-merge' },
                { id: 'RESTORE', label: 'Restaurar', icon: 'settings-backup-restore', testID: 'import-mode-restore' },
              ]}
            />
            <Text style={[s.caption, { color: p.muted }]}>
              {importMode === 'MERGE'
                ? 'Mantém os dados atuais e inclui só o que for novo.'
                : 'Substitui tudo pelo conteúdo do backup.'}
            </Text>

            <View style={[s.panelGroup, { backgroundColor: isLight ? '#FFFFFF' : '#1C1E20', borderColor: p.divider }]}>
              <PanelAction
                first
                icon="file-upload"
                label={importMode === 'MERGE' ? 'Importar e mesclar dados' : 'Restaurar e substituir dados'}
                isLight={isLight}
                testID="import-dossier-btn"
                onPress={onImport}
              />
              <PanelAction icon="table-chart" label="Importar dados da planilha" isLight={isLight} testID="import-spreadsheet-btn" onPress={onImportSpreadsheet} />
            </View>
          </View>
        }
      />
      {footer}
    </View>
  );
};

const s = StyleSheet.create({
  groupLabel: { fontFamily: typography.fontFamily, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 10, marginLeft: 6 },
  groupCard: { paddingVertical: 2, paddingHorizontal: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  iconChip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontFamily: typography.fontFamily, fontSize: 12, lineHeight: 17, marginTop: 1 },
  rowValue: { fontFamily: typography.fontFamily, fontSize: 13, maxWidth: 140 },
  caption: { fontFamily: typography.fontFamily, fontSize: 12, lineHeight: 17 },
  mono: { fontFamily: typography.fontFamilyMono, fontSize: 10 },
  panel: { borderRadius: 16, padding: 12, marginBottom: 12, gap: 10 },
  panelGroup: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 },
  panelLabel: { fontFamily: typography.fontFamily, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  panelAction: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  panelActionText: { flex: 1, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '600' },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', height: 48 },
  heroCol: { alignItems: 'center', gap: 6, paddingBottom: 6 },
  avatarHero: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarHeroText: { fontFamily: typography.fontFamily, fontSize: 26, fontWeight: '700', color: '#1A0E08' },
  name: { fontFamily: typography.fontFamily, fontSize: 20, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '600' },
  pinSheet: { alignItems: 'center', paddingTop: 4 },
  pinIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sheetTitle: { fontFamily: typography.fontFamily, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  sheetSubtitle: { fontFamily: typography.fontFamily, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 4, minHeight: 18 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
  cancelText: { fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '600' },
});

/** Estilo dos cartões de grupo do Perfil (usado pela tela). */
export const profileGroupCardStyle = s.groupCard;
