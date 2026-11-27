package yahoo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// S107-GO-01: Mapeamento de símbolos US_STOCK, USDBRL, EURBRL, B3 e cripto
func TestSprint107_SymbolMapping_US_FX_B3_Crypto(t *testing.T) {
	cases := []struct {
		ticker      string
		assetClass  string
		wantYahoo   string
		wantCleaned string
	}{
		{ticker: "NVDA", assetClass: "US_STOCK", wantYahoo: "NVDA", wantCleaned: "NVDA"},
		{ticker: "aapl", assetClass: "us_stock", wantYahoo: "AAPL", wantCleaned: "AAPL"},
		{ticker: "USDBRL", assetClass: "", wantYahoo: "BRL=X", wantCleaned: "USDBRL"},
		{ticker: "usdbrl", assetClass: "CURRENCY", wantYahoo: "BRL=X", wantCleaned: "USDBRL"},
		{ticker: "EURBRL", assetClass: "", wantYahoo: "EURBRL=X", wantCleaned: "EURBRL"},
		{ticker: "BRL=X", assetClass: "", wantYahoo: "BRL=X", wantCleaned: "USDBRL"},
		{ticker: "EURBRL=X", assetClass: "", wantYahoo: "EURBRL=X", wantCleaned: "EURBRL"},
		{ticker: "PETR4", assetClass: "", wantYahoo: "PETR4.SA", wantCleaned: "PETR4"},
		{ticker: "PETR4", assetClass: "STOCK", wantYahoo: "PETR4.SA", wantCleaned: "PETR4"},
		{ticker: "BTC", assetClass: "", wantYahoo: "BTC-BRL", wantCleaned: "BTC"},
		{ticker: "BTC", assetClass: "CRYPTO", wantYahoo: "BTC-BRL", wantCleaned: "BTC"},
	}

	for _, tc := range cases {
		gotYahoo := ToYahooSymbol(tc.ticker, tc.assetClass)
		if gotYahoo != tc.wantYahoo {
			t.Errorf("ToYahooSymbol(%q, %q) = %q, esperado %q", tc.ticker, tc.assetClass, gotYahoo, tc.wantYahoo)
		}

		gotCleaned := FromYahooSymbol(gotYahoo)
		if gotCleaned != tc.wantCleaned {
			t.Errorf("FromYahooSymbol(%q) = %q, esperado %q", gotYahoo, gotCleaned, tc.wantCleaned)
		}
	}
}

// S107-GO-02: Parse de currency USD, BRL e ausente (default BRL) em Quote, HistoricalBar e CorporateEvent
func TestSprint107_CurrencyParsing_USD_BRL_AndMissing(t *testing.T) {
	ctx := context.Background()
	nvdaFixture := loadTestFixture(t, "nvda_chart.json")
	usdbrlFixture := loadTestFixture(t, "usdbrl_chart.json")
	petrNoCurrFixture := loadTestFixture(t, "petr4_no_currency_chart.json")

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/NVDA"):
			_, _ = w.Write(nvdaFixture)
		case strings.HasSuffix(r.URL.Path, "/BRL=X"):
			_, _ = w.Write(usdbrlFixture)
		case strings.HasSuffix(r.URL.Path, "/PETR4.SA"):
			_, _ = w.Write(petrNoCurrFixture)
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockYahoo.Close()

	client := NewClient(mockYahoo.URL, mockYahoo.URL, 0)

	// 1. Quote NVDA com class US_STOCK => Currency USD
	nvdaQuotes, err := client.FetchQuotesWithClass(ctx, []string{"NVDA"}, "US_STOCK")
	if err != nil {
		t.Fatalf("FetchQuotesWithClass(NVDA, US_STOCK) erro: %v", err)
	}
	nvdaQ, ok := nvdaQuotes["NVDA"]
	if !ok {
		t.Fatalf("cotação NVDA ausente")
	}
	if nvdaQ.Currency != "USD" {
		t.Errorf("NVDA Currency = %q, esperado USD", nvdaQ.Currency)
	}
	if nvdaQ.Price != 135.40 {
		t.Errorf("NVDA Price = %.2f, esperado 135.40", nvdaQ.Price)
	}

	// 2. Quote USDBRL => Currency BRL
	fxQuotes, err := client.FetchQuotes(ctx, []string{"USDBRL"})
	if err != nil {
		t.Fatalf("FetchQuotes(USDBRL) erro: %v", err)
	}
	fxQ, ok := fxQuotes["USDBRL"]
	if !ok {
		t.Fatalf("cotação USDBRL ausente")
	}
	if fxQ.Currency != "BRL" {
		t.Errorf("USDBRL Currency = %q, esperado BRL", fxQ.Currency)
	}
	if fxQ.Price != 5.75 {
		t.Errorf("USDBRL Price = %.2f, esperado 5.75", fxQ.Price)
	}

	// 3. Quote PETR4 sem campo currency no JSON => default BRL
	petrQuotes, err := client.FetchQuotes(ctx, []string{"PETR4"})
	if err != nil {
		t.Fatalf("FetchQuotes(PETR4) erro: %v", err)
	}
	petrQ, ok := petrQuotes["PETR4"]
	if !ok {
		t.Fatalf("cotação PETR4 ausente")
	}
	if petrQ.Currency != "BRL" {
		t.Errorf("PETR4 Currency (ausente no JSON) = %q, esperado BRL", petrQ.Currency)
	}

	// 4. FetchChartHistoryWithClass para NVDA => HistoricalBar e CorporateEvent com Currency USD
	bars, events, err := client.FetchChartHistoryWithClass(ctx, "NVDA", "1y", "US_STOCK")
	if err != nil {
		t.Fatalf("FetchChartHistoryWithClass(NVDA, US_STOCK) erro: %v", err)
	}
	if len(bars) == 0 {
		t.Fatalf("esperava barras históricas para NVDA")
	}
	if bars[0].Currency != "USD" {
		t.Errorf("HistoricalBar.Currency = %q, esperado USD", bars[0].Currency)
	}
	if len(events) == 0 {
		t.Fatalf("esperava eventos corporativos (dividendo) para NVDA")
	}
	if events[0].Currency != "USD" {
		t.Errorf("CorporateEvent.Currency = %q, esperado USD", events[0].Currency)
	}
}
