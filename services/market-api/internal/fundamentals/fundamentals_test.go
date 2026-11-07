package fundamentals

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

const sampleYahooQuoteSummary = `{
  "quoteSummary": {
    "result": [
      {
        "summaryDetail": {
          "dividendYield": {"raw": 0.124, "fmt": "12.4%"},
          "trailingPE": {"raw": 5.2, "fmt": "5.2"},
          "priceToBook": {"raw": 1.3, "fmt": "1.3"},
          "marketCap": {"raw": 497000000000, "fmt": "497B"}
        },
        "financialData": {
          "returnOnEquity": {"raw": 0.24, "fmt": "24%"},
          "profitMargins": {"raw": 0.21, "fmt": "21%"}
        },
        "defaultKeyStatistics": {
          "sharesOutstanding": {"raw": 12900000000, "fmt": "12.9B"}
        },
        "assetProfile": {
          "longBusinessSummary": "Petróleo Brasileiro S.A. operates in oil and gas.",
          "sector": "Petróleo, gás e biocombustíveis",
          "website": "https://petrobras.com.br"
        }
      }
    ],
    "error": null
  }
}`

const sampleFundamentusHTML = `
<html>
<body>
<table>
  <tr><td><span class="txt">Papel</span></td><td><span class="txt">PETR4</span></td><td><span class="txt">Cotação</span></td><td><span class="txt">38,42</span></td></tr>
  <tr><td><span class="txt">Empresa</span></td><td><span class="txt">PETROBRAS</span></td><td><span class="txt">Setor</span></td><td><span class="txt">Petróleo, Gás e Biocombustíveis</span></td></tr>
  <tr><td><span class="txt">P/L</span></td><td><span class="txt">5,20</span></td><td><span class="txt">DY</span></td><td><span class="txt">12,40%</span></td></tr>
  <tr><td><span class="txt">P/VP</span></td><td><span class="txt">1,30</span></td><td><span class="txt">ROE</span></td><td><span class="txt">24,00%</span></td></tr>
  <tr><td><span class="txt">Valor de mercado</span></td><td><span class="txt">497.000.000.000</span></td><td><span class="txt">Vol $ méd (2m)</span></td><td><span class="txt">1.200.000.000</span></td></tr>
  <tr><td><span class="txt">Marg. Líquida</span></td><td><span class="txt">21,00%</span></td><td><span class="txt">Dív. Líquida/EBITDA</span></td><td><span class="txt">0,90</span></td></tr>
  <tr><td><span class="txt">Nro. Ações</span></td><td><span class="txt">12.900.000.000</span></td></tr>
</table>
</body>
</html>
`

func TestYahooFundamentalsProvider_Parse(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sampleYahooQuoteSummary))
	}))
	defer ts.Close()

	provider := NewYahooFundamentalsProvider(ts.URL)
	dto, err := provider.FetchProfile(context.Background(), "PETR4", "STOCK")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if dto.Ticker != "PETR4" {
		t.Errorf("expected PETR4, got %s", dto.Ticker)
	}
	if dto.Sector == "" {
		t.Errorf("expected non-empty sector")
	}
	if dto.Indicators["dy"] == nil {
		t.Errorf("expected dy indicator")
	}
}

func TestFundamentusFallbackProvider_Parse(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sampleFundamentusHTML))
	}))
	defer ts.Close()

	provider := NewFundamentusFallbackProvider(ts.URL)
	dto, err := provider.FetchProfile(context.Background(), "PETR4", "STOCK")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if dto.Ticker != "PETR4" {
		t.Errorf("expected PETR4, got %s", dto.Ticker)
	}
	if dto.Indicators["pl"] == nil {
		t.Errorf("expected pl indicator from fundamentus")
	}
}

func TestFallbackChain_YahooFail_FundamentusSuccess(t *testing.T) {
	fundamentusServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sampleFundamentusHTML))
	}))
	defer fundamentusServer.Close()

	yahooServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer yahooServer.Close()

	chain := NewMultiFundamentalsProvider(
		NewYahooFundamentalsProvider(yahooServer.URL),
		NewFundamentusFallbackProvider(fundamentusServer.URL),
	)

	dto, err := chain.FetchProfile(context.Background(), "PETR4", "STOCK")
	if err != nil {
		t.Fatalf("unexpected error on fallback: %v", err)
	}
	if dto.Source != "FUNDAMENTUS" {
		t.Errorf("expected source FUNDAMENTUS on fallback, got %s", dto.Source)
	}
}
