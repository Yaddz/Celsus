import {
  Portfolio,
  PortfolioClassTarget,
  Asset,
  Transaction,
  portfolios as portfoliosTable,
  portfolioClassTargets as classTargetsTable,
  assets as assetsTable,
  transactions as transactionsTable,
} from '../db/schema';
import { getDatabase } from '../db/client';
import { PortfolioRepository, portfolioRepository } from '../repositories/portfolioRepository';
import { AssetRepository, assetRepository } from '../repositories/assetRepository';
import { TransactionRepository, transactionRepository } from '../repositories/transactionRepository';
import { calculatePositionFromTransactions } from '../domain/finance/averagePrice';

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

// ============================================================================
// Pure JS UTF-8 & SHA-256 Implementation (FIPS 180-4)
// ============================================================================

function stringToUtf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    } else {
      i++;
      charcode =
        0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

function utf8BytesToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      const c2 = bytes[i++];
      out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
    } else if (c > 223 && c < 240) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      out += String.fromCharCode(
        ((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63)
      );
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      const u =
        (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) -
        0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023));
    }
  }
  return out;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? stringToUtf8Bytes(input) : input;
  const bitLen = bytes.length * 8;

  // Padding: message + 1 byte (0x80) + zeros + 8 bytes length
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(paddedLen - 8, highBits, false);
  view.setUint32(paddedLen - 4, lowBits, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

// ============================================================================
// Pure JS Standard PKZIP (Method 0 - Store) Reader & Writer
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipBytes(files: Record<string, string>): Uint8Array {
  const fileNames = Object.keys(files);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const name of fileNames) {
    const nameBytes = stringToUtf8Bytes(name);
    const dataBytes = stringToUtf8Bytes(files[name]);
    const fileCrc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + file name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true); // Compression method: 0 (Stored)
    lv.setUint16(10, 0, true); // Last mod file time
    lv.setUint16(12, 0, true); // Last mod file date
    lv.setUint32(14, fileCrc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory file header (46 bytes + file name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0x0800, true); // General purpose bit flag (UTF-8)
    cv.setUint16(10, 0, true); // Compression method: 0 (Stored)
    cv.setUint16(12, 0, true); // Last mod time
    cv.setUint16(14, 0, true); // Last mod date
    cv.setUint32(16, fileCrc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) {
    centralDirSize += part.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, fileNames.length, true); // Number of central directory records on this disk
  ev.setUint16(10, fileNames.length, true); // Total number of central directory records
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = centralDirOffset + centralDirSize + eocd.length;
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);

  return out;
}

function parseZipBytes(zipBytes: Uint8Array): Record<string, string> {
  if (!zipBytes || zipBytes.byteLength < 22) {
    throw new Error('[SECURITY PROTOCOL: CORRUPTED DOSSIER] Invalid ZIP archive.');
  }

  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );

  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = zipBytes.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('[SECURITY PROTOCOL: CORRUPTED DOSSIER] Missing ZIP End of Central Directory.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const files: Record<string, string> = {};

  for (let i = 0; i < totalEntries; i++) {
    const sig = view.getUint32(centralOffset, true);
    if (sig !== 0x02014b50) {
      throw new Error('[SECURITY PROTOCOL: CORRUPTED DOSSIER] Invalid ZIP Central Directory entry.');
    }

    const compressionMethod = view.getUint16(centralOffset + 10, true);
    if (compressionMethod !== 0) {
      throw new Error(`[SECURITY PROTOCOL: CORRUPTED DOSSIER] Unsupported compression method ${compressionMethod}.`);
    }

    const compressedSize = view.getUint32(centralOffset + 20, true);
    const nameLen = view.getUint16(centralOffset + 28, true);
    const extraLen = view.getUint16(centralOffset + 30, true);
    const commentLen = view.getUint16(centralOffset + 32, true);
    const localHeaderOffset = view.getUint32(centralOffset + 42, true);

    const nameBytes = zipBytes.subarray(
      centralOffset + 46,
      centralOffset + 46 + nameLen
    );
    const fileName = utf8BytesToString(nameBytes);

    // Read local header to skip variable extra field length
    const localSig = view.getUint32(localHeaderOffset, true);
    if (localSig !== 0x04034b50) {
      throw new Error('[SECURITY PROTOCOL: CORRUPTED DOSSIER] Invalid ZIP Local File Header.');
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataBytes = zipBytes.subarray(dataStart, dataStart + compressedSize);

    files[fileName] = utf8BytesToString(dataBytes);
    centralOffset += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

// ============================================================================
// CSV Serialization & Deserialization (RFC 4180)
// ============================================================================

const PORTFOLIOS_COLUMNS: (keyof Portfolio)[] = [
  'id',
  'name',
  'description',
  'docket_code',
  'is_archived',
  'created_at',
  'updated_at',
];

const CLASS_TARGETS_COLUMNS: (keyof PortfolioClassTarget)[] = [
  'id',
  'portfolio_id',
  'asset_class',
  'target_percentage',
  'updated_at',
];

const ASSETS_COLUMNS: (keyof Asset)[] = [
  'id',
  'portfolio_id',
  'asset_class',
  'ticker',
  'name',
  'target_percentage_in_class',
  'quantity',
  'average_price',
  'manual_price_override',
  'rf_indexer',
  'rf_rate',
  'rf_maturity_date',
  'rf_is_tax_exempt',
  'source',
  'external_id',
  'institution_id',
  'last_synced_at',
  'created_at',
  'updated_at',
];

const TRANSACTIONS_COLUMNS: (keyof Transaction)[] = [
  'id',
  'portfolio_id',
  'asset_id',
  'type',
  'trade_date',
  'quantity',
  'unit_price',
  'fees',
  'total_amount',
  'notes',
  'source',
  'external_id',
  'created_at',
];

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeToCsv<T extends Record<string, any>>(
  rows: T[],
  columns: (keyof T)[]
): string {
  const header = columns.join(',');
  if (rows.length === 0) {
    return header;
  }
  const dataLines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(row[col])).join(',')
  );
  return [header, ...dataLines].join('\n');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseCsvRecords(csvText: string): Record<string, string>[] {
  const trimmed = csvText.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = parseCsvLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? '';
    });
    records.push(obj);
  }

  return records;
}

