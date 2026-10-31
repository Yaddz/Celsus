package macro

import (
	"context"
	"database/sql"
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
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// SaveRates idempotently saves macro rates.
func (r *SQLiteRepository) SaveRates(ctx context.Context, rates []Rate) error {
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// GetRates retrieves rates by type and date range [from, to].
func (r *SQLiteRepository) GetRates(ctx context.Context, rateType string, from, to string) ([]Rate, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, nil
}
