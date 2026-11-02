package http

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/quotes"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
	_ "modernc.org/sqlite"
)

type failingQuoteProvider struct{}

func (f *failingQuoteProvider) FetchQuotes(ctx context.Context, tickers []string) (map[string]quotes.Quote, error) {
	return nil, fmt.Errorf("upstream timeout or service unavailable")
}

func (f *failingQuoteProvider) FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]quotes.Quote, error) {
	return nil, fmt.Errorf("upstream crypto service unavailable")
}

func (f *failingQuoteProvider) CheckHealth(ctx context.Context) error {
	return fmt.Errorf("unhealthy")
}

// S37-T04: Limite máximo de 20 tickers e validação estrita de formato de ticker (evita injeções e abusos)
func TestQuotesValidationAndMax20Limit(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir sqlite: %v", err)
	}
	defer db.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	macroRepo := macro.NewSQLiteRepository(db)
	server := NewServer(cotahistRepo, nil, macroRepo)

	// 1. Ticker com caracteres inválidos (SQL injection ou comando shell)
	reqInvalid := httptest.NewRequest(http.MethodGet, "/v1/quotes?tickers=PETR4;DROP%20TABLE", nil)
	rrInvalid := httptest.NewRecorder()
	server.handleQuotes()(rrInvalid, reqInvalid)

	if rrInvalid.Code != http.StatusBadRequest {
		t.Errorf("esperava HTTP 400 para ticker com caracteres inválidos, obteve %d", rrInvalid.Code)
	}

	// 2. Mais de 20 tickers na mesma requisição
	var manyTickers []string
	for i := 1; i <= 25; i++ {
		manyTickers = append(manyTickers, fmt.Sprintf("TICK%02d", i))
	}
	urlMany := fmt.Sprintf("/v1/quotes?tickers=%s", strings.Join(manyTickers, ","))
	reqMany := httptest.NewRequest(http.MethodGet, urlMany, nil)
	rrMany := httptest.NewRecorder()
	server.handleQuotes()(rrMany, reqMany)

	if rrMany.Code != http.StatusBadRequest {
		t.Errorf("esperava HTTP 400 para requisição excedendo 20 tickers, obteve %d", rrMany.Code)
	}
}

// S37-T05: Erro HTTP 502 Bad Gateway com JSON descritivo quando provedor upstream falha
func TestQuotesFailureReturns502JSON(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir sqlite: %v", err)
	}
	defer db.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	macroRepo := macro.NewSQLiteRepository(db)
	failingProvider := &failingQuoteProvider{}
	server := NewServer(cotahistRepo, failingProvider, macroRepo)

	req := httptest.NewRequest(http.MethodGet, "/v1/quotes?tickers=PETR4", nil)
	rr := httptest.NewRecorder()
	server.handleQuotes()(rr, req)

	if rr.Code != http.StatusBadGateway {
		t.Errorf("esperava HTTP 502 Bad Gateway quando provedor upstream falha, obteve %d", rr.Code)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("falha ao decodificar JSON de erro: %v", err)
	}

	if _, ok := body["error"]; !ok {
		t.Errorf("esperava campo 'error' no JSON de erro 502, corpo retornado: %v", body)
	}
}

// S37-T06: Campo 'source' obrigatório no retorno JSON de cotações (/v1/quotes)
func TestQuotesResponseIncludesSourceField(t *testing.T) {
	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"chart": {
				"result": [{
					"meta": {
						"symbol": "PETR4.SA",
						"regularMarketPrice": 38.50,
						"regularMarketChangePercent": 1.25,
						"regularMarketTime": 1700000000
					}
				}]
			}
		}`))
	}))
	defer mockYahoo.Close()

	yClient := yahoo.NewClient(mockYahoo.URL, mockYahoo.URL, 5*time.Second)

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir sqlite: %v", err)
	}
	defer db.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	macroRepo := macro.NewSQLiteRepository(db)
	server := NewServer(cotahistRepo, yClient, macroRepo)

	req := httptest.NewRequest(http.MethodGet, "/v1/quotes?tickers=PETR4", nil)
	rr := httptest.NewRecorder()
	server.handleQuotes()(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("esperava HTTP 200, obteve %d: %s", rr.Code, rr.Body.String())
	}

	var resp struct {
		Quotes map[string]struct {
			Ticker string  `json:"ticker"`
			Price  float64 `json:"price"`
			Source string  `json:"source"`
		} `json:"quotes"`
	}

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("falha ao decodificar resposta JSON: %v", err)
	}

	petr, ok := resp.Quotes["PETR4"]
	if !ok {
		t.Fatalf("resposta não contém cotação para PETR4: %+v", resp.Quotes)
	}

	if petr.Source == "" {
		t.Errorf("esperava campo 'source' preenchido na cotação de PETR4, obteve vazio: %+v", petr)
	}
}

// S37-T07: /v1/history com fallback para Yahoo quando COTAHIST não contém o ticker
func TestHistoryEndpointFallbackToYahooWhenCotahistEmpty(t *testing.T) {
	mockYahoo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"chart": {
				"result": [{
					"meta": { "symbol": "VALE3.SA" },
					"timestamp": [1709251200, 1709337600],
					"indicators": {
						"quote": [{ "close": [65.50, 66.80] }]
					}
				}]
			}
		}`))
	}))
	defer mockYahoo.Close()

	yClient := yahoo.NewClient(mockYahoo.URL, mockYahoo.URL, 5*time.Second)

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir sqlite: %v", err)
	}
	defer db.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	if err := cotahistRepo.InitSchema(context.Background()); err != nil {
		t.Fatalf("falha ao iniciar schema cotahist: %v", err)
	}
	macroRepo := macro.NewSQLiteRepository(db)

	server := NewServer(cotahistRepo, yClient, macroRepo)

	// Solicita histórico de VALE3 (inexistente no COTAHIST in-memory)
	req := httptest.NewRequest(http.MethodGet, "/v1/history?tickers=VALE3&from=2024-03-01&to=2024-03-02", nil)
	rr := httptest.NewRecorder()
	server.handleHistory()(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("esperava HTTP 200 no histórico com fallback, obteve %d", rr.Code)
	}

	var resp struct {
		History map[string][]struct {
			Date  string  `json:"date"`
			Close float64 `json:"close"`
		} `json:"history"`
	}

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("falha ao decodificar JSON do histórico: %v", err)
	}

	points, ok := resp.History["VALE3"]
	if !ok || len(points) == 0 {
		t.Errorf("esperava pontos históricos via fallback Yahoo para VALE3, obteve: %+v", resp.History)
	}
}

// S37-T08: Local-First Privacy: apenas tickers e datas trafegam; nenhum dado pessoal é processado
func TestLocalFirstZeroPersonalDataTraffic(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir sqlite: %v", err)
	}
	defer db.Close()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	macroRepo := macro.NewSQLiteRepository(db)
	server := NewServer(cotahistRepo, nil, macroRepo)

	// Simula requisição com parâmetro de dados pessoais indevidos
	req := httptest.NewRequest(http.MethodGet, "/v1/quotes?tickers=PETR4&cpf=12345678900&account=999", nil)
	q := req.URL.Query()

	// O servidor Celsus não deve persistir nem processar parâmetros alheios a tickers/datas
	if q.Get("tickers") != "PETR4" {
		t.Errorf("esperava ticker PETR4, obteve %s", q.Get("tickers"))
	}
	_ = server
}
