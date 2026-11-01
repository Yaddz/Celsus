package mobilebridge

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Helper to construct fixed-width 245-byte B3 COTAHIST lines
func buildTestCotahistLine(tipreg, datpre, codbdi, codneg, tpmerc, nomres, preabe, premax, premin, preult, voltot string) string {
	line := make([]byte, 245)
	for i := range line {
		line[i] = ' '
	}
	copy(line[0:2], tipreg)
	copy(line[2:10], datpre)
	copy(line[10:12], codbdi)
	copy(line[12:24], codneg)
	copy(line[24:27], tpmerc)
	copy(line[27:39], nomres)
	copy(line[56:69], preabe)
	copy(line[69:82], premax)
	copy(line[82:95], premin)
	copy(line[108:121], preult)
	copy(line[170:188], voltot)
	return string(line)
}

// S22-T01: Inicialização em SQLite com catálogo e busca offline instantânea (< 100ms) sem chamadas de rede
func TestBridge_InitAndSearchCatalogOffline(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	start := time.Now()
	resJSON, err := SearchCatalogJSON("PET", "STOCK")
	duration := time.Since(start)

	if err != nil {
		t.Fatalf("SearchCatalogJSON failed: %v", err)
	}
	if duration > 100*time.Millisecond {
		t.Errorf("SearchCatalogJSON took too long: %v (expected < 100ms)", duration)
	}

	var stockRes struct {
		Results []struct {
			Ticker     string `json:"ticker"`
			Name       string `json:"name"`
			AssetClass string `json:"asset_class"`
		} `json:"results"`
	}
	if err := json.Unmarshal([]byte(resJSON), &stockRes); err != nil {
		t.Fatalf("failed to parse search catalog JSON: %v, raw: %s", err, resJSON)
	}

	foundPETR4 := false
	foundPETR3 := false
	for _, item := range stockRes.Results {
		if item.Ticker == "PETR4" {
			foundPETR4 = true
		}
		if item.Ticker == "PETR3" {
			foundPETR3 = true
		}
	}
	if !foundPETR4 || !foundPETR3 {
		t.Errorf("expected PETR4 and PETR3 in results, got %+v", stockRes.Results)
	}

	// Search FII
	fiiJSON, err := SearchCatalogJSON("HGLG", "FII")
	if err != nil {
		t.Fatalf("SearchCatalogJSON(HGLG) failed: %v", err)
	}
	var fiiRes struct {
		Results []struct {
			Ticker string `json:"ticker"`
		} `json:"results"`
	}
	if err := json.Unmarshal([]byte(fiiJSON), &fiiRes); err != nil {
		t.Fatalf("failed to parse FII search JSON: %v", err)
	}
	foundHGLG11 := false
	for _, item := range fiiRes.Results {
		if item.Ticker == "HGLG11" {
			foundHGLG11 = true
		}
	}
	if !foundHGLG11 {
		t.Errorf("expected HGLG11 in FII search results, got %+v", fiiRes.Results)
	}

	// Search Crypto
	cryptoJSON, err := SearchCatalogJSON("BTC", "CRYPTO")
	if err != nil {
		t.Fatalf("SearchCatalogJSON(BTC) failed: %v", err)
	}
	var cryptoRes struct {
		Results []struct {
			Ticker string `json:"ticker"`
		} `json:"results"`
	}
	if err := json.Unmarshal([]byte(cryptoJSON), &cryptoRes); err != nil {
		t.Fatalf("failed to parse Crypto search JSON: %v", err)
	}
	foundBTC := false
	for _, item := range cryptoRes.Results {
		if item.Ticker == "BTC" {
			foundBTC = true
		}
	}
	if !foundBTC {
		t.Errorf("expected BTC in Crypto search results, got %+v", cryptoRes.Results)
	}
}

