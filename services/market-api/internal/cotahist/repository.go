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
		volume REAL NOT NULL,
		PRIMARY KEY (ticker, trade_date)
	);
	CREATE INDEX IF NOT EXISTS idx_hq_date ON historical_quotes(trade_date);
	CREATE INDEX IF NOT EXISTS idx_hq_ticker ON historical_quotes(ticker);
	CREATE INDEX IF NOT EXISTS idx_hq_class ON historical_quotes(asset_class);
	`
	_, err := r.db.ExecContext(ctx, schema)
	if err != nil {
		return fmt.Errorf("falha ao criar schema cotahist: %w", err)
	}
	return nil
}

// UpsertQuotes idempotently inserts or replaces quotes in a batch.
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
	INSERT OR REPLACE INTO historical_quotes (
		ticker, trade_date, asset_class, name, open, high, low, close_price, volume
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
	`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("falha ao preparar statement: %w", err)
	}
	defer stmt.Close()

	for _, q := range quotes {
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
			q.Volume,
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
	SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, volume
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
			return nil, fmt.Errorf("falha no scan de cotação: %w", err)
		}
		results = append(results, q)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// SearchCatalog searches for assets matching query and optional asset class.
func (r *SQLiteRepository) SearchCatalog(ctx context.Context, query string, assetClass string) ([]Quote, error) {
	pattern := "%" + query + "%"
	var rows *sql.Rows
	var err error

	if assetClass != "" {
		sqlQuery := `
		SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, volume
		FROM historical_quotes
		WHERE (ticker LIKE ? OR name LIKE ?) AND asset_class = ?
		GROUP BY ticker
		ORDER BY ticker ASC;
		`
		rows, err = r.db.QueryContext(ctx, sqlQuery, pattern, pattern, assetClass)
	} else {
		sqlQuery := `
		SELECT ticker, trade_date, asset_class, name, open, high, low, close_price, volume
		FROM historical_quotes
		WHERE ticker LIKE ? OR name LIKE ?
		GROUP BY ticker
		ORDER BY ticker ASC;
		`
		rows, err = r.db.QueryContext(ctx, sqlQuery, pattern, pattern)
	}

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
