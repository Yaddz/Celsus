import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BentoGrid } from '../components/ui';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import { useHeaderScrollFade } from '../hooks/useHeaderScrollFade';
import { bento, colors, layout } from '../theme/tokens';
import { ThemeMode } from '../theme/palettes';
import { useProfileSettings } from './profile/useProfileSettings';
import {
  AppearanceTile,
  BackupTile,
  IdentityTile,
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
  const { scrollY, scrollProps } = useHeaderScrollFade();
  const p = useProfileSettings({ themeMode, onTogglePrivacyMode, onThemeModeChange, onDataRestored });
  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;
  const mode = p.isLight ? 'light' : 'dark';

  const identity = (
    <IdentityTile
      isLight={p.isLight}
      userName={userName}
      userInitials={userInitials}
      walletCount={p.wallets.length}
      assetCount={p.wallets.reduce((n, w) => n + w.assetCount, 0)}
      onClose={onClose}
    />
  );
  const wallets = <WalletsTile isLight={p.isLight} isPrivacyMode={isPrivacyMode} wallets={p.wallets} />;
  const appearance = <AppearanceTile isLight={p.isLight} mode={mode} onSelect={p.selectTheme} />;
  const security = (
    <SecurityTile
      isLight={p.isLight}
      isBiometricEnabled={p.isBiometricEnabled}
      isAppLocked={p.isAppLocked}
      onToggleBiometrics={p.toggleBiometrics}
      onTestBiometrics={p.testBiometricLock}
    />
  );
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
    />
  );

  return (
    <View testID={testID} style={[styles.container, p.isLight && styles.containerLight]}>
      <XpMinimalHeader
        title="Perfil & Configurações"
        subtitle="Preferências, segurança e backup"
        onBack={onClose}
        themeMode={p.currentThemeMode}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={() => p.togglePrivacy(!isPrivacyMode)}
        scrollY={scrollY}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} {...scrollProps}>
        <View style={styles.content}>
          {p.banner ? <StatusBannerTile banner={p.banner} isLight={p.isLight} /> : null}
          {twoColumns ? (
            <View style={styles.columns}>
              <BentoGrid style={styles.column} testID="profile-column-left">
                {identity}
                {wallets}
                {appearance}
              </BentoGrid>
              <BentoGrid style={styles.column} testID="profile-column-right">
                {security}
                {backup}
              </BentoGrid>
            </View>
          ) : (
            <BentoGrid>
              {identity}
              {wallets}
              {appearance}
              {security}
              {backup}
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
  scrollContent: { padding: layout.screenPadding, paddingBottom: 40, alignItems: 'center' },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: bento.gap },
  columns: { flexDirection: 'row', gap: bento.gap, alignItems: 'flex-start' },
  column: { flex: 1 },
});

export default SettingsBackupScreen;