// S22-T02: Cache de cotações com TTL de 15 minutos, forceRefresh e fallback gracioso offline (is_stale: true)
func TestBridge_FetchQuotesJSON_TTLAndStaleFallback(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	var yahooRequests int32
	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&yahooRequests, 1)
		w.Header().Set("Content-Type", "application/json")

		if strings.Contains(r.URL.Path, "PETR4.SA") {
			resp := `{
				"chart": {
					"result": [
						{
							"meta": {
								"currency": "BRL",
								"symbol": "PETR4.SA",
								"regularMarketPrice": 38.50,
								"chartPreviousClose": 38.00,
								"regularMarketTime": 1714564800,
								"instrumentType": "EQUITY"
							},
							"timestamp": [1714564800],
							"indicators": {
								"quote": [{"open": [38.00], "high": [38.70], "low": [37.90], "close": [38.50], "volume": [1000000]}],
								"adjclose": [{"adjclose": [38.50]}]
							}
						}
					],
					"error": null
				}
			}`
			_, _ = w.Write([]byte(resp))
			return
		}
		http.NotFound(w, r)
	}))
	defer mockYahoo.Close()

	SetCustomBaseURLs(mockYahoo.URL, mockYahoo.URL, "")

	// 1st Fetch: Cache miss -> calls Yahoo
	quotesJSON1, err := FetchQuotesJSON("PETR4", false)
	if err != nil {
		t.Fatalf("1st FetchQuotesJSON failed: %v", err)
	}
	if atomic.LoadInt32(&yahooRequests) != 1 {
		t.Fatalf("expected 1 Yahoo request, got %d", yahooRequests)
	}

	var res1 struct {
		Quotes []struct {
			Ticker           string  `json:"ticker"`
			AssetClass       string  `json:"asset_class"`
			CurrentPrice     float64 `json:"current_price"`
			ChangePercent24h float64 `json:"change_percent_24h"`
			UpdatedAt        string  `json:"updated_at"`
			IsStale          bool    `json:"is_stale"`
		} `json:"quotes"`
	}
	if err := json.Unmarshal([]byte(quotesJSON1), &res1); err != nil {
		t.Fatalf("failed to parse quotes JSON: %v, raw: %s", err, quotesJSON1)
	}
	if len(res1.Quotes) != 1 {
		t.Fatalf("expected 1 quote, got %d", len(res1.Quotes))
	}
	q1 := res1.Quotes[0]
	if q1.Ticker != "PETR4" || q1.CurrentPrice != 38.50 || q1.IsStale {
		t.Errorf("unexpected quote 1: %+v", q1)
	}

	// 2nd Fetch with forceRefresh = false: Hit SQLite cache -> no HTTP request
	quotesJSON2, err := FetchQuotesJSON("PETR4", false)
	if err != nil {
		t.Fatalf("2nd FetchQuotesJSON failed: %v", err)
	}
	if atomic.LoadInt32(&yahooRequests) != 1 {
		t.Fatalf("expected still 1 Yahoo request (served from SQLite cache), got %d", yahooRequests)
	}
	if !strings.Contains(quotesJSON2, "PETR4") {
		t.Errorf("expected PETR4 in cached response: %s", quotesJSON2)
	}

	// 3rd Fetch with forceRefresh = true: Bypasses cache -> calls Yahoo
	_, err = FetchQuotesJSON("PETR4", true)
	if err != nil {
		t.Fatalf("3rd FetchQuotesJSON with forceRefresh failed: %v", err)
	}
	if atomic.LoadInt32(&yahooRequests) != 2 {
		t.Fatalf("expected 2 Yahoo requests after forceRefresh, got %d", yahooRequests)
	}

	// 4th Fetch: Simulate network outage -> mock server closed
	mockYahoo.Close()

	staleQuotesJSON, err := FetchQuotesJSON("PETR4", true)
	if err != nil {
		t.Fatalf("expected graceful fallback when network fails, got error: %v", err)
	}

	var staleRes struct {
		Quotes []struct {
			Ticker       string  `json:"ticker"`
			CurrentPrice float64 `json:"current_price"`
			IsStale      bool    `json:"is_stale"`
		} `json:"quotes"`
	}
	if err := json.Unmarshal([]byte(staleQuotesJSON), &staleRes); err != nil {
		t.Fatalf("failed to parse stale quotes JSON: %v", err)
	}
	if len(staleRes.Quotes) != 1 {
		t.Fatalf("expected 1 stale quote, got %d", len(staleRes.Quotes))
	}
	if !staleRes.Quotes[0].IsStale {
		t.Errorf("expected is_stale: true on offline fallback, got %+v", staleRes.Quotes[0])
	}
	if staleRes.Quotes[0].CurrentPrice != 38.50 {
		t.Errorf("expected cached price 38.50 on stale fallback, got %.2f", staleRes.Quotes[0].CurrentPrice)
	}
}

