package cotahist

import (
	"context"

	"github.com/pedro/celsus/services/market-api/internal/macro"
)

// SeedMarketData populates cotahist and macro repositories with a baseline set of market data.
func SeedMarketData(ctx context.Context, cotahistRepo *SQLiteRepository, macroRepo *macro.SQLiteRepository) error {
	// Stub implementation for Phase A
	return nil
}
