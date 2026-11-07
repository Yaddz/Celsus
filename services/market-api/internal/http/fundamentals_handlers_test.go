package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/fundamentals"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	_ "modernc.org/sqlite"
)

type mockFundamentalsProvider struct{}

func (m *mockFundamentalsProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*fundamentals.AssetProfileDTO, error) {
	return &fundamentals.AssetProfileDTO{
		Ticker:      ticker,
		Name:        ticker + " Name",
		AssetClass:  assetClass,
		Price:       38.42,
		Change24h:   1.80,
		Change12m:   14.3,
		Indicators:  map[string]interface{}{"dy": 12.4, "pl": 5.2, "pvp": 1.3},
		CompanyName: "Petroleo Brasileiro",
		Sector:      "Petroleo",
		Source:      "YAHOO",
		UpdatedAt:   time.Now(),
	}, nil
}

func TestFundamentalsEndpoints(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	cRepo := cotahist.NewSQLiteRepository(db)
	_ = cRepo.InitSchema(ctx)
	mRepo := macro.NewSQLiteRepository(db)
	_ = mRepo.InitSchema(ctx)

	server := NewServer(cRepo, nil, mRepo)
	server.SetFundamentalsProvider(&mockFundamentalsProvider{})
	server.SetDB(db)

	t.Run("GET /v1/assets/{ticker}/profile", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/assets/PETR4/profile", nil)
		rec := httptest.NewRecorder()
		server.Router().ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if resp["ticker"] != "PETR4" {
			t.Errorf("expected PETR4, got %v", resp["ticker"])
		}
	})

	t.Run("GET /v1/assets/{ticker}/history", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/assets/PETR4/history?range=1y", nil)
		rec := httptest.NewRecorder()
		server.Router().ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := resp["history"]; !ok {
			t.Errorf("expected history field in response")
		}
	})

	t.Run("GET /v1/assets/{ticker}/dividends", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/assets/PETR4/dividends", nil)
		rec := httptest.NewRecorder()
		server.Router().ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := resp["dividends"]; !ok {
			t.Errorf("expected dividends field in response")
		}
	})

	t.Run("GET /v1/rankings", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/v1/rankings?class=FII&by=dy&limit=10", nil)
		rec := httptest.NewRecorder()
		server.Router().ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := resp["rankings"]; !ok {
			t.Errorf("expected rankings field in response")
		}
	})
}
