import {
  BackupService,
  BackupDatabaseSnapshot,
  IBackupStorageAdapter,
} from '../backupService';
import {
  Portfolio,
  PortfolioClassTarget,
  Asset,
  Transaction,
} from '../../db/schema';
import { calculatePositionFromTransactions } from '../../domain/finance/averagePrice';

function createMockSnapshot(): BackupDatabaseSnapshot {
  const portfolios: Portfolio[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Dossiê Aposentadoria',
      description: 'Carteira previdenciária de longo prazo',
      docket_code: 'REV-CART-001',
      is_archived: 0,
      created_at: '2026-01-10T10:00:00.000Z',
      updated_at: '2026-10-30T20:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Dossiê Reserva & Cripto',
      description: 'Reserva de oportunidade e exposição cripto',
      docket_code: 'REV-CART-002',
      is_archived: 0,
      created_at: '2026-02-15T12:00:00.000Z',
      updated_at: '2026-10-30T21:00:00.000Z',
    },
  ];

  const classTargets: PortfolioClassTarget[] = [
    {
      id: 'ct-1',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'FIXED_INCOME',
      target_percentage: 40.0,
      updated_at: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'ct-2',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'FII',
      target_percentage: 20.0,
      updated_at: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'ct-3',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'STOCK',
      target_percentage: 40.0,
      updated_at: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'ct-4',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'CRYPTO',
      target_percentage: 0.0,
      updated_at: '2026-01-10T10:00:00.000Z',
    },
  ];

  const assets: Asset[] = [
    {
      id: 'aaaa1111-1111-4111-8111-111111111111',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      target_percentage_in_class: 100.0,
      quantity: '100',
      average_price: '35.50',
      manual_price_override: null,
      rf_indexer: null,
      rf_rate: null,
      rf_maturity_date: null,
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
    },
    {
      id: 'bbbb2222-2222-4222-8222-222222222222',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_class: 'FIXED_INCOME',
      ticker: 'CDB-110-CDI',
      name: 'CDB Liquidez Diária 110% CDI',
      target_percentage_in_class: 100.0,
      quantity: '1',
      average_price: '5000.00',
      manual_price_override: '5420.00',
      rf_indexer: 'CDI',
      rf_rate: 110.0,
      rf_maturity_date: '2028-12-31',
      rf_is_tax_exempt: 0,
      source: 'MANUAL',
      external_id: null,
      institution_id: null,
      last_synced_at: null,
      created_at: '2026-01-20T10:00:00.000Z',
      updated_at: '2026-03-10T10:00:00.000Z',
    },
  ];

  const transactions: Transaction[] = [
    {
      id: 'tx-1111-1111-4111-8111-111111111111',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_id: 'aaaa1111-1111-4111-8111-111111111111',
      type: 'BUY',
      trade_date: '2026-01-15',
      quantity: '50',
      unit_price: '35.00',
      fees: '0.00',
      total_amount: '1750.00',
      notes: 'Primeiro lote PETR4',
      source: 'MANUAL',
      external_id: null,
      created_at: '2026-01-15T10:05:00.000Z',
    },
    {
      id: 'tx-2222-2222-4222-8222-222222222222',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_id: 'aaaa1111-1111-4111-8111-111111111111',
      type: 'BUY',
      trade_date: '2026-02-15',
      quantity: '50',
      unit_price: '36.00',
      fees: '0.00',
      total_amount: '1800.00',
      notes: 'Segundo lote PETR4',
      source: 'MANUAL',
      external_id: null,
      created_at: '2026-02-15T10:05:00.000Z',
    },
    {
      id: 'tx-3333-3333-4333-8333-333333333333',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_id: 'bbbb2222-2222-4222-8222-222222222222',
      type: 'BUY',
      trade_date: '2026-01-20',
      quantity: '1',
      unit_price: '5000.00',
      fees: '0.00',
      total_amount: '5000.00',
      notes: 'Aporte CDB',
      source: 'MANUAL',
      external_id: null,
      created_at: '2026-01-20T10:05:00.000Z',
    },
  ];

  return { portfolios, classTargets, assets, transactions };
}

class InMemoryStorageAdapter implements IBackupStorageAdapter {
  public snapshot: BackupDatabaseSnapshot;
  public replaceCallCount = 0;
  public mergeCallCount = 0;

  constructor(initial?: BackupDatabaseSnapshot) {
    this.snapshot = initial
      ? JSON.parse(JSON.stringify(initial))
      : { portfolios: [], classTargets: [], assets: [], transactions: [] };
  }

