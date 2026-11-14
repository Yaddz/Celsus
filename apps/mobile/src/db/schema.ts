import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * PORTFOLIOS
 * Entidade central representando cada carteira ou "Dossiê" no app.
 */
export const portfolios = sqliteTable('portfolios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  docket_code: text('docket_code').notNull(),
  patrimony_goal: text('patrimony_goal'), // meta de patrimônio (R$), decimal em texto
  monthly_contribution: text('monthly_contribution'), // aporte mensal planejado (R$)
  is_archived: integer('is_archived').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

/**
 * PORTFOLIO_CLASS_TARGETS
 * Metas Macro de alocação por classe em cada carteira (soma 100%).
 */
export const portfolioClassTargets = sqliteTable('portfolio_class_targets', {
  id: text('id').primaryKey(),
  portfolio_id: text('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  asset_class: text('asset_class').notNull(), // FIXED_INCOME | FII | STOCK | CRYPTO
  target_percentage: real('target_percentage').notNull().default(0.0),
  receives_contribution: integer('receives_contribution').notNull().default(1),
  updated_at: text('updated_at').notNull(),
});

/**
 * ASSETS
 * Ativos cadastrados na carteira com posição atual e metas micro dentro da classe.
 */
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  portfolio_id: text('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  asset_class: text('asset_class').notNull(), // FIXED_INCOME | FII | STOCK | CRYPTO
  ticker: text('ticker').notNull(),
  name: text('name').notNull(),
  target_percentage_in_class: real('target_percentage_in_class').notNull().default(0.0),
  quantity: text('quantity').notNull().default('0'),
  average_price: text('average_price').notNull().default('0.00'),
  manual_price_override: text('manual_price_override'),

  // Renda Fixa specific fields
  rf_indexer: text('rf_indexer'), // CDI | IPCA | PRE | NULL
  rf_rate: real('rf_rate'),
  rf_maturity_date: text('rf_maturity_date'),
  rf_is_tax_exempt: integer('rf_is_tax_exempt').notNull().default(0),

  // Open Finance integration fields
  source: text('source').notNull().default('MANUAL'), // MANUAL | OPEN_FINANCE
  external_id: text('external_id'),
  institution_id: text('institution_id'),
  last_synced_at: text('last_synced_at'),

  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

/**
 * TRANSACTIONS
 * Livro-razão de movimentações (compras e vendas) executadas.
 */
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  portfolio_id: text('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  asset_id: text('asset_id')
    .notNull()
    .references(() => assets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // BUY | SELL | SPLIT | INPLIT
  trade_date: text('trade_date').notNull(), // YYYY-MM-DD
  quantity: text('quantity').notNull(),
  unit_price: text('unit_price').notNull(),
  fees: text('fees').notNull().default('0.00'),
  total_amount: text('total_amount').notNull(),
  notes: text('notes'),

  // Open Finance integration fields
  source: text('source').notNull().default('MANUAL'), // MANUAL | OPEN_FINANCE | YAHOO
  external_id: text('external_id'),

  created_at: text('created_at').notNull(),
});

/**
 * INCOME_EVENTS
 * Proventos recebidos (dividendos, JCP, rendimentos de FIIs) — aba "Lançamentos > Rendimento" da planilha.
 */
export const incomeEvents = sqliteTable('income_events', {
  id: text('id').primaryKey(),
  portfolio_id: text('portfolio_id')
    .notNull()
    .references(() => portfolios.id, { onDelete: 'cascade' }),
  ticker: text('ticker').notNull(),
  pay_date: text('pay_date').notNull(), // YYYY-MM-DD
  amount: text('amount').notNull(), // R$ decimal em texto
  notes: text('notes'),
  source: text('source').notNull().default('MANUAL'),
  external_id: text('external_id'),
  kind: text('kind'),
  quantity: text('quantity'),
  unit_amount: text('unit_amount'),
  created_at: text('created_at').notNull(),
});

export type IncomeEvent = typeof incomeEvents.$inferSelect;

/**
 * APP_META
 * Chave/valor pequeno para marcas de estado do app (ex.: semente inicial já aplicada).
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * MARKET_PRICE_CACHE
 * Cache local de cotações em tempo real / fechamento do dia (TTL).
 */
export const marketPriceCache = sqliteTable('market_price_cache', {
  ticker: text('ticker').primaryKey(),
  asset_class: text('asset_class').notNull(),
  current_price: text('current_price').notNull(),
  change_percent_24h: real('change_percent_24h'),
  updated_at: text('updated_at').notNull(),
});

/**
 * HISTORICAL_PRICES_LOCAL
 * Cache local de fechamentos históricos importados do COTAHIST ou BRAPI.
 */
export const historicalPricesLocal = sqliteTable(
  'historical_prices_local',
  {
    ticker: text('ticker').notNull(),
    price_date: text('price_date').notNull(), // YYYY-MM-DD
    close_price: text('close_price').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ticker, table.price_date] }),
  ]
);

