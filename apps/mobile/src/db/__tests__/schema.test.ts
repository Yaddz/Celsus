import { getTableName, getTableColumns } from 'drizzle-orm';
import {
  portfolios,
  portfolioClassTargets,
  assets,
  transactions,
  marketPriceCache,
  historicalPricesLocal,
} from '../schema';

describe('S2-T03: TestSQLiteTablesAndOpenFinanceColumns', () => {
  describe('Local SQLite Database Table Names', () => {
    it('should define all 6 required SQLite tables with exact names', () => {
      expect(getTableName(portfolios)).toBe('portfolios');
      expect(getTableName(portfolioClassTargets)).toBe('portfolio_class_targets');
      expect(getTableName(assets)).toBe('assets');
      expect(getTableName(transactions)).toBe('transactions');
      expect(getTableName(marketPriceCache)).toBe('market_price_cache');
      expect(getTableName(historicalPricesLocal)).toBe('historical_prices_local');
    });
  });

  describe('Portfolios and Targets Schema Columns', () => {
    it('should define portfolios table with UUID primary key and docket metadata', () => {
      const cols = getTableColumns(portfolios);
      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
      expect(cols.name).toBeDefined();
      expect(cols.description).toBeDefined();
      expect(cols.docket_code).toBeDefined();
      expect(cols.is_archived).toBeDefined();
      expect(cols.created_at).toBeDefined();
      expect(cols.updated_at).toBeDefined();
    });

    it('should define portfolio_class_targets table with portfolio relation and target percentage', () => {
      const cols = getTableColumns(portfolioClassTargets);
      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
      expect(cols.portfolio_id).toBeDefined();
      expect(cols.asset_class).toBeDefined();
      expect(cols.target_percentage).toBeDefined();
      expect(cols.updated_at).toBeDefined();
    });
  });

  describe('Assets Schema and Open Finance Columns', () => {
    it('should define assets table with financial position, fixed income fields and Open Finance columns', () => {
      const cols = getTableColumns(assets);
      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
      expect(cols.portfolio_id).toBeDefined();
      expect(cols.asset_class).toBeDefined();
      expect(cols.ticker).toBeDefined();
      expect(cols.name).toBeDefined();
      expect(cols.target_percentage_in_class).toBeDefined();
      expect(cols.quantity).toBeDefined();
      expect(cols.average_price).toBeDefined();
      expect(cols.manual_price_override).toBeDefined();

      // Fixed Income fields
      expect(cols.rf_indexer).toBeDefined();
      expect(cols.rf_rate).toBeDefined();
      expect(cols.rf_maturity_date).toBeDefined();
      expect(cols.rf_is_tax_exempt).toBeDefined();

      // Open Finance future integration columns
      expect(cols.source).toBeDefined();
      expect(cols.external_id).toBeDefined();
      expect(cols.institution_id).toBeDefined();
      expect(cols.last_synced_at).toBeDefined();

      expect(cols.created_at).toBeDefined();
      expect(cols.updated_at).toBeDefined();
    });
  });

  describe('Transactions Schema and Open Finance Columns', () => {
    it('should define transactions table with trade data, ledger notes and Open Finance deduplication columns', () => {
      const cols = getTableColumns(transactions);
      expect(cols.id).toBeDefined();
      expect(cols.id.primary).toBe(true);
      expect(cols.portfolio_id).toBeDefined();
      expect(cols.asset_id).toBeDefined();
      expect(cols.type).toBeDefined();
      expect(cols.trade_date).toBeDefined();
      expect(cols.quantity).toBeDefined();
      expect(cols.unit_price).toBeDefined();
      expect(cols.fees).toBeDefined();
      expect(cols.total_amount).toBeDefined();
      expect(cols.notes).toBeDefined();

      // Open Finance columns
      expect(cols.source).toBeDefined();
      expect(cols.external_id).toBeDefined();

      expect(cols.created_at).toBeDefined();
    });
  });

  describe('Market Cache and Historical Prices Schema Columns', () => {
    it('should define market_price_cache table for 24h ticker quotes', () => {
      const cols = getTableColumns(marketPriceCache);
      expect(cols.ticker).toBeDefined();
      expect(cols.ticker.primary).toBe(true);
      expect(cols.asset_class).toBeDefined();
      expect(cols.current_price).toBeDefined();
      expect(cols.change_percent_24h).toBeDefined();
      expect(cols.updated_at).toBeDefined();
    });

    it('should define historical_prices_local table for local COTAHIST closing prices', () => {
      const cols = getTableColumns(historicalPricesLocal);
      expect(cols.ticker).toBeDefined();
      expect(cols.price_date).toBeDefined();
      expect(cols.close_price).toBeDefined();
    });
  });
});
