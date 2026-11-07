import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BentoTile, DirectiveButton } from '../../components/ui';
import { bento, BentoVariant, colors, typography } from '../../theme/tokens';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { BackupImportMode, ExportArchiveResult } from '../../services/backupService';
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
  isBiometricEnabled: boolean;
  isAppLocked: boolean;
  onToggleBiometrics: (v: boolean) => void;
  onTestBiometrics: () => void;
}

export const SecurityTile: React.FC<SecurityTileProps> = ({ isLight, isBiometricEnabled, isAppLocked, onToggleBiometrics, onTestBiometrics }) => {
  const { variant, fg, muted } = useTileColors(isLight);
  return (
    <BentoTile variant={variant} testID="settings-section-seguranca">
      <SectionTitle icon="security" label="SEGURANÇA" fg={fg} />
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: fg }]}>Bloqueio biométrico / PIN</Text>
          <Text style={[s.body, { color: muted }]}>Protege a abertura do app com digital, rosto ou PIN.</Text>
        </View>
        <Switch
          testID="biometric-switch"
          value={isBiometricEnabled}
          onValueChange={onToggleBiometrics}
          trackColor={{ false: isLight ? '#EAE4D7' : '#2A2D30', true: colors.secondary }}
          thumbColor={isBiometricEnabled ? colors.primary : isLight ? '#C5BEB3' : '#8A8C90'}
        />
      </View>
      <View style={{ marginTop: 12 }}>
        <DirectiveButton
          testID="test-biometric-btn"
          label={isAppLocked ? 'Aplicativo bloqueado — autenticar agora' : 'Testar autenticação biométrica'}
          variant="secondary"
          materialIcon="fingerprint"
          onPress={onTestBiometrics}
          themeMode={isLight ? 'light' : 'dark'}
        />
      </View>
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
});
