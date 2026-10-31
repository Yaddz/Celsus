package macro

import (
	"context"
	"database/sql"
	"fmt"
)

// Rate represents a macroeconomic rate observation (CDI, SELIC, IPCA).
type Rate struct {
	Date  string  `json:"date"`  // YYYY-MM-DD
	Type  string  `json:"type"`  // CDI, SELIC, IPCA
	Value float64 `json:"value"` // Rate value
}

// Repository defines storage and retrieval of macroeconomic rates.
type Repository interface {
	InitSchema(ctx context.Context) error
	SaveRates(ctx context.Context, rates []Rate) error
	GetRates(ctx context.Context, rateType string, from, to string) ([]Rate, error)
}

// SQLiteRepository implements Repository backed by SQLite.
type SQLiteRepository struct {
	db *sql.DB
}

// NewSQLiteRepository creates a new SQLiteRepository for macro rates.
func NewSQLiteRepository(db *sql.DB) *SQLiteRepository {
	return &SQLiteRepository{db: db}
}

// InitSchema creates the macro_rates table and indexes if not exists.
func (r *SQLiteRepository) InitSchema(ctx context.Context) error {
	_, _ = r.db.ExecContext(ctx, "PRAGMA journal_mode = WAL;")

	schema := `
	CREATE TABLE IF NOT EXISTS macro_rates (
		date TEXT NOT NULL,
		type TEXT NOT NULL,
		value REAL NOT NULL,
		PRIMARY KEY (date, type)
	);
	CREATE INDEX IF NOT EXISTS idx_mr_date ON macro_rates(date);
	CREATE INDEX IF NOT EXISTS idx_mr_type ON macro_rates(type);
	`
	_, err := r.db.ExecContext(ctx, schema)
	if err != nil {
		return fmt.Errorf("falha ao criar schema macro: %w", err)
	}
	return nil
}

// SaveRates idempotently saves macro rates.
func (r *SQLiteRepository) SaveRates(ctx context.Context, rates []Rate) error {
	if len(rates) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("falha ao iniciar transacao macro: %w", err)
	}
	defer tx.Rollback()

	query := `INSERT OR REPLACE INTO macro_rates (date, type, value) VALUES (?, ?, ?);`
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("falha ao preparar statement macro: %w", err)
	}
	defer stmt.Close()

	for _, r := range rates {
		_, err := stmt.ExecContext(ctx, r.Date, r.Type, r.Value)
		if err != nil {
			return fmt.Errorf("falha ao inserir taxa macro %s/%s: %w", r.Type, r.Date, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("falha no commit das taxas macro: %w", err)
	}

	return nil
}

// GetRates retrieves rates by type and date range [from, to].
func (r *SQLiteRepository) GetRates(ctx context.Context, rateType string, from, to string) ([]Rate, error) {
	if from == "" {
		from = "0000-01-01"
	}
	if to == "" {
		to = "9999-12-31"
	}

	var rows *sql.Rows
	var err error

	if rateType != "" {
		query := `
		SELECT date, type, value
		FROM macro_rates
		WHERE type = ? AND date >= ? AND date <= ?
		ORDER BY date ASC;
		`
		rows, err = r.db.QueryContext(ctx, query, rateType, from, to)
	} else {
		query := `
		SELECT date, type, value
		FROM macro_rates
		WHERE date >= ? AND date <= ?
		ORDER BY date ASC;
		`
		rows, err = r.db.QueryContext(ctx, query, from, to)
	}

	if err != nil {
		return nil, fmt.Errorf("falha ao consultar taxas macro: %w", err)
	}
	defer rows.Close()

	var results []Rate
	for rows.Next() {
		var rate Rate
		if err := rows.Scan(&rate.Date, &rate.Type, &rate.Value); err != nil {
			return nil, fmt.Errorf("falha no scan da taxa macro: %w", err)
		}
		results = append(results, rate)
	}

	return results, rows.Err()
}
