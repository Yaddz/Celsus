/**
 * Sprint 93 — Perfil: "Exportar backup" grava e compartilha o .celsus.zip;
 * "Importar" lê o arquivo escolhido pelo usuário, não o último pacote em memória.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';

jest.mock('../../services/backupService', () => ({
  backupService: {
    exportDossierArchive: jest.fn(),
    importDossierArchive: jest.fn(),
  },
}));

jest.mock('../../services/backupFileService', () => ({
  backupFileService: {
    saveAndShareArchive: jest.fn(),
    pickArchive: jest.fn(),
  },
}));

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: { listPortfolios: jest.fn(async () => []) },
}));

jest.mock('../../repositories/assetRepository', () => ({
  assetRepository: { getAssetsByPortfolio: jest.fn(async () => []) },
}));

jest.mock('../../services/authService', () => ({
  authService: {
    isBiometricEnabled: jest.fn(async () => false),
    enableBiometrics: jest.fn(),
    disableBiometrics: jest.fn(),
    authenticateBiometric: jest.fn(),
  },
}));

jest.mock('../../services/spreadsheetImportService', () => ({
  spreadsheetImportService: { importSeed: jest.fn() },
  describeImportReport: jest.fn(() => ''),
}));

import { backupService } from '../../services/backupService';
import { backupFileService } from '../../services/backupFileService';
import { useProfileSettings } from '../profile/useProfileSettings';

type HookResult = ReturnType<typeof useProfileSettings>;

const fileInfo = (rows: number) => ({ rows, sha256: 'a'.repeat(64) });
const EXPORTED = {
  fileName: 'celsus-dossier-20261117-1903.celsus.zip',
  zipBytes: new Uint8Array([0x50, 0x4b, 3, 4]),
  manifest: {
    files: {
      'portfolios.csv': fileInfo(2),
      'assets.csv': fileInfo(19),
      'transactions.csv': fileInfo(40),
    },
  },
  files: {},
};

function renderHookHarness(onDataRestored = jest.fn()) {
  const ref: { current: HookResult | null } = { current: null };
  function Harness() {
    ref.current = useProfileSettings({ onTogglePrivacyMode: jest.fn(), onDataRestored });
    return null;
  }
  render(<Harness />);
  return ref;
}

beforeEach(() => {
  jest.clearAllMocks();
  (backupService.exportDossierArchive as jest.Mock).mockResolvedValue(EXPORTED);
  (backupService.importDossierArchive as jest.Mock).mockResolvedValue({
    mode: 'MERGE',
    importedCounts: { portfolios: 2, assets: 19, transactions: 40 },
  });
  (backupFileService.saveAndShareArchive as jest.Mock).mockResolvedValue({
    uri: 'file:///cache/celsus-dossier-20261117-1903.celsus.zip',
    shared: true,
  });
});

describe('Sprint 93 — Perfil: backup compartilhável', () => {
  it('S93-T04: exportar gera o pacote e entrega ao compartilhamento do sistema', async () => {
    const hook = renderHookHarness();
    await act(async () => {
      await hook.current!.exportDossier();
    });

    expect(backupFileService.saveAndShareArchive).toHaveBeenCalledTimes(1);
    expect(backupFileService.saveAndShareArchive).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: EXPORTED.fileName, zipBytes: EXPORTED.zipBytes })
    );
    expect(hook.current!.banner?.type).toBe('success');
    expect(hook.current!.banner?.message).toContain(EXPORTED.fileName);
    expect(hook.current!.lastExport?.fileName).toBe(EXPORTED.fileName);
  });

  it('S93-T05: sem compartilhamento disponível, o aviso diz onde o arquivo ficou', async () => {
    (backupFileService.saveAndShareArchive as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/celsus-dossier-20261117-1903.celsus.zip',
      shared: false,
    });
    const hook = renderHookHarness();
    await act(async () => {
      await hook.current!.exportDossier();
    });
    expect(hook.current!.banner?.message).toContain('file:///cache/celsus-dossier-20261117-1903.celsus.zip');
  });

  it('S93-T06: falha ao gravar/compartilhar vira aviso de erro', async () => {
    (backupFileService.saveAndShareArchive as jest.Mock).mockRejectedValue(new Error('disco cheio'));
    const hook = renderHookHarness();
    await act(async () => {
      await hook.current!.exportDossier();
    });
    expect(hook.current!.banner?.type).toBe('error');
    expect(hook.current!.banner?.title).toBe('ERRO AO EXPORTAR BACKUP');
    expect(hook.current!.banner?.message).toContain('disco cheio');
  });

  it('S93-T07: importar usa o arquivo escolhido no seletor, com o modo selecionado', async () => {
    const pickedBytes = new Uint8Array([0x50, 0x4b, 9, 9]);
    (backupFileService.pickArchive as jest.Mock).mockResolvedValue({
      fileName: 'backup-antigo.celsus.zip',
      zipBytes: pickedBytes,
    });
    const onDataRestored = jest.fn();
    const hook = renderHookHarness(onDataRestored);

    // Mesmo com um pacote exportado em memória, a importação lê o arquivo escolhido
    await act(async () => {
      await hook.current!.exportDossier();
    });
    (backupService.exportDossierArchive as jest.Mock).mockClear();

    await act(async () => {
      hook.current!.setImportMode('RESTORE');
    });
    await act(async () => {
      await hook.current!.importDossier();
    });

    expect(backupFileService.pickArchive).toHaveBeenCalledTimes(1);
    expect(backupService.exportDossierArchive).not.toHaveBeenCalled();
    expect(backupService.importDossierArchive).toHaveBeenCalledWith(pickedBytes, 'RESTORE');
    expect(hook.current!.banner?.type).toBe('success');
    expect(onDataRestored).toHaveBeenCalled();
  });

  it('S93-T08: seletor cancelado não importa nada nem mostra erro', async () => {
    (backupFileService.pickArchive as jest.Mock).mockResolvedValue(null);
    const hook = renderHookHarness();
    await act(async () => {
      await hook.current!.importDossier();
    });
    expect(backupService.importDossierArchive).not.toHaveBeenCalled();
    expect(backupService.exportDossierArchive).not.toHaveBeenCalled();
    expect(hook.current!.banner).toBeNull();
  });

  it('S93-T09: arquivo recusado pelo seletor vira aviso de arquivo inválido', async () => {
    (backupFileService.pickArchive as jest.Mock).mockRejectedValue(new Error('Escolha um arquivo .celsus.zip'));
    const hook = renderHookHarness();
    await act(async () => {
      await hook.current!.importDossier();
    });
    expect(backupService.importDossierArchive).not.toHaveBeenCalled();
    expect(hook.current!.banner?.type).toBe('error');
    expect(hook.current!.banner?.message).toContain('Escolha um arquivo .celsus.zip');
  });
});
