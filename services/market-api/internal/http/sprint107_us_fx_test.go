package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
	_ "modernc.org/sqlite"
)

func loadYahooTestFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("..", "yahoo", "testdata", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("falha ao ler fixture %s: %v", path, err)
	}
	return data
}

// S107-HTTP-01: Rotas /v1/quotes, /v1/history, /v1/assets/{t}/history, /v1/assets/{t}/dividends e /v1/catalog/search com class e currency
func TestSprint107_Routes_US_FX_Currency_And_CatalogSearch(t *testing.T) {
	ctx := context.Background()
	nvdaFixture := loadYahooTestFixture(t, "nvda_chart.json")
	usdbrlFixture := loadYahooTestFixture(t, "usdbrl_chart.json")
	eurbrlFixture := loadYahooTestFixture(t, "eurbrl_chart.json")
	petrNoCurrFixture := loadYahooTestFixture(t, "petr4_no_currency_chart.json")
	usSearchFixture := loadYahooTestFixture(t, "us_search.json")

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v8/finance/chart/NVDA":
			_, _ = w.Write(nvdaFixture)
		case "/v8/finance/chart/MSFT":
			// Simula ticker digitado sem resultado no search, mas válido na cotação
			_, _ = w.Write(nvdaFixture)
		case "/v8/finance/chart/BRL=X":
			_, _ = w.Write(usdbrlFixture)
		case "/v8/finance/chart/EURBRL=X":
			_, _ = w.Write(eurbrlFixture)
		case "/v8/finance/chart/PETR4.SA":
			_, _ = w.Write(petrNoCurrFixture)
		case "/v1/finance/search":
			q := strings.ToUpper(r.URL.Query().Get("q"))
			if q == "NVDA" {
				_, _ = w.Write(usSearchFixture)
				return
			}
			_, _ = w.Write([]byte(`{"quotes":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockYahoo.Close()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("erro sqlite: %v", err)
	}
	defer db.Close()

	cRepo := cotahist.NewSQLiteRepository(db)
	if err := cRepo.InitSchema(ctx); err != nil {
		t.Fatalf("erro schema cotahist: %v", err)
	}
	mRepo := macro.NewSQLiteRepository(db)
	if err := mRepo.InitSchema(ctx); err != nil {
		t.Fatalf("erro schema macro: %v", err)
	}

	yClient := yahoo.NewClient(mockYahoo.URL, mockYahoo.URL, 0)
	srv := NewServer(cRepo, yClient, mRepo)
	srv.SetDB(db)
	router := srv.Router()

	doGet := func(target string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	t.Run("Quotes_US_STOCK_and_FX_Currency", func(t *testing.T) {
		rec := doGet("/v1/quotes?tickers=NVDA&class=US_STOCK")
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /v1/quotes NVDA status=%d body=%s", rec.Code, rec.Body.String())
		}
		var resp struct {
			Quotes map[string]struct {
				Ticker   string  `json:"ticker"`
				Price    float64 `json:"price"`
				Currency string  `json:"currency"`
			} `json:"quotes"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("json decode erro: %v", err)
		}
		nvda, ok := resp.Quotes["NVDA"]
		if !ok {
			t.Fatalf("NVDA ausente em /v1/quotes")
		}
		if nvda.Currency != "USD" {
			t.Errorf("NVDA currency = %q, esperado USD", nvda.Currency)
		}

		recFx := doGet("/v1/quotes?tickers=USDBRL,EURBRL")
		if recFx.Code != http.StatusOK {
			t.Fatalf("GET /v1/quotes FX status=%d", recFx.Code)
		}
		if err := json.Unmarshal(recFx.Body.Bytes(), &resp); err != nil {
			t.Fatalf("json decode FX erro: %v", err)
		}
		if resp.Quotes["USDBRL"].Currency != "BRL" || resp.Quotes["USDBRL"].Price != 5.75 {
			t.Errorf("USDBRL inesperado: %+v", resp.Quotes["USDBRL"])
		}
		if resp.Quotes["EURBRL"].Currency != "BRL" || resp.Quotes["EURBRL"].Price != 6.12 {
			t.Errorf("EURBRL inesperado: %+v", resp.Quotes["EURBRL"])
		}
	})

	t.Run("History_With_Class_US_STOCK", func(t *testing.T) {
		rec := doGet("/v1/history?tickers=NVDA&from=2024-01-01&to=2024-01-10&class=US_STOCK")
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /v1/history status=%d body=%s", rec.Code, rec.Body.String())
		}
		var resp struct {
			History map[string][]struct {
				Date     string  `json:"date"`
				Close    float64 `json:"close"`
				Currency string  `json:"currency"`
			} `json:"history"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("json decode history erro: %v", err)
		}
		pts := resp.History["NVDA"]
		if len(pts) == 0 {
			t.Fatalf("esperava pontos em history[NVDA]")
		}
		if pts[0].Currency != "USD" {
			t.Errorf("history[NVDA][0].Currency = %q, esperado USD", pts[0].Currency)
		}
	})

	t.Run("AssetHistory_And_Dividends_With_Class", func(t *testing.T) {
		recHist := doGet("/v1/assets/NVDA/history?range=1y&class=US_STOCK")
		if recHist.Code != http.StatusOK {
			t.Fatalf("GET /v1/assets/NVDA/history status=%d", recHist.Code)
		}
		var histResp struct {
			Currency string `json:"currency"`
			History  []struct {
				Date     string  `json:"date"`
				Close    float64 `json:"close"`
				Currency string  `json:"currency"`
			} `json:"history"`
		}
		if err := json.Unmarshal(recHist.Body.Bytes(), &histResp); err != nil {
			t.Fatalf("json decode asset history erro: %v", err)
		}
		if histResp.Currency != "USD" || len(histResp.History) == 0 || histResp.History[0].Currency != "USD" {
			t.Errorf("asset history currency inesperado: top=%q len=%d", histResp.Currency, len(histResp.History))
		}

		recDiv := doGet("/v1/assets/NVDA/dividends?class=US_STOCK")
		if recDiv.Code != http.StatusOK {
			t.Fatalf("GET /v1/assets/NVDA/dividends status=%d", recDiv.Code)
		}
		var divResp struct {
			Currency  string `json:"currency"`
			Dividends []struct {
				Date     string  `json:"date"`
				Amount   float64 `json:"amount"`
				Currency string  `json:"currency"`
			} `json:"dividends"`
		}
		if err := json.Unmarshal(recDiv.Body.Bytes(), &divResp); err != nil {
			t.Fatalf("json decode asset dividends erro: %v", err)
		}
		if divResp.Currency != "USD" || len(divResp.Dividends) == 0 || divResp.Dividends[0].Currency != "USD" {
			t.Errorf("asset dividends currency inesperado: top=%q len=%d", divResp.Currency, len(divResp.Dividends))
		}
	})

	t.Run("CatalogSearch_US_STOCK_SearchAndFallbackQuote", func(t *testing.T) {
		// 1. Search retorna NVDA (e filtra NVDA34.SA)
		rec := doGet("/v1/catalog/search?q=NVDA&class=US_STOCK")
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /v1/catalog/search status=%d", rec.Code)
		}
		var searchResp struct {
			Results []struct {
				Ticker string `json:"ticker"`
				Name   string `json:"name"`
				Class  string `json:"class"`
			} `json:"results"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &searchResp); err != nil {
			t.Fatalf("json decode search erro: %v", err)
		}
		if len(searchResp.Results) == 0 || searchResp.Results[0].Ticker != "NVDA" || searchResp.Results[0].Class != "US_STOCK" {
			t.Fatalf("resultado inesperado no search US_STOCK: %+v", searchResp.Results)
		}

		// 2. Sem resultado no search -> valida ticker digitado com cotação real (MSFT)
		recMsft := doGet("/v1/catalog/search?q=MSFT&class=US_STOCK")
		if recMsft.Code != http.StatusOK {
			t.Fatalf("GET /v1/catalog/search MSFT status=%d", recMsft.Code)
		}
		if err := json.Unmarshal(recMsft.Body.Bytes(), &searchResp); err != nil {
			t.Fatalf("json decode search MSFT erro: %v", err)
		}
		if len(searchResp.Results) == 0 || searchResp.Results[0].Ticker != "MSFT" || searchResp.Results[0].Class != "US_STOCK" {
			t.Fatalf("fallback de cotação real para MSFT falhou: %+v", searchResp.Results)
		}
	})
}
