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
  of_item_id: text('of_item_id'),
  fin_account_id: text('fin_account_id'),
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
  manual_position_value: text('manual_position_value'),

  // Renda Fixa specific fields
  rf_indexer: text('rf_indexer'), // CDI | IPCA | PRE | NULL
  rf_rate: real('rf_rate'),
  rf_indexer_pct: real('rf_indexer_pct'),
  rf_maturity_date: text('rf_maturity_date'),
  rf_is_tax_exempt: integer('rf_is_tax_exempt').notNull().default(0),
  rf_issuer: text('rf_issuer'),
  rf_daily_liquidity: integer('rf_daily_liquidity'), // 1 = liquidez diária, 0/NULL = não líquida

  // Open Finance integration fields
  source: text('source').notNull().default('MANUAL'), // MANUAL | OPEN_FINANCE
  external_id: text('external_id'),
  institution_id: text('institution_id'),
  last_synced_at: text('last_synced_at'),
  isin: text('isin'),
  gross_amount: text('gross_amount'),
  cost_basis_source: text('cost_basis_source'), // TRANSACTIONS | INSTITUTION | MANUAL
  missing_since: text('missing_since'),
  is_etf: integer('is_etf').notNull().default(0),
  of_status: text('of_status'), // ACTIVE | PENDING | TOTAL_WITHDRAWAL
  issuer_cnpj: text('issuer_cnpj'),
  issue_date: text('issue_date'),
  purchase_date: text('purchase_date'),
  taxes: text('taxes'),
  taxes2: text('taxes2'),
  auto_name: text('auto_name'),
  of_reported_value: text('of_reported_value'),
  of_reported_at: text('of_reported_at'),
  value_source: text('value_source'), // QUOTE | INSTITUTION | MANUAL

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
  archived_at: text('archived_at'),
  is_synthetic: integer('is_synthetic').notNull().default(0),

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
  item_id: text('item_id'),
  asset_id: text('asset_id'),
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
  currency: text('currency').notNull().default('BRL'),
  updated_at: text('updated_at').notNull(),
});

/**
 * HISTORICAL_PRICES_LOCAL
 * Cache local de fechamentos históricos importados do COTAHIST ou Yahoo.
 */
export const historicalPricesLocal = sqliteTable(
  'historical_prices_local',
  {
    ticker: text('ticker').notNull(),
    price_date: text('price_date').notNull(), // YYYY-MM-DD
    close_price: text('close_price').notNull(),
    currency: text('currency').notNull().default('BRL'),
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
  closing_day: integer('closing_day'),
  due_day: integer('due_day'),
  credit_limit_cents: integer('credit_limit_cents'),
  of_account_id: text('of_account_id'),
  source: text('source').notNull().default('MANUAL'), // 'MANUAL' | 'OPEN_FINANCE'
  reported_balance_cents: integer('reported_balance_cents'),
  reported_balance_at: text('reported_balance_at'),
  masked_number: text('masked_number'),
  owner: text('owner'),
  auto_name: text('auto_name'),
  of_linked_at: text('of_linked_at'),
  closing_balance_cents: integer('closing_balance_cents'),
  auto_invested_cents: integer('auto_invested_cents'),
  credit_used_cents: integer('credit_used_cents'),
  of_available_limit_cents: integer('of_available_limit_cents'),
  of_minimum_payment_cents: integer('of_minimum_payment_cents'),
  of_balance_due_date: text('of_balance_due_date'),
  of_overdraft_used_cents: integer('of_overdraft_used_cents'),
  of_reserved_cents: integer('of_reserved_cents'),
  calendar_source: text('calendar_source'), // 'USER' | 'PLUGGY_BILLS' | 'DEFAULT'
  created_at: text('created_at').notNull(),
});

/**
 * FIN_BILLS
 * Faturas de cartão de crédito sincronizadas via Open Finance (fechamento e pagamento mínimo).
 */