// S22-T03: Sincronização sob demanda de histórico Yahoo com close_price nominal e adj_close
func TestBridge_GetHistoricalPriceJSON_OnDemandSync(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	var yahooSyncRequests int32
	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&yahooSyncRequests, 1)
		w.Header().Set("Content-Type", "application/json")

		if strings.Contains(r.URL.Path, "VALE3.SA") {
			// Returns 2026-05-15 chart bar: close nominal 65.50, adjclose 62.00
			resp := `{
				"chart": {
					"result": [
						{
							"meta": {
								"currency": "BRL",
								"symbol": "VALE3.SA",
								"regularMarketPrice": 65.50,
								"chartPreviousClose": 65.00,
								"regularMarketTime": 1778846400,
								"instrumentType": "EQUITY"
							},
							"timestamp": [1778846400],
							"indicators": {
								"quote": [{"open": [65.00], "high": [66.00], "low": [64.80], "close": [65.50], "volume": [2000000]}],
								"adjclose": [{"adjclose": [62.00]}]
							}
						}
					],
					"error": null
				}
			}`
			_, _ = w.Write([]byte(resp))
			return
		}
		http.NotFound(w, r)
	}))
	defer mockYahoo.Close()

	SetCustomBaseURLs(mockYahoo.URL, mockYahoo.URL, "")

	// 1st request: date not in SQLite -> on-demand sync from Yahoo
	priceJSON, err := GetHistoricalPriceJSON("VALE3", "2026-05-15")
	if err != nil {
		t.Fatalf("GetHistoricalPriceJSON failed: %v", err)
	}

	var res struct {
		Ticker     string  `json:"ticker"`
		Date       string  `json:"date"`
		ClosePrice float64 `json:"close_price"`
		AdjClose   float64 `json:"adj_close"`
		Source     string  `json:"source"`
	}
	if err := json.Unmarshal([]byte(priceJSON), &res); err != nil {
		t.Fatalf("failed to parse historical price JSON: %v, raw: %s", err, priceJSON)
	}

	if res.Ticker != "VALE3" {
		t.Errorf("expected ticker VALE3, got %s", res.Ticker)
	}
	if res.Date != "2026-05-15" {
		t.Errorf("expected date 2026-05-15, got %s", res.Date)
	}
	if res.ClosePrice != 65.50 {
		t.Errorf("expected nominal close_price 65.50, got %.2f", res.ClosePrice)
	}
	if res.AdjClose != 62.00 {
		t.Errorf("expected adj_close 62.00, got %.2f", res.AdjClose)
	}
	if res.Source != "YAHOO" {
		t.Errorf("expected source YAHOO, got %s", res.Source)
	}

	// 2nd request: must be served locally without calling Yahoo again
	requestsBefore := atomic.LoadInt32(&yahooSyncRequests)
	priceJSON2, err := GetHistoricalPriceJSON("VALE3", "2026-05-15")
	if err != nil {
		t.Fatalf("2nd GetHistoricalPriceJSON failed: %v", err)
	}
	if atomic.LoadInt32(&yahooSyncRequests) != requestsBefore {
		t.Errorf("expected 2nd request served from SQLite without new Yahoo call")
	}
	if priceJSON2 != priceJSON {
		t.Errorf("expected identical JSON from local SQLite cache, got: %s", priceJSON2)
	}
}

// S22-T04: CheckHealthJSON retorna status ok e provider YAHOO
func TestBridge_CheckHealthJSON(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	healthJSON, err := CheckHealthJSON()
	if err != nil {
		t.Fatalf("CheckHealthJSON failed: %v", err)
	}

	var res struct {
		Status           string `json:"status"`
		CotahistLastDate string `json:"cotahist_last_date"`
		Provider         string `json:"provider"`
	}
	if err := json.Unmarshal([]byte(healthJSON), &res); err != nil {
		t.Fatalf("failed to parse health JSON: %v, raw: %s", err, healthJSON)
	}
	if res.Status != "ok" {
		t.Errorf("expected status ok, got %s", res.Status)
	}
	if res.Provider != "YAHOO" {
		t.Errorf("expected provider YAHOO, got %s", res.Provider)
	}
}

// S22-T05: FetchMacroRatesJSON retorna histórico CDI e IPCA do BCB
func TestBridge_FetchMacroRatesJSON(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	ratesJSON, err := FetchMacroRatesJSON("2026-01-01")
	if err != nil {
		t.Fatalf("FetchMacroRatesJSON failed: %v", err)
	}

	var rates []struct {
		Date  string  `json:"date"`
		Type  string  `json:"type"`
		Value float64 `json:"value"`
	}
	if err := json.Unmarshal([]byte(ratesJSON), &rates); err != nil {
		t.Fatalf("failed to parse macro rates JSON: %v, raw: %s", err, ratesJSON)
	}

	if len(rates) == 0 {
		t.Errorf("expected seeded macro rates from 2026-01-01, got empty array")
	}
}

