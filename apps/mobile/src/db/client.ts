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
  manual_position_value TEXT,
  rf_indexer TEXT,
  rf_rate REAL,
  rf_maturity_date TEXT,
  rf_is_tax_exempt INTEGER NOT NULL DEFAULT 0,
  rf_issuer TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  external_id TEXT,
  institution_id TEXT,
  last_synced_at TEXT,
  isin TEXT,
  gross_amount TEXT,
  cost_basis_source TEXT,
  missing_since TEXT,
  is_etf INTEGER NOT NULL DEFAULT 0,
  of_status TEXT,
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
  archived_at TEXT,
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
CREATE TABLE IF NOT EXISTS fin_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#D96628',
  archived INTEGER NOT NULL DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  credit_limit_cents INTEGER,
  of_account_id TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  reported_balance_cents INTEGER,
  reported_balance_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'category',
  color TEXT NOT NULL DEFAULT '#8A8A8E',
  parent_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fin_entries (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  paid_date TEXT,
  paid_amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  recurrence_id TEXT,
  recurrence_period TEXT,
  installment_group_id TEXT,
  installment_number INTEGER,
  installment_total INTEGER,
  bill_month TEXT,
  transfer_group_id TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  external_id TEXT,
  import_batch_id TEXT,
  description_raw TEXT,
  user_edited_fields TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_category_rules (
  id TEXT PRIMARY KEY NOT NULL,
  match_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  kind TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fin_recurrence_skips (
  recurrence_id TEXT NOT NULL,
  period TEXT NOT NULL,
  PRIMARY KEY (recurrence_id, period)
);
CREATE TABLE IF NOT EXISTS fin_recurrences (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  frequency TEXT NOT NULL,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_subscription INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  variable_amount INTEGER NOT NULL DEFAULT 0,
  generated_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS of_items (
  id TEXT PRIMARY KEY NOT NULL,
  connector_name TEXT,
  status TEXT,
  execution_status TEXT,
  consent_expires_at TEXT,
  last_synced_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS of_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  counts_json TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS fin_goals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  target_cents INTEGER NOT NULL,
  target_date TEXT,
  source_type TEXT NOT NULL,
  monthly_contribution_cents INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_goal_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES fin_goals(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_goal_sources (
  id TEXT PRIMARY KEY NOT NULL,
  goal_id TEXT NOT NULL REFERENCES fin_goals(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  asset_class TEXT,
  share_percent INTEGER NOT NULL DEFAULT 100
);
CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  year_month TEXT PRIMARY KEY NOT NULL,
  accounts_cents INTEGER NOT NULL,
  investments_cents INTEGER NOT NULL,
  card_debt_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fin_budgets (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  year_month TEXT,
  limit_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`;

export const SCHEMA_SQL = INITIAL_SCHEMA_SQL;

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
CREATE INDEX IF NOT EXISTS idx_fin_entries_due_date ON fin_entries(due_date);
CREATE INDEX IF NOT EXISTS idx_fin_entries_status ON fin_entries(status);
CREATE INDEX IF NOT EXISTS idx_fin_entries_recurrence ON fin_entries(recurrence_id);
CREATE INDEX IF NOT EXISTS idx_fin_entries_recurrence_period ON fin_entries(recurrence_id, recurrence_period);
CREATE INDEX IF NOT EXISTS idx_fin_entries_installment_group ON fin_entries(installment_group_id);
CREATE INDEX IF NOT EXISTS idx_fin_entries_bill_month ON fin_entries(bill_month);
CREATE INDEX IF NOT EXISTS idx_fin_entries_transfer_group ON fin_entries(transfer_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_entries_account_external ON fin_entries(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_entries_import_batch ON fin_entries(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_of_sync_runs_item ON of_sync_runs(item_id);
CREATE INDEX IF NOT EXISTS idx_fin_goal_contributions_goal ON fin_goal_contributions(goal_id);
CREATE INDEX IF NOT EXISTS idx_fin_goal_sources_goal ON fin_goal_sources(goal_id);
CREATE INDEX IF NOT EXISTS idx_fin_goal_sources_ref ON fin_goal_sources(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_fin_budgets_category_month ON fin_budgets(category_id, year_month);
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
  fin_accounts: [],
  fin_categories: [],
  fin_entries: [],
  fin_recurrences: [],
  fin_recurrence_skips: [],
  fin_category_rules: [],
  of_items: [],
  of_sync_runs: [],
  fin_goals: [],
  fin_goal_contributions: [],
  fin_goal_sources: [],
  net_worth_snapshots: [],
  fin_budgets: [],
};

function evalCondition(row: any, cond: any): boolean {
  if (!cond || !cond.queryChunks) return true;
  const chunks = cond.queryChunks;
  if (chunks.length === 3 && chunks[0]?.value?.[0] === '(' && chunks[2]?.value?.[0] === ')') {
    return evalCondition(row, chunks[1]);
  }
  const hasAnd = chunks.some((c: any) => typeof c?.value?.[0] === 'string' && c.value[0].includes('and'));
  if (hasAnd) {
    const subConds = chunks.filter((c: any) => c?.queryChunks);
    return subConds.every((sub: any) => evalCondition(row, sub));
  }
  const hasOr = chunks.some((c: any) => typeof c?.value?.[0] === 'string' && c.value[0].includes(' or '));
  if (hasOr) {
    const subConds = chunks.filter((c: any) => c?.queryChunks);
    return subConds.some((sub: any) => evalCondition(row, sub));
  }
  let colName: string | null = null;
  let val: any = undefined;
  let op = '=';
  for (const c of chunks) {
    if (c?.name && typeof c.name === 'string') {
      colName = c.name;
    } else if (c?.constructor?.name === 'Param' || (c && 'value' in c && typeof c.value !== 'object')) {
      val = c.value;
    } else if (Array.isArray(c?.value) && typeof c.value[0] === 'string') {
      const s = c.value[0];
      if (s.includes('>=')) op = '>=';
      else if (s.includes('<=')) op = '<=';
      else if (s.includes('<>') || s.includes('!=')) op = '!=';
      else if (s.includes('>')) op = '>';
      else if (s.includes('<')) op = '<';
      else if (s.toLowerCase().includes('is null')) op = 'is_null';
      else if (s.toLowerCase().includes('is not null')) op = 'is_not_null';
    }
  }
  if (colName !== null) {
    const rowVal = row[colName];
    if (op === 'is_null') return rowVal === null || rowVal === undefined;
    if (op === 'is_not_null') return rowVal !== null && rowVal !== undefined;
    if (op === '>=') return rowVal >= val;
    if (op === '<=') return rowVal <= val;
    if (op === '>') return rowVal > val;
    if (op === '<') return rowVal < val;
    if (op === '!=') return rowVal !== val;
    return rowVal === val;
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
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const snapshot = JSON.parse(JSON.stringify(inMemoryStore));
      try {
        return await fn(this);
      } catch (err) {
        for (const k of Object.keys(inMemoryStore)) {
          delete inMemoryStore[k];
        }
        Object.assign(inMemoryStore, snapshot);
        throw err;
      }
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
  { table: 'fin_entries', column: 'recurrence_period', ddl: 'ALTER TABLE fin_entries ADD COLUMN recurrence_period TEXT' },
  {
    table: 'fin_recurrences',
    column: 'variable_amount',
    ddl: 'ALTER TABLE fin_recurrences ADD COLUMN variable_amount INTEGER NOT NULL DEFAULT 0',
  },
  { table: 'fin_accounts', column: 'closing_day', ddl: 'ALTER TABLE fin_accounts ADD COLUMN closing_day INTEGER' },
  { table: 'fin_accounts', column: 'due_day', ddl: 'ALTER TABLE fin_accounts ADD COLUMN due_day INTEGER' },
  { table: 'fin_accounts', column: 'credit_limit_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN credit_limit_cents INTEGER' },
  { table: 'fin_entries', column: 'bill_month', ddl: 'ALTER TABLE fin_entries ADD COLUMN bill_month TEXT' },
  { table: 'fin_entries', column: 'transfer_group_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN transfer_group_id TEXT' },
  { table: 'fin_entries', column: 'source', ddl: "ALTER TABLE fin_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'" },
  { table: 'fin_entries', column: 'external_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN external_id TEXT' },
  { table: 'fin_entries', column: 'import_batch_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN import_batch_id TEXT' },
  { table: 'fin_accounts', column: 'of_account_id', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_account_id TEXT' },
  { table: 'fin_accounts', column: 'source', ddl: "ALTER TABLE fin_accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'" },
  { table: 'fin_accounts', column: 'reported_balance_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN reported_balance_cents INTEGER' },
  { table: 'fin_accounts', column: 'reported_balance_at', ddl: 'ALTER TABLE fin_accounts ADD COLUMN reported_balance_at TEXT' },
  { table: 'fin_entries', column: 'description_raw', ddl: 'ALTER TABLE fin_entries ADD COLUMN description_raw TEXT' },
  { table: 'fin_entries', column: 'user_edited_fields', ddl: 'ALTER TABLE fin_entries ADD COLUMN user_edited_fields TEXT' },
  { table: 'assets', column: 'manual_position_value', ddl: 'ALTER TABLE assets ADD COLUMN manual_position_value TEXT' },
  { table: 'assets', column: 'rf_issuer', ddl: 'ALTER TABLE assets ADD COLUMN rf_issuer TEXT' },
  { table: 'assets', column: 'isin', ddl: 'ALTER TABLE assets ADD COLUMN isin TEXT' },
  { table: 'assets', column: 'gross_amount', ddl: 'ALTER TABLE assets ADD COLUMN gross_amount TEXT' },
  { table: 'assets', column: 'cost_basis_source', ddl: 'ALTER TABLE assets ADD COLUMN cost_basis_source TEXT' },
  { table: 'assets', column: 'missing_since', ddl: 'ALTER TABLE assets ADD COLUMN missing_since TEXT' },
  { table: 'assets', column: 'is_etf', ddl: 'ALTER TABLE assets ADD COLUMN is_etf INTEGER NOT NULL DEFAULT 0' },
  { table: 'assets', column: 'of_status', ddl: 'ALTER TABLE assets ADD COLUMN of_status TEXT' },
  { table: 'transactions', column: 'archived_at', ddl: 'ALTER TABLE transactions ADD COLUMN archived_at TEXT' },
];

function applySchemaUpgrades(raw: SQLiteDatabase) {
  for (const up of SCHEMA_UPGRADES) {
    const cols = raw.getAllSync<{ name: string }>(`PRAGMA table_info(${up.table})`);
    if (!cols.some((c) => c.name === up.column)) {
      raw.execSync(up.ddl);
    }
  }
  raw.execSync(SCHEMA_INDEXES_SQL);
  // Migração item 1.1: em Renda Fixa, manual_price_override representava valor da posição.
  raw.execSync(
    "UPDATE assets SET manual_position_value = manual_price_override, manual_price_override = NULL WHERE asset_class = 'FIXED_INCOME' AND manual_price_override IS NOT NULL AND manual_price_override != '' AND manual_position_value IS NULL;"
  );
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
        getAllSync: (sql: string) => {
          if (sql.includes('PRAGMA table_info(assets)')) {
            return [
              'id', 'portfolio_id', 'asset_class', 'ticker', 'name',
              'target_percentage_in_class', 'quantity', 'average_price',
              'manual_price_override', 'manual_position_value',
              'rf_indexer', 'rf_rate', 'rf_maturity_date', 'rf_is_tax_exempt', 'rf_issuer',
              'source', 'external_id', 'institution_id', 'last_synced_at',
              'isin', 'gross_amount', 'cost_basis_source', 'missing_since',
              'is_etf', 'of_status', 'created_at', 'updated_at',
            ].map((name) => ({ name }));
          }
          if (sql.includes('PRAGMA table_info(transactions)')) {
            return [
              'id', 'portfolio_id', 'asset_id', 'type', 'trade_date',
              'quantity', 'unit_price', 'fees', 'total_amount', 'notes',
              'source', 'external_id', 'archived_at', 'created_at',
            ].map((name) => ({ name }));
          }
          return [];
        },
      } as any;
    }
  }
  return _rawSqliteDb!;
}

export const getRawSqlite = getRawSqliteDatabase;

let _inTransaction = false;

/**
 * Executa `fn` dentro de uma transação SQLite (ou transação em memória no Jest/web `?memdb=1`).
 * Chamadas aninhadas reutilizam a transação ativa para evitar erro de transação dupla no SQLite.
 */
export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (_inTransaction) {
    return fn();
  }
  _inTransaction = true;
  try {
    const db = getDatabase() as any;
    if (_rawSqliteDb && !isTestEnvironment() && typeof _rawSqliteDb.withTransactionAsync === 'function') {
      let result!: T;
      await _rawSqliteDb.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    }
    if (typeof db.transaction === 'function') {
      return await db.transaction(async () => fn());
    }
    return await fn();
  } finally {
    _inTransaction = false;
  }
}

export default getDatabase;
