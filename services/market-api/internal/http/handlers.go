package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pedro/celsus/services/market-api/internal/macro"
)

// handleHealth returns server status, cotahist last date, and brapi status.
func (s *Server) handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lastDate := ""
		if s.cotahistRepo != nil {
			if d, err := s.cotahistRepo.GetLastDate(r.Context()); err == nil {
				lastDate = d
			}
		}

		brapiStatus := "ok"
		if s.brapiClient != nil {
			if err := s.brapiClient.CheckHealth(r.Context()); err != nil {
				brapiStatus = "degraded"
			}
		}

		resp := map[string]interface{}{
			"status":             "ok",
			"cotahist_last_date": lastDate,
			"brapi_status":       brapiStatus,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(resp)
	}
}

type catalogItem struct {
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
	Class  string `json:"class"`
}

// handleCatalogSearch searches tickers and names for autocomplete.
func (s *Server) handleCatalogSearch() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if query == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "query parameter 'q' is required"})
			return
		}

		assetClass := strings.TrimSpace(r.URL.Query().Get("class"))
		quotes, err := s.cotahistRepo.SearchCatalog(r.Context(), query, assetClass)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		items := make([]catalogItem, 0, len(quotes))
		for _, q := range quotes {
			items = append(items, catalogItem{
				Ticker: q.Ticker,
				Name:   q.Name,
				Class:  q.AssetClass,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"results": items,
		})
	}
}

func isCryptoTicker(t string) bool {
	switch strings.ToUpper(t) {
	case "BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK":
		return true
	default:
		return false
	}
}

// handleQuotes returns current prices for given tickers.
func (s *Server) handleQuotes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tickersParam := strings.TrimSpace(r.URL.Query().Get("tickers"))
		if tickersParam == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "query parameter 'tickers' is required"})
			return
		}

		rawTickers := strings.Split(tickersParam, ",")
		var stockTickers []string
		var cryptoCoins []string

		for _, item := range rawTickers {
			clean := strings.ToUpper(strings.TrimSpace(item))
			if clean == "" {
				continue
			}
			if isCryptoTicker(clean) {
				cryptoCoins = append(cryptoCoins, clean)
			} else {
				stockTickers = append(stockTickers, clean)
			}
		}

		quotesMap := make(map[string]interface{})

		if len(stockTickers) > 0 && s.brapiClient != nil {
			stkQuotes, err := s.brapiClient.FetchQuotes(r.Context(), stockTickers)
			if err == nil {
				for k, v := range stkQuotes {
					quotesMap[k] = v
				}
			}
		}

		if len(cryptoCoins) > 0 && s.brapiClient != nil {
			cryptoQuotes, err := s.brapiClient.FetchCryptoQuotes(r.Context(), cryptoCoins)
			if err == nil {
				for k, v := range cryptoQuotes {
					quotesMap[k] = v
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"quotes": quotesMap,
		})
	}
}

type historyPoint struct {
	Date  string  `json:"date"`
	Close float64 `json:"close"`
}

// handleHistory returns historical closing prices for given tickers.
func (s *Server) handleHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tickersParam := strings.TrimSpace(r.URL.Query().Get("tickers"))
		if tickersParam == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "query parameter 'tickers' is required"})
			return
		}

		from := strings.TrimSpace(r.URL.Query().Get("from"))
		if from == "" {
			from = "0000-01-01"
		}
		to := strings.TrimSpace(r.URL.Query().Get("to"))
		if to == "" {
			to = "9999-12-31"
		}

		historyMap := make(map[string][]historyPoint)
		rawTickers := strings.Split(tickersParam, ",")

		for _, item := range rawTickers {
			ticker := strings.ToUpper(strings.TrimSpace(item))
			if ticker == "" {
				continue
			}

			quotes, err := s.cotahistRepo.GetQuotes(r.Context(), ticker, from, to)
			if err != nil {
				continue
			}

			points := make([]historyPoint, 0, len(quotes))
			for _, q := range quotes {
				points = append(points, historyPoint{
					Date:  q.Date,
					Close: q.Close,
				})
			}
			historyMap[ticker] = points
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"history": historyMap,
		})
	}
}

// handleRatesMacro returns daily historical macro rates (CDI, SELIC, IPCA).
func (s *Server) handleRatesMacro() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		from := strings.TrimSpace(r.URL.Query().Get("from"))
		to := strings.TrimSpace(r.URL.Query().Get("to"))
		rateType := strings.TrimSpace(r.URL.Query().Get("type"))

		rates, err := s.macroRepo.GetRates(r.Context(), rateType, from, to)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		if rates == nil {
			rates = []macro.Rate{}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"rates": rates,
		})
	}
}