function parsePortfoliosFromCsv(csv: string): Portfolio[] {
  return parseCsvRecords(csv).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description === '' ? null : r.description,
    docket_code: r.docket_code,
    is_archived: Number(r.is_archived || 0),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

function parseClassTargetsFromCsv(csv: string): PortfolioClassTarget[] {
  return parseCsvRecords(csv).map((r) => ({
    id: r.id,
    portfolio_id: r.portfolio_id,
    asset_class: r.asset_class,
    target_percentage: Number(r.target_percentage || 0),
    updated_at: r.updated_at,
  }));
}

function parseAssetsFromCsv(csv: string): Asset[] {
  return parseCsvRecords(csv).map((r) => ({
    id: r.id,
    portfolio_id: r.portfolio_id,
    asset_class: r.asset_class,
    ticker: r.ticker,
    name: r.name,
    target_percentage_in_class: Number(r.target_percentage_in_class || 0),
    quantity: r.quantity || '0',
    average_price: r.average_price || '0.00',
    manual_price_override: r.manual_price_override === '' ? null : r.manual_price_override,
    rf_indexer: r.rf_indexer === '' ? null : r.rf_indexer,
    rf_rate: r.rf_rate === '' ? null : Number(r.rf_rate),
    rf_maturity_date: r.rf_maturity_date === '' ? null : r.rf_maturity_date,
    rf_is_tax_exempt: Number(r.rf_is_tax_exempt || 0),
    source: r.source || 'MANUAL',
    external_id: r.external_id === '' ? null : r.external_id,
    institution_id: r.institution_id === '' ? null : r.institution_id,
    last_synced_at: r.last_synced_at === '' ? null : r.last_synced_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

function parseTransactionsFromCsv(csv: string): Transaction[] {
  return parseCsvRecords(csv).map((r) => ({
    id: r.id,
    portfolio_id: r.portfolio_id,
    asset_id: r.asset_id,
    type: r.type,
    trade_date: r.trade_date,
    quantity: r.quantity,
    unit_price: r.unit_price,
    fees: r.fees || '0.00',
    total_amount: r.total_amount,
    notes: r.notes === '' ? null : r.notes,
    source: r.source || 'MANUAL',
    external_id: r.external_id === '' ? null : r.external_id,
    created_at: r.created_at,
  }));
}

// ============================================================================
// Default SQLite Storage Adapter
// ============================================================================

class SqliteBackupStorageAdapter implements IBackupStorageAdapter {
  constructor(
    private portfolioRepo: PortfolioRepository = portfolioRepository,
    private assetRepo: AssetRepository = assetRepository,
    private txRepo: TransactionRepository = transactionRepository
  ) {}

  async getSnapshot(): Promise<BackupDatabaseSnapshot> {
    try {
      const portfolios = await this.portfolioRepo.listPortfolios(true);
      const classTargets: PortfolioClassTarget[] = [];
      const assets: Asset[] = [];
      const transactions: Transaction[] = [];

      for (const p of portfolios) {
        const cts = await this.portfolioRepo.getClassTargets(p.id);
        classTargets.push(...cts);
        const pAssets = await this.assetRepo.getAssetsByPortfolio(p.id);
        assets.push(...pAssets);
        const pTxs = await this.txRepo.getTransactionsByPortfolio(p.id);
        transactions.push(...pTxs);
      }

      return { portfolios, classTargets, assets, transactions };
    } catch {
      return { portfolios: [], classTargets: [], assets: [], transactions: [] };
    }
  }

  async replaceAll(snapshot: BackupDatabaseSnapshot): Promise<void> {
    const db = getDatabase();
    await db.delete(transactionsTable);
    await db.delete(assetsTable);
    await db.delete(classTargetsTable);
    await db.delete(portfoliosTable);

    for (const p of snapshot.portfolios) {
      await db.insert(portfoliosTable).values(p);
    }
    for (const ct of snapshot.classTargets) {
      await db.insert(classTargetsTable).values(ct);
    }
    for (const a of snapshot.assets) {
      await db.insert(assetsTable).values(a);
    }
    for (const tx of snapshot.transactions) {
      await db.insert(transactionsTable).values(tx);
    }
  }

  async mergeByUuid(incoming: BackupDatabaseSnapshot): Promise<void> {
    const current = await this.getSnapshot();

    const portfolioMap = new Map<string, Portfolio>();
    for (const p of current.portfolios) portfolioMap.set(p.id, { ...p });
    for (const p of incoming.portfolios) portfolioMap.set(p.id, { ...p });

    const targetMap = new Map<string, PortfolioClassTarget>();
    for (const ct of current.classTargets) targetMap.set(ct.id, { ...ct });
    for (const ct of incoming.classTargets) targetMap.set(ct.id, { ...ct });

    const assetMap = new Map<string, Asset>();
    for (const a of current.assets) assetMap.set(a.id, { ...a });
    for (const a of incoming.assets) assetMap.set(a.id, { ...a });

    const txMap = new Map<string, Transaction>();
    for (const tx of current.transactions) txMap.set(tx.id, { ...tx });
    for (const tx of incoming.transactions) txMap.set(tx.id, { ...tx });

    const mergedAssets = Array.from(assetMap.values());
    const mergedTxs = Array.from(txMap.values());

    for (const asset of mergedAssets) {
      const assetTxs = mergedTxs
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

    await this.replaceAll({
      portfolios: Array.from(portfolioMap.values()),
      classTargets: Array.from(targetMap.values()),
      assets: mergedAssets,
      transactions: mergedTxs,
    });
  }
}

// ============================================================================
// BackupService Implementation
// ============================================================================

function formatArchiveTimestamp(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

export class BackupService {
  private adapter: IBackupStorageAdapter;

  constructor(
    storageAdapter?: IBackupStorageAdapter,
    protected portfolioRepo: PortfolioRepository = portfolioRepository,
    protected assetRepo: AssetRepository = assetRepository,
    protected txRepo: TransactionRepository = transactionRepository
  ) {
    this.adapter =
      storageAdapter ||
      new SqliteBackupStorageAdapter(portfolioRepo, assetRepo, txRepo);
  }

  /**
   * Calcula o hash SHA-256 hexadecimal (lowercase) de uma string UTF-8 ou bytes.
   */
  static computeSha256(content: string | Uint8Array): string {
    return sha256Hex(content);
  }

  /**
   * Compacta um mapa de arquivos UTF-8 em um pacote .zip (Uint8Array).
   */
  static createZipArchive(files: Record<string, string>): Uint8Array {
    return buildZipBytes(files);
  }

  /**
   * Descompacta um pacote .zip (Uint8Array) retornando o mapa de arquivos UTF-8.
   */
  static extractZipArchive(zipBytes: Uint8Array): Record<string, string> {
    return parseZipBytes(zipBytes);
  }

  /**
   * S6-T01: Gera o pacote .celsus.zip contendo manifest.json + 4 arquivos CSV
   * com hashes SHA-256 e contagem de linhas exatos.
   */
  async exportDossierArchive(
    snapshotOverride?: BackupDatabaseSnapshot,
    exportDate: Date = new Date()
  ): Promise<ExportArchiveResult> {
    const snapshot = snapshotOverride || (await this.adapter.getSnapshot());

    const portfoliosCsv = serializeToCsv(snapshot.portfolios, PORTFOLIOS_COLUMNS);
    const classTargetsCsv = serializeToCsv(snapshot.classTargets, CLASS_TARGETS_COLUMNS);
    const assetsCsv = serializeToCsv(snapshot.assets, ASSETS_COLUMNS);
    const transactionsCsv = serializeToCsv(snapshot.transactions, TRANSACTIONS_COLUMNS);

    const manifest: BackupManifest = {
      format: 'CELSUS_ARCHIVE',
      schemaVersion: 1,
      appVersion: '0.1.0',
      exportedAt: exportDate.toISOString(),
      currency: 'BRL',
      files: {
        'portfolios.csv': {
          rows: snapshot.portfolios.length,
          sha256: BackupService.computeSha256(portfoliosCsv),
        },
        'class_targets.csv': {
          rows: snapshot.classTargets.length,
          sha256: BackupService.computeSha256(classTargetsCsv),
        },
        'assets.csv': {
          rows: snapshot.assets.length,
          sha256: BackupService.computeSha256(assetsCsv),
        },
        'transactions.csv': {
          rows: snapshot.transactions.length,
          sha256: BackupService.computeSha256(transactionsCsv),
        },
      },
    };

    const manifestJson = JSON.stringify(manifest, null, 2);

    const files = {
      'manifest.json': manifestJson,
      'portfolios.csv': portfoliosCsv,
      'class_targets.csv': classTargetsCsv,
      'assets.csv': assetsCsv,
      'transactions.csv': transactionsCsv,
    };

    const zipBytes = BackupService.createZipArchive(files);
    const fileName = `celsus-dossier-${formatArchiveTimestamp(exportDate)}.celsus.zip`;

    return {
      fileName,
      zipBytes,
      manifest,
      files,
    };
  }

  /**
   * S6-T02 & S6-T03: Valida integridade SHA-256 do pacote .celsus.zip e executa
   * importação transacional em modo RESTORE (substituir tudo) ou MERGE (por UUID v4).
   */
  async importDossierArchive(
    zipBytes: Uint8Array,
    mode: BackupImportMode
  ): Promise<ImportArchiveResult> {
    // 1. Extract ZIP in memory
    const extracted = BackupService.extractZipArchive(zipBytes);

    // 2. Validate manifest.json presence and schemaVersion
    const manifestRaw = extracted['manifest.json'];
    if (!manifestRaw) {
      throw new Error(
        '[SECURITY PROTOCOL: CORRUPTED DOSSIER] Missing manifest.json in archive.'
      );
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new Error(
        '[SECURITY PROTOCOL: CORRUPTED DOSSIER] Invalid JSON syntax in manifest.json.'
      );
    }

    if (
      manifest.format !== 'CELSUS_ARCHIVE' ||
      manifest.schemaVersion !== 1 ||
      !manifest.files
    ) {
      throw new Error(
        `[SECURITY PROTOCOL: CORRUPTED DOSSIER] Unsupported manifest format or schemaVersion (${manifest.schemaVersion}).`
      );
    }

    // 3. Validate SHA-256 of each required CSV BEFORE touching local database
    const requiredCsvs = [
      'portfolios.csv',
      'class_targets.csv',
      'assets.csv',
      'transactions.csv',
    ] as const;

    for (const csvName of requiredCsvs) {
      const fileEntry = manifest.files[csvName];
      const csvContent = extracted[csvName];

      if (!fileEntry || csvContent === undefined) {
        throw new Error(
          `[SECURITY PROTOCOL: CORRUPTED DOSSIER] Missing required file ${csvName} in archive.`
        );
      }

      const actualHash = BackupService.computeSha256(csvContent);
      if (actualHash.toLowerCase() !== fileEntry.sha256.toLowerCase()) {
        throw new Error(
          `[SECURITY PROTOCOL: CORRUPTED DOSSIER] SHA-256 integrity mismatch on ${csvName}. Expected ${fileEntry.sha256}, got ${actualHash}.`
        );
      }
    }

    // 4. Parse CSV records
    const parsedSnapshot: BackupDatabaseSnapshot = {
      portfolios: parsePortfoliosFromCsv(extracted['portfolios.csv']),
      classTargets: parseClassTargetsFromCsv(extracted['class_targets.csv']),
      assets: parseAssetsFromCsv(extracted['assets.csv']),
      transactions: parseTransactionsFromCsv(extracted['transactions.csv']),
    };

    // 5. Execute transactional import (RESTORE or MERGE)
    if (mode === 'RESTORE') {
      await this.adapter.replaceAll(parsedSnapshot);
    } else {
      await this.adapter.mergeByUuid(parsedSnapshot);
    }

    return {
      success: true,
      mode,
      importedCounts: {
        portfolios: parsedSnapshot.portfolios.length,
        classTargets: parsedSnapshot.classTargets.length,
        assets: parsedSnapshot.assets.length,
        transactions: parsedSnapshot.transactions.length,
      },
      manifest,
    };
  }
}

export const backupService = new BackupService();
