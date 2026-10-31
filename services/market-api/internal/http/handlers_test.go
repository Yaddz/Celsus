package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/brapi"
	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	_ "modernc.org/sqlite"
)

// S1-T09: Contratos JSON e códigos HTTP (200, 400) para todos os 5 endpoints /v1/*
func TestEndpoints_Health_Catalog_Quotes_History_Macro(t *testing.T) {
	ctx := context.Background()

	// 1. Setup Mock BRAPI Server
	mockBrapi := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/quote/PETR4" || r.URL.Path == "/api/quote/PETR4,HGLG11" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"results": []map[string]interface{}{
					{
						"symbol":                     "PETR4",
						"regularMarketPrice":         38.50,
						"regularMarketChangePercent": 1.25,
					},
					{
						"symbol":                     "HGLG11",
						"regularMarketPrice":         162.50,
						"regularMarketChangePercent": -0.40,
					},
				},
			})
			return
		}
		if r.URL.Path == "/api/v2/crypto" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"coins": []map[string]interface{}{
					{
						"coin":                       "BTC",
						"currency":                   "BRL",
						"regularMarketPrice":         350000.50,
						"regularMarketChangePercent": 2.75,
					},
				},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "ok"})
	}))
	defer mockBrapi.Close()

	// 2. Setup SQLite Repositories in-memory
	cotahistDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco cotahist: %v", err)
	}
	defer cotahistDB.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(cotahistDB)
	if err := cotahistRepo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema cotahist: %v", err)
	}

	// Insere cotação de teste
	_ = cotahistRepo.UpsertQuotes(ctx, []cotahist.Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      38.50,
			Volume:     500000.00,
		},
	})

	macroDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco macro: %v", err)
	}
	defer macroDB.Close()

	macroRepo := macro.NewSQLiteRepository(macroDB)
	if err := macroRepo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema macro: %v", err)
	}

	_ = macroRepo.SaveRates(ctx, []macro.Rate{
		{Date: "2024-01-02", Type: "CDI", Value: 0.000450},
	})

	brapiClient := brapi.NewClient("test-token", mockBrapi.URL, 1*time.Minute)

	server := NewServer(cotahistRepo, brapiClient, macroRepo)
	router := server.Router()

	// Helper para disparar requisições
	executeReq := func(method, target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, target, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	// ==========================================
	// Teste 1: GET /v1/health
	// ==========================================
	t.Run("Endpoint_Health", func(t *testing.T) {
		rec := executeReq(http.MethodGet, "/v1/health")
		if rec.Code != http.StatusOK {
			t.Fatalf("esperava status 200 em /v1/health, obtido %d", rec.Code)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("resposta não é JSON válido: %v", err)
		}

		if body["status"] != "ok" {
			t.Errorf("esperava status='ok', obtido %v", body["status"])
		}
		if _, ok := body["cotahist_last_date"]; !ok {
			t.Errorf("campo cotahist_last_date ausente na resposta")
		}
	})

	// ==========================================
	// Teste 2: GET /v1/catalog/search
	// ==========================================
	t.Run("Endpoint_CatalogSearch", func(t *testing.T) {
		// 400 quando parâmetro q ausente
		rec400 := executeReq(http.MethodGet, "/v1/catalog/search")
		if rec400.Code != http.StatusBadRequest {
			t.Errorf("esperava status 400 sem param q, obtido %d", rec400.Code)
		}

		// 200 com query válida
		rec200 := executeReq(http.MethodGet, "/v1/catalog/search?q=PETR&class=STOCK")
		if rec200.Code != http.StatusOK {
			t.Fatalf("esperava status 200 em catalog search, obtido %d", rec200.Code)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(rec200.Body.Bytes(), &body); err != nil {
			t.Fatalf("resposta inválida: %v", err)
		}
		if _, ok := body["results"]; !ok {
			t.Errorf("campo results ausente no catálogo")
		}
	})

	// ==========================================
	// Teste 3: GET /v1/quotes
	// ==========================================
	t.Run("Endpoint_Quotes", func(t *testing.T) {
		// 400 quando tickers ausente
		rec400 := executeReq(http.MethodGet, "/v1/quotes")
		if rec400.Code != http.StatusBadRequest {
			t.Errorf("esperava status 400 sem param tickers, obtido %d", rec400.Code)
		}

		// 200 com tickers válidos
		rec200 := executeReq(http.MethodGet, "/v1/quotes?tickers=PETR4,BTC")
		if rec200.Code != http.StatusOK {
			t.Fatalf("esperava status 200 em quotes, obtido %d", rec200.Code)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(rec200.Body.Bytes(), &body); err != nil {
			t.Fatalf("resposta inválida: %v", err)
		}
		if _, ok := body["quotes"]; !ok {
			t.Errorf("campo quotes ausente na resposta")
		}
	})

	// ==========================================
	// Teste 4: GET /v1/history
	// ==========================================
	t.Run("Endpoint_History", func(t *testing.T) {
		// 400 quando tickers ausente
		rec400 := executeReq(http.MethodGet, "/v1/history")
		if rec400.Code != http.StatusBadRequest {
			t.Errorf("esperava status 400 sem param tickers, obtido %d", rec400.Code)
		}

		// 200 com ticker e range
		rec200 := executeReq(http.MethodGet, "/v1/history?tickers=PETR4&from=2024-01-01&to=2024-01-10")
		if rec200.Code != http.StatusOK {
			t.Fatalf("esperava status 200 em history, obtido %d", rec200.Code)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(rec200.Body.Bytes(), &body); err != nil {
			t.Fatalf("resposta inválida: %v", err)
		}
		if _, ok := body["history"]; !ok {
			t.Errorf("campo history ausente na resposta")
		}
	})

	// ==========================================
	// Teste 5: GET /v1/rates/macro
	// ==========================================
	t.Run("Endpoint_RatesMacro", func(t *testing.T) {
		rec200 := executeReq(http.MethodGet, "/v1/rates/macro?from=2024-01-01&type=CDI")
		if rec200.Code != http.StatusOK {
			t.Fatalf("esperava status 200 em rates/macro, obtido %d", rec200.Code)
		}

		var body map[string]interface{}
		if err := json.Unmarshal(rec200.Body.Bytes(), &body); err != nil {
			t.Fatalf("resposta inválida: %v", err)
		}
		if _, ok := body["rates"]; !ok {
			t.Errorf("campo rates ausente na resposta")
		}
	})
}
