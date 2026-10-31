package brapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// S1-T06: Busca em lote na BRAPI e retorno do cache dentro do TTL sem nova chamada HTTP
func TestFetchStockAndFIIQuotesWithCache(t *testing.T) {
	ctx := context.Background()
	var serverRequests int32

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&serverRequests, 1)

		if r.URL.Query().Get("token") != "test-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		resp := map[string]interface{}{
			"results": []map[string]interface{}{
				{
					"symbol":                     "PETR4",
					"regularMarketPrice":         38.50,
					"regularMarketChangePercent": 1.25,
					"regularMarketTime":          "2024-01-02T18:00:00.000Z",
				},
				{
					"symbol":                     "HGLG11",
					"regularMarketPrice":         162.50,
					"regularMarketChangePercent": -0.40,
					"regularMarketTime":          "2024-01-02T18:00:00.000Z",
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	cacheTTL := 60 * time.Millisecond
	client := NewClient("test-token", mockServer.URL, cacheTTL)

	// 1ª Chamada: deve bater no servidor mock
	quotes1, err := client.FetchQuotes(ctx, []string{"PETR4", "HGLG11"})
	if err != nil {
		t.Fatalf("erro na 1ª chamada de FetchQuotes: %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 1 {
		t.Fatalf("esperava 1 requisição ao servidor mock, obtido %d", serverRequests)
	}
	if quotes1["PETR4"].Price != 38.50 || quotes1["HGLG11"].Price != 162.50 {
		t.Errorf("preços incorretos retornados na 1ª chamada: %+v", quotes1)
	}

	// 2ª Chamada imediata (dentro do TTL): deve vir do cache em memória (zero requisições adicionais)
	quotes2, err := client.FetchQuotes(ctx, []string{"PETR4", "HGLG11"})
	if err != nil {
		t.Fatalf("erro na 2ª chamada de FetchQuotes: %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 1 {
		t.Fatalf("cache TTL falhou! Servidor foi chamado %d vezes, esperado 1", serverRequests)
	}
	if quotes2["PETR4"].Price != 38.50 {
		t.Errorf("preço em cache incorreto: %.2f", quotes2["PETR4"].Price)
	}

	// Aguarda expiração do TTL
	time.Sleep(80 * time.Millisecond)

	// 3ª Chamada (após TTL expirar): deve fazer nova requisição HTTP
	quotes3, err := client.FetchQuotes(ctx, []string{"PETR4", "HGLG11"})
	if err != nil {
		t.Fatalf("erro na 3ª chamada de FetchQuotes após expiração: %v", err)
	}
	if atomic.LoadInt32(&serverRequests) != 2 {
		t.Fatalf("após expiração do TTL, esperava 2 requisições ao servidor, obtido %d", serverRequests)
	}
	if quotes3["PETR4"].Price != 38.50 {
		t.Errorf("preço incorreto retornado após expiração: %.2f", quotes3["PETR4"].Price)
	}
}

// S1-T07: Cotação de criptomoedas (BTC, ETH) padronizada em BRL
func TestFetchCryptoQuotesInBRL(t *testing.T) {
	ctx := context.Background()

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/crypto" {
			http.NotFound(w, r)
			return
		}

		currency := r.URL.Query().Get("currency")
		if currency != "BRL" {
			http.Error(w, "currency must be BRL", http.StatusBadRequest)
			return
		}

		coinParam := r.URL.Query().Get("coin")
		if coinParam == "" {
			http.Error(w, "missing coin param", http.StatusBadRequest)
			return
		}

		resp := map[string]interface{}{
			"coins": []map[string]interface{}{
				{
					"coin":                       "BTC",
					"currency":                   "BRL",
					"regularMarketPrice":         350000.50,
					"regularMarketChangePercent": 2.75,
					"regularMarketTime":          "2024-01-02T18:00:00.000Z",
				},
				{
					"coin":                       "ETH",
					"currency":                   "BRL",
					"regularMarketPrice":         18200.00,
					"regularMarketChangePercent": -1.10,
					"regularMarketTime":          "2024-01-02T18:00:00.000Z",
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer mockServer.Close()

	client := NewClient("test-token", mockServer.URL, 1*time.Minute)

	quotes, err := client.FetchCryptoQuotes(ctx, []string{"BTC", "ETH"})
	if err != nil {
		t.Fatalf("erro ao buscar cotação cripto em BRL: %v", err)
	}

	btc, ok := quotes["BTC"]
	if !ok {
		t.Fatalf("cotação de BTC ausente na resposta")
	}
	if btc.Price != 350000.50 {
		t.Errorf("preço em BRL do BTC incorreto: esperado 350000.50, obtido %.2f", btc.Price)
	}
	if btc.Change24h != 2.75 {
		t.Errorf("variação 24h do BTC incorreta: esperado 2.75, obtido %.2f", btc.Change24h)
	}

	eth, ok := quotes["ETH"]
	if !ok {
		t.Fatalf("cotação de ETH ausente na resposta")
	}
	if eth.Price != 18200.00 {
		t.Errorf("preço em BRL do ETH incorreto: esperado 18200.00, obtido %.2f", eth.Price)
	}
	if eth.Change24h != -1.10 {
		t.Errorf("variação 24h do ETH incorreta: esperado -1.10, obtido %.2f", eth.Change24h)
	}
}
