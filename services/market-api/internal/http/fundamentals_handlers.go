package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pedro/celsus/services/market-api/internal/fundamentals"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
)

type cachedProfileRecord struct {
	Ticker      string `json:"ticker"`
	ProfileJSON string `json:"profile_json"`
	UpdatedAt   string `json:"updated_at"`
}

func (s *Server) initAssetProfilesTable() {
	if s.db == nil {
		return
	}
	schema := `
	CREATE TABLE IF NOT EXISTS asset_profiles (
		ticker TEXT PRIMARY KEY,
		profile_json TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	`
	_, _ = s.db.Exec(schema)
}

func (s *Server) handleAssetProfile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ticker := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "ticker")))
		if ticker == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "ticker is required"})
			return
		}

		s.initAssetProfilesTable()

		// 1. Verificar cache local no SQLite (TTL 12h)
		if s.db != nil {
			var profileJSON, updatedAtStr string
			err := s.db.QueryRowContext(r.Context(),
				"SELECT profile_json, updated_at FROM asset_profiles WHERE ticker = ?",
				ticker,
			).Scan(&profileJSON, &updatedAtStr)

			if err == nil {
				parsedTime, err := time.Parse(time.RFC3339, updatedAtStr)
				if err == nil && time.Since(parsedTime) < 12*time.Hour {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusOK)
					_, _ = w.Write([]byte(profileJSON))
					return
				}
			}
		}

		// 2. Buscar dados via FundamentalsProvider
		if s.fundamentalsProvider != nil {
			cls := "STOCK"
			if strings.HasSuffix(ticker, "11") {
				cls = "FII"
			} else if isCryptoTicker(ticker) {
				cls = "CRYPTO"
			}

			dto, err := s.fundamentalsProvider.FetchProfile(r.Context(), ticker, cls)
			if err == nil && dto != nil && dto.Price > 0 {
				bytes, _ := json.Marshal(dto)
				if s.db != nil {
					_, _ = s.db.ExecContext(r.Context(),
						`INSERT INTO asset_profiles (ticker, profile_json, updated_at) 
						 VALUES (?, ?, ?)
						 ON CONFLICT(ticker) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`,
						ticker, string(bytes), time.Now().UTC().Format(time.RFC3339),
					)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(bytes)
				return
			}
		}

		// 3. Fallback: retornar perfil básico caso offline
		fallback := map[string]interface{}{
			"ticker":      ticker,
			"name":        ticker,
			"asset_class": "STOCK",
			"price":       0.0,
			"change_24h":  0.0,
			"indicators":  map[string]interface{}{},
			"is_stale":    true,
			"source":      "OFFLINE",
			"updated_at":  time.Now().UTC(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(fallback)
	}
}

func (s *Server) handleAssetPriceHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ticker := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "ticker")))
		if ticker == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "ticker is required"})
			return
		}

		rangeParam := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("range")))
		if rangeParam == "" {
			rangeParam = "1y"
		}
		// Aceita as siglas do app (1A, 5A, MAX) e as do serviço; qualquer outra cai em 1 ano.
		switch rangeParam {
		case "1a":
			rangeParam = "1y"
		case "5a":
			rangeParam = "5y"
		case "7d", "30d", "6m", "1y", "5y", "max", "1mo", "6mo":
		default:
			rangeParam = "1y"
		}
		// Intervalos aceitos pelo Yahoo (7d/30d/6m não existem lá): busca o mais próximo e recorta.
		yahooRange := map[string]string{"7d": "1mo", "30d": "1mo", "6m": "6mo", "1mo": "1mo", "6mo": "6mo", "1y": "1y", "5y": "5y", "max": "max"}[rangeParam]
		cutoffDays := map[string]int{"7d": 7, "30d": 30}[rangeParam]

		assetClass := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("class")))

		type pricePoint struct {
			Date     string  `json:"date"`
			Close    float64 `json:"close"`
			Currency string  `json:"currency"`
		}

		points := make([]pricePoint, 0)
		currency := "BRL"

		if yClient, ok := s.quoteProvider.(*yahoo.Client); ok && yClient != nil {
			bars, _, err := yClient.FetchChartHistoryWithClass(r.Context(), ticker, yahooRange, assetClass)
			if err == nil {
				cutoff := ""
				if cutoffDays > 0 {
					cutoff = time.Now().AddDate(0, 0, -cutoffDays).Format("2006-01-02")
				}
				for _, b := range bars {
					if b.Currency != "" {
						currency = b.Currency
					}
					if cutoff != "" && b.Date < cutoff {
						continue
					}
					curr := b.Currency
					if curr == "" {
						curr = "BRL"
					}
					points = append(points, pricePoint{
						Date:     b.Date,
						Close:    b.Close,
						Currency: curr,
					})
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ticker":   ticker,
			"range":    rangeParam,
			"currency": currency,
			"history":  points,
		})
	}
}

func (s *Server) handleAssetDividends() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ticker := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "ticker")))
		if ticker == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "ticker is required"})
			return
		}

		assetClass := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("class")))

		type dividendItem struct {
			Date     string  `json:"date"`
			Type     string  `json:"type"`
			Amount   float64 `json:"amount"`
			Currency string  `json:"currency"`
		}

		divs := make([]dividendItem, 0)
		currency := "BRL"

		if yClient, ok := s.quoteProvider.(*yahoo.Client); ok && yClient != nil {
			bars, events, err := yClient.FetchChartHistoryWithClass(r.Context(), ticker, "5y", assetClass)
			if err == nil {
				if len(bars) > 0 && bars[0].Currency != "" {
					currency = bars[0].Currency
				}
				for _, ev := range events {
					if ev.Type == "DIVIDEND" {
						curr := ev.Currency
						if curr == "" {
							curr = currency
						}
						divs = append(divs, dividendItem{
							Date:     ev.Date,
							Type:     "DIVIDEND",
							Amount:   ev.CashAmount,
							Currency: curr,
						})
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ticker":    ticker,
			"currency":  currency,
			"dividends": divs,
		})
	}
}

func (s *Server) handleRankings() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		assetClass := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("class")))
		by := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("by")))
		if by == "" {
			by = "dy"
		}
		limit := 20
		if l, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit"))); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		s.initAssetProfilesTable()
		items := fundamentals.LoadCatalog(r.Context(), s.db, assetClass)
		results := fundamentals.BuildRanking(r.Context(), items, fundamentals.SQLProfileCache{DB: s.db},
			s.fundamentalsProvider, by, limit, 12*time.Second)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"rankings": results})
	}
}