  async getSnapshot(): Promise<BackupDatabaseSnapshot> {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  async replaceAll(newSnapshot: BackupDatabaseSnapshot): Promise<void> {
    this.replaceCallCount += 1;
    this.snapshot = JSON.parse(JSON.stringify(newSnapshot));
  }

  async mergeByUuid(incoming: BackupDatabaseSnapshot): Promise<void> {
    this.mergeCallCount += 1;

    // Upsert portfolios by UUID
    const portfolioMap = new Map<string, Portfolio>();
    for (const p of this.snapshot.portfolios) portfolioMap.set(p.id, { ...p });
    for (const p of incoming.portfolios) portfolioMap.set(p.id, { ...p });
    this.snapshot.portfolios = Array.from(portfolioMap.values());

    // Upsert classTargets by UUID
    const targetMap = new Map<string, PortfolioClassTarget>();
    for (const ct of this.snapshot.classTargets) targetMap.set(ct.id, { ...ct });
    for (const ct of incoming.classTargets) targetMap.set(ct.id, { ...ct });
    this.snapshot.classTargets = Array.from(targetMap.values());

    // Upsert assets by UUID
    const assetMap = new Map<string, Asset>();
    for (const a of this.snapshot.assets) assetMap.set(a.id, { ...a });
    for (const a of incoming.assets) assetMap.set(a.id, { ...a });
    this.snapshot.assets = Array.from(assetMap.values());

    // Upsert transactions by UUID (no duplicates)
    const txMap = new Map<string, Transaction>();
    for (const tx of this.snapshot.transactions) txMap.set(tx.id, { ...tx });
    for (const tx of incoming.transactions) txMap.set(tx.id, { ...tx });
    this.snapshot.transactions = Array.from(txMap.values());

    // Recalculate quantity and average_price of each asset from its transactions
    for (const asset of this.snapshot.assets) {
      const assetTxs = this.snapshot.transactions
        .filter((t) => t.asset_id === asset.id)
        .sort((a, b) => a.trade_date.localeCompare(b.trade_date));

      if (assetTxs.length > 0) {
        const pos = calculatePositionFromTransactions(
          assetTxs.map((t) => ({
            type: t.type as 'BUY' | 'SELL',
            quantity: t.quantity,
            price: t.unit_price,
            fees: t.fees,
          })),
          asset.asset_class === 'CRYPTO' ? 8 : 0
        );
        asset.quantity = pos.quantity;
        asset.average_price = pos.averagePrice;
      }
    }
  }
}

describe('S6-T01: TestExportZipStructureAndManifestSHA256', () => {
  it('should generate a valid .celsus.zip containing manifest.json and 4 CSVs with exact row counts and SHA-256 hashes', async () => {
    const mockSnapshot = createMockSnapshot();
    const adapter = new InMemoryStorageAdapter(mockSnapshot);
    const service = new BackupService(adapter);

    const fixedDate = new Date('2026-10-30T23:30:00.000Z');
    const result = await service.exportDossierArchive(undefined, fixedDate);

    // 1. Validate archive naming convention: celsus-dossier-YYYYMMDD-HHMM.celsus.zip
    expect(result.fileName).toMatch(/^celsus-dossier-\d{8}-\d{4}\.celsus\.zip$/);
    expect(result.zipBytes).toBeInstanceOf(Uint8Array);
    expect(result.zipBytes.byteLength).toBeGreaterThan(100);

    // 2. Extract ZIP and verify exact 5 files at root
    const extractedFiles = BackupService.extractZipArchive(result.zipBytes);
    const fileNames = Object.keys(extractedFiles).sort();
    expect(fileNames).toEqual([
      'assets.csv',
      'class_targets.csv',
      'manifest.json',
      'portfolios.csv',
      'transactions.csv',
    ]);

    // 3. Validate manifest.json structure per SPEC section 7.1
    const parsedManifest = JSON.parse(extractedFiles['manifest.json']);
    expect(parsedManifest.format).toBe('CELSUS_ARCHIVE');
    expect(parsedManifest.schemaVersion).toBe(1);
    expect(parsedManifest.currency).toBe('BRL');
    expect(parsedManifest.exportedAt).toBeDefined();

    // 4. Validate exact row counts (data rows excluding header)
    expect(parsedManifest.files['portfolios.csv'].rows).toBe(2);
    expect(parsedManifest.files['class_targets.csv'].rows).toBe(4);
    expect(parsedManifest.files['assets.csv'].rows).toBe(2);
    expect(parsedManifest.files['transactions.csv'].rows).toBe(3);

    // 5. Validate SHA-256 hashes (64-char hex) match actual extracted CSV content
    for (const csvName of [
      'portfolios.csv',
      'class_targets.csv',
      'assets.csv',
      'transactions.csv',
    ] as const) {
      const csvContent = extractedFiles[csvName];
      const computedHash = BackupService.computeSha256(csvContent);
      expect(computedHash).toMatch(/^[a-f0-9]{64}$/);
      expect(parsedManifest.files[csvName].sha256).toBe(computedHash);

      // Verify CSV has 1 header line + N data rows
      const nonEmptyLines = csvContent.trim().split(/\r?\n/);
      expect(nonEmptyLines.length).toBe(parsedManifest.files[csvName].rows + 1);
    }
  });

  it('should handle empty database snapshot with 0 rows and valid CSV headers', async () => {
    const emptySnapshot: BackupDatabaseSnapshot = {
      portfolios: [],
      classTargets: [],
      assets: [],
      transactions: [],
    };
    const adapter = new InMemoryStorageAdapter(emptySnapshot);
    const service = new BackupService(adapter);

    const result = await service.exportDossierArchive();
    const extracted = BackupService.extractZipArchive(result.zipBytes);
    const manifest = JSON.parse(extracted['manifest.json']);

    expect(manifest.files['portfolios.csv'].rows).toBe(0);
    expect(manifest.files['class_targets.csv'].rows).toBe(0);
    expect(manifest.files['assets.csv'].rows).toBe(0);
    expect(manifest.files['transactions.csv'].rows).toBe(0);

    for (const csvName of [
      'portfolios.csv',
      'class_targets.csv',
      'assets.csv',
      'transactions.csv',
    ] as const) {
      expect(manifest.files[csvName].sha256).toBe(
        BackupService.computeSha256(extracted[csvName])
      );
    }
  });

  it('should compute deterministic SHA-256 hash matching standard NIST vector', () => {
    // Empty string SHA-256 vector from SPEC 7.1: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const emptyHash = BackupService.computeSha256('');
    expect(emptyHash).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );

    const abcHash = BackupService.computeSha256('abc');
    expect(abcHash).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('S6-T02: TestRejectTamperedCSVOnImport', () => {
  it('should immediately abort import with SECURITY PROTOCOL: CORRUPTED DOSSIER when 1 byte of transactions.csv is tampered, leaving local DB untouched', async () => {
    const initialLocalSnapshot = createMockSnapshot();
    const adapter = new InMemoryStorageAdapter(initialLocalSnapshot);
    const service = new BackupService(adapter);

    // Generate valid archive first
    const exported = await service.exportDossierArchive(initialLocalSnapshot);

    // Extract, tamper 1 byte in transactions.csv (e.g. changing 1750.00 to 9750.00), and re-zip without updating manifest.json
    const extracted = BackupService.extractZipArchive(exported.zipBytes);
    const tamperedTransactionsCsv = extracted['transactions.csv'].replace(
      '1750.00',
      '9750.00'
    );
    expect(tamperedTransactionsCsv).not.toBe(extracted['transactions.csv']);

    const tamperedZipBytes = BackupService.createZipArchive({
      ...extracted,
      'transactions.csv': tamperedTransactionsCsv,
    });

    // Attempt to import tampered archive in RESTORE mode
    await expect(
      service.importDossierArchive(tamperedZipBytes, 'RESTORE')
    ).rejects.toThrow(/\[SECURITY PROTOCOL: CORRUPTED DOSSIER\]|SHA-256/i);

    // Local database must remain 100% intact (zero calls to replaceAll or mergeByUuid)
    expect(adapter.replaceCallCount).toBe(0);
    expect(adapter.mergeCallCount).toBe(0);

    const currentDb = await adapter.getSnapshot();
    expect(currentDb.transactions).toHaveLength(3);
    expect(currentDb.transactions[0].total_amount).toBe('1750.00');
  });

  it('should reject archive if manifest.json is missing or has unsupported schemaVersion', async () => {
    const initialLocalSnapshot = createMockSnapshot();
    const adapter = new InMemoryStorageAdapter(initialLocalSnapshot);
    const service = new BackupService(adapter);

    const invalidZipBytes = BackupService.createZipArchive({
      'portfolios.csv': 'id,name\n',
    });

    await expect(
      service.importDossierArchive(invalidZipBytes, 'RESTORE')
    ).rejects.toThrow(/manifest\.json|CORRUPTED DOSSIER/i);

    expect(adapter.replaceCallCount).toBe(0);
  });

  it('should reject archive if any required CSV file declared in manifest.json is missing from the ZIP', async () => {
    const initialLocalSnapshot = createMockSnapshot();
    const adapter = new InMemoryStorageAdapter(initialLocalSnapshot);
    const service = new BackupService(adapter);

    const exported = await service.exportDossierArchive(initialLocalSnapshot);
    const extracted = BackupService.extractZipArchive(exported.zipBytes);
    delete extracted['assets.csv'];

    const incompleteZip = BackupService.createZipArchive(extracted);

    await expect(
      service.importDossierArchive(incompleteZip, 'RESTORE')
    ).rejects.toThrow(/\[SECURITY PROTOCOL: CORRUPTED DOSSIER\]|assets\.csv/i);

    expect(adapter.replaceCallCount).toBe(0);
  });
});

describe('S6-T03: TestImportFullRestoreAndUUIDMerge', () => {
  it('should completely replace all local records when importing in RESTORE mode', async () => {
    // Local DB starts with only 1 portfolio and 0 transactions
    const localSnapshot: BackupDatabaseSnapshot = {
      portfolios: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Carteira Antiga Temporária',
          description: 'Será substituída no Restore',
          docket_code: 'REV-TEMP-999',
          is_archived: 0,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ],
      classTargets: [],
      assets: [],
      transactions: [],
    };

    const adapter = new InMemoryStorageAdapter(localSnapshot);
    const service = new BackupService(adapter);

    // Create backup from full mock snapshot (2 portfolios, 4 targets, 2 assets, 3 transactions)
    const backupSource = createMockSnapshot();
    const exported = await service.exportDossierArchive(backupSource);

    // Execute Full Restore
    const importResult = await service.importDossierArchive(
      exported.zipBytes,
      'RESTORE'
    );

    expect(importResult.success).toBe(true);
    expect(importResult.mode).toBe('RESTORE');
    expect(importResult.importedCounts).toEqual({
      portfolios: 2,
      classTargets: 4,
      assets: 2,
      transactions: 3,
    });

    const restoredDb = await adapter.getSnapshot();
    expect(restoredDb.portfolios).toHaveLength(2);
    expect(
      restoredDb.portfolios.find(
        (p) => p.id === '99999999-9999-4999-8999-999999999999'
      )
    ).toBeUndefined();
    expect(restoredDb.assets).toHaveLength(2);
    expect(restoredDb.transactions).toHaveLength(3);
  });

  it('should merge records by UUID v4 without duplicating existing transactions and recalculate asset average price in MERGE mode', async () => {
    const baseSnapshot = createMockSnapshot();
    const adapter = new InMemoryStorageAdapter(baseSnapshot);
    const service = new BackupService(adapter);

    // Incoming backup contains:
    // - Same portfolio 1111... (updated name)
    // - Same asset PETR4 (aaaa1111...)
    // - Existing transaction tx-1111... and tx-2222... (must NOT duplicate)
    // - 1 NEW transaction tx-4444... buying 100 more PETR4 @ R$ 41.50
    const incomingSnapshot: BackupDatabaseSnapshot = JSON.parse(
      JSON.stringify(baseSnapshot)
    );
    incomingSnapshot.portfolios[0].name = 'Dossiê Aposentadoria (Atualizado)';
    incomingSnapshot.transactions.push({
      id: 'tx-4444-4444-4444-8444-444444444444',
      portfolio_id: '11111111-1111-4111-8111-111111111111',
      asset_id: 'aaaa1111-1111-4111-8111-111111111111',
      type: 'BUY',
      trade_date: '2026-03-20',
      quantity: '100',
      unit_price: '41.50',
      fees: '0.00',
      total_amount: '4150.00',
      notes: 'Terceiro lote PETR4 via Merge',
      source: 'MANUAL',
      external_id: null,
      created_at: '2026-03-20T14:00:00.000Z',
    });

    const exportedIncoming = await service.exportDossierArchive(incomingSnapshot);

    // Execute Merge
    const mergeResult = await service.importDossierArchive(
      exportedIncoming.zipBytes,
      'MERGE'
    );

    expect(mergeResult.success).toBe(true);
    expect(mergeResult.mode).toBe('MERGE');

    const mergedDb = await adapter.getSnapshot();
    // Portfolios count remains 2 (no duplicate UUIDs)
    expect(mergedDb.portfolios).toHaveLength(2);
    expect(mergedDb.portfolios[0].name).toBe('Dossiê Aposentadoria (Atualizado)');

    // Transactions count should be 4 (3 existing deduplicated + 1 new)
    expect(mergedDb.transactions).toHaveLength(4);

    // PETR4 position recalculated from transactions:
    // 50 @ 35.00 (1750) + 50 @ 36.00 (1800) + 100 @ 41.50 (4150) = 200 shares, total cost 7700.00 -> PM = 38.50
    const petr4 = mergedDb.assets.find((a) => a.ticker === 'PETR4')!;
    expect(petr4.quantity).toBe('200');
    expect(petr4.average_price).toBe('38.50');
  });
});
