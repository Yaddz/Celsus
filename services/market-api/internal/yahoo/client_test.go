package yahoo

import (
	"context"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func loadTestFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("testdata", name)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("falha ao ler fixture %s: %v", path, err)
	}
	return data
}

// S20-T01: Normalização bidirecional de tickers (PETR4 <-> PETR4.SA, HGLG11 <-> HGLG11.SA, BTC <-> BTC-BRL)
func TestTickerNormalization(t *testing.T) {
	cases := []struct {
		ticker      string
		assetClass  string
		wantYahoo   string
		wantCleaned string
	}{
		{ticker: "PETR4", assetClass: "STOCK", wantYahoo: "PETR4.SA", wantCleaned: "PETR4"},
		{ticker: "petr4", assetClass: "", wantYahoo: "PETR4.SA", wantCleaned: "PETR4"},
		{ticker: "PETR4.SA", assetClass: "STOCK", wantYahoo: "PETR4.SA", wantCleaned: "PETR4"},
		{ticker: "HGLG11", assetClass: "FII", wantYahoo: "HGLG11.SA", wantCleaned: "HGLG11"},
		{ticker: "BTC", assetClass: "CRYPTO", wantYahoo: "BTC-BRL", wantCleaned: "BTC"},
		{ticker: "btc", assetClass: "", wantYahoo: "BTC-BRL", wantCleaned: "BTC"},
		{ticker: "ETH", assetClass: "CRYPTO", wantYahoo: "ETH-BRL", wantCleaned: "ETH"},
		{ticker: "BTC-BRL", assetClass: "CRYPTO", wantYahoo: "BTC-BRL", wantCleaned: "BTC"},
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
		if strings.HasSuffix(gotCleaned, ".SA") || strings.HasSuffix(gotCleaned, "-BRL") {
			t.Errorf("FromYahooSymbol(%q) reteve sufixo proibido: %q", gotYahoo, gotCleaned)
		}
	}
}

