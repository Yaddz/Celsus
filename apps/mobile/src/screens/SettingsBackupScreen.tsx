import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BentoGrid, BentoTile } from '../components/ui';
import { bento, colors, layout } from '../theme/tokens';
import { ThemeMode } from '../theme/palettes';
import { useProfileSettings } from './profile/useProfileSettings';
import { useProfile } from '../stores/profileStore';
import {
  AppearanceTile,
  BackupTile,
  GroupLabel,
  IdentityTile,
  PrivacyRow,
  ProfileNameRow,
  profileGroupCardStyle,
  WipeDataRow,
  SecurityTile,
  StatusBannerTile,
  WalletsTile,
} from './profile/ProfileTiles';

export interface SettingsBackupScreenProps {
  isPrivacyMode: boolean;
  onTogglePrivacyMode: (enabled: boolean) => void;
  onClose?: () => void;
  onDataRestored?: () => void;
  onOpenB3Import?: () => void;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
  /** Dados do usuário só aparecem quando informados; não há valores de exemplo. */
  userName?: string;
  userInitials?: string;
  testID?: string;
}

/** Largura a partir da qual o Perfil usa duas colunas. */
const TWO_COLUMN_MIN_WIDTH = 720;
const MAX_CONTENT_WIDTH = 960;

/** Perfil & Configurações em bento grid: uma coluna no celular, duas em telas largas. */
export const SettingsBackupScreen: React.FC<SettingsBackupScreenProps> = ({
  isPrivacyMode,
  onTogglePrivacyMode,
  onClose,
  onDataRestored,
  onOpenB3Import,
  themeMode,
  onThemeModeChange,
  userName,
  userInitials,
  testID = 'settings-backup-screen',
}) => {
  const { width } = useWindowDimensions();
  const p = useProfileSettings({ themeMode, onTogglePrivacyMode, onThemeModeChange, onDataRestored });
  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;
  const [sec, setSec] = React.useState<{ hasPin: boolean; biometricEnabled: boolean } | null>(null);
  const mode = p.isLight ? 'light' : 'dark';
  const profile = useProfile();

  const identity = (
    <IdentityTile
      isLight={p.isLight}
      userName={userName ?? (profile.name || undefined)}
      userInitials={userInitials ?? (profile.initials || undefined)}
      walletCount={p.wallets.length}
      assetCount={p.wallets.reduce((n, w) => n + w.assetCount, 0)}
      onClose={onClose}
      hasPin={sec ? sec.hasPin : undefined}
      biometricEnabled={sec ? sec.biometricEnabled : undefined}
    />
  );
  const nameRow = <ProfileNameRow isLight={p.isLight} first />;
  const wallets = <WalletsTile isLight={p.isLight} isPrivacyMode={isPrivacyMode} wallets={p.wallets} />;
  const appearance = <AppearanceTile isLight={p.isLight} mode={mode} onSelect={p.selectTheme} />;
  const security = (
    <SecurityTile
      isLight={p.isLight}
      isBiometricEnabled={p.isBiometricEnabled}
      isAppLocked={p.isAppLocked}
      onToggleBiometrics={p.toggleBiometrics}
      onTestBiometrics={p.testBiometricLock}
      onStatusChange={setSec}
      showWipe={false}
      showName={false}
    />
  );
  const groupAccount = <GroupLabel label="CONTA" isLight={p.isLight} testID="profile-group-account" />;
  const groupProtection = <GroupLabel label="PROTEÇÃO" isLight={p.isLight} testID="profile-group-protection" />;
  const groupData = <GroupLabel label="DADOS" isLight={p.isLight} testID="profile-group-data" />;
  const privacy = <PrivacyRow isLight={p.isLight} enabled={isPrivacyMode} onToggle={p.togglePrivacy} />;
  const variant = p.isLight ? 'light' : 'dark';
  const card = (id: string, ...rows: React.ReactNode[]) => (
    <BentoTile variant={variant} testID={id} style={profileGroupCardStyle}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>{r}</React.Fragment>
      ))}
    </BentoTile>
  );
  const banner = p.banner ? <StatusBannerTile banner={p.banner} isLight={p.isLight} /> : null;
  const backup = (
    <BackupTile
      isLight={p.isLight}
      importMode={p.importMode}
      onChangeImportMode={p.setImportMode}
      lastExport={p.lastExport}
      onExport={p.exportDossier}
      onImport={p.importDossier}
      onImportSpreadsheet={p.importSpreadsheet}
      onImportB3={onOpenB3Import}
      footer={<WipeDataRow isLight={p.isLight} />}
    />
  );

  return (
    <View testID={testID} style={[styles.container, p.isLight && styles.containerLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {twoColumns ? (
            <View style={styles.columns}>
              <BentoGrid style={styles.column} testID="profile-column-left">
                {identity}
                {banner}
                {groupAccount}
                {card('profile-card-account', nameRow, wallets, appearance, privacy)}
              </BentoGrid>
              <BentoGrid style={styles.column} testID="profile-column-right">
                {groupProtection}
                {card('profile-card-protection', security)}
                {groupData}
                {card('profile-card-data', backup)}
              </BentoGrid>
            </View>
          ) : (
            <BentoGrid>
              {identity}
              {banner}
              {groupAccount}
              {card('profile-card-account', nameRow, wallets, appearance, privacy)}
              {groupProtection}
              {card('profile-card-protection', security)}
              {groupData}
              {card('profile-card-data', backup)}
            </BentoGrid>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidFloor },
  containerLight: { backgroundColor: '#F4F1EA' },
  scrollContent: { padding: layout.screenPadding, paddingTop: 4, paddingBottom: 40, alignItems: 'center' },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: bento.gap },
  columns: { flexDirection: 'row', gap: bento.gap, alignItems: 'flex-start' },
  column: { flex: 1 },
});

export default SettingsBackupScreen;
