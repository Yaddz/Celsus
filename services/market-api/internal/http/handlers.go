package http

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
)

var tickerRegex = regexp.MustCompile(`^[A-Z0-9.\-_]{1,15}$`)

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
		if s.quoteProvider != nil {
			if err := s.quoteProvider.CheckHealth(r.Context()); err != nil {
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
		if len(rawTickers) > 20 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "maximum 20 tickers allowed"})
			return
		}

		var stockTickers []string
		var cryptoCoins []string

		for _, item := range rawTickers {
			clean := strings.ToUpper(strings.TrimSpace(item))
			if clean == "" {
				continue
			}
			if !tickerRegex.MatchString(clean) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid ticker format"})
				return
			}
			if isCryptoTicker(clean) {
				cryptoCoins = append(cryptoCoins, clean)
			} else {
				stockTickers = append(stockTickers, clean)
			}
		}

		quotesMap := make(map[string]interface{})
		var firstErr error

		if len(stockTickers) > 0 && s.quoteProvider != nil {
			stkQuotes, err := s.quoteProvider.FetchQuotes(r.Context(), stockTickers)
			if err != nil {
				firstErr = err
			} else {
				for k, v := range stkQuotes {
					if v.Source == "" {
						v.Source = "YAHOO"
					}
					quotesMap[k] = v
				}
			}
		}

		if len(cryptoCoins) > 0 && s.quoteProvider != nil {
			cryptoQuotes, err := s.quoteProvider.FetchCryptoQuotes(r.Context(), cryptoCoins)
			if err != nil {
				if firstErr == nil {
					firstErr = err
				}
			} else {
				for k, v := range cryptoQuotes {
					if v.Source == "" {
						v.Source = "YAHOO"
					}
					quotesMap[k] = v
				}
			}
		}

		if len(quotesMap) == 0 && firstErr != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "upstream provider failure: " + firstErr.Error()})
			return
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

		rawTickers := strings.Split(tickersParam, ",")
		if len(rawTickers) > 20 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "maximum 20 tickers allowed"})
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

		for _, item := range rawTickers {
			ticker := strings.ToUpper(strings.TrimSpace(item))
			if ticker == "" {
				continue
			}

			quotes, err := s.cotahistRepo.GetQuotes(r.Context(), ticker, from, to)
			points := make([]historyPoint, 0)
			if err == nil && len(quotes) > 0 {
				for _, q := range quotes {
					points = append(points, historyPoint{
						Date:  q.Date,
						Close: q.Close,
					})
				}
			} else if yClient, ok := s.quoteProvider.(*yahoo.Client); ok {
				// Fallback para Yahoo quando COTAHIST não contiver o ticker
				bars, _, errFallback := yClient.FetchChartHistory(r.Context(), ticker, "1y")
				if errFallback == nil {
					for _, b := range bars {
						if (from == "" || b.Date >= from) && (to == "" || b.Date <= to) {
							points = append(points, historyPoint{
								Date:  b.Date,
								Close: b.Close,
							})
						}
					}
				}
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