// S20-T02: Busca de cotações de Ações, FIIs e Cripto no Yahoo Finance com User-Agent, remoção de .SA/-BRL e cache TTL
func TestFetchQuotes_SuccessAndCache(t *testing.T) {
	ctx := context.Background()
	petrFixture := loadTestFixture(t, "petr4_chart.json")
	hglgFixture := loadTestFixture(t, "hglg11_chart.json")
	btcFixture := loadTestFixture(t, "btc_brl_chart.json")

	var serverRequests int32

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&serverRequests, 1)

		ua := r.Header.Get("User-Agent")
		if !strings.Contains(ua, "Mozilla/5.0") {
			http.Error(w, "missing browser User-Agent", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v8/finance/chart/PETR4.SA":
			_, _ = w.Write(petrFixture)
		case "/v8/finance/chart/HGLG11.SA":
			_, _ = w.Write(hglgFixture)
		case "/v8/finance/chart/BTC-BRL":
			_, _ = w.Write(btcFixture)
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockYahoo.Close()

	cacheTTL := 80 * time.Millisecond
	client := NewClient(mockYahoo.URL, mockYahoo.URL, cacheTTL)

	// 1ª Chamada: deve consultar o mock para os 3 ativos
	quotesMap, err := client.FetchQuotes(ctx, []string{"PETR4", "HGLG11", "BTC"})
	if err != nil {
		t.Fatalf("erro na 1ª chamada de FetchQuotes: %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 3 {
		t.Fatalf("esperava 3 requisições HTTP ao servidor mock na 1ª chamada, obtido %d", serverRequests)
	}

	for key, q := range quotesMap {
		if strings.Contains(key, ".SA") || strings.Contains(key, "-BRL") || strings.Contains(q.Ticker, ".SA") || strings.Contains(q.Ticker, "-BRL") {
			t.Fatalf("ticker retornado contém sufixo do Yahoo (.SA ou -BRL): key=%q, ticker=%q", key, q.Ticker)
		}
	}

	petr, ok := quotesMap["PETR4"]
	if !ok {
		t.Fatalf("cotação de PETR4 ausente no mapa retornado")
	}
	if petr.Price != 38.50 {
		t.Errorf("preço de PETR4 incorreto: esperado 38.50, obtido %.2f", petr.Price)
	}
	expectedChange := ((38.50 - 38.00) / 38.00) * 100.0
	if math.Abs(petr.Change24h-expectedChange) > 0.01 {
		t.Errorf("variação 24h de PETR4 incorreta: esperado %.4f, obtido %.4f", expectedChange, petr.Change24h)
	}

	hglg, ok := quotesMap["HGLG11"]
	if !ok || hglg.Price != 162.50 {
		t.Errorf("cotação de HGLG11 incorreta: %+v", hglg)
	}

	btc, ok := quotesMap["BTC"]
	if !ok || btc.Price != 350000.50 {
		t.Errorf("cotação de BTC incorreta: %+v", btc)
	}

	// 2ª Chamada dentro do TTL: deve retornar do cache em memória sem novas requisições HTTP
	quotesCached, err := client.FetchQuotes(ctx, []string{"PETR4", "HGLG11", "BTC"})
	if err != nil {
		t.Fatalf("erro na 2ª chamada (cache): %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 3 {
		t.Fatalf("cache TTL falhou! Esperava 3 requisições acumuladas, obtido %d", serverRequests)
	}
	if quotesCached["PETR4"].Price != 38.50 {
		t.Errorf("preço em cache de PETR4 incorreto: %.2f", quotesCached["PETR4"].Price)
	}

	// Aguarda expiração do TTL
	time.Sleep(110 * time.Millisecond)

	// 3ª Chamada após expiração do TTL: deve buscar novamente para PETR4
	_, err = client.FetchQuotes(ctx, []string{"PETR4"})
	if err != nil {
		t.Fatalf("erro na 3ª chamada após expirar TTL: %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 4 {
		t.Fatalf("esperava 4 requisições após expirar TTL de PETR4, obtido %d", serverRequests)
	}
}

// S20-T03: Extração de histórico diário (close nominal vs adjclose) e eventos corporativos (splits e dividends)
func TestFetchChartHistory_CloseAdjCloseAndSplits(t *testing.T) {
	ctx := context.Background()
	petrFixture := loadTestFixture(t, "petr4_chart.json")

	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v8/finance/chart/PETR4.SA" {
			http.NotFound(w, r)
			return
		}
		if !strings.Contains(r.URL.Query().Get("events"), "splits") {
			http.Error(w, "missing events=div,splits query param", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(petrFixture)
	}))
	defer mockYahoo.Close()

	client := NewClient(mockYahoo.URL, mockYahoo.URL, 1*time.Minute)

	bars, events, err := client.FetchChartHistory(ctx, "PETR4", "1mo")
	if err != nil {
		t.Fatalf("erro em FetchChartHistory: %v", err)
	}

	if len(bars) != 3 {
		t.Fatalf("esperava 3 barras históricas, obtido %d", len(bars))
	}

	// Verifica distinção entre Close nominal e AdjClose
	if bars[0].Date != "2024-01-02" || bars[0].Close != 38.50 || bars[0].AdjClose != 34.10 {
		t.Errorf("1ª barra histórica incorreta (esperava Close=38.50, AdjClose=34.10): %+v", bars[0])
	}
	if bars[1].Date != "2024-01-03" || bars[1].Close != 39.12 || bars[1].AdjClose != 34.65 {
		t.Errorf("2ª barra histórica incorreta: %+v", bars[1])
	}

	// Verifica eventos corporativos extraídos (1 SPLIT 2:1 e 1 DIVIDEND)
	if len(events) != 2 {
		t.Fatalf("esperava 2 eventos corporativos (1 split + 1 dividendo), obtido %d", len(events))
	}

	var foundSplit, foundDiv bool
	for _, ev := range events {
		if ev.Ticker != "PETR4" {
			t.Errorf("ticker do evento corporativo deve ser limpo ('PETR4'), obtido %q", ev.Ticker)
		}
		if ev.Type == "SPLIT" {
			foundSplit = true
			if ev.Date != "2024-01-03" || ev.Numerator != 2 || ev.Denominator != 1 || ev.Ratio != "2:1" {
				t.Errorf("evento de SPLIT incorreto: %+v", ev)
			}
		}
		if ev.Type == "DIVIDEND" {
			foundDiv = true
			if ev.Date != "2024-01-04" || ev.CashAmount != 1.15 {
				t.Errorf("evento de DIVIDEND incorreto: %+v", ev)
			}
		}
	}

	if !foundSplit || !foundDiv {
		t.Errorf("eventos corporativos incompletos: foundSplit=%v, foundDiv=%v", foundSplit, foundDiv)
	}
}

// S20-T04: Failover automático de query1 (429 Too Many Requests / 5xx) para query2
func TestFetchQuotes_FailoverQuery1ToQuery2(t *testing.T) {
	ctx := context.Background()
	petrFixture := loadTestFixture(t, "petr4_chart.json")

	var query1Calls int32
	var query2Calls int32

	query1Server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&query1Calls, 1)
		http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
	}))
	defer query1Server.Close()

	query2Server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&query2Calls, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(petrFixture)
	}))
	defer query2Server.Close()

	client := NewClient(query1Server.URL, query2Server.URL, 1*time.Minute)

	quotesMap, err := client.FetchQuotes(ctx, []string{"PETR4"})
	if err != nil {
		t.Fatalf("esperava sucesso via failover para query2, mas ocorreu erro: %v", err)
	}

	if atomic.LoadInt32(&query1Calls) != 1 {
		t.Errorf("esperava 1 tentativa no host primário (query1), obtido %d", query1Calls)
	}
	if atomic.LoadInt32(&query2Calls) != 1 {
		t.Errorf("esperava 1 chamada de failover no host secundário (query2), obtido %d", query2Calls)
	}

	if quotesMap["PETR4"].Price != 38.50 {
		t.Errorf("preço retornado após failover incorreto: esperado 38.50, obtido %.2f", quotesMap["PETR4"].Price)
	}
}
