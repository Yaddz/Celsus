import { useCallback, useEffect, useState } from 'react';
import { backupService, BackupImportMode, ExportArchiveResult } from '../../services/backupService';
import { privacyAndAuthService } from '../../services/privacyAndAuth';
import { authService } from '../../services/authService';
import { sessionStore } from '../../stores/sessionStore';
import { describeImportReport, spreadsheetImportService } from '../../services/spreadsheetImportService';
import { ThemeMode, themeModeService } from '../../theme/palettes';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';

export interface StatusBanner {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

export interface LocalWalletSummary {
  id: string;
  name: string;
  assetCount: number;
  patrimonyGoal: string | null;
}

interface Options {
  themeMode?: ThemeMode;
  onTogglePrivacyMode: (enabled: boolean) => void;
  onThemeModeChange?: (mode: ThemeMode) => void;
  onDataRestored?: () => void;
}

/** Estado e ações da tela de Perfil: tema, segurança, backup, importação e resumo local. */
export function useProfileSettings({ themeMode, onTogglePrivacyMode, onThemeModeChange, onDataRestored }: Options) {
  const [currentThemeMode, setCurrentThemeMode] = useState<ThemeMode>(themeMode || themeModeService.getThemeMode());
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(sessionStore.getState().status === 'locked');
  const [importMode, setImportMode] = useState<BackupImportMode>('MERGE');
  const [lastExport, setLastExport] = useState<ExportArchiveResult | null>(null);
  const [banner, setBanner] = useState<StatusBanner | null>(null);
  const [wallets, setWallets] = useState<LocalWalletSummary[]>([]);

  const loadWallets = useCallback(async () => {
    try {
      const list = await portfolioRepository.listPortfolios(false);
      const rows = await Promise.all(
        list.map(async (p) => ({
          id: p.id,
          name: p.name,
          assetCount: (await assetRepository.getAssetsByPortfolio(p.id)).length,
          patrimonyGoal: p.patrimony_goal ?? null,
        }))
      );
      setWallets(rows);
    } catch {
      setWallets([]);
    }
  }, []);

  useEffect(() => {
    loadWallets();
    authService.isBiometricEnabled().then(setIsBiometricEnabled).catch(() => {});
  }, [loadWallets]);

  const afterDataChange = useCallback(() => {
    loadWallets();
    onDataRestored?.();
  }, [loadWallets, onDataRestored]);

  const selectTheme = (mode: ThemeMode) => {
    setCurrentThemeMode(mode);
    themeModeService.setThemeMode(mode);
    onThemeModeChange?.(mode);
  };

  const togglePrivacy = (val: boolean) => {
    privacyAndAuthService.setPrivacyMode(val);
    onTogglePrivacyMode(val);
  };

  const toggleBiometrics = async (val: boolean) => {
    if (val) {
      const res = await authService.enableBiometrics();
      if (res.success) {
        setIsBiometricEnabled(true);
        setBanner({
          type: 'info',
          title: 'BLOQUEIO BIOMÉTRICO ATIVADO',
          message: 'O Celsus exigirá autenticação biométrica ou PIN ao abrir o app.',
        });
      } else {
        const message =
          res.reason === 'pin_required'
            ? 'Crie um PIN antes de ativar a biometria.'
            : res.reason === 'biometrics_unavailable'
            ? 'Biometria não disponível neste aparelho ou nenhuma digital cadastrada no sistema.'
            : 'Autenticação biométrica cancelada ou não reconhecida.';
        setBanner({
          type: 'error',
          title: 'NÃO FOI POSSÍVEL ATIVAR',
          message,
        });
      }
    } else {
      await authService.disableBiometrics();
      setIsBiometricEnabled(false);
      setBanner({
        type: 'info',
        title: 'BLOQUEIO BIOMÉTRICO DESATIVADO',
        message: 'A exigência de biometria ao iniciar foi desativada.',
      });
    }
  };

  const testBiometricLock = async () => {
    sessionStore.lock();
    setIsAppLocked(true);
    const auth = await authService.authenticateBiometric('Autenticar acesso ao Celsus');
    if (auth.success) {
      sessionStore.unlock();
      setIsAppLocked(false);
      setBanner({
        type: 'success',
        title: 'AUTENTICAÇÃO BIOMÉTRICA CONFIRMADA',
        message: 'Identidade verificada com sucesso pelo motor de segurança local.',
      });
    } else {
      setBanner({
        type: 'error',
        title: 'FALHA NA AUTENTICAÇÃO BIOMÉTRICA',
        message: `Não foi possível desbloquear: ${auth.reason || 'cancelado'}.`,
      });
    }
  };

  const exportDossier = async () => {
    try {
      const exported = await backupService.exportDossierArchive();
      setLastExport(exported);
      const { files } = exported.manifest;
      setBanner({
        type: 'success',
        title: 'ARQUIVO .CELSUS.ZIP GERADO COM SUCESSO',
        message:
          `Pacote: ${exported.fileName} (${exported.zipBytes.byteLength} bytes)\n` +
          `• portfolios.csv (${files['portfolios.csv'].rows} linhas) — SHA-256: ${files['portfolios.csv'].sha256.slice(0, 12)}...\n` +
          `• assets.csv (${files['assets.csv'].rows} linhas) — SHA-256: ${files['assets.csv'].sha256.slice(0, 12)}...\n` +
          `• transactions.csv (${files['transactions.csv'].rows} linhas) — SHA-256: ${files['transactions.csv'].sha256.slice(0, 12)}...`,
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        title: 'ERRO AO EXPORTAR BACKUP',
        message: err?.message || 'Falha inesperada na geração do pacote .celsus.zip.',
      });
    }
  };

  const importDossier = async () => {
    try {
      const archive = lastExport || (await backupService.exportDossierArchive());
      const res = await backupService.importDossierArchive(archive.zipBytes, importMode);
      setBanner({
        type: 'success',
        title: res.mode === 'RESTORE' ? 'RESTAURAÇÃO COMPLETA CONCLUÍDA' : 'DADOS MESCLADOS COM SUCESSO',
        message:
          `Integridade SHA-256 verificada em todos os 4 CSVs.\n` +
          `Carteiras: ${res.importedCounts.portfolios} | Ativos: ${res.importedCounts.assets} | Transações: ${res.importedCounts.transactions}`,
      });
      afterDataChange();
    } catch (err: any) {
      setBanner({
        type: 'error',
        title: 'IMPORTAÇÃO NÃO REALIZADA: ARQUIVO INVÁLIDO',
        message: err?.message || 'Arquivo .celsus.zip corrompido ou inválido.',
      });
    }
  };

  const importSpreadsheet = async () => {
    try {
      const r = await spreadsheetImportService.importSeed();
      const ok = r.failures.length === 0 && r.verification.matches;
      setBanner({
        type: ok ? 'success' : 'error',
        title: ok ? 'Planilha importada na carteira AUVP' : 'Planilha importada com pendências',
        message: describeImportReport(r),
      });
      afterDataChange();
    } catch (e: any) {
      setBanner({ type: 'error', title: 'Falha ao importar planilha', message: e?.message ?? 'Erro inesperado.' });
    }
  };

  return {
    currentThemeMode,
    isLight: currentThemeMode === 'light',
    selectTheme,
    isBiometricEnabled,
    isAppLocked,
    toggleBiometrics,
    testBiometricLock,
    togglePrivacy,
    importMode,
    setImportMode,
    lastExport,
    exportDossier,
    importDossier,
    importSpreadsheet,
    banner,
    wallets,
  };
}
