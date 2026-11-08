import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { getTableName } from 'drizzle-orm';
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
  patrimony_goal TEXT,
  monthly_contribution TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_class_targets (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  target_percentage REAL NOT NULL DEFAULT 0.0,
  receives_contribution INTEGER NOT NULL DEFAULT 1,
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

CREATE TABLE IF NOT EXISTS income_events (
  id TEXT PRIMARY KEY NOT NULL,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  amount TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  external_id TEXT,
  kind TEXT,
  quantity TEXT,
  unit_amount TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS asset_profile_cache (
  ticker TEXT PRIMARY KEY NOT NULL,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Índices das consultas quentes (por carteira, por ativo, por data e deduplicação por external_id).
 * Rodam DEPOIS das migrações de coluna: em bancos antigos `income_events.external_id` só existe após
 * applySchemaUpgrades, e criar o índice antes derrubaria a abertura do banco.
 */
export const SCHEMA_INDEXES_SQL = `CREATE INDEX IF NOT EXISTS idx_class_targets_portfolio ON portfolio_class_targets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_assets_portfolio ON assets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_date ON transactions(portfolio_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_income_events_portfolio_date ON income_events(portfolio_id, pay_date);
CREATE INDEX IF NOT EXISTS idx_income_events_external ON income_events(external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external ON transactions(external_id);
`;

const inMemoryStore: Record<string, any[]> = {
  portfolios: [],
  portfolio_class_targets: [],
  assets: [],
  transactions: [],
  income_events: [],
  app_meta: [],
  market_price_cache: [],
  historical_prices_local: [],
  asset_profile_cache: [],
};

function evalCondition(row: any, cond: any): boolean {
  if (!cond || !cond.queryChunks) return true;
  const chunks = cond.queryChunks;
  if (chunks.length === 3 && chunks[0]?.value?.[0] === '(' && chunks[2]?.value?.[0] === ')') {
    return evalCondition(row, chunks[1]);
  }
  const hasAnd = chunks.some((c: any) => c?.value?.[0]?.includes('and'));
  if (hasAnd) {
    const subConds = chunks.filter((c: any) => c?.constructor?.name === 'SQL');
    return subConds.every((sub: any) => evalCondition(row, sub));
  }
  let colName: string | null = null;
  let val: any = undefined;
  for (const c of chunks) {
    if (c?.name && typeof c.name === 'string') {
      colName = c.name;
    } else if (c?.constructor?.name === 'Param' || (c && 'value' in c && typeof c.value !== 'object')) {
      val = c.value;
    }
  }
  if (colName !== null) {
    return row[colName] === val;
  }
  return true;
}

function createInMemoryDatabase(): ReturnType<typeof drizzle> {
  return {
    insert(table: any) {
      const tableName = getTableName(table);
      return {
        values: async (vals: any | any[]) => {
          const arr = Array.isArray(vals) ? vals : [vals];
          inMemoryStore[tableName] = inMemoryStore[tableName] || [];
          inMemoryStore[tableName].push(...arr);
          return arr;
        },
      };
    },
    select() {
      return {
        from(table: any) {
          const tableName = getTableName(table);
          let condition: any = null;
          let orderClause: any = null;
          const query = {
            where(c: any) {
              condition = c;
              return query;
            },
            orderBy(o: any) {
              orderClause = o;
              return query;
            },
            then(resolve: (val: any) => void, reject?: (err: any) => void) {
              try {
                let rows = [...(inMemoryStore[tableName] || [])];
                if (condition) {
                  rows = rows.filter((r) => evalCondition(r, condition));
                }
                if (orderClause && orderClause.queryChunks) {
                  let col: string | null = null;
                  let isDesc = false;
                  for (const ch of orderClause.queryChunks) {
                    if (ch?.name) col = ch.name;
                    if (ch?.value?.[0]?.includes('desc')) isDesc = true;
                  }
                  if (col) {
                    rows.sort((a, b) => {
                      if (a[col!] === b[col!]) return 0;
                      return isDesc ? (b[col!] > a[col!] ? 1 : -1) : (a[col!] > b[col!] ? 1 : -1);
                    });
                  }
                }
                resolve(rows);
              } catch (e) {
                if (reject) reject(e);
                else throw e;
              }
            },
          };
          return query;
        },
      };
    },
    update(table: any) {
      const tableName = getTableName(table);
      return {
        set(patch: any) {
          return {
            where: async (cond: any) => {
              inMemoryStore[tableName] = (inMemoryStore[tableName] || []).map((r) => {
                if (evalCondition(r, cond)) {
                  return { ...r, ...patch };
                }
                return r;
              });
            },
          };
        },
      };
    },
    delete(table: any) {
      const tableName = getTableName(table);
      const delQuery = {
        where: async (cond: any) => {
          inMemoryStore[tableName] = (inMemoryStore[tableName] || []).filter((r) => !evalCondition(r, cond));
        },
        then(resolve: () => void) {
          inMemoryStore[tableName] = [];
          resolve();
        },
      };
      return delQuery;
    },
  } as any;
}

/**
 * O mock em memória só é permitido em Jest/Node. Em produção, uma falha ao abrir o
 * SQLite deve ser propagada: cair silenciosamente para memória causaria perda de dados.
 */
function isTestEnvironment(): boolean {
  return (
    (typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || process.env?.JEST_WORKER_ID !== undefined)) ||
    isWebMemoryDbOptIn()
  );
}

/**
 * Opt-in explícito (somente web, via `?memdb=1` na URL) para usar o motor em memória quando o
 * expo-sqlite web não inicializa. Serve para inspecionar a UI no navegador; não persiste dados.
 * No app nativo isto nunca é verdadeiro, então falhas de SQLite continuam sendo propagadas.
 */
function isWebMemoryDbOptIn(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.location?.search === 'string' &&
    window.location.search.includes('memdb=1')
  );
}

/** Colunas adicionadas depois da v1; CREATE TABLE IF NOT EXISTS não as cria em bancos existentes. */
export const SCHEMA_UPGRADES: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'portfolios', column: 'patrimony_goal', ddl: 'ALTER TABLE portfolios ADD COLUMN patrimony_goal TEXT' },
  { table: 'portfolios', column: 'monthly_contribution', ddl: 'ALTER TABLE portfolios ADD COLUMN monthly_contribution TEXT' },
  {
    table: 'portfolio_class_targets',
    column: 'receives_contribution',
    ddl: 'ALTER TABLE portfolio_class_targets ADD COLUMN receives_contribution INTEGER NOT NULL DEFAULT 1',
  },
  { table: 'income_events', column: 'source', ddl: "ALTER TABLE income_events ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'" },
  { table: 'income_events', column: 'external_id', ddl: 'ALTER TABLE income_events ADD COLUMN external_id TEXT' },
  { table: 'income_events', column: 'kind', ddl: 'ALTER TABLE income_events ADD COLUMN kind TEXT' },
  { table: 'income_events', column: 'quantity', ddl: 'ALTER TABLE income_events ADD COLUMN quantity TEXT' },
  { table: 'income_events', column: 'unit_amount', ddl: 'ALTER TABLE income_events ADD COLUMN unit_amount TEXT' },
];

