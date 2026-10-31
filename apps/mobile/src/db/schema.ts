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
  type: text('type').notNull(), // BUY | SELL
  trade_date: text('trade_date').notNull(), // YYYY-MM-DD
  quantity: text('quantity').notNull(),
  unit_price: text('unit_price').notNull(),
  fees: text('fees').notNull().default('0.00'),
  total_amount: text('total_amount').notNull(),
  notes: text('notes'),

  // Open Finance integration fields
  source: text('source').notNull().default('MANUAL'),
  external_id: text('external_id'),

  created_at: text('created_at').notNull(),
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

export type Portfolio = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;

export type PortfolioClassTarget = typeof portfolioClassTargets.$inferSelect;
export type NewPortfolioClassTarget = typeof portfolioClassTargets.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type MarketPriceCache = typeof marketPriceCache.$inferSelect;
export type NewMarketPriceCache = typeof marketPriceCache.$inferInsert;

export type HistoricalPriceLocal = typeof historicalPricesLocal.$inferSelect;
export type NewHistoricalPriceLocal = typeof historicalPricesLocal.$inferInsert;
