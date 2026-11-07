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

