import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'celsus.db';

export const INITIAL_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  docket_code TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_class_targets (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  target_percentage REAL NOT NULL DEFAULT 0.0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  target_percentage_in_class REAL NOT NULL DEFAULT 0.0,
  quantity TEXT NOT NULL DEFAULT '0',
  average_price TEXT NOT NULL DEFAULT '0.00',
  manual_price_override TEXT,
  rf_indexer TEXT,
  rf_rate REAL,
  rf_maturity_date TEXT,
  rf_is_tax_exempt INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  external_id TEXT,
  institution_id TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  type TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  quantity TEXT NOT NULL,
  unit_price TEXT NOT NULL,
  fees TEXT NOT NULL DEFAULT '0.00',
  total_amount TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  external_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS market_price_cache (
  ticker TEXT PRIMARY KEY NOT NULL,
  asset_class TEXT NOT NULL,
  current_price TEXT NOT NULL,
  change_percent_24h REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historical_prices_local (
  ticker TEXT NOT NULL,
  price_date TEXT NOT NULL,
  close_price TEXT NOT NULL,
  PRIMARY KEY (ticker, price_date)
);
`;

let _dbInstance: ReturnType<typeof drizzle> | null = null;
let _rawSqliteDb: SQLiteDatabase | null = null;

export function getDatabase(dbName: string = DATABASE_NAME): ReturnType<typeof drizzle> {
  if (!_dbInstance) {
    try {
      _rawSqliteDb = openDatabaseSync(dbName);
      _rawSqliteDb.execSync(INITIAL_SCHEMA_SQL);
      _dbInstance = drizzle(_rawSqliteDb, { schema });
    } catch {
      // In Node.js / Jest unit test environment, ExpoSQLite.NativeDatabase is not available natively.
      _dbInstance = {} as any;
    }
  }
  return _dbInstance!;
}

export function getRawSqliteDatabase(dbName: string = DATABASE_NAME): SQLiteDatabase {
  if (!_rawSqliteDb) {
    _rawSqliteDb = openDatabaseSync(dbName);
    _rawSqliteDb.execSync(INITIAL_SCHEMA_SQL);
  }
  return _rawSqliteDb;
}

export default getDatabase;