export type Portfolio = Omit<typeof portfolios.$inferSelect, 'patrimony_goal' | 'monthly_contribution'> & {
  patrimony_goal?: string | null;
  monthly_contribution?: string | null;
};
export type NewPortfolio = typeof portfolios.$inferInsert;

export type PortfolioClassTarget = Omit<typeof portfolioClassTargets.$inferSelect, 'receives_contribution'> & {
  receives_contribution?: number;
};
export type NewPortfolioClassTarget = typeof portfolioClassTargets.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type MarketPriceCache = typeof marketPriceCache.$inferSelect;
export type NewMarketPriceCache = typeof marketPriceCache.$inferInsert;

export type HistoricalPriceLocal = typeof historicalPricesLocal.$inferSelect;
export type NewHistoricalPriceLocal = typeof historicalPricesLocal.$inferInsert;

/**
 * ASSET_PROFILE_CACHE
 * Cache local de fundamentos da empresa e ficha do ativo (TTL 12h).
 */
export const assetProfileCache = sqliteTable('asset_profile_cache', {
  ticker: text('ticker').primaryKey(),
  profile_json: text('profile_json').notNull(),
  updated_at: text('updated_at').notNull(),
});

export type AssetProfileCache = typeof assetProfileCache.$inferSelect;
export type NewAssetProfileCache = typeof assetProfileCache.$inferInsert;

/**
 * FIN_ACCOUNTS
 * Contas pessoais do módulo Finanças (carteira, conta corrente, cartão).
 * Independentes das carteiras de investimento.
 */
export const finAccounts = sqliteTable('fin_accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cash' | 'checking' | 'card'
  initial_balance_cents: integer('initial_balance_cents').notNull().default(0),
  color: text('color').notNull(),
  archived: integer('archived').notNull().default(0),
  created_at: text('created_at').notNull(),
});

/**
 * FIN_CATEGORIES
 * Categorias de receitas e despesas pessoais (com suporte a hierarquia e arquivamento).
 */
export const finCategories = sqliteTable('fin_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'income' | 'expense'
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  parent_id: text('parent_id'),
  archived: integer('archived').notNull().default(0),
});

/**
 * FIN_ENTRIES
 * Lançamentos financeiros pessoais (receitas, despesas, parcelas e ocorrências de recorrência).
 * Valores sempre em centavos inteiros; datas em ISO YYYY-MM-DD.
 */
export const finEntries = sqliteTable('fin_entries', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'income' | 'expense'
  amount_cents: integer('amount_cents').notNull(),
  due_date: text('due_date').notNull(), // YYYY-MM-DD
  paid_date: text('paid_date'), // YYYY-MM-DD
  paid_amount_cents: integer('paid_amount_cents'),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  account_id: text('account_id').notNull(),
  category_id: text('category_id').notNull(),
  description: text('description').notNull(),
  recurrence_id: text('recurrence_id'),
  installment_group_id: text('installment_group_id'),
  installment_number: integer('installment_number'),
  installment_total: integer('installment_total'),
  created_at: text('created_at').notNull(),
});

/**
 * FIN_RECURRENCES
 * Despesas/receitas fixas e assinaturas geradas de forma preguiçosa por janela de meses.
 */
export const finRecurrences = sqliteTable('fin_recurrences', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'income' | 'expense'
  amount_cents: integer('amount_cents').notNull(),
  description: text('description').notNull(),
  account_id: text('account_id').notNull(),
  category_id: text('category_id').notNull(),
  frequency: text('frequency').notNull(), // 'weekly' | 'monthly' | 'yearly'
  day_of_month: integer('day_of_month').notNull(),
  start_date: text('start_date').notNull(), // YYYY-MM-DD
  end_date: text('end_date'), // YYYY-MM-DD
  is_subscription: integer('is_subscription').notNull().default(0),
  active: integer('active').notNull().default(1),
  generated_until: text('generated_until'), // YYYY-MM-DD
  created_at: text('created_at').notNull(),
});

export type FinAccount = typeof finAccounts.$inferSelect;
export type NewFinAccount = typeof finAccounts.$inferInsert;

export type FinCategory = typeof finCategories.$inferSelect;
export type NewFinCategory = typeof finCategories.$inferInsert;

export type FinEntry = typeof finEntries.$inferSelect;
export type NewFinEntry = typeof finEntries.$inferInsert;

export type FinRecurrence = typeof finRecurrences.$inferSelect;
export type NewFinRecurrence = typeof finRecurrences.$inferInsert;