export const finBills = sqliteTable('fin_bills', {
  id: text('id').primaryKey(),
  account_id: text('account_id').notNull(),
  external_id: text('external_id'),
  bill_month: text('bill_month').notNull(), // YYYY-MM
  closing_date: text('closing_date'), // YYYY-MM-DD
  due_date: text('due_date').notNull(), // YYYY-MM-DD
  total_amount_cents: integer('total_amount_cents').notNull(),
  minimum_payment_cents: integer('minimum_payment_cents'),
  payments_json: text('payments_json'),
  payments_total_cents: integer('payments_total_cents'),
  finance_charges_json: text('finance_charges_json'),
  chargeable_charges_cents: integer('chargeable_charges_cents'),
  allows_installments: integer('allows_installments'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
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
  kind: text('kind').notNull(), // 'income' | 'expense' | 'transfer_out' | 'transfer_in' | 'investment_buy' | 'investment_sell' | 'investment_income'
  amount_cents: integer('amount_cents').notNull(),
  due_date: text('due_date').notNull(), // YYYY-MM-DD
  paid_date: text('paid_date'), // YYYY-MM-DD
  paid_amount_cents: integer('paid_amount_cents'),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  account_id: text('account_id').notNull(),
  category_id: text('category_id').notNull(),
  description: text('description').notNull(),
  recurrence_id: text('recurrence_id'),
  recurrence_period: text('recurrence_period'),
  installment_group_id: text('installment_group_id'),
  installment_number: integer('installment_number'),
  installment_total: integer('installment_total'),
  bill_month: text('bill_month'), // YYYY-MM (apenas contas tipo card)
  transfer_group_id: text('transfer_group_id'),
  source: text('source').notNull().default('MANUAL'), // 'MANUAL' | 'FILE_IMPORT' | 'OCR' | 'OPEN_FINANCE'
  external_id: text('external_id'),
  import_batch_id: text('import_batch_id'),
  description_raw: text('description_raw'),
  user_edited_fields: text('user_edited_fields'),
  linked_income_id: text('linked_income_id'),
  linked_transaction_id: text('linked_transaction_id'),
  of_removed_at: text('of_removed_at'),
  of_category_id: text('of_category_id'), // categoryId hierárquico da Pluggy (Sprint 91)
  of_class_reason: text('of_class_reason'), // INVESTMENT_MOVE | OWN_ACCOUNT_UNPAIRED | ... (Sprint 91)
  of_provider_id: text('of_provider_id'),
  of_bill_id: text('of_bill_id'),
  of_bill_forecast_month: text('of_bill_forecast_month'),
  of_bill_post_date: text('of_bill_post_date'),
  of_operation_type: text('of_operation_type'),
  of_raw_status: text('of_raw_status'),
  of_raw_type: text('of_raw_type'),
  of_raw_amount_cents: integer('of_raw_amount_cents'),
  of_created_at: text('of_created_at'),
  of_installment_number: integer('of_installment_number'),
  of_installment_total: integer('of_installment_total'),
  of_bill_month_source: text('of_bill_month_source'),
  created_at: text('created_at').notNull(),
});

/**
 * FIN_CATEGORY_RULES
 * Regras de categorização automática aprendidas para importação de extratos/faturas, OCR e Open Finance.
 */
export const finCategoryRules = sqliteTable('fin_category_rules', {
  id: text('id').primaryKey(),
  match_type: text('match_type').notNull(), // 'contains' | 'starts_with' | 'exact'
  pattern: text('pattern').notNull(), // normalizado sem acento e em minúsculas
  kind: text('kind').notNull(), // 'income' | 'expense'
  category_id: text('category_id').notNull(),
  created_at: text('created_at').notNull(),
  hits: integer('hits').notNull().default(0),
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
  variable_amount: integer('variable_amount').notNull().default(0),
  generated_until: text('generated_until'), // YYYY-MM-DD
  created_at: text('created_at').notNull(),
});

export const finRecurrenceSkips = sqliteTable(
  'fin_recurrence_skips',
  {
    recurrence_id: text('recurrence_id').notNull(),
    period: text('period').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recurrence_id, table.period] }),
  ]
);

export type FinAccount = typeof finAccounts.$inferSelect;
export type NewFinAccount = typeof finAccounts.$inferInsert;

export type FinBill = typeof finBills.$inferSelect;
export type NewFinBill = typeof finBills.$inferInsert;

export type FinCategory = typeof finCategories.$inferSelect;
export type NewFinCategory = typeof finCategories.$inferInsert;

export type FinCategoryRule = typeof finCategoryRules.$inferSelect;
export type NewFinCategoryRule = typeof finCategoryRules.$inferInsert;

export type FinEntry = Omit<typeof finEntries.$inferSelect, 'recurrence_period'> & {
  recurrence_period?: string | null;
};
export type NewFinEntry = typeof finEntries.$inferInsert;

export type FinRecurrence = typeof finRecurrences.$inferSelect;
export type NewFinRecurrence = typeof finRecurrences.$inferInsert;

export type FinRecurrenceSkip = typeof finRecurrenceSkips.$inferSelect;
export type NewFinRecurrenceSkip = typeof finRecurrenceSkips.$inferInsert;

/**
 * FIN_BUDGETS
 * Orçamento mensal por categoria (year_month nulo = recorrente todo mês; específico do mês vence).
 */
export const finBudgets = sqliteTable('fin_budgets', {
  id: text('id').primaryKey(),
  category_id: text('category_id').notNull(),
  year_month: text('year_month'),
  limit_cents: integer('limit_cents').notNull(),
  created_at: text('created_at').notNull(),
});

export type FinBudget = typeof finBudgets.$inferSelect;
export type NewFinBudget = typeof finBudgets.$inferInsert;