function applySchemaUpgrades(raw: SQLiteDatabase) {
  for (const up of SCHEMA_UPGRADES) {
    const cols = raw.getAllSync<{ name: string }>(`PRAGMA table_info(${up.table})`);
    if (!cols.some((c) => c.name === up.column)) {
      raw.execSync(up.ddl);
    }
  }
  raw.execSync(SCHEMA_INDEXES_SQL);
}

let _dbInstance: ReturnType<typeof drizzle> | null = null;
let _rawSqliteDb: SQLiteDatabase | null = null;

const resetListeners: Array<() => void> = [];

export function onDatabaseReset(listener: () => void) {
  resetListeners.push(listener);
}

/** Marcas que sobrevivem a "Apagar todos os dados" (nenhuma chave mantida; banco 100% limpo). */
const META_KEYS_KEPT_ON_WIPE: string[] = [];

/**
 * Apaga todos os dados do usuário. No Jest/web em memória limpa as tabelas em memória; no aparelho
 * apaga as linhas de todas as tabelas do SQLite (o esquema fica). Antes, no aparelho, só a memória
 * era limpa e "Apagar todos os dados" não apagava nada do banco.
 */
export function resetDatabase() {
  for (const k of Object.keys(inMemoryStore)) {
    inMemoryStore[k] = [];
  }
  if (_rawSqliteDb && !isTestEnvironment()) {
    const tables = _rawSqliteDb.getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
    );
    _rawSqliteDb.withTransactionSync(() => {
      for (const { name } of tables) {
        if (name === 'app_meta') {
          if (META_KEYS_KEPT_ON_WIPE.length > 0) {
            const kept = META_KEYS_KEPT_ON_WIPE.map((k) => `'${k}'`).join(', ');
            _rawSqliteDb!.execSync(`DELETE FROM app_meta WHERE key NOT IN (${kept})`);
          } else {
            _rawSqliteDb!.execSync(`DELETE FROM app_meta`);
          }
        } else {
          _rawSqliteDb!.execSync(`DELETE FROM "${name}"`);
        }
      }
    });
  }
  for (const listener of resetListeners) {
    try {
      listener();
    } catch {
      // Ignora erro em listener
    }
  }
}

export function getDatabase(dbName: string = DATABASE_NAME): ReturnType<typeof drizzle> {
  if (!_dbInstance) {
    try {
      // Reaproveita a conexão aberta por getRawSqliteDatabase (antes abria uma segunda conexão).
      if (!_rawSqliteDb) {
        _rawSqliteDb = openDatabaseSync(dbName);
        _rawSqliteDb.execSync(INITIAL_SCHEMA_SQL);
        applySchemaUpgrades(_rawSqliteDb);
      }
      _dbInstance = drizzle(_rawSqliteDb, { schema });
    } catch (err) {
      if (!isTestEnvironment()) {
        _rawSqliteDb = null;
        throw err;
      }
      // Jest: fallback para o motor em memória.
      _dbInstance = createInMemoryDatabase();
    }
  }
  return _dbInstance!;
}

export function getRawSqliteDatabase(dbName: string = DATABASE_NAME): SQLiteDatabase {
  if (!_rawSqliteDb) {
    try {
      _rawSqliteDb = openDatabaseSync(dbName);
      _rawSqliteDb.execSync(INITIAL_SCHEMA_SQL);
      applySchemaUpgrades(_rawSqliteDb);
    } catch (err) {
      if (!isTestEnvironment()) {
        _rawSqliteDb = null;
        throw err;
      }
      _rawSqliteDb = {
        execSync: () => {},
        prepareSync: () => ({ executeSync: () => ({}) }),
      } as any;
    }
  }
  return _rawSqliteDb!;
}

export default getDatabase;
