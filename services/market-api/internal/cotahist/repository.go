package cotahist

import (
	"context"
	"database/sql"
	"fmt"
)

// SQLiteRepository implements Repository backed by SQLite.
type SQLiteRepository struct {
	db *sql.DB
}

// NewSQLiteRepository creates a new SQLiteRepository.
func NewSQLiteRepository(db *sql.DB) *SQLiteRepository {
	return &SQLiteRepository{db: db}
}

// InitSchema creates the historical_quotes table and indexes if not exists.
func (r *SQLiteRepository) InitSchema(ctx context.Context) error {
	_, _ = r.db.ExecContext(ctx, "PRAGMA journal_mode = WAL;")

	schema := `
	CREATE TABLE IF NOT EXISTS historical_quotes (
		ticker TEXT NOT NULL,
		trade_date TEXT NOT NULL,
		asset_class TEXT NOT NULL,
		name TEXT NOT NULL,
		open REAL NOT NULL,
		high REAL NOT NULL,
		low REAL NOT NULL,
		close_price REAL NOT NULL,
		adj_close REAL,
		volume REAL NOT NULL,
		source TEXT NOT NULL DEFAULT 'COTAHIST',
		PRIMARY KEY (ticker, trade_date)
	);
	CREATE INDEX IF NOT EXISTS idx_hq_date ON historical_quotes(trade_date);
	CREATE INDEX IF NOT EXISTS idx_hq_ticker ON historical_quotes(ticker);
	CREATE INDEX IF NOT EXISTS idx_hq_class ON historical_quotes(asset_class);

	CREATE TABLE IF NOT EXISTS corporate_events (
		ticker TEXT NOT NULL,
		event_type TEXT NOT NULL,
		event_date TEXT NOT NULL,
		numerator REAL NOT NULL DEFAULT 0,
		denominator REAL NOT NULL DEFAULT 0,
		ratio TEXT NOT NULL DEFAULT '',
		cash_amount REAL NOT NULL DEFAULT 0,
		PRIMARY KEY (ticker, event_type, event_date)
	);
	CREATE INDEX IF NOT EXISTS idx_ce_ticker_date ON corporate_events(ticker, event_date);

	CREATE TABLE IF NOT EXISTS catalog_assets (
		ticker TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		asset_class TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_cat_ticker ON catalog_assets(ticker);
	CREATE INDEX IF NOT EXISTS idx_cat_class ON catalog_assets(asset_class);
	`
	_, err := r.db.ExecContext(ctx, schema)
	if err != nil {
		return fmt.Errorf("falha ao criar schema cotahist: %w", err)
	}

	// Idempotent migration for existing tables
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE historical_quotes ADD COLUMN adj_close REAL;")
	_, _ = r.db.ExecContext(ctx, "ALTER TABLE historical_quotes ADD COLUMN source TEXT NOT NULL DEFAULT 'COTAHIST';")

	return nil
}

