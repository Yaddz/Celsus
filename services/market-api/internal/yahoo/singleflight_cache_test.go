package yahoo

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// S37-T01: Deduplicação de requisições concorrentes via Singleflight (50 chamadas -> 1 upstream)
func TestSingleflightDeduplication(t *testing.T) {
	var upstreamCalls int64

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&upstreamCalls, 1)
		// Simula latência de rede upstream para expor janela concorrente
		time.Sleep(30 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fixture := loadTestFixture(t, "petr4_chart.json")
		_, _ = w.Write(fixture)
	}))
	defer mockServer.Close()

	client := NewClient(mockServer.URL, mockServer.URL, 5*time.Second)

	const concurrentCallers = 50
	var wg sync.WaitGroup
	wg.Add(concurrentCallers)

	errChan := make(chan error, concurrentCallers)

	for i := 0; i < concurrentCallers; i++ {
		go func() {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			quotes, err := client.FetchQuotes(ctx, []string{"PETR4"})
			if err != nil {
				errChan <- err
				return
			}
			if q, ok := quotes["PETR4"]; !ok || q.Price <= 0 {
				errChan <- fmt.Errorf("cotação inválida retornada: %+v", q)
			}
		}()
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		t.Fatalf("erro em chamada concorrente: %v", err)
	}

	totalUpstream := atomic.LoadInt64(&upstreamCalls)
	if totalUpstream != 1 {
		t.Errorf("esperava exatamente 1 chamada upstream pelo singleflight para 50 chamadas concorrentes simultâneas, obteve %d", totalUpstream)
	}
}

// S37-T02: Backoff e Cache Negativo em HTTP 429 Too Many Requests
func TestNegativeCacheOnRateLimit429(t *testing.T) {
	var upstreamCalls int64

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&upstreamCalls, 1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error": "rate limit exceeded"}`))
	}))
	defer mockServer.Close()

	client := NewClient(mockServer.URL, mockServer.URL, 5*time.Second)

	ctx := context.Background()

	// 1ª chamada: falha com 429
	_, err1 := client.FetchQuotes(ctx, []string{"VALE3"})
	if err1 == nil {
		t.Fatal("esperava erro na 1ª chamada com upstream 429, mas foi bem-sucedida")
	}

	// 2ª chamada imediata: deve retornar erro pelo cache negativo sem bater novamente no upstream
	_, err2 := client.FetchQuotes(ctx, []string{"VALE3"})
	if err2 == nil {
		t.Fatal("esperava erro na 2ª chamada sob cache negativo de 429")
	}

	calls := atomic.LoadInt64(&upstreamCalls)
	if calls > 1 {
		t.Errorf("esperava que cache negativo evitasse nova requisição upstream após 429, chamadas realizadas: %d", calls)
	}
}

// S37-T03: Conversão de Tickers Cripto com AssetClass explícita
func TestCryptoSymbolConversionWithAssetClass(t *testing.T) {
	cases := []struct {
		ticker     string
		assetClass string
		expected   string
	}{
		{"SUI", "CRYPTO", "SUI-BRL"},
		{"RENDER", "CRYPTO", "RENDER-BRL"},
		{"BTC", "CRYPTO", "BTC-BRL"},
		{"PETR4", "STOCK", "PETR4.SA"},
		{"HGLG11", "FII", "HGLG11.SA"},
	}

	for _, c := range cases {
		got := ToYahooSymbol(c.ticker, c.assetClass)
		if got != c.expected {
			t.Errorf("ToYahooSymbol(%q, %q) = %q, esperado %q", c.ticker, c.assetClass, got, c.expected)
		}
	}
}
