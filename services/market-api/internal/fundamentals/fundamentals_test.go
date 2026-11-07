package fundamentals

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
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

// Fixtures reais do Fundamentus (capturadas do site, convertidas para UTF-8).
func loadFixture(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return string(b)
}

// serveAsLatin1 serve o HTML como a página real: bytes ISO-8859-1.
func serveAsLatin1(html string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
		w.WriteHeader(http.StatusOK)
		out := make([]byte, 0, len(html))
		for _, c := range html {
			if c < 256 {
				out = append(out, byte(c))
			} else {
				out = append(out, '?')
			}
		}
		_, _ = w.Write(out)
	})
}

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

func TestFundamentusProvider_Stock_RealPage(t *testing.T) {
	ts := httptest.NewServer(serveAsLatin1(loadFixture(t, "petr4.utf8.html")))
	defer ts.Close()

	dto, err := NewFundamentusProvider(ts.URL).FetchProfile(context.Background(), "PETR4", "STOCK")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dto.Price != 45.36 {
		t.Errorf("price = %v, want 45.36", dto.Price)
	}
	if dto.Name != "PETROBRAS PN" {
		t.Errorf("name = %q", dto.Name)
	}
	if dto.Sector != "Petróleo, Gás e Biocombustíveis" {
		t.Errorf("sector = %q (acentos devem sobreviver ao ISO-8859-1)", dto.Sector)
	}
	if dto.Change24h != -1.28 || dto.Change12m != 59.28 {
		t.Errorf("variações = %v / %v", dto.Change24h, dto.Change12m)
	}
	want := map[string]float64{"pl": 4.38, "pvp": 1.22, "dy": 8.0, "roe": 27.7, "netMargin": 24.4}
	for k, v := range want {
		if got, _ := dto.Indicators[k].(float64); got != v {
			t.Errorf("indicador %s = %v, want %v", k, dto.Indicators[k], v)
		}
	}
	if dto.Indicators["marketCap"] == nil || dto.Indicators["dailyLiquidity"] == nil {
		t.Errorf("faltou valor de mercado/liquidez: %v", dto.Indicators)
	}
	if dto.Source != "FUNDAMENTUS" {
		t.Errorf("source = %s", dto.Source)
	}
}

func TestFundamentusProvider_FII_RealPage(t *testing.T) {
	ts := httptest.NewServer(serveAsLatin1(loadFixture(t, "mxrf11.utf8.html")))
	defer ts.Close()

	dto, err := NewFundamentusProvider(ts.URL).FetchProfile(context.Background(), "MXRF11", "FII")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dto.Price != 8.80 {
		t.Errorf("price = %v, want 8.80", dto.Price)
	}
	if got, _ := dto.Indicators["dy"].(float64); got != 13.4 {
		t.Errorf("dy = %v", dto.Indicators["dy"])
	}
	if got, _ := dto.Indicators["pvp"].(float64); got != 0.94 {
		t.Errorf("pvp = %v", dto.Indicators["pvp"])
	}
	if dto.Sector != "Logística" || dto.Name == "" {
		t.Errorf("nome/segmento = %q / %q", dto.Name, dto.Sector)
	}
	if dto.Change24h != 1.85 {
		t.Errorf("dia = %v", dto.Change24h)
	}
}

func TestFundamentusProvider_PageWithoutQuote_IsError(t *testing.T) {
	ts := httptest.NewServer(serveAsLatin1("<html><body>nada aqui</body></html>"))
	defer ts.Close()
	if _, err := NewFundamentusProvider(ts.URL).FetchProfile(context.Background(), "XXXX3", "STOCK"); err == nil {
		t.Fatal("página sem cotação deve ser erro (nunca preço 0)")
	}
}

func TestFallbackChain_FundamentusFirst_YahooFallback(t *testing.T) {
	fundamentusServer := httptest.NewServer(serveAsLatin1(loadFixture(t, "petr4.utf8.html")))
	defer fundamentusServer.Close()
	yahooServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer yahooServer.Close()

	chain := NewMultiFundamentalsProvider(
		NewFundamentusProvider(fundamentusServer.URL),
		NewYahooFundamentalsProvider(yahooServer.URL),
	)
	dto, err := chain.FetchProfile(context.Background(), "PETR4", "STOCK")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if dto.Source != "FUNDAMENTUS" || dto.Price <= 0 {
		t.Errorf("source=%s price=%v", dto.Source, dto.Price)
	}
}
