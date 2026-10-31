import { Portfolio, PortfolioClassTarget, Asset, Transaction } from '../db/schema';
import { PortfolioRepository, portfolioRepository } from '../repositories/portfolioRepository';
import { AssetRepository, assetRepository } from '../repositories/assetRepository';
import { TransactionRepository, transactionRepository } from '../repositories/transactionRepository';

export type BackupImportMode = 'RESTORE' | 'MERGE';

export interface ManifestFileEntry {
  rows: number;
  sha256: string;
}

export interface BackupManifest {
  format: 'CELSUS_ARCHIVE';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  currency: 'BRL';
  files: {
    'portfolios.csv': ManifestFileEntry;
    'class_targets.csv': ManifestFileEntry;
    'assets.csv': ManifestFileEntry;
    'transactions.csv': ManifestFileEntry;
    [key: string]: ManifestFileEntry;
  };
}

export interface BackupDatabaseSnapshot {
  portfolios: Portfolio[];
  classTargets: PortfolioClassTarget[];
  assets: Asset[];
  transactions: Transaction[];
}

export interface ExportArchiveResult {
  fileName: string;
  zipBytes: Uint8Array;
  manifest: BackupManifest;
  files: {
    'manifest.json': string;
    'portfolios.csv': string;
    'class_targets.csv': string;
    'assets.csv': string;
    'transactions.csv': string;
  };
}

export interface ImportArchiveResult {
  success: boolean;
  mode: BackupImportMode;
  importedCounts: {
    portfolios: number;
    classTargets: number;
    assets: number;
    transactions: number;
  };
  manifest: BackupManifest;
}

export interface IBackupStorageAdapter {
  getSnapshot(): Promise<BackupDatabaseSnapshot>;
  replaceAll(snapshot: BackupDatabaseSnapshot): Promise<void>;
  mergeByUuid(snapshot: BackupDatabaseSnapshot): Promise<void>;
}

export class BackupService {
  constructor(
    protected storageAdapter?: IBackupStorageAdapter,
    protected portfolioRepo: PortfolioRepository = portfolioRepository,
    protected assetRepo: AssetRepository = assetRepository,
    protected txRepo: TransactionRepository = transactionRepository
  ) {}

  /**
   * Calcula o hash SHA-256 hexadecimal (lowercase) de uma string UTF-8 ou bytes.
   */
  static computeSha256(_content: string | Uint8Array): string {
    throw new Error('Not implemented: BackupService.computeSha256');
  }

  /**
   * Compacta um mapa de arquivos UTF-8 em um pacote .zip (Uint8Array).
   */
  static createZipArchive(_files: Record<string, string>): Uint8Array {
    throw new Error('Not implemented: BackupService.createZipArchive');
  }

  /**
   * Descompacta um pacote .zip (Uint8Array) retornando o mapa de arquivos UTF-8.
   */
  static extractZipArchive(_zipBytes: Uint8Array): Record<string, string> {
    throw new Error('Not implemented: BackupService.extractZipArchive');
  }

  /**
   * S6-T01: Gera o pacote .celsus.zip contendo manifest.json + 4 arquivos CSV
   * com hashes SHA-256 e contagem de linhas exatos.
   */
  async exportDossierArchive(
    _snapshotOverride?: BackupDatabaseSnapshot,
    _exportDate?: Date
  ): Promise<ExportArchiveResult> {
    throw new Error('Not implemented: BackupService.exportDossierArchive');
  }

  /**
   * S6-T02 & S6-T03: Valida integridade SHA-256 do pacote .celsus.zip e executa
   * importação transacional em modo RESTORE (substituir tudo) ou MERGE (por UUID v4).
   */
  async importDossierArchive(
    _zipBytes: Uint8Array,
    _mode: BackupImportMode
  ): Promise<ImportArchiveResult> {
    throw new Error('Not implemented: BackupService.importDossierArchive');
  }
}

export const backupService = new BackupService();
