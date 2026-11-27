import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema';
import { findEquivalentIncome } from '../domain/finance/incomeDedup';
import { normalizeCardEntry } from '../domain/financeFlow/cards';

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
  of_item_id TEXT,
  fin_account_id TEXT,
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
  rf_indexer_pct REAL,
  rf_maturity_date TEXT,
  rf_is_tax_exempt INTEGER NOT NULL DEFAULT 0,
  rf_issuer TEXT,
  rf_daily_liquidity INTEGER,
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
  of_reported_value TEXT,
  of_reported_at TEXT,
  value_source TEXT,
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
  is_synthetic INTEGER NOT NULL DEFAULT 0,
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
  item_id TEXT,
  asset_id TEXT,
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
  currency TEXT NOT NULL DEFAULT 'BRL',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS historical_prices_local (
  ticker TEXT NOT NULL,
  price_date TEXT NOT NULL,
  close_price TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
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
  of_item_id TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  reported_balance_cents INTEGER,
  reported_balance_at TEXT,
  masked_number TEXT,
  owner TEXT,
  auto_name TEXT,
  of_linked_at TEXT,
  closing_balance_cents INTEGER,
  auto_invested_cents INTEGER,
  credit_used_cents INTEGER,
  of_available_limit_cents INTEGER,
  of_minimum_payment_cents INTEGER,
  of_balance_due_date TEXT,
  of_overdraft_used_cents INTEGER,
  of_reserved_cents INTEGER,
  calendar_source TEXT,
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
  target_account_id TEXT,
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
  linked_income_id TEXT,
  linked_transaction_id TEXT,
  of_removed_at TEXT,
  of_category_id TEXT,
  of_class_reason TEXT,
  of_provider_id TEXT,
  of_bill_id TEXT,
  of_bill_forecast_month TEXT,
  of_bill_post_date TEXT,
  of_operation_type TEXT,
  of_raw_status TEXT,
  of_raw_type TEXT,
  of_raw_amount_cents INTEGER,
  of_created_at TEXT,
  of_installment_number INTEGER,
  of_installment_total INTEGER,
  of_bill_month_source TEXT,
  of_link_restore TEXT,
  batch_id TEXT,
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
  target_account_id TEXT,
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
  last_error TEXT,
  last_updated_at TEXT,
  next_auto_sync_at TEXT,
  status_detail_json TEXT,
  error_code TEXT
);
CREATE TABLE IF NOT EXISTS of_sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'FINANCE',
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
CREATE TABLE IF NOT EXISTS fin_bills (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  external_id TEXT,
  bill_month TEXT NOT NULL,
  closing_date TEXT,
  due_date TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  minimum_payment_cents INTEGER,
  payments_json TEXT,
  payments_total_cents INTEGER,
  finance_charges_json TEXT,
  chargeable_charges_cents INTEGER,
  allows_installments INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_scenarios (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'time_machine',
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_portfolios (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  initial_cents INTEGER NOT NULL DEFAULT 0,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  rebalance TEXT NOT NULL DEFAULT 'never',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sandbox_portfolio_items (
  id TEXT PRIMARY KEY NOT NULL,
  sandbox_portfolio_id TEXT NOT NULL REFERENCES sandbox_portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  weight REAL NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_fin_bills_account_month ON fin_bills(account_id, bill_month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolios_of_item_id ON portfolios(of_item_id) WHERE of_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portfolios_fin_account_id ON portfolios(fin_account_id);
CREATE INDEX IF NOT EXISTS idx_fin_entries_linked_transaction ON fin_entries(linked_transaction_id);
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
  fin_bills: [],
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
  { table: 'portfolios', column: 'of_item_id', ddl: 'ALTER TABLE portfolios ADD COLUMN of_item_id TEXT' },
  { table: 'portfolios', column: 'fin_account_id', ddl: 'ALTER TABLE portfolios ADD COLUMN fin_account_id TEXT' },
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
  {
    table: 'fin_recurrences',
    column: 'target_account_id',
    ddl: 'ALTER TABLE fin_recurrences ADD COLUMN target_account_id TEXT',
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
  { table: 'assets', column: 'rf_daily_liquidity', ddl: 'ALTER TABLE assets ADD COLUMN rf_daily_liquidity INTEGER' },
  { table: 'assets', column: 'isin', ddl: 'ALTER TABLE assets ADD COLUMN isin TEXT' },
  { table: 'assets', column: 'gross_amount', ddl: 'ALTER TABLE assets ADD COLUMN gross_amount TEXT' },
  { table: 'assets', column: 'cost_basis_source', ddl: 'ALTER TABLE assets ADD COLUMN cost_basis_source TEXT' },
  { table: 'assets', column: 'missing_since', ddl: 'ALTER TABLE assets ADD COLUMN missing_since TEXT' },
  { table: 'assets', column: 'is_etf', ddl: 'ALTER TABLE assets ADD COLUMN is_etf INTEGER NOT NULL DEFAULT 0' },
  { table: 'assets', column: 'of_status', ddl: 'ALTER TABLE assets ADD COLUMN of_status TEXT' },
  { table: 'assets', column: 'issuer_cnpj', ddl: 'ALTER TABLE assets ADD COLUMN issuer_cnpj TEXT' },
  { table: 'assets', column: 'issue_date', ddl: 'ALTER TABLE assets ADD COLUMN issue_date TEXT' },
  { table: 'assets', column: 'purchase_date', ddl: 'ALTER TABLE assets ADD COLUMN purchase_date TEXT' },
  { table: 'assets', column: 'taxes', ddl: 'ALTER TABLE assets ADD COLUMN taxes TEXT' },
  { table: 'assets', column: 'taxes2', ddl: 'ALTER TABLE assets ADD COLUMN taxes2 TEXT' },
  { table: 'assets', column: 'auto_name', ddl: 'ALTER TABLE assets ADD COLUMN auto_name TEXT' },
  { table: 'assets', column: 'rf_indexer_pct', ddl: 'ALTER TABLE assets ADD COLUMN rf_indexer_pct REAL' },
  { table: 'assets', column: 'of_reported_value', ddl: 'ALTER TABLE assets ADD COLUMN of_reported_value TEXT' },
  { table: 'assets', column: 'of_reported_at', ddl: 'ALTER TABLE assets ADD COLUMN of_reported_at TEXT' },
  { table: 'assets', column: 'value_source', ddl: 'ALTER TABLE assets ADD COLUMN value_source TEXT' },
  { table: 'transactions', column: 'is_synthetic', ddl: 'ALTER TABLE transactions ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0' },
  { table: 'income_events', column: 'item_id', ddl: 'ALTER TABLE income_events ADD COLUMN item_id TEXT' },
  { table: 'income_events', column: 'asset_id', ddl: 'ALTER TABLE income_events ADD COLUMN asset_id TEXT' },
  { table: 'fin_entries', column: 'linked_income_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN linked_income_id TEXT' },
  { table: 'fin_entries', column: 'linked_transaction_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN linked_transaction_id TEXT' },
  { table: 'fin_entries', column: 'of_removed_at', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_removed_at TEXT' },
  { table: 'fin_entries', column: 'of_category_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_category_id TEXT' },
  { table: 'fin_entries', column: 'of_class_reason', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_class_reason TEXT' },
  { table: 'fin_accounts', column: 'of_linked_at', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_linked_at TEXT' },
  { table: 'fin_accounts', column: 'closing_balance_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN closing_balance_cents INTEGER' },
  { table: 'fin_accounts', column: 'auto_invested_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN auto_invested_cents INTEGER' },
  { table: 'fin_accounts', column: 'credit_used_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN credit_used_cents INTEGER' },
  { table: 'of_sync_runs', column: 'kind', ddl: "ALTER TABLE of_sync_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'FINANCE'" },
  { table: 'fin_accounts', column: 'masked_number', ddl: 'ALTER TABLE fin_accounts ADD COLUMN masked_number TEXT' },
  { table: 'fin_accounts', column: 'owner', ddl: 'ALTER TABLE fin_accounts ADD COLUMN owner TEXT' },
  { table: 'fin_accounts', column: 'auto_name', ddl: 'ALTER TABLE fin_accounts ADD COLUMN auto_name TEXT' },
  { table: 'transactions', column: 'archived_at', ddl: 'ALTER TABLE transactions ADD COLUMN archived_at TEXT' },
  { table: 'fin_entries', column: 'of_provider_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_provider_id TEXT' },
  { table: 'fin_entries', column: 'of_bill_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_bill_id TEXT' },
  { table: 'fin_entries', column: 'of_bill_forecast_month', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_bill_forecast_month TEXT' },
  { table: 'fin_entries', column: 'of_bill_post_date', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_bill_post_date TEXT' },
  { table: 'fin_entries', column: 'of_operation_type', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_operation_type TEXT' },
  { table: 'fin_entries', column: 'of_raw_status', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_raw_status TEXT' },
  { table: 'fin_entries', column: 'of_raw_type', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_raw_type TEXT' },
  { table: 'fin_entries', column: 'of_raw_amount_cents', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_raw_amount_cents INTEGER' },
  { table: 'fin_entries', column: 'of_created_at', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_created_at TEXT' },
  { table: 'fin_entries', column: 'of_installment_number', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_installment_number INTEGER' },
  { table: 'fin_entries', column: 'of_installment_total', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_installment_total INTEGER' },
  { table: 'fin_entries', column: 'of_bill_month_source', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_bill_month_source TEXT' },
  { table: 'fin_bills', column: 'payments_json', ddl: 'ALTER TABLE fin_bills ADD COLUMN payments_json TEXT' },
  { table: 'fin_bills', column: 'payments_total_cents', ddl: 'ALTER TABLE fin_bills ADD COLUMN payments_total_cents INTEGER' },
  { table: 'fin_bills', column: 'finance_charges_json', ddl: 'ALTER TABLE fin_bills ADD COLUMN finance_charges_json TEXT' },
  { table: 'fin_bills', column: 'chargeable_charges_cents', ddl: 'ALTER TABLE fin_bills ADD COLUMN chargeable_charges_cents INTEGER' },
  { table: 'fin_bills', column: 'allows_installments', ddl: 'ALTER TABLE fin_bills ADD COLUMN allows_installments INTEGER' },
  { table: 'fin_accounts', column: 'of_available_limit_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_available_limit_cents INTEGER' },
  { table: 'fin_accounts', column: 'of_minimum_payment_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_minimum_payment_cents INTEGER' },
  { table: 'fin_accounts', column: 'of_balance_due_date', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_balance_due_date TEXT' },
  { table: 'fin_accounts', column: 'of_overdraft_used_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_overdraft_used_cents INTEGER' },
  { table: 'fin_accounts', column: 'of_reserved_cents', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_reserved_cents INTEGER' },
  { table: 'of_items', column: 'last_updated_at', ddl: 'ALTER TABLE of_items ADD COLUMN last_updated_at TEXT' },
  { table: 'of_items', column: 'next_auto_sync_at', ddl: 'ALTER TABLE of_items ADD COLUMN next_auto_sync_at TEXT' },
  { table: 'of_items', column: 'status_detail_json', ddl: 'ALTER TABLE of_items ADD COLUMN status_detail_json TEXT' },
  { table: 'of_items', column: 'error_code', ddl: 'ALTER TABLE of_items ADD COLUMN error_code TEXT' },
  { table: 'fin_accounts', column: 'calendar_source', ddl: 'ALTER TABLE fin_accounts ADD COLUMN calendar_source TEXT' },
  { table: 'fin_accounts', column: 'of_item_id', ddl: 'ALTER TABLE fin_accounts ADD COLUMN of_item_id TEXT' },
  { table: 'fin_entries', column: 'of_link_restore', ddl: 'ALTER TABLE fin_entries ADD COLUMN of_link_restore TEXT' },
  { table: 'fin_entries', column: 'batch_id', ddl: 'ALTER TABLE fin_entries ADD COLUMN batch_id TEXT' },
  { table: 'historical_prices_local', column: 'currency', ddl: "ALTER TABLE historical_prices_local ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL'" },
  { table: 'market_price_cache', column: 'currency', ddl: "ALTER TABLE market_price_cache ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL'" },
];

const VALID_LEDGER_TYPES = new Set(['BUY', 'SELL', 'SPLIT', 'INPLIT']);

export function applySchemaUpgrades(raw: SQLiteDatabase) {
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
  // Migração Sprint 71: remove movimentações fantasmas de Open Finance fora de BUY/SELL/SPLIT/INPLIT
  raw.execSync(
    "DELETE FROM transactions WHERE source = 'OPEN_FINANCE' AND type NOT IN ('BUY', 'SELL', 'SPLIT', 'INPLIT');"
  );
  if (Array.isArray(inMemoryStore.transactions)) {
    inMemoryStore.transactions = inMemoryStore.transactions.filter(
      (t) => !(t.source === 'OPEN_FINANCE' && !VALID_LEDGER_TYPES.has(t.type))
    );
  }
  deduplicateIncomeEventsInMemory();
  deduplicateIncomeEventsSqlite(raw);
  migrateCardEntriesInMemory();
  migrateCardEntriesSqlite(raw);
  // Migração Sprint 86: preenche income_events.item_id a partir de assets OPEN_FINANCE quando external_id começa com 'pluggy:'
  raw.execSync(
    "UPDATE income_events SET item_id = (SELECT a.institution_id FROM assets a WHERE a.portfolio_id = income_events.portfolio_id AND UPPER(a.ticker) = UPPER(income_events.ticker) AND a.source = 'OPEN_FINANCE' AND a.institution_id IS NOT NULL LIMIT 1) WHERE item_id IS NULL AND external_id LIKE 'pluggy:%';"
  );
  if (Array.isArray(inMemoryStore.income_events) && Array.isArray(inMemoryStore.assets)) {
    for (const inc of inMemoryStore.income_events) {
      if (!inc.item_id && typeof inc.external_id === 'string' && inc.external_id.startsWith('pluggy:')) {
        const matchAsset = inMemoryStore.assets.find(
          (a: any) =>
            a.portfolio_id === inc.portfolio_id &&
            String(a.ticker || '').toUpperCase() === String(inc.ticker || '').toUpperCase() &&
            a.source === 'OPEN_FINANCE' &&
            a.institution_id
        );
        if (matchAsset) {
          inc.item_id = matchAsset.institution_id;
        }
      }
    }
  }
  // Migração Sprint 87: infere of_sync_runs.kind pelo prefixo 'of-inv-'
  raw.execSync(
    "UPDATE of_sync_runs SET kind = 'INVESTMENTS' WHERE id LIKE 'of-inv-%' AND (kind IS NULL OR kind = 'FINANCE');"
  );
  if (Array.isArray(inMemoryStore.of_sync_runs)) {
    for (const run of inMemoryStore.of_sync_runs) {
      if (!run.kind || (typeof run.id === 'string' && run.id.startsWith('of-inv-') && run.kind === 'FINANCE')) {
        run.kind = typeof run.id === 'string' && run.id.startsWith('of-inv-') ? 'INVESTMENTS' : 'FINANCE';
      }
    }
  }
}

function migrateCardEntriesInMemory() {
  const entries = inMemoryStore.fin_entries;
  const accounts = inMemoryStore.fin_accounts;
  if (!Array.isArray(entries) || !Array.isArray(accounts)) return;
  const cardById = new Map<string, any>();
  for (const acc of accounts) {
    if (acc && acc.type === 'card') {
      cardById.set(acc.id, acc);
    }
  }
  if (cardById.size === 0) return;

  for (const entry of entries) {
    if (!entry) continue;
    const card = cardById.get(entry.account_id);
    if (!card) continue;
    if (entry.kind !== 'expense' && entry.kind !== 'income') continue;
    if (entry.status !== 'pending' && entry.bill_month != null) continue;

    const normalized = normalizeCardEntry(
      {
        kind: entry.kind,
        dueDate: entry.due_date,
        amountCents: entry.amount_cents,
        status: entry.status,
        paidDate: entry.paid_date,
        paidAmountCents: entry.paid_amount_cents,
        billMonth: entry.bill_month,
      },
      card
    );
    entry.status = normalized.status;
    entry.paid_date = entry.paid_date ?? normalized.paid_date;
    entry.paid_amount_cents = entry.paid_amount_cents ?? normalized.paid_amount_cents;
    entry.bill_month = normalized.bill_month;
  }
}

function migrateCardEntriesSqlite(raw: SQLiteDatabase) {
  if (isTestEnvironment() || isWebMemoryDbOptIn()) return;
  try {
    const rows = raw.getAllSync<{
      id: string;
      kind: 'expense' | 'income';
      due_date: string;
      amount_cents: number;
      status: 'pending' | 'paid';
      paid_date: string | null;
      paid_amount_cents: number | null;
      bill_month: string | null;
      closing_day: number | null;
      due_day: number | null;
    }>(
      `SELECT e.id, e.kind, e.due_date, e.amount_cents, e.status, e.paid_date, e.paid_amount_cents, e.bill_month, a.closing_day, a.due_day
       FROM fin_entries e
       JOIN fin_accounts a ON a.id = e.account_id
       WHERE a.type = 'card' AND e.kind IN ('expense', 'income') AND (e.status = 'pending' OR e.bill_month IS NULL)`
    );
    if (!rows || rows.length === 0) return;

    raw.execSync('BEGIN IMMEDIATE;');
    try {
      for (const row of rows) {
        const normalized = normalizeCardEntry(
          {
            kind: row.kind,
            dueDate: row.due_date,
            amountCents: row.amount_cents,
            status: row.status,
            paidDate: row.paid_date,
            paidAmountCents: row.paid_amount_cents,
            billMonth: row.bill_month,
          },
          { type: 'card', closing_day: row.closing_day, due_day: row.due_day }
        );
        raw.runSync(
          `UPDATE fin_entries
           SET status = ?,
               paid_date = COALESCE(paid_date, ?),
               paid_amount_cents = COALESCE(paid_amount_cents, ?),
               bill_month = ?
           WHERE id = ?`,
          [
            normalized.status,
            normalized.paid_date,
            normalized.paid_amount_cents,
            normalized.bill_month,
            row.id,
          ]
        );
      }
      raw.execSync('COMMIT;');
    } catch (err) {
      raw.execSync('ROLLBACK;');
      throw err;
    }
  } catch {
    // Tabela pode ainda não existir em bancos parciais de teste
  }
}

function deduplicateIncomeEventsInMemory() {
  const rows = inMemoryStore.income_events;
  if (!Array.isArray(rows) || rows.length < 2) return;
  const sorted = [...rows].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || ''))
  );
  const kept: any[] = [];
  let removed = 0;

  for (const row of sorted) {
    const equiv = findEquivalentIncome(
      {
        id: row.id,
        portfolioId: row.portfolio_id,
        ticker: row.ticker,
        payDate: row.pay_date,
        amount: row.amount,
        kind: row.kind,
      },
      kept.map((k) => ({
        id: k.id,
        portfolioId: k.portfolio_id,
        ticker: k.ticker,
        payDate: k.pay_date,
        amount: k.amount,
        kind: k.kind,
      }))
    );
    if (equiv) {
      const keeper = kept.find((k) => k.id === equiv.id)!;
      keeper.kind = keeper.kind || row.kind || null;
      keeper.quantity = keeper.quantity || row.quantity || null;
      keeper.unit_amount = keeper.unit_amount || row.unit_amount || null;
      removed += 1;
    } else {
      kept.push(row);
    }
  }

  if (removed > 0) {
    inMemoryStore.income_events = kept;
    const meta = (inMemoryStore.app_meta = inMemoryStore.app_meta || []);
    const existingMeta = meta.find((m) => m.key === 'migration:income_dedup_removed');
    if (existingMeta) {
      existingMeta.value = String(removed);
    } else {
      meta.push({ key: 'migration:income_dedup_removed', value: String(removed) });
    }
  }
}

function deduplicateIncomeEventsSqlite(raw: SQLiteDatabase) {
  if (isTestEnvironment() || isWebMemoryDbOptIn()) return;
  try {
    const rows = raw.getAllSync<any>('SELECT * FROM income_events ORDER BY created_at ASC');
    if (!rows || rows.length < 2) return;
    const kept: any[] = [];
    let removed = 0;
    for (const row of rows) {
      const equiv = findEquivalentIncome(
        {
          id: row.id,
          portfolioId: row.portfolio_id,
          ticker: row.ticker,
          payDate: row.pay_date,
          amount: row.amount,
          kind: row.kind,
        },
        kept.map((k) => ({
          id: k.id,
          portfolioId: k.portfolio_id,
          ticker: k.ticker,
          payDate: k.pay_date,
          amount: k.amount,
          kind: k.kind,
        }))
      );
      if (equiv) {
        const keeper = kept.find((k) => k.id === equiv.id)!;
        const nextKind = keeper.kind || row.kind || null;
        const nextQty = keeper.quantity || row.quantity || null;
        const nextUnit = keeper.unit_amount || row.unit_amount || null;
        raw
          .prepareSync(
            'UPDATE income_events SET kind = ?, quantity = ?, unit_amount = ? WHERE id = ?'
          )
          .executeSync(nextKind, nextQty, nextUnit, keeper.id);
        raw.prepareSync('DELETE FROM income_events WHERE id = ?').executeSync(row.id);
        removed += 1;
      } else {
        kept.push(row);
      }
    }
    if (removed > 0) {
      raw
        .prepareSync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)')
        .executeSync('migration:income_dedup_removed', String(removed));
    }
  } catch {
    // Ignora caso tabela ainda não exista ou em mock
  }
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

export async function initializeDatabase(dbName: string = DATABASE_NAME): Promise<void> {
  getDatabase(dbName);
}

export function getDatabase(dbName: string = DATABASE_NAME): ReturnType<typeof drizzle> {
  if (!_dbInstance) {
    if (isTestEnvironment() || isWebMemoryDbOptIn()) {
      _dbInstance = createInMemoryDatabase();
      return _dbInstance;
    }
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
          if (sql.includes('PRAGMA table_info(portfolios)')) {
            return [
              'id', 'name', 'description', 'docket_code', 'patrimony_goal',
              'monthly_contribution', 'of_item_id', 'fin_account_id', 'is_archived', 'created_at', 'updated_at',
            ].map((name) => ({ name }));
          }
          if (sql.includes('PRAGMA table_info(assets)')) {
            return [
              'id', 'portfolio_id', 'asset_class', 'ticker', 'name',
              'target_percentage_in_class', 'quantity', 'average_price',
              'manual_price_override', 'manual_position_value',
              'rf_indexer', 'rf_rate', 'rf_indexer_pct', 'rf_maturity_date', 'rf_is_tax_exempt', 'rf_issuer', 'rf_daily_liquidity',
              'source', 'external_id', 'institution_id', 'last_synced_at',
              'isin', 'gross_amount', 'cost_basis_source', 'missing_since',
              'is_etf', 'of_status', 'issuer_cnpj', 'issue_date', 'purchase_date',
              'taxes', 'taxes2', 'auto_name', 'of_reported_value', 'of_reported_at', 'value_source',
              'created_at', 'updated_at',
            ].map((name) => ({ name }));
          }
          if (sql.includes('PRAGMA table_info(fin_accounts)')) {
            return [
              'id', 'name', 'type', 'initial_balance_cents', 'color', 'archived',
              'closing_day', 'due_day', 'credit_limit_cents', 'of_account_id',
              'source', 'reported_balance_cents', 'reported_balance_at',
              'masked_number', 'owner', 'auto_name', 'of_linked_at',
              'closing_balance_cents', 'auto_invested_cents', 'credit_used_cents',
              'of_available_limit_cents', 'of_minimum_payment_cents', 'of_balance_due_date',
              'of_overdraft_used_cents', 'of_reserved_cents', 'calendar_source', 'created_at',
            ].map((name) => ({ name }));
          }
          if (sql.includes('PRAGMA table_info(transactions)')) {
            return [
              'id', 'portfolio_id', 'asset_id', 'type', 'trade_date',
              'quantity', 'unit_price', 'fees', 'total_amount', 'notes',
              'source', 'external_id', 'archived_at', 'is_synthetic', 'created_at',
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
    // Snapshot inMemoryStore para garantir atomicidade no ambiente Jest / ?memdb=1
    const snapshot: Record<string, any[]> = {};
    for (const [k, v] of Object.entries(inMemoryStore)) {
      snapshot[k] = Array.isArray(v) ? v.map((row) => ({ ...row })) : [];
    }
    try {
      return await fn();
    } catch (err) {
      for (const [k, v] of Object.entries(snapshot)) {
        (inMemoryStore as any)[k] = v;
      }
      throw err;
    }
  } finally {
    _inTransaction = false;
  }
}

export default getDatabase;