// S22-T06: GetCorporateEventsJSON retorna eventos (splits e dividendos)
func TestBridge_GetCorporateEventsJSON(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "PETR4.SA") {
			resp := `{
				"chart": {
					"result": [
						{
							"meta": {
								"currency": "BRL",
								"symbol": "PETR4.SA",
								"regularMarketPrice": 38.50,
								"chartPreviousClose": 38.00,
								"regularMarketTime": 1715774400,
								"instrumentType": "EQUITY"
							},
							"timestamp": [1715774400],
							"events": {
								"splits": {
									"1715774400": {
										"date": 1715774400,
										"numerator": 2,
										"denominator": 1,
										"splitRatio": "2:1"
									}
								}
							},
							"indicators": {
								"quote": [{"open": [38.00], "high": [38.50], "low": [37.80], "close": [38.50], "volume": [1000000]}],
								"adjclose": [{"adjclose": [38.50]}]
							}
						}
					],
					"error": null
				}
			}`
			_, _ = w.Write([]byte(resp))
			return
		}
		http.NotFound(w, r)
	}))
	defer mockYahoo.Close()

	SetCustomBaseURLs(mockYahoo.URL, mockYahoo.URL, "")

	// Trigger on-demand sync
	_, _ = GetHistoricalPriceJSON("PETR4", "2026-05-15")

	eventsJSON, err := GetCorporateEventsJSON("PETR4", "2026-01-01")
	if err != nil {
		t.Fatalf("GetCorporateEventsJSON failed: %v", err)
	}

	var res struct {
		Events []struct {
			Ticker      string  `json:"ticker"`
			Type        string  `json:"type"`
			Date        string  `json:"date"`
			Numerator   float64 `json:"numerator"`
			Denominator float64 `json:"denominator"`
			Ratio       string  `json:"ratio"`
		} `json:"events"`
	}
	if err := json.Unmarshal([]byte(eventsJSON), &res); err != nil {
		t.Fatalf("failed to parse events JSON: %v, raw: %s", err, eventsJSON)
	}

	foundSplit := false
	for _, ev := range res.Events {
		if ev.Ticker == "PETR4" && ev.Type == "SPLIT" && ev.Numerator == 2 && ev.Denominator == 1 {
			foundSplit = true
		}
	}
	if !foundSplit {
		t.Errorf("expected split event for PETR4 (2:1), got %+v", res.Events)
	}
}

// S22-T07: IngestCotahistZipJSON importa arquivo COTAHIST .ZIP filtrado por allowedTickers
func TestBridge_IngestCotahistZipJSON(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "celsus_market.db")

	if err := InitEngine(dbPath, true); err != nil {
		t.Fatalf("InitEngine failed: %v", err)
	}
	defer func() {
		_ = CloseEngine()
	}()

	// Build in-memory COTAHIST zip containing VALE3 and KNRI11
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)
	fw, err := zipWriter.Create("COTAHIST_A2024.TXT")
	if err != nil {
		t.Fatalf("failed to create entry in zip: %v", err)
	}

	header := "00COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"
	valeLine := buildTestCotahistLine("01", "20240102", "02", "VALE3       ", "010", "VALE        ", "0000000006800", "0000000006950", "0000000006750", "0000000006900", "000000000080000000") + "\r\n"
	knriLine := buildTestCotahistLine("01", "20240102", "12", "KNRI11      ", "010", "KINEA RENDA ", "0000000015500", "0000000015700", "0000000015450", "0000000015600", "000000000012000000") + "\r\n"
	trailer := "99COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"

	_, _ = fw.Write([]byte(header + valeLine + knriLine + trailer))
	_ = zipWriter.Close()

	zipFilePath := filepath.Join(tmpDir, "cotahist_sample.zip")
	if err := os.WriteFile(zipFilePath, buf.Bytes(), 0644); err != nil {
		t.Fatalf("failed to write zip file: %v", err)
	}

	// Ingest filtering only VALE3
	resJSON, err := IngestCotahistZipJSON(zipFilePath, "VALE3")
	if err != nil {
		t.Fatalf("IngestCotahistZipJSON failed: %v", err)
	}

	var res struct {
		ImportedCount int `json:"imported_count"`
	}
	if err := json.Unmarshal([]byte(resJSON), &res); err != nil {
		t.Fatalf("failed to parse ingest JSON: %v, raw: %s", err, resJSON)
	}
	if res.ImportedCount != 1 {
		t.Errorf("expected imported_count 1 (only VALE3), got %d", res.ImportedCount)
	}

	// Verify imported quote exists in SQLite with COTAHIST source
	priceJSON, err := GetHistoricalPriceJSON("VALE3", "2024-01-02")
	if err != nil {
		t.Fatalf("GetHistoricalPriceJSON for imported VALE3 failed: %v", err)
	}

	var priceRes struct {
		ClosePrice float64 `json:"close_price"`
		Source     string  `json:"source"`
	}
	_ = json.Unmarshal([]byte(priceJSON), &priceRes)
	if priceRes.ClosePrice != 69.00 || priceRes.Source != "COTAHIST" {
		t.Errorf("expected close_price 69.00 and source COTAHIST, got %+v", priceRes)
	}
}
