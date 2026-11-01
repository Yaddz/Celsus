import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { DirectiveButton } from '../components/ui';
import { XpMinimalHeader } from '../components/ui/XpMinimalHeader';
import {
  backupService,
  ExportArchiveResult,
  BackupImportMode,
} from '../services/backupService';
import {
  privacyAndAuthService,
  PRIVACY_CURRENCY_MASK,
} from '../services/privacyAndAuth';
import { ThemeMode, themeModeService } from '../theme/palettes';

export interface SettingsBackupScreenProps {
  isPrivacyMode: boolean;
  onTogglePrivacyMode: (enabled: boolean) => void;
  onClose?: () => void;
  onDataRestored?: () => void;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
  userName?: string;
  userInitials?: string;
  investorProfile?: string;
  mainPortfolioName?: string;
  testID?: string;
}

export const SettingsBackupScreen: React.FC<SettingsBackupScreenProps> = ({
  isPrivacyMode,
  onTogglePrivacyMode,
  onClose,
  onDataRestored,
  themeMode,
  onThemeModeChange,
  userName = 'Pedro',
  userInitials = 'PL',
  investorProfile = 'Moderado',
  mainPortfolioName = 'Carteira Principal',
  testID = 'settings-backup-screen',
}) => {
  const [currentThemeMode, setCurrentThemeMode] = useState<ThemeMode>(
    themeMode || themeModeService.getThemeMode()
  );

  const handleSelectThemeMode = (mode: ThemeMode) => {
    setCurrentThemeMode(mode);
    themeModeService.setThemeMode(mode);
    if (onThemeModeChange) {
      onThemeModeChange(mode);
    }
  };

  const [isBiometricEnabled, setIsBiometricEnabled] = useState(
    privacyAndAuthService.getState().isBiometricLockEnabled
  );
  const [isAppLocked, setIsAppLocked] = useState(
    privacyAndAuthService.getState().isLocked
  );
  const [selectedImportMode, setSelectedImportMode] =
    useState<BackupImportMode>('MERGE');

  const [lastExport, setLastExport] = useState<ExportArchiveResult | null>(
    null
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const handleTogglePrivacy = (val: boolean) => {
    privacyAndAuthService.setPrivacyMode(val);
    onTogglePrivacyMode(val);
  };

  const handleToggleBiometrics = (val: boolean) => {
    const nextState = privacyAndAuthService.setBiometricLockEnabled(val);
    setIsBiometricEnabled(nextState.isBiometricLockEnabled);
    setIsAppLocked(nextState.isLocked);
    setStatusBanner({
      type: 'info',
      title: val ? 'BLOQUEIO BIOMÉTRICO ATIVADO' : 'BLOQUEIO BIOMÉTRICO DESATIVADO',
      message: val
        ? 'O Dossiê Celsus exigirá autenticação biométrica ou PIN nativo ao ser bloqueado.'
        : 'A exigência de biometria ao iniciar foi desativada.',
    });
  };

  const handleTestBiometricLock = async () => {
    privacyAndAuthService.setBiometricLockEnabled(true);
    setIsBiometricEnabled(true);
    const locked = privacyAndAuthService.lockApp();
    setIsAppLocked(locked.isLocked);

    const authResult = await privacyAndAuthService.authenticateAndUnlock(
      'Autenticar acesso ao Dossiê Celsus'
    );

    if (authResult.authenticated) {
      setIsAppLocked(false);
      setStatusBanner({
        type: 'success',
        title: 'AUTENTICAÇÃO BIOMÉTRICA CONFIRMADA',
        message: 'Identidade verificada com sucesso pelo motor de segurança local.',
      });
    } else {
      setStatusBanner({
        type: 'error',
        title: 'FALHA NA AUTENTICAÇÃO BIOMÉTRICA',
        message: `Não foi possível desbloquear: ${authResult.reason || 'cancelado'}.`,
      });
    }
  };

  const handleExportDossier = async () => {
    try {
      const exported = await backupService.exportDossierArchive();
      setLastExport(exported);
      const { files } = exported.manifest;
      setStatusBanner({
        type: 'success',
        title: 'ARQUIVO .CELSUS.ZIP GERADO COM SUCESSO',
        message: `Pacote: ${exported.fileName} (${exported.zipBytes.byteLength} bytes)\n` +
          `• portfolios.csv (${files['portfolios.csv'].rows} linhas) — SHA-256: ${files['portfolios.csv'].sha256.slice(0, 12)}...\n` +
          `• assets.csv (${files['assets.csv'].rows} linhas) — SHA-256: ${files['assets.csv'].sha256.slice(0, 12)}...\n` +
          `• transactions.csv (${files['transactions.csv'].rows} linhas) — SHA-256: ${files['transactions.csv'].sha256.slice(0, 12)}...`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        title: 'ERRO AO EXPORTAR DOSSIÊ',
        message: err?.message || 'Falha inesperada na geração do pacote .celsus.zip.',
      });
    }
  };

  const handleImportDossier = async () => {
    try {
      const archiveToImport =
        lastExport || (await backupService.exportDossierArchive());
      const res = await backupService.importDossierArchive(
        archiveToImport.zipBytes,
        selectedImportMode
      );

      setStatusBanner({
        type: 'success',
        title:
          res.mode === 'RESTORE'
            ? 'RESTAURAÇÃO COMPLETA CONCLUÍDA'
            : 'MESCLAGEM POR UUID v4 CONCLUÍDA',
        message:
          `Integridade SHA-256 verificada em todos os 4 CSVs.\n` +
          `Carteiras: ${res.importedCounts.portfolios} | Ativos: ${res.importedCounts.assets} | Transações: ${res.importedCounts.transactions}`,
      });
      onDataRestored?.();
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        title: 'PROTOCOLO DE SEGURANÇA: IMPORTAÇÃO ABORTADA',
        message: err?.message || 'Arquivo .celsus.zip corrompido ou inválido.',
      });
    }
  };

  const isLight = currentThemeMode === 'light';

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* 1. Header Minimalista XP com Voltar */}
      <XpMinimalHeader
        title="Perfil & Configurações"
        onBack={onClose || (() => {})}
        themeMode={currentThemeMode}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={() => handleTogglePrivacy(!isPrivacyMode)}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Card de Identidade / Perfil do Investidor (XP Style) */}
        <View testID="investor-profile-card" style={[styles.profileCard, isLight && styles.profileCardLight]}>
          <View style={styles.profileHeaderRow}>
            <View style={styles.avatarWrapper}>
              <View style={[styles.avatarCircle, isLight && styles.avatarCircleLight]}>
                <Text style={[styles.avatarText, isLight && styles.avatarTextLight]}>{userInitials}</Text>
              </View>
              <TouchableOpacity
                testID="profile-edit-avatar"
                style={[styles.editAvatarBadge, isLight && styles.editAvatarBadgeLight]}
                activeOpacity={0.8}
              >
                <MaterialIcons name="edit" size={12} color={isLight ? '#111315' : colors.parchmentPale} />
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfoCol}>
              <View style={styles.sealAndStatusRow}>
                <View testID="profile-seal" style={[styles.profileSeal, isLight && styles.profileSealLight]}>
                  <Text style={[styles.profileSealText, isLight && styles.profileSealTextLight]}>
                    Celsus | Dossiê Local
                  </Text>
                </View>
                <View testID="profile-status-pill" style={[styles.profileStatusPill, isLight && styles.profileStatusPillLight]}>
                  <Text style={[styles.profileStatusPillText, isLight && styles.profileStatusPillTextLight]}>
                    {investorProfile}
                  </Text>
                </View>
              </View>

              <Text style={[styles.profileName, isLight && styles.profileNameLight]}>{userName}</Text>
            </View>

            {onClose && (
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, isLight && styles.closeBtnLight]}
                testID="close-settings-btn"
              >
                <MaterialIcons name="close" size={20} color={isLight ? '#111315' : colors.parchmentPale} />
              </TouchableOpacity>
            )}
          </View>

          {/* Barra horizontal de nível: Local-First ─── Sovereign */}
          <View testID="profile-level-bar" style={[styles.levelBarContainer, isLight && styles.levelBarContainerLight]}>
            <View style={styles.levelLabelsRow}>
              <View style={styles.levelIndicatorGroup}>
                <MaterialIcons name="security" size={12} color={isLight ? '#A0522D' : colors.tertiary} />
                <Text style={[styles.levelLabel, isLight && styles.levelLabelLight]}>Local-First</Text>
              </View>
              <Text style={[styles.levelDividerText, isLight && styles.levelDividerTextLight]}>────────</Text>
              <View style={styles.levelIndicatorGroup}>
                <Text style={[styles.levelLabel, isLight && styles.levelLabelLight]}>Sovereign</Text>
                <MaterialIcons name="verified" size={12} color={isLight ? '#2E4A44' : '#AECDC5'} />
              </View>
            </View>
            <View style={[styles.levelTrack, isLight && styles.levelTrackLight]}>
              <View style={[styles.levelFill, isLight && styles.levelFillLight]} />
            </View>
          </View>
        </View>

        {/* Status Banner */}
        {statusBanner && (
          <View
            style={[
              styles.statusCard,
              statusBanner.type === 'error'
                ? styles.statusError
                : statusBanner.type === 'success'
                ? styles.statusSuccess
                : styles.statusInfo,
            ]}
          >
            <View style={styles.statusHeaderRow}>
              <MaterialIcons
                name={
                  statusBanner.type === 'error'
                    ? 'gpp-bad'
                    : statusBanner.type === 'success'
                    ? 'verified-user'
                    : 'info'
                }
                size={18}
                color={
                  statusBanner.type === 'error'
                    ? colors.primary
                    : statusBanner.type === 'success'
                    ? '#AECDC5'
                    : colors.tertiary
                }
              />
              <Text style={styles.statusTitle}>{statusBanner.title}</Text>
            </View>
            <Text style={styles.statusMessage}>{statusBanner.message}</Text>
          </View>
        )}

        {/* 3. Módulo Horizontal: Dados das carteiras */}
        <View testID="wallets-summary-section" style={[styles.bentoCard, isLight && styles.bentoCardLight]}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons name="account-balance-wallet" size={18} color={isLight ? '#A0522D' : colors.primary} />
            <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>DADOS DAS CARTEIRAS</Text>
          </View>
          <Text style={[styles.cardHelperText, isLight && styles.cardHelperTextLight]}>
            Visão consolidada das carteiras registradas no dossiê soberano local.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.walletCardsScroll}>
            {/* Card 1: Carteira Principal */}
            <View testID="wallet-summary-card-main" style={[styles.walletSummaryCard, isLight && styles.walletSummaryCardLight]}>
              <View style={styles.walletCardHeader}>
                <MaterialIcons name="stars" size={16} color={isLight ? '#A0522D' : colors.primary} />
                <Text style={[styles.walletDocketCode, isLight && styles.walletDocketCodeLight]}>•••• 001</Text>
              </View>
              <Text style={[styles.walletCardTitle, isLight && styles.walletCardTitleLight]}>{mainPortfolioName}</Text>
              <Text style={[styles.walletCardBalance, isLight && styles.walletCardBalanceLight]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : 'R$ 32.468,00'}
              </Text>
              <Text style={[styles.walletCardSub, isLight && styles.walletCardSubLight]}>Patrimônio Principal</Text>
            </View>

            {/* Card 2: Carteira Reserva / Oportunidade */}
            <View testID="wallet-summary-card-reserve" style={[styles.walletSummaryCard, isLight && styles.walletSummaryCardLight]}>
              <View style={styles.walletCardHeader}>
                <MaterialIcons name="savings" size={16} color={isLight ? '#2E4A44' : colors.tertiary} />
                <Text style={[styles.walletDocketCode, isLight && styles.walletDocketCodeLight]}>•••• 002</Text>
              </View>
              <Text style={[styles.walletCardTitle, isLight && styles.walletCardTitleLight]}>Reserva / Oportunidade</Text>
              <Text style={[styles.walletCardBalance, isLight && styles.walletCardBalanceLight]}>
                {isPrivacyMode ? PRIVACY_CURRENCY_MASK : 'R$ 8.120,00'}
              </Text>
              <Text style={[styles.walletCardSub, isLight && styles.walletCardSubLight]}>Liquidez Imediata (CDI)</Text>
            </View>
          </ScrollView>
        </View>

        {/* 4. Bloco Agrupado: Personalização */}
        <View testID="settings-section-personalizacao" style={[styles.bentoCard, isLight && styles.bentoCardLight]}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons name="tune" size={18} color={isLight ? '#A0522D' : colors.tertiary} />
            <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>PERSONALIZAÇÃO</Text>
          </View>

          {/* Modo Privacidade */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={[styles.settingTitle, isLight && styles.settingTitleLight]}>Modo Privacidade (Tarja)</Text>
              <Text style={[styles.settingDesc, isLight && styles.settingDescLight]}>
                Oculta saldos em BRL como{' '}
                <Text style={styles.codeHighlight}>{PRIVACY_CURRENCY_MASK}</Text>
              </Text>
            </View>
            <Switch
              testID="privacy-mode-switch"
              value={isPrivacyMode}
              onValueChange={handleTogglePrivacy}
              trackColor={{ false: isLight ? '#EAE4D7' : '#2A2D30', true: colors.secondary }}
              thumbColor={isPrivacyMode ? colors.primary : isLight ? '#C5BEB3' : '#8A8C90'}
            />
          </View>

          <View style={[styles.divider, isLight && styles.dividerLight]} />

          {/* Aparência: Tema Escuro / Claro */}
          <View style={styles.settingRowNoPadding}>
            <View style={styles.settingTextCol}>
              <Text style={[styles.settingTitle, isLight && styles.settingTitleLight]}>Aparência do Aplicativo</Text>
              <Text style={[styles.settingDesc, isLight && styles.settingDescLight]}>
                Alterne entre Tema Escuro (#111315) e Tema Claro (#F4F1EA).
              </Text>
            </View>
          </View>

          <View style={styles.themeSelectorRow}>
            <TouchableOpacity
              testID="theme-option-dark"
              onPress={() => handleSelectThemeMode('dark')}
              style={[
                styles.themeOptionButton,
                isLight && styles.themeOptionButtonLight,
                currentThemeMode === 'dark' && (isLight ? styles.themeOptionActiveLight : styles.themeOptionActive),
              ]}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="dark-mode"
                size={20}
                color={currentThemeMode === 'dark' ? colors.primary : isLight ? '#6E6A63' : '#8A8C90'}
              />
              <Text
                style={[
                  styles.themeOptionText,
                  isLight && styles.themeOptionTextLight,
                  currentThemeMode === 'dark' && styles.themeOptionTextActive,
                ]}
              >
                Tema Escuro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="theme-option-light"
              onPress={() => handleSelectThemeMode('light')}
              style={[
                styles.themeOptionButton,
                isLight && styles.themeOptionButtonLight,
                currentThemeMode === 'light' && (isLight ? styles.themeOptionActiveLight : styles.themeOptionActive),
              ]}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="light-mode"
                size={20}
                color={currentThemeMode === 'light' ? colors.primary : isLight ? '#6E6A63' : '#8A8C90'}
              />
              <Text
                style={[
                  styles.themeOptionText,
                  isLight && styles.themeOptionTextLight,
                  currentThemeMode === 'light' && styles.themeOptionTextActive,
                ]}
              >
                Tema Claro
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. Bloco Agrupado: Segurança */}
        <View testID="settings-section-seguranca" style={[styles.bentoCard, isLight && styles.bentoCardLight]}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons name="security" size={18} color={isLight ? '#A0522D' : colors.primary} />
            <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>SEGURANÇA</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={[styles.settingTitle, isLight && styles.settingTitleLight]}>
                Bloqueio Biométrico / PIN Nativo
              </Text>
              <Text style={[styles.settingDesc, isLight && styles.settingDescLight]}>
                Protege a abertura do app com FaceID, Impressão Digital ou PIN
              </Text>
            </View>
            <Switch
              testID="biometric-switch"
              value={isBiometricEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: isLight ? '#EAE4D7' : '#2A2D30', true: colors.secondary }}
              thumbColor={isBiometricEnabled ? colors.primary : isLight ? '#C5BEB3' : '#8A8C90'}
            />
          </View>

          <View style={[styles.divider, isLight && styles.dividerLight]} />

          <View style={{ marginTop: 10 }}>
            <DirectiveButton
              testID="test-biometric-btn"
              label={
                isAppLocked
                  ? 'Dossiê Bloqueado — Autenticar Agora'
                  : 'Testar Autenticação Biométrica'
              }
              variant="secondary"
              materialIcon="fingerprint"
              onPress={handleTestBiometricLock}
            />
          </View>
        </View>

        {/* 6. Bloco Agrupado: Gestão de dados (.celsus.zip) */}
        <View testID="settings-section-gestao-dados" style={[styles.bentoCard, isLight && styles.bentoCardLight]}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons name="folder-zip" size={18} color={isLight ? '#A0522D' : colors.tertiary} />
            <Text style={[styles.sectionLabel, isLight && styles.sectionLabelLight]}>
              GESTÃO DE DADOS (.CELSUS.ZIP)
            </Text>
          </View>
          <Text style={[styles.cardHelperText, isLight && styles.cardHelperTextLight]}>
            Gera um arquivo compactado legível contendo 4 arquivos CSV (portfolios, class_targets, assets, transactions) e o manifesto criptográfico manifest.json com hashes SHA-256.
          </Text>

          <View style={{ marginTop: 12 }}>
            <DirectiveButton
              testID="export-dossier-btn"
              label="Exportar Backup .celsus.zip"
              variant="primary"
              materialIcon="file-download"
              onPress={handleExportDossier}
            />
          </View>

          {lastExport && (
            <View style={[styles.manifestBox, isLight && styles.manifestBoxLight]}>
              <Text style={[styles.manifestTitle, isLight && styles.manifestTitleLight]}>
                MANIFESTO GERADO: {lastExport.fileName}
              </Text>
              <Text style={[styles.manifestHashLine, isLight && styles.manifestHashLineLight]}>
                Formato: {lastExport.manifest.format} (v{lastExport.manifest.schemaVersion})
              </Text>
              <Text style={[styles.manifestHashLine, isLight && styles.manifestHashLineLight]}>
                portfolios.csv: {lastExport.manifest.files['portfolios.csv'].rows} linhas | SHA-256: {lastExport.manifest.files['portfolios.csv'].sha256.slice(0, 16)}...
              </Text>
              <Text style={[styles.manifestHashLine, isLight && styles.manifestHashLineLight]}>
                assets.csv: {lastExport.manifest.files['assets.csv'].rows} linhas | SHA-256: {lastExport.manifest.files['assets.csv'].sha256.slice(0, 16)}...
              </Text>
              <Text style={[styles.manifestHashLine, isLight && styles.manifestHashLineLight]}>
                transactions.csv: {lastExport.manifest.files['transactions.csv'].rows} linhas | SHA-256: {lastExport.manifest.files['transactions.csv'].sha256.slice(0, 16)}...
              </Text>
            </View>
          )}

          <View style={[styles.divider, isLight && styles.dividerLight, { marginVertical: 14 }]} />

          <Text style={[styles.settingTitle, isLight && styles.settingTitleLight]}>
            IMPORTAR E VALIDAR INTEGRIDADE
          </Text>
          <Text style={[styles.cardHelperText, isLight && styles.cardHelperTextLight, { marginTop: 4 }]}>
            Antes de tocar no banco SQLite local, o Celsus valida o hash SHA-256 de cada CSV. Qualquer adulteração de 1 byte aborta a operação.
          </Text>

          {/* Seletor de Modo: MERGE vs RESTORE */}
          <View style={styles.modeSelectorRow}>
            <TouchableOpacity
              testID="import-mode-merge"
              activeOpacity={0.8}
              onPress={() => setSelectedImportMode('MERGE')}
              style={[
                styles.modeOption,
                isLight && styles.modeOptionLight,
                selectedImportMode === 'MERGE' && (isLight ? styles.modeOptionActiveLight : styles.modeOptionActive),
              ]}
            >
              <MaterialIcons
                name="merge-type"
                size={18}
                color={selectedImportMode === 'MERGE' ? colors.primary : isLight ? '#6E6A63' : '#8A8C90'}
              />
              <Text
                style={[
                  styles.modeOptionTitle,
                  isLight && styles.modeOptionTitleLight,
                  selectedImportMode === 'MERGE' && styles.modeOptionTitleActive,
                ]}
              >
                MESCLAR (UUID)
              </Text>
              <Text style={[styles.modeOptionSub, isLight && styles.modeOptionSubLight]}>
                Preserva dados atuais e recalcula PM sem duplicar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="import-mode-restore"
              activeOpacity={0.8}
              onPress={() => setSelectedImportMode('RESTORE')}
              style={[
                styles.modeOption,
                isLight && styles.modeOptionLight,
                selectedImportMode === 'RESTORE' && (isLight ? styles.modeOptionActiveLight : styles.modeOptionActive),
              ]}
            >
              <MaterialIcons
                name="settings-backup-restore"
                size={18}
                color={selectedImportMode === 'RESTORE' ? colors.primary : isLight ? '#6E6A63' : '#8A8C90'}
              />
              <Text
                style={[
                  styles.modeOptionTitle,
                  isLight && styles.modeOptionTitleLight,
                  selectedImportMode === 'RESTORE' && styles.modeOptionTitleActive,
                ]}
              >
                RESTORE TOTAL
              </Text>
              <Text style={[styles.modeOptionSub, isLight && styles.modeOptionSubLight]}>
                Substitui todas as tabelas pelo arquivo importado
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12 }}>
            <DirectiveButton
              testID="import-dossier-btn"
              label={
                selectedImportMode === 'MERGE'
                  ? 'Importar e Mesclar por UUID v4'
                  : 'Restaurar Substituindo Banco Local'
              }
              variant="secondary"
              materialIcon="file-upload"
              onPress={handleImportDossier}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  scrollContent: {
    padding: spacing.margin,
    gap: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#191B1D',
    borderRadius: borders.radiusLg,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    padding: spacing.md,
  },
  profileCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrapper: {
    position: 'relative',
    width: 50,
    height: 50,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#202224',
    borderWidth: 1.5,
    borderColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleLight: {
    backgroundColor: '#EAE4D7',
    borderColor: colors.primary,
  },
  avatarText: {
    fontFamily: typography.fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: colors.tertiary,
  },
  avatarTextLight: {
    color: colors.primary,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#191B1D',
  },
  editAvatarBadgeLight: {
    borderColor: '#FFFFFF',
  },
  profileInfoCol: {
    flex: 1,
  },
  sealAndStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  profileSeal: {
    backgroundColor: '#202224',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2E4A44',
  },
  profileSealLight: {
    backgroundColor: '#F0EDE6',
    borderColor: '#EAE4D7',
  },
  profileSealText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.tertiary,
    letterSpacing: 0.5,
  },
  profileSealTextLight: {
    color: '#A0522D',
  },
  profileStatusPill: {
    backgroundColor: '#1A2E28',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#34554E',
  },
  profileStatusPillLight: {
    backgroundColor: '#E8F2EF',
    borderColor: '#C3DFD8',
  },
  profileStatusPillText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: '#AECDC5',
  },
  profileStatusPillTextLight: {
    color: '#2E4A44',
  },
  profileName: {
    fontFamily: typography.fontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  profileNameLight: {
    color: '#111315',
  },
  profilePortfolio: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  profilePortfolioLight: {
    color: '#6E6A63',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnLight: {
    backgroundColor: '#EAE4D7',
  },
  levelBarContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#26292C',
  },
  levelBarContainerLight: {
    borderTopColor: '#EAE4D7',
  },
  levelLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelIndicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  levelLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: colors.parchmentPale,
    letterSpacing: 0.5,
  },
  levelLabelLight: {
    color: '#111315',
  },
  levelDividerText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#3A3E42',
    letterSpacing: -1,
  },
  levelDividerTextLight: {
    color: '#C5BEB3',
  },
  levelTrack: {
    height: 6,
    backgroundColor: '#202224',
    borderRadius: 3,
    overflow: 'hidden',
  },
  levelTrackLight: {
    backgroundColor: '#EAE4D7',
  },
  levelFill: {
    height: '100%',
    width: '85%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  levelFillLight: {
    backgroundColor: colors.primary,
  },
  statusCard: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
  },
  statusSuccess: {
    backgroundColor: '#162824',
    borderColor: colors.secondary,
  },
  statusError: {
    backgroundColor: '#2E1812',
    borderColor: colors.primary,
  },
  statusInfo: {
    backgroundColor: '#202224',
    borderColor: '#383C40',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  statusMessage: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#D5CAA8',
    lineHeight: 16,
  },
  bentoCard: {
    backgroundColor: colors.neutral,
    borderRadius: 24,
    padding: 16,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  bentoCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  sectionLabelLight: {
    color: '#111315',
  },
  cardHelperText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#A0A4A8',
    lineHeight: 15,
  },
  cardHelperTextLight: {
    color: '#6E6A63',
  },
  walletCardsScroll: {
    marginTop: 12,
  },
  walletSummaryCard: {
    width: 200,
    backgroundColor: '#141618',
    borderRadius: 16,
    padding: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#26292C',
  },
  walletSummaryCardLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  walletDocketCode: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
  },
  walletDocketCodeLight: {
    color: '#6E6A63',
  },
  walletCardTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.parchmentPale,
    marginBottom: 4,
  },
  walletCardTitleLight: {
    color: '#111315',
  },
  walletCardBalance: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.tertiary,
    marginBottom: 2,
  },
  walletCardBalanceLight: {
    color: '#A0522D',
  },
  walletCardSub: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
  },
  walletCardSubLight: {
    color: '#6E6A63',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingRowNoPadding: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  settingTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  settingTitleLight: {
    color: '#111315',
  },
  settingDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
    marginTop: 2,
  },
  settingDescLight: {
    color: '#6E6A63',
  },
  codeHighlight: {
    color: colors.tertiary,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#26292C',
    marginVertical: 6,
  },
  dividerLight: {
    backgroundColor: '#EAE4D7',
  },
  manifestBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#141618',
    borderWidth: borders.hairline,
    borderColor: '#2E4A44',
  },
  manifestBoxLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  manifestTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: '#AECDC5',
    marginBottom: 4,
  },
  manifestTitleLight: {
    color: '#2E4A44',
  },
  manifestHashLine: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#9BA0A6',
    lineHeight: 14,
  },
  manifestHashLineLight: {
    color: '#6E6A63',
  },
  modeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modeOption: {
    flex: 1,
    backgroundColor: '#141618',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2D30',
  },
  modeOptionLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  modeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#241B16',
  },
  modeOptionActiveLight: {
    borderColor: colors.primary,
    backgroundColor: '#FFF5EE',
  },
  modeOptionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#9BA0A6',
    marginTop: 4,
  },
  modeOptionTitleLight: {
    color: '#111315',
  },
  modeOptionTitleActive: {
    color: colors.primary,
  },
  modeOptionSub: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#7A7E82',
    marginTop: 2,
    lineHeight: 13,
  },
  modeOptionSubLight: {
    color: '#6E6A63',
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  themeOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141618',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2A2D30',
  },
  themeOptionButtonLight: {
    backgroundColor: '#F8F6F0',
    borderColor: '#EAE4D7',
  },
  themeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#241B16',
  },
  themeOptionActiveLight: {
    borderColor: colors.primary,
    backgroundColor: '#FFF5EE',
  },
  themeOptionText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: '#9BA0A6',
  },
  themeOptionTextLight: {
    color: '#6E6A63',
  },
  themeOptionTextActive: {
    color: colors.primary,
  },
});
