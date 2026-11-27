package mobilebridge

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func loadYahooFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("..", "..", "internal", "yahoo", "testdata", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("falha ao ler fixture %s: %v", path, err)
	}
	return data
}

// S107-BRIDGE-01: Funções *WithClassJSON e currency nos retornos da ponte mobilebridge
func TestSprint107_MobileBridge_US_FX_And_Currency(t *testing.T) {
	nvdaFixture := loadYahooFixture(t, "nvda_chart.json")
	usdbrlFixture := loadYahooFixture(t, "usdbrl_chart.json")
	usSearchFixture := loadYahooFixture(t, "us_search.json")

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v8/finance/chart/NVDA":
			_, _ = w.Write(nvdaFixture)
		case "/v8/finance/chart/BRL=X":
			_, _ = w.Write(usdbrlFixture)
		case "/v1/finance/search":
			if strings.EqualFold(r.URL.Query().Get("q"), "NVDA") {
				_, _ = w.Write(usSearchFixture)
				return
			}
			_, _ = w.Write([]byte(`{"quotes":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockYahoo.Close()

	dbPath := filepath.Join(t.TempDir(), "s107_bridge.db")
	SetCustomBaseURLs(mockYahoo.URL, mockYahoo.URL, "")
	if err := InitEngine(dbPath, false); err != nil {
		t.Fatalf("InitEngine falhou: %v", err)
	}
	defer func() {
		_ = CloseEngine()
		SetCustomBaseURLs("", "", "")
	}()

	// 1. FetchQuotesWithClassJSON para NVDA (US_STOCK) -> currency USD
	qJSON, err := FetchQuotesWithClassJSON("NVDA", "US_STOCK", true)
	if err != nil {
		t.Fatalf("FetchQuotesWithClassJSON erro: %v", err)
	}
	var qResp struct {
		Quotes []struct {
			Ticker       string  `json:"ticker"`
			AssetClass   string  `json:"asset_class"`
			CurrentPrice float64 `json:"current_price"`
			Currency     string  `json:"currency"`
		} `json:"quotes"`
	}
	if err := json.Unmarshal([]byte(qJSON), &qResp); err != nil {
		t.Fatalf("unmarshal quotes erro: %v", err)
	}
	if len(qResp.Quotes) != 1 || qResp.Quotes[0].Currency != "USD" || qResp.Quotes[0].Ticker != "NVDA" {
		t.Fatalf("FetchQuotesWithClassJSON inesperado: %+v", qResp.Quotes)
	}

	// 2. FetchQuotesJSON para USDBRL -> currency BRL
	fxJSON, err := FetchQuotesJSON("USDBRL", true)
	if err != nil {
		t.Fatalf("FetchQuotesJSON(USDBRL) erro: %v", err)
	}
	if err := json.Unmarshal([]byte(fxJSON), &qResp); err != nil {
		t.Fatalf("unmarshal fx quotes erro: %v", err)
	}
	if len(qResp.Quotes) != 1 || qResp.Quotes[0].Currency != "BRL" || qResp.Quotes[0].Ticker != "USDBRL" {
		t.Fatalf("FetchQuotesJSON(USDBRL) inesperado: %+v", qResp.Quotes)
	}

	// 3. GetHistoricalPriceWithClassJSON para NVDA -> currency USD (on-demand + cache hit)
	histJSON, err := GetHistoricalPriceWithClassJSON("NVDA", "2024-01-02", "US_STOCK")
	if err != nil {
		t.Fatalf("GetHistoricalPriceWithClassJSON erro: %v", err)
	}
	var histResp struct {
		Ticker     string  `json:"ticker"`
		Date       string  `json:"date"`
		ClosePrice float64 `json:"close_price"`
		Currency   string  `json:"currency"`
	}
	if err := json.Unmarshal([]byte(histJSON), &histResp); err != nil {
		t.Fatalf("unmarshal historical price erro: %v", err)
	}
	if histResp.Currency != "USD" || histResp.ClosePrice != 49.50 {
		t.Fatalf("GetHistoricalPriceWithClassJSON inesperado: %+v", histResp)
	}

	// Segunda chamada deve vir do cache SQLite preservando Currency == "USD"
	histCachedJSON, err := GetHistoricalPriceWithClassJSON("NVDA", "2024-01-02", "US_STOCK")
	if err != nil {
		t.Fatalf("GetHistoricalPriceWithClassJSON cache hit erro: %v", err)
	}
	if err := json.Unmarshal([]byte(histCachedJSON), &histResp); err != nil {
		t.Fatalf("unmarshal cached historical price erro: %v", err)
	}
	if histResp.Currency != "USD" {
		t.Fatalf("cache hit perdeu currency USD: %+v", histResp)
	}

	// 4. GetPriceHistoryWithClassJSON e GetDividendsWithClassJSON
	phJSON, err := GetPriceHistoryWithClassJSON("NVDA", "1y", "US_STOCK")
	if err != nil {
		t.Fatalf("GetPriceHistoryWithClassJSON erro: %v", err)
	}
	var phResp struct {
		Currency string `json:"currency"`
		History  []struct {
			Date     string  `json:"date"`
			Close    float64 `json:"close"`
			Currency string  `json:"currency"`
		} `json:"history"`
	}
	if err := json.Unmarshal([]byte(phJSON), &phResp); err != nil {
		t.Fatalf("unmarshal price history erro: %v", err)
	}
	if phResp.Currency != "USD" || len(phResp.History) == 0 || phResp.History[0].Currency != "USD" {
		t.Fatalf("GetPriceHistoryWithClassJSON inesperado: %+v", phResp)
	}

	divJSON, err := GetDividendsWithClassJSON("NVDA", "US_STOCK")
	if err != nil {
		t.Fatalf("GetDividendsWithClassJSON erro: %v", err)
	}
	var divResp struct {
		Currency  string `json:"currency"`
		Dividends []struct {
			Date     string  `json:"date"`
			Amount   float64 `json:"amount"`
			Currency string  `json:"currency"`
		} `json:"dividends"`
	}
	if err := json.Unmarshal([]byte(divJSON), &divResp); err != nil {
		t.Fatalf("unmarshal dividends erro: %v", err)
	}
	if divResp.Currency != "USD" || len(divResp.Dividends) == 0 || divResp.Dividends[0].Currency != "USD" {
		t.Fatalf("GetDividendsWithClassJSON inesperado: %+v", divResp)
	}

	// 5. SearchCatalogJSON para US_STOCK
	catJSON, err := SearchCatalogJSON("NVDA", "US_STOCK")
	if err != nil {
		t.Fatalf("SearchCatalogJSON erro: %v", err)
	}
	var catResp struct {
		Results []struct {
			Ticker     string `json:"ticker"`
			AssetClass string `json:"asset_class"`
		} `json:"results"`
	}
	if err := json.Unmarshal([]byte(catJSON), &catResp); err != nil {
		t.Fatalf("unmarshal catalog erro: %v", err)
	}
	if len(catResp.Results) == 0 || catResp.Results[0].Ticker != "NVDA" || catResp.Results[0].AssetClass != "US_STOCK" {
		t.Fatalf("SearchCatalogJSON US_STOCK inesperado: %+v", catResp.Results)
	}
}