// UpsertQuotes idempotently inserts or updates quotes in a batch respecting source precedence (COTAHIST > YAHOO).
func (r *SQLiteRepository) UpsertQuotes(ctx context.Context, quotes []Quote) error {
	if len(quotes) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("falha ao iniciar transacao: %w", err)
	}
	defer tx.Rollback()

	query := `
	INSERT INTO historical_quotes (
		ticker, trade_date, asset_class, name, open, high, low, close_price, adj_close, volume, source
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(ticker, trade_date) DO UPDATE SET
		asset_class = excluded.asset_class,
		name = excluded.name,
		open = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.open
			ELSE excluded.open
		END,
		high = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.high
			ELSE excluded.high
		END,
		low = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.low
			ELSE excluded.low
		END,
		close_price = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.close_price
			ELSE excluded.close_price
		END,
		adj_close = CASE 
			WHEN excluded.adj_close IS NOT NULL AND excluded.adj_close > 0 THEN excluded.adj_close
			ELSE historical_quotes.adj_close
		END,
		volume = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.volume
			ELSE excluded.volume
		END,
		source = CASE 
			WHEN historical_quotes.source = 'COTAHIST' AND excluded.source != 'COTAHIST' THEN historical_quotes.source
			ELSE excluded.source
		END;
	`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("falha ao preparar statement: %w", err)
	}
	defer stmt.Close()

	for _, q := range quotes {
		src := q.Source
		if src == "" {
			src = "COTAHIST"
		}
		adj := q.AdjClose
		if adj == 0 && src == "COTAHIST" {
			adj = q.Close
		}

		_, err := stmt.ExecContext(
			ctx,
			q.Ticker,
			q.Date,
			q.AssetClass,
			q.Name,
			q.Open,
			q.High,
			q.Low,
			q.Close,
			adj,
			q.Volume,
			src,
		)
		if err != nil {
			return fmt.Errorf("falha ao inserir cotação %s na data %s: %w", q.Ticker, q.Date, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("falha no commit do lote cotahist: %w", err)
	}

	return nil
}

// GetQuotes queries quotes for a ticker within a date range [from, to].
func (r *SQLiteRepository) GetQuotes(ctx context.Context, ticker string, from, to string) ([]Quote, error) {
	query := `
	SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, COALESCE(adj_close, close_price), volume, source
	FROM historical_quotes
	WHERE ticker = ? AND trade_date >= ? AND trade_date <= ?
	ORDER BY trade_date ASC;
	`
	rows, err := r.db.QueryContext(ctx, query, ticker, from, to)
	if err != nil {
		return nil, fmt.Errorf("falha na query de cotacoes: %w", err)
	}
	defer rows.Close()

	var results []Quote
	for rows.Next() {
		var q Quote
		var adjClose sql.NullFloat64
		var source sql.NullString
		if err := rows.Scan(
			&q.Ticker,
			&q.Date,
			&q.AssetClass,
			&q.Name,
			&q.Open,
			&q.High,
			&q.Low,
			&q.Close,
			&adjClose,
			&q.Volume,
			&source,
		); err != nil {
			return nil, fmt.Errorf("falha no scan de cotação: %w", err)
		}
		if adjClose.Valid {
			q.AdjClose = adjClose.Float64
		} else {
			q.AdjClose = q.Close
		}
		if source.Valid && source.String != "" {
			q.Source = source.String
		} else {
			q.Source = "COTAHIST"
		}
		results = append(results, q)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// SearchCatalog searches for assets matching query and optional asset class across catalog_assets and historical_quotes.
func (r *SQLiteRepository) SearchCatalog(ctx context.Context, query string, assetClass string) ([]Quote, error) {
	pattern := "%" + query + "%"

	sqlQuery := `
	SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, volume
	FROM (
		SELECT ticker, '' as trade_date, asset_class, name, 0.0 as open, 0.0 as high, 0.0 as low, 0.0 as close_price, 0.0 as volume
		FROM catalog_assets
		WHERE (ticker LIKE ? OR name LIKE ?) AND (? = '' OR asset_class = ?)
		UNION ALL
		SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, volume
		FROM historical_quotes
		WHERE (ticker LIKE ? OR name LIKE ?) AND (? = '' OR asset_class = ?)
	)
	GROUP BY ticker
	ORDER BY ticker ASC;
	`
	rows, err := r.db.QueryContext(ctx, sqlQuery, pattern, pattern, assetClass, assetClass, pattern, pattern, assetClass, assetClass)
	if err != nil {
		return nil, fmt.Errorf("falha na busca do catálogo: %w", err)
	}
	defer rows.Close()

	var results []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(
			&q.Ticker,
			&q.Date,
			&q.AssetClass,
			&q.Name,
			&q.Open,
			&q.High,
			&q.Low,
			&q.Close,
			&q.Volume,
		); err != nil {
			return nil, fmt.Errorf("falha no scan do catalogo: %w", err)
		}
		results = append(results, q)
	}

	return results, rows.Err()
}

// GetLastDate returns the most recent quote date in the repository.
func (r *SQLiteRepository) GetLastDate(ctx context.Context) (string, error) {
	var lastDate sql.NullString
	err := r.db.QueryRowContext(ctx, "SELECT MAX(trade_date) FROM historical_quotes;").Scan(&lastDate)
	if err != nil {
		return "", fmt.Errorf("falha ao buscar data mais recente: %w", err)
	}
	if lastDate.Valid {
		return lastDate.String, nil
	}
	return "", nil
}

// SaveCorporateEvents persists corporate events (splits, dividends) for tickers.
func (r *SQLiteRepository) SaveCorporateEvents(ctx context.Context, events []CorporateEvent) error {
	if len(events) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("falha ao iniciar transacao para eventos corporativos: %w", err)
	}
	defer tx.Rollback()

	query := `
	INSERT OR REPLACE INTO corporate_events (
		ticker, event_type, event_date, numerator, denominator, ratio, cash_amount
	) VALUES (?, ?, ?, ?, ?, ?, ?);
	`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("falha ao preparar statement para corporate_events: %w", err)
	}
	defer stmt.Close()

	for _, e := range events {
		_, err := stmt.ExecContext(
			ctx,
			e.Ticker,
			e.Type,
			e.Date,
			e.Numerator,
			e.Denominator,
			e.Ratio,
			e.CashAmount,
		)
		if err != nil {
			return fmt.Errorf("falha ao salvar evento corporativo (%s, %s, %s): %w", e.Ticker, e.Type, e.Date, err)
		}
	}

	return tx.Commit()
}

// GetCorporateEvents retrieves corporate events for a ticker in date range [from, to].
func (r *SQLiteRepository) GetCorporateEvents(ctx context.Context, ticker string, from, to string) ([]CorporateEvent, error) {
	query := `
	SELECT ticker, event_type, event_date, numerator, denominator, ratio, cash_amount
	FROM corporate_events
	WHERE ticker = ? AND event_date >= ? AND event_date <= ?
	ORDER BY event_date ASC;
	`
	rows, err := r.db.QueryContext(ctx, query, ticker, from, to)
	if err != nil {
		return nil, fmt.Errorf("falha na query de eventos corporativos: %w", err)
	}
	defer rows.Close()

	var events []CorporateEvent
	for rows.Next() {
		var e CorporateEvent
		if err := rows.Scan(
			&e.Ticker,
			&e.Type,
			&e.Date,
			&e.Numerator,
			&e.Denominator,
			&e.Ratio,
			&e.CashAmount,
		); err != nil {
			return nil, fmt.Errorf("falha no scan de evento corporativo: %w", err)
		}
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

// UpsertCatalogAssets inserts or replaces assets in the public catalog.
func (r *SQLiteRepository) UpsertCatalogAssets(ctx context.Context, assets []CatalogAsset) error {
	if len(assets) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("falha ao iniciar transacao para catalog_assets: %w", err)
	}
	defer tx.Rollback()

	query := `
	INSERT OR REPLACE INTO catalog_assets (
		ticker, name, asset_class
	) VALUES (?, ?, ?);
	`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("falha ao preparar statement para catalog_assets: %w", err)
	}
	defer stmt.Close()

	for _, a := range assets {
		_, err := stmt.ExecContext(ctx, a.Ticker, a.Name, a.AssetClass)
		if err != nil {
			return fmt.Errorf("falha ao inserir catalog_asset %s: %w", a.Ticker, err)
		}
	}

	return tx.Commit()
}