/**
 * OF_ITEMS
 * Conexões Open Finance (Meu Pluggy) cadastradas pelo usuário (máx. 5).
 */
export const ofItems = sqliteTable('of_items', {
  id: text('id').primaryKey(),
  connector_name: text('connector_name'),
  status: text('status'),
  execution_status: text('execution_status'),
  consent_expires_at: text('consent_expires_at'),
  last_synced_at: text('last_synced_at'),
  last_error: text('last_error'),
  last_updated_at: text('last_updated_at'),
  next_auto_sync_at: text('next_auto_sync_at'),
  status_detail_json: text('status_detail_json'),
  error_code: text('error_code'),
});

/**
 * OF_SYNC_RUNS
 * Histórico de execuções de teste de conexão / sincronização Open Finance.
 */
export const ofSyncRuns = sqliteTable('of_sync_runs', {
  id: text('id').primaryKey(),
  item_id: text('item_id').notNull(),
  started_at: text('started_at').notNull(),
  finished_at: text('finished_at'),
  status: text('status').notNull(),
  kind: text('kind').notNull().default('FINANCE'), // 'FINANCE' | 'INVESTMENTS'
  counts_json: text('counts_json'),
  error: text('error'),
});

export type OfItem = typeof ofItems.$inferSelect;
export type NewOfItem = typeof ofItems.$inferInsert;

export type OfSyncRun = typeof ofSyncRuns.$inferSelect;
export type NewOfSyncRun = typeof ofSyncRuns.$inferInsert;

/**
 * FIN_GOALS (Sprint 68)
 * Metas financeiras unificadas: manuais, ligadas a contas, carteiras ou patrimônio líquido.
 */
export const finGoals = sqliteTable('fin_goals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  target_cents: integer('target_cents').notNull(),
  target_date: text('target_date'), // YYYY-MM-DD | null
  source_type: text('source_type').notNull(), // 'manual' | 'account' | 'portfolio' | 'net_worth'
  monthly_contribution_cents: integer('monthly_contribution_cents'),
  archived: integer('archived').notNull().default(0),
  created_at: text('created_at').notNull(),
});

/**
 * FIN_GOAL_CONTRIBUTIONS (Sprint 68)
 * Aportes lançados manualmente em metas com source_type = 'manual'.
 */
export const finGoalContributions = sqliteTable('fin_goal_contributions', {
  id: text('id').primaryKey(),
  goal_id: text('goal_id')
    .notNull()
    .references(() => finGoals.id, { onDelete: 'cascade' }),
  amount_cents: integer('amount_cents').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  notes: text('notes'),
  created_at: text('created_at').notNull(),
});

/**
 * FIN_GOAL_SOURCES (Sprint 68)
 * Origens ligadas a contas ou carteiras (com fatia percentual 1–100 e classe opcional).
 */
export const finGoalSources = sqliteTable('fin_goal_sources', {
  id: text('id').primaryKey(),
  goal_id: text('goal_id')
    .notNull()
    .references(() => finGoals.id, { onDelete: 'cascade' }),
  ref_type: text('ref_type').notNull(), // 'account' | 'portfolio'
  ref_id: text('ref_id').notNull(),
  asset_class: text('asset_class'), // FIXED_INCOME | FII | STOCK | CRYPTO | null
  share_percent: integer('share_percent').notNull().default(100), // 1–100
});

/**
 * NET_WORTH_SNAPSHOTS (Sprint 68)
 * Foto mensal única do patrimônio líquido (contas + investimentos − dívida de cartão).
 */
export const netWorthSnapshots = sqliteTable('net_worth_snapshots', {
  year_month: text('year_month').primaryKey(), // YYYY-MM
  accounts_cents: integer('accounts_cents').notNull(),
  investments_cents: integer('investments_cents').notNull(),
  card_debt_cents: integer('card_debt_cents').notNull(),
  total_cents: integer('total_cents').notNull(),
});

export type FinGoal = typeof finGoals.$inferSelect;
export type NewFinGoal = typeof finGoals.$inferInsert;

export type FinGoalContribution = typeof finGoalContributions.$inferSelect;
export type NewFinGoalContribution = typeof finGoalContributions.$inferInsert;

export type FinGoalSource = typeof finGoalSources.$inferSelect;
export type NewFinGoalSource = typeof finGoalSources.$inferInsert;

export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type NewNetWorthSnapshot = typeof netWorthSnapshots.$inferInsert;

/**
 * SANDBOX_SCENARIOS (Sprint 108)
 * Cenários salvos do simulador (apenas especificação; resultado é recalculado ao abrir).
 */
export const sandboxScenarios = sqliteTable('sandbox_scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('time_machine'),
  spec_json: text('spec_json').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export type SandboxScenario = typeof sandboxScenarios.$inferSelect;
export type NewSandboxScenario = typeof sandboxScenarios.$inferInsert;




