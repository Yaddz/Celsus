package cotahist

import (
	"context"
	"database/sql"
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
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// UpsertQuotes idempotently inserts or replaces quotes in a batch.
func (r *SQLiteRepository) UpsertQuotes(ctx context.Context, quotes []Quote) error {
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// GetQuotes queries quotes for a ticker within a date range [from, to].
func (r *SQLiteRepository) GetQuotes(ctx context.Context, ticker string, from, to string) ([]Quote, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, nil
}

// SearchCatalog searches for assets matching query and optional asset class.
func (r *SQLiteRepository) SearchCatalog(ctx context.Context, query string, assetClass string) ([]Quote, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, nil
}

// GetLastDate returns the most recent quote date in the repository.
func (r *SQLiteRepository) GetLastDate(ctx context.Context) (string, error) {
	// Stub for Phase A (TDD Red Phase)
	return "", nil
}
