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
import {
  backupService,
  ExportArchiveResult,
  BackupImportMode,
} from '../services/backupService';
import {
  privacyAndAuthService,
  PRIVACY_CURRENCY_MASK,
} from '../services/privacyAndAuth';

export interface SettingsBackupScreenProps {
  isPrivacyMode: boolean;
  onTogglePrivacyMode: (enabled: boolean) => void;
  onClose?: () => void;
  onDataRestored?: () => void;
}

export const SettingsBackupScreen: React.FC<SettingsBackupScreenProps> = ({
  isPrivacyMode,
  onTogglePrivacyMode,
  onClose,
  onDataRestored,
}) => {
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIconBadge}>
            <MaterialIcons name="security" size={18} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>SEGURANÇA & BACKUP</Text>
            <Text style={styles.headerSubtitle}>
              100% LOCAL-FIRST • .CELSUS.ZIP SHA-256
            </Text>
          </View>
        </View>
        {onClose && (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            testID="close-settings-btn"
          >
            <MaterialIcons name="close" size={20} color={colors.parchmentPale} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* 1. Segurança Local & Privacidade */}
        <View style={styles.bentoCard}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons
              name="visibility-off"
              size={18}
              color={colors.primary}
            />
            <Text style={styles.sectionLabel}>PRIVACIDADE & BIOMETRIA</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitle}>Modo Privacidade (Tarja)</Text>
              <Text style={styles.settingDesc}>
                Oculta saldos em BRL como{' '}
                <Text style={styles.codeHighlight}>{PRIVACY_CURRENCY_MASK}</Text>
              </Text>
            </View>
            <Switch
              value={isPrivacyMode}
              onValueChange={handleTogglePrivacy}
              trackColor={{ false: '#2A2D30', true: colors.secondary }}
              thumbColor={isPrivacyMode ? colors.primary : '#8A8C90'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingTextCol}>
              <Text style={styles.settingTitle}>
                Bloqueio Biométrico / PIN Nativo
              </Text>
              <Text style={styles.settingDesc}>
                Protege a abertura do app com FaceID, Impressão Digital ou PIN
              </Text>
            </View>
            <Switch
              value={isBiometricEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: '#2A2D30', true: colors.secondary }}
              thumbColor={isBiometricEnabled ? colors.primary : '#8A8C90'}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <DirectiveButton
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

        {/* 2. Exportação Offline (.celsus.zip) */}
        <View style={styles.bentoCard}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons
              name="folder-zip"
              size={18}
              color={colors.tertiary}
            />
            <Text style={styles.sectionLabel}>
              EXPORTAR DOSSIÊ (.CELSUS.ZIP)
            </Text>
          </View>
          <Text style={styles.cardHelperText}>
            Gera um arquivo compactado legível contendo 4 arquivos CSV (
            portfolios, class_targets, assets, transactions) e o manifesto
            criptográfico manifest.json com hashes SHA-256.
          </Text>

          <View style={{ marginTop: 12 }}>
            <DirectiveButton
              label="Exportar Backup .celsus.zip"
              variant="primary"
              materialIcon="file-download"
              onPress={handleExportDossier}
            />
          </View>

          {lastExport && (
            <View style={styles.manifestBox}>
              <Text style={styles.manifestTitle}>
                MANIFESTO GERADO: {lastExport.fileName}
              </Text>
              <Text style={styles.manifestHashLine}>
                Formato: {lastExport.manifest.format} (v
                {lastExport.manifest.schemaVersion})
              </Text>
              <Text style={styles.manifestHashLine}>
                portfolios.csv: {lastExport.manifest.files['portfolios.csv'].rows}{' '}
                linhas | SHA-256:{' '}
                {lastExport.manifest.files['portfolios.csv'].sha256.slice(0, 16)}...
              </Text>
              <Text style={styles.manifestHashLine}>
                assets.csv: {lastExport.manifest.files['assets.csv'].rows} linhas |
                SHA-256:{' '}
                {lastExport.manifest.files['assets.csv'].sha256.slice(0, 16)}...
              </Text>
              <Text style={styles.manifestHashLine}>
                transactions.csv:{' '}
                {lastExport.manifest.files['transactions.csv'].rows} linhas |
                SHA-256:{' '}
                {lastExport.manifest.files['transactions.csv'].sha256.slice(0, 16)}
                ...
              </Text>
            </View>
          )}
        </View>

        {/* 3. Importação e Recuperação (Restore vs Merge) */}
        <View style={styles.bentoCard}>
          <View style={styles.sectionTitleRow}>
            <MaterialIcons
              name="restore-page"
              size={18}
              color={colors.primary}
            />
            <Text style={styles.sectionLabel}>
              IMPORTAR E VALIDAR INTEGRIDADE
            </Text>
          </View>
          <Text style={styles.cardHelperText}>
            Antes de tocar no banco SQLite local, o Celsus valida o hash SHA-256
            de cada CSV. Qualquer adulteração de 1 byte aborta a operação.
          </Text>

          {/* Seletor de Modo: MERGE vs RESTORE */}
          <View style={styles.modeSelectorRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedImportMode('MERGE')}
              style={[
                styles.modeOption,
                selectedImportMode === 'MERGE' && styles.modeOptionActive,
              ]}
            >
              <MaterialIcons
                name="merge-type"
                size={18}
                color={
                  selectedImportMode === 'MERGE'
                    ? colors.primary
                    : '#8A8C90'
                }
              />
              <Text
                style={[
                  styles.modeOptionTitle,
                  selectedImportMode === 'MERGE' && styles.modeOptionTitleActive,
                ]}
              >
                MESCLAR (UUID)
              </Text>
              <Text style={styles.modeOptionSub}>
                Preserva dados atuais e recalcula PM sem duplicar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedImportMode('RESTORE')}
              style={[
                styles.modeOption,
                selectedImportMode === 'RESTORE' && styles.modeOptionActive,
              ]}
            >
              <MaterialIcons
                name="settings-backup-restore"
                size={18}
                color={
                  selectedImportMode === 'RESTORE'
                    ? colors.primary
                    : '#8A8C90'
                }
              />
              <Text
                style={[
                  styles.modeOptionTitle,
                  selectedImportMode === 'RESTORE' &&
                    styles.modeOptionTitleActive,
                ]}
              >
                RESTORE TOTAL
              </Text>
              <Text style={styles.modeOptionSub}>
                Substitui todas as tabelas pelo arquivo importado
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 12 }}>
            <DirectiveButton
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.margin,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: borders.hairline,
    borderBottomColor: '#26292C',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borders.hairline,
    borderColor: '#303336',
  },
  headerTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.parchmentPale,
  },
  headerSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: colors.secondary,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.margin,
    gap: 16,
    paddingBottom: 40,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  cardHelperText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#A0A4A8',
    lineHeight: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
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
  settingDesc: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: '#8A8C90',
    marginTop: 2,
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
  manifestBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#141618',
    borderWidth: borders.hairline,
    borderColor: '#2E4A44',
  },
  manifestTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: '#AECDC5',
    marginBottom: 4,
  },
  manifestHashLine: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#9BA0A6',
    lineHeight: 14,
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
  modeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#241B16',
  },
  modeOptionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#9BA0A6',
    marginTop: 4,
  },
  modeOptionTitleActive: {
    color: colors.parchmentPale,
  },
  modeOptionSub: {
    fontFamily: typography.fontFamily,
    fontSize: 9,
    color: '#7A7E82',
    marginTop: 2,
    lineHeight: 13,
  },
});
