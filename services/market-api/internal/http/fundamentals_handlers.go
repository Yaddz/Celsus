package http

import (
	"encoding/json"
	"net/http"
	"sort"
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
			if err == nil && dto != nil {
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
		switch rangeParam {
		case "7d", "30d", "6m", "1y", "5y", "max":
		default:
			rangeParam = "1y"
		}

		type pricePoint struct {
			Date  string  `json:"date"`
			Close float64 `json:"close"`
		}

		points := make([]pricePoint, 0)

		if yClient, ok := s.quoteProvider.(*yahoo.Client); ok && yClient != nil {
			bars, _, err := yClient.FetchChartHistory(r.Context(), ticker, rangeParam)
			if err == nil {
				for _, b := range bars {
					points = append(points, pricePoint{
						Date:  b.Date,
						Close: b.Close,
					})
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ticker":  ticker,
			"range":   rangeParam,
			"history": points,
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

		type dividendItem struct {
			Date   string  `json:"date"`
			Type   string  `json:"type"`
			Amount float64 `json:"amount"`
		}

		divs := make([]dividendItem, 0)

		if yClient, ok := s.quoteProvider.(*yahoo.Client); ok && yClient != nil {
			_, events, err := yClient.FetchChartHistory(r.Context(), ticker, "5y")
			if err == nil {
				for _, ev := range events {
					if ev.Type == "DIVIDEND" {
						divs = append(divs, dividendItem{
							Date:   ev.Date,
							Type:   "DIVIDEND",
							Amount: ev.CashAmount,
						})
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"ticker":    ticker,
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
		limitStr := strings.TrimSpace(r.URL.Query().Get("limit"))
		limit := 20
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		type rankingEntry struct {
			Ticker     string  `json:"ticker"`
			Name       string  `json:"name"`
			AssetClass string  `json:"asset_class"`
			Price      float64 `json:"price"`
			DY12m      float64 `json:"dy12m"`
			PVP        float64 `json:"pvp"`
			Change24h  float64 `json:"change_24h"`
		}

		results := make([]rankingEntry, 0)
		s.initAssetProfilesTable()

		if s.db != nil {
			rows, err := s.db.QueryContext(r.Context(), "SELECT profile_json FROM asset_profiles")
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var raw string
					if err := rows.Scan(&raw); err == nil {
						var dto fundamentals.AssetProfileDTO
						if err := json.Unmarshal([]byte(raw), &dto); err == nil {
							if assetClass != "" && !strings.EqualFold(dto.AssetClass, assetClass) {
								continue
							}
							dyVal := 0.0
							if dy, ok := dto.Indicators["dy"].(float64); ok {
								dyVal = dy
							}
							pvpVal := 0.0
							if pvp, ok := dto.Indicators["pvp"].(float64); ok {
								pvpVal = pvp
							}
							results = append(results, rankingEntry{
								Ticker:     dto.Ticker,
								Name:       dto.Name,
								AssetClass: dto.AssetClass,
								Price:      dto.Price,
								DY12m:      dyVal,
								PVP:        pvpVal,
								Change24h:  dto.Change24h,
							})
						}
					}
				}
			}
		}

		// Ordenação
		sort.Slice(results, func(i, j int) bool {
			if by == "pvp" {
				return results[i].PVP < results[j].PVP
			}
			if by == "change" {
				return results[i].Change24h > results[j].Change24h
			}
			return results[i].DY12m > results[j].DY12m
		})

		if len(results) > limit {
			results = results[:limit]
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"rankings": results,
		})
	}
}
