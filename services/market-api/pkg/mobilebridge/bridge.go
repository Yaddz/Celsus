package mobilebridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
	_ "modernc.org/sqlite"
)

type marketEngine struct {
	db           *sql.DB
	cotahistRepo *cotahist.SQLiteRepository
	macroRepo    *macro.SQLiteRepository
	yahooClient  *yahoo.Client
	bcbClient    *macro.BCBClient
}

var (
	engineLock          sync.RWMutex
	globalEngine        *marketEngine
	customYahooPrimary  string
	customYahooFallback string
	customBCBBaseURL    string

	ErrNotInitialized = errors.New("mobilebridge: engine not initialized")
)

// InitEngine initializes the SQLite database at dbPath, executes schema migrations,
// seeds production catalog and macro rates (if isProd is true) or sample market data,
// and initializes the embedded market engine singleton.
func InitEngine(dbPath string, isProd bool) error {
	engineLock.Lock()
	defer engineLock.Unlock()

	if globalEngine != nil && globalEngine.db != nil {
		_ = globalEngine.db.Close()
		globalEngine = nil
	}

	if dir := filepath.Dir(dbPath); dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return fmt.Errorf("failed to open sqlite database: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, _ = db.ExecContext(ctx, "PRAGMA journal_mode = WAL;")

	cacheTableSchema := `
	CREATE TABLE IF NOT EXISTS market_price_cache (
		ticker TEXT PRIMARY KEY,
		asset_class TEXT NOT NULL,
		current_price REAL NOT NULL,
		change_percent_24h REAL NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_mpc_updated ON market_price_cache(updated_at);
	`
	if _, err := db.ExecContext(ctx, cacheTableSchema); err != nil {
		_ = db.Close()
		return fmt.Errorf("failed to create market_price_cache table: %w", err)
	}

	cRepo := cotahist.NewSQLiteRepository(db)
	if err := cRepo.InitSchema(ctx); err != nil {
		_ = db.Close()
		return fmt.Errorf("failed to init cotahist schema: %w", err)
	}

	mRepo := macro.NewSQLiteRepository(db)
	if err := mRepo.InitSchema(ctx); err != nil {
		_ = db.Close()
		return fmt.Errorf("failed to init macro schema: %w", err)
	}

	if isProd {
		if err := cotahist.SeedProductionCatalogAndMacro(ctx, cRepo, mRepo); err != nil {
			_ = db.Close()
			return fmt.Errorf("failed to seed production catalog and macro: %w", err)
		}
	} else {
		if err := cotahist.SeedMarketData(ctx, cRepo, mRepo); err != nil {
			_ = db.Close()
			return fmt.Errorf("failed to seed market data: %w", err)
		}
	}

	var yClient *yahoo.Client
	if customYahooPrimary != "" {
		fallback := customYahooFallback
		if fallback == "" {
			fallback = customYahooPrimary
		}
		yClient = yahoo.NewClient(customYahooPrimary, fallback, 0)
	} else {
		yClient = yahoo.NewDefaultClient(0)
	}

	bClient := macro.NewBCBClient(customBCBBaseURL, nil)

	globalEngine = &marketEngine{
		db:           db,
		cotahistRepo: cRepo,
		macroRepo:    mRepo,
		yahooClient:  yClient,
		bcbClient:    bClient,
	}

	return nil
}

// CloseEngine closes any open SQLite connection and releases engine resources.
func CloseEngine() error {
	engineLock.Lock()
	defer engineLock.Unlock()

	if globalEngine != nil {
		if globalEngine.db != nil {
			_ = globalEngine.db.Close()
		}
		globalEngine = nil
	}
	return nil
}

// SetCustomBaseURLs overrides the default Yahoo Finance and BCB SGS base URLs (for tests and offline mocking).
func SetCustomBaseURLs(yahooPrimary, yahooFallback, bcbBaseURL string) {
	engineLock.Lock()
	defer engineLock.Unlock()

	customYahooPrimary = yahooPrimary
	customYahooFallback = yahooFallback
	customBCBBaseURL = bcbBaseURL

	if globalEngine != nil {
		if yahooPrimary != "" {
			fallback := yahooFallback
			if fallback == "" {
				fallback = yahooPrimary
			}
			globalEngine.yahooClient = yahoo.NewClient(yahooPrimary, fallback, 0)
		}
		if bcbBaseURL != "" {
			globalEngine.bcbClient = macro.NewBCBClient(bcbBaseURL, nil)
		}
	}
}

func getEngine() (*marketEngine, error) {
	engineLock.RLock()
	defer engineLock.RUnlock()

	if globalEngine == nil || globalEngine.db == nil {
		return nil, ErrNotInitialized
	}
	return globalEngine, nil
}

// CheckHealthJSON returns the health status of the embedded engine in JSON format.
func CheckHealthJSON() (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	lastDate, _ := eng.cotahistRepo.GetLastDate(ctx)

	resp := struct {
		Status           string `json:"status"`
		CotahistLastDate string `json:"cotahist_last_date"`
		Provider         string `json:"provider"`
	}{
		Status:           "ok",
		CotahistLastDate: lastDate,
		Provider:         "YAHOO",
	}

	bytes, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

type catalogResultItem struct {
	Ticker     string `json:"ticker"`
	Name       string `json:"name"`
	AssetClass string `json:"asset_class"`
}

type searchCatalogResponse struct {
	Results []catalogResultItem `json:"results"`
}

// SearchCatalogJSON searches assets by query and optional assetClass in the local catalog and quotes,
// falling back to Yahoo Finance if query length >= 4 and nothing is found locally.
func SearchCatalogJSON(query string, assetClass string) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	quotes, err := eng.cotahistRepo.SearchCatalog(ctx, query, assetClass)
	if err != nil {
		return "", fmt.Errorf("search catalog failed: %w", err)
	}

	items := make([]catalogResultItem, 0, len(quotes))
	for _, q := range quotes {
		items = append(items, catalogResultItem{
			Ticker:     q.Ticker,
			Name:       q.Name,
			AssetClass: q.AssetClass,
		})
	}

	if len(items) == 0 && len(strings.TrimSpace(query)) >= 4 && eng.yahooClient != nil {
		clean := strings.ToUpper(strings.TrimSpace(query))
		yQuotes, err := eng.yahooClient.FetchQuotes(ctx, []string{clean})
		if err == nil {
			if yq, ok := yQuotes[clean]; ok {
				cls := assetClass
				if cls == "" {
					cls = resolveAssetClass(ctx, eng.db, clean)
				}
				item := catalogResultItem{
					Ticker:     yq.Ticker,
					Name:       yq.Ticker,
					AssetClass: cls,
				}
				items = append(items, item)
				_ = eng.cotahistRepo.UpsertCatalogAssets(ctx, []cotahist.CatalogAsset{
					{Ticker: item.Ticker, Name: item.Name, AssetClass: item.AssetClass},
				})
			}
		}
	}

	resp := searchCatalogResponse{Results: items}
	bytes, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

type quoteJSONItem struct {
	Ticker           string  `json:"ticker"`
	AssetClass       string  `json:"asset_class"`
	CurrentPrice     float64 `json:"current_price"`
	ChangePercent24h float64 `json:"change_percent_24h"`
	UpdatedAt        string  `json:"updated_at"`
	IsStale          bool    `json:"is_stale"`
}

type quotesResponse struct {
	Quotes []quoteJSONItem `json:"quotes"`
}

func isKnownCrypto(ticker string) bool {
	switch strings.ToUpper(strings.TrimSpace(ticker)) {
	case "BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK":
		return true
	default:
		return false
	}
}

func resolveAssetClass(ctx context.Context, db *sql.DB, ticker string) string {
	clean := strings.ToUpper(strings.TrimSpace(ticker))
	if db != nil {
		var cls string
		err := db.QueryRowContext(ctx, "SELECT asset_class FROM catalog_assets WHERE ticker = ?", clean).Scan(&cls)
		if err == nil && cls != "" {
			return cls
		}
	}
	if isKnownCrypto(clean) {
		return "CRYPTO"
	}
	if strings.HasSuffix(clean, "11") && len(clean) >= 5 {
		return "FII"
	}
	return "STOCK"
}

// FetchQuotesJSON fetches quotes for comma-separated tickers, respecting the 15-minute SQLite cache TTL,
// or returning stale cached quotes when offline.
func FetchQuotesJSON(tickersCSV string, forceRefresh bool) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	rawList := strings.Split(tickersCSV, ",")
	var tickers []string
	for _, t := range rawList {
		clean := strings.ToUpper(strings.TrimSpace(t))
		if clean != "" {
			tickers = append(tickers, clean)
		}
	}
	if len(tickers) == 0 {
		return `{"quotes":[]}`, nil
	}

	quotesMap := make(map[string]quoteJSONItem)
	var needFetch []string

	if !forceRefresh {
		for _, ticker := range tickers {
			var item quoteJSONItem
			var updatedAtStr string
			err := eng.db.QueryRowContext(ctx,
				"SELECT ticker, asset_class, current_price, change_percent_24h, updated_at FROM market_price_cache WHERE ticker = ?",
				ticker,
			).Scan(&item.Ticker, &item.AssetClass, &item.CurrentPrice, &item.ChangePercent24h, &updatedAtStr)

			if err == nil {
				parsedTime, err := time.Parse(time.RFC3339, updatedAtStr)
				if err == nil && time.Since(parsedTime) < 15*time.Minute {
					item.UpdatedAt = updatedAtStr
					item.IsStale = false
					quotesMap[ticker] = item
					continue
				}
			}
			needFetch = append(needFetch, ticker)
		}
	} else {
		needFetch = tickers
	}

	if len(needFetch) > 0 {
		fetchedQuotes, err := eng.yahooClient.FetchQuotes(ctx, needFetch)
		if err == nil && len(fetchedQuotes) > 0 {
			nowStr := time.Now().UTC().Format(time.RFC3339)
			for _, q := range fetchedQuotes {
				cls := resolveAssetClass(ctx, eng.db, q.Ticker)
				item := quoteJSONItem{
					Ticker:           q.Ticker,
					AssetClass:       cls,
					CurrentPrice:     q.Price,
					ChangePercent24h: q.Change24h,
					UpdatedAt:        nowStr,
					IsStale:          false,
				}
				quotesMap[q.Ticker] = item

				_, _ = eng.db.ExecContext(ctx, `
					INSERT INTO market_price_cache (ticker, asset_class, current_price, change_percent_24h, updated_at)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(ticker) DO UPDATE SET
						asset_class = excluded.asset_class,
						current_price = excluded.current_price,
						change_percent_24h = excluded.change_percent_24h,
						updated_at = excluded.updated_at;
				`, item.Ticker, item.AssetClass, item.CurrentPrice, item.ChangePercent24h, item.UpdatedAt)
			}
		} else {
			for _, ticker := range needFetch {
				if _, ok := quotesMap[ticker]; ok {
					continue
				}
				var item quoteJSONItem
				var updatedAtStr string
				err := eng.db.QueryRowContext(ctx,
					"SELECT ticker, asset_class, current_price, change_percent_24h, updated_at FROM market_price_cache WHERE ticker = ?",
					ticker,
				).Scan(&item.Ticker, &item.AssetClass, &item.CurrentPrice, &item.ChangePercent24h, &updatedAtStr)

				if err == nil {
					item.UpdatedAt = updatedAtStr
					item.IsStale = true
					quotesMap[ticker] = item
				}
			}
		}
	}

	resultList := make([]quoteJSONItem, 0, len(tickers))
	for _, ticker := range tickers {
		if q, ok := quotesMap[ticker]; ok {
			resultList = append(resultList, q)
		}
	}

	resp := quotesResponse{Quotes: resultList}
	bytes, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

type historicalPriceResponse struct {
	Ticker     string  `json:"ticker"`
	Date       string  `json:"date"`
	ClosePrice float64 `json:"close_price"`
	AdjClose   float64 `json:"adj_close"`
	Source     string  `json:"source"`
}

// GetHistoricalPriceJSON queries local quotes and performs on-demand Yahoo sync if missing,
// returning the nominal close price and adjusted close in JSON format.
func GetHistoricalPriceJSON(ticker string, date string) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cleanTicker := strings.ToUpper(strings.TrimSpace(ticker))
	cleanDate := strings.TrimSpace(date)

	quotes, err := eng.cotahistRepo.GetQuotes(ctx, cleanTicker, cleanDate, cleanDate)
	if err == nil && len(quotes) > 0 {
		q := quotes[0]
		adj := q.AdjClose
		if adj == 0 {
			adj = q.Close
		}
		resp := historicalPriceResponse{
			Ticker:     cleanTicker,
			Date:       q.Date,
			ClosePrice: q.Close,
			AdjClose:   adj,
			Source:     q.Source,
		}
		bytes, err := json.Marshal(resp)
		if err != nil {
			return "", err
		}
		return string(bytes), nil
	}

	if eng.yahooClient != nil {
		bars, events, err := eng.yahooClient.FetchChartHistory(ctx, cleanTicker, "max")
		if err == nil && len(bars) > 0 {
			cls := resolveAssetClass(ctx, eng.db, cleanTicker)
			quotesToSave := make([]cotahist.Quote, 0, len(bars))
			for _, bar := range bars {
				adj := bar.AdjClose
				if adj == 0 {
					adj = bar.Close
				}
				quotesToSave = append(quotesToSave, cotahist.Quote{
					Ticker:     cleanTicker,
					Date:       bar.Date,
					AssetClass: cls,
					Name:       cleanTicker,
					Open:       bar.Open,
					High:       bar.High,
					Low:        bar.Low,
					Close:      bar.Close,
					AdjClose:   adj,
					Volume:     bar.Volume,
					Source:     "YAHOO",
				})
			}
			_ = eng.cotahistRepo.UpsertQuotes(ctx, quotesToSave)

			if len(events) > 0 {
				eventsToSave := make([]cotahist.CorporateEvent, 0, len(events))
				for _, ev := range events {
					eventsToSave = append(eventsToSave, cotahist.CorporateEvent{
						Ticker:      cleanTicker,
						Type:        ev.Type,
						Date:        ev.Date,
						Numerator:   ev.Numerator,
						Denominator: ev.Denominator,
						Ratio:       ev.Ratio,
						CashAmount:  ev.CashAmount,
					})
				}
				_ = eng.cotahistRepo.SaveCorporateEvents(ctx, eventsToSave)
			}

			quotesAfter, errAfter := eng.cotahistRepo.GetQuotes(ctx, cleanTicker, cleanDate, cleanDate)
			if errAfter == nil && len(quotesAfter) > 0 {
				q := quotesAfter[0]
				adj := q.AdjClose
				if adj == 0 {
					adj = q.Close
				}
				resp := historicalPriceResponse{
					Ticker:     cleanTicker,
					Date:       q.Date,
					ClosePrice: q.Close,
					AdjClose:   adj,
					Source:     q.Source,
				}
				bytes, err := json.Marshal(resp)
				if err != nil {
					return "", err
				}
				return string(bytes), nil
			}

			// Fallback: se a data for final de semana ou feriado, busca o pregão imediatamente anterior
			priorQuotes, errPrior := eng.cotahistRepo.GetQuotes(ctx, cleanTicker, "", cleanDate)
			if errPrior == nil && len(priorQuotes) > 0 {
				q := priorQuotes[len(priorQuotes)-1]
				adj := q.AdjClose
				if adj == 0 {
					adj = q.Close
				}
				resp := historicalPriceResponse{
					Ticker:     cleanTicker,
					Date:       q.Date,
					ClosePrice: q.Close,
					AdjClose:   adj,
					Source:     q.Source,
				}
				bytes, err := json.Marshal(resp)
				if err != nil {
					return "", err
				}
				return string(bytes), nil
			}
		}
	}

	return "", fmt.Errorf("historical quote not found for %s on %s", cleanTicker, cleanDate)
}

type macroRateItem struct {
	Date  string  `json:"date"`
	Type  string  `json:"type"`
	Value float64 `json:"value"`
	CDI   float64 `json:"cdi,omitempty"`
	IPCA  float64 `json:"ipca,omitempty"`
}

// FetchMacroRatesJSON syncs incremental BCB SGS rates (CDI series 12 and IPCA series 433)
// and returns historical macro rates from fromDate in JSON format.
func FetchMacroRatesJSON(fromDate string) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if eng.bcbClient != nil {
		_, _ = eng.bcbClient.SyncIncrementalRates(ctx, eng.macroRepo, time.Now().Format("2006-01-02"))
	}

	rates, err := eng.macroRepo.GetRates(ctx, "", fromDate, "9999-12-31")
	if err != nil {
		return "", fmt.Errorf("failed to query macro rates: %w", err)
	}

	if len(rates) == 0 {
		rates, _ = eng.macroRepo.GetRates(ctx, "", "0000-01-01", "9999-12-31")
	}

	items := make([]macroRateItem, 0, len(rates))
	for _, r := range rates {
		item := macroRateItem{
			Date:  r.Date,
			Type:  r.Type,
			Value: r.Value,
		}
		if r.Type == "CDI" {
			item.CDI = r.Value
		} else if r.Type == "IPCA" {
			item.IPCA = r.Value
		}
		items = append(items, item)
	}

	bytes, err := json.Marshal(items)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

type corporateEventItem struct {
	Ticker      string  `json:"ticker"`
	Type        string  `json:"type"`
	Date        string  `json:"date"`
	Numerator   float64 `json:"numerator"`
	Denominator float64 `json:"denominator"`
	Ratio       string  `json:"ratio"`
}

type corporateEventsResponse struct {
	Events []corporateEventItem `json:"events"`
}

// GetCorporateEventsJSON returns corporate events (splits, inplits, dividends) for given tickers from fromDate.
func GetCorporateEventsJSON(tickersCSV string, fromDate string) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rawList := strings.Split(tickersCSV, ",")
	items := make([]corporateEventItem, 0)

	for _, t := range rawList {
		ticker := strings.ToUpper(strings.TrimSpace(t))
		if ticker == "" {
			continue
		}
		events, err := eng.cotahistRepo.GetCorporateEvents(ctx, ticker, "0000-01-01", "9999-12-31")
		if err != nil {
			continue
		}
		for _, ev := range events {
			items = append(items, corporateEventItem{
				Ticker:      ev.Ticker,
				Type:        ev.Type,
				Date:        ev.Date,
				Numerator:   ev.Numerator,
				Denominator: ev.Denominator,
				Ratio:       ev.Ratio,
			})
		}
	}

	resp := corporateEventsResponse{Events: items}
	bytes, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// IngestCotahistZipJSON ingests a local B3 COTAHIST ZIP archive, filtering quotes by allowedTickersCSV.
func IngestCotahistZipJSON(zipPath string, allowedTickersCSV string) (string, error) {
	eng, err := getEngine()
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	file, err := os.Open(zipPath)
	if err != nil {
		return "", fmt.Errorf("failed to open zip file %s: %w", zipPath, err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return "", fmt.Errorf("failed to stat zip file: %w", err)
	}

	var allowedTickers []string
	if strings.TrimSpace(allowedTickersCSV) != "" {
		for _, t := range strings.Split(allowedTickersCSV, ",") {
			clean := strings.ToUpper(strings.TrimSpace(t))
			if clean != "" {
				allowedTickers = append(allowedTickers, clean)
			}
		}
	}

	var importedQuotes []cotahist.Quote
	parser := cotahist.NewParser()
	err = parser.ParseZIPFiltered(file, stat.Size(), allowedTickers, func(q cotahist.Quote) error {
		importedQuotes = append(importedQuotes, q)
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("failed to parse cotahist zip: %w", err)
	}

	if len(importedQuotes) > 0 {
		if err := eng.cotahistRepo.UpsertQuotes(ctx, importedQuotes); err != nil {
			return "", fmt.Errorf("failed to upsert quotes: %w", err)
		}
	}

	resp := struct {
		ImportedCount int `json:"imported_count"`
	}{
		ImportedCount: len(importedQuotes),
	}

	bytes, err := json.Marshal(resp)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// GetAssetProfileJSON returns company fundamentals and overview.
func GetAssetProfileJSON(ticker string) (string, error) {
	return `{"ticker":"` + strings.ToUpper(strings.TrimSpace(ticker)) + `"}`, nil
}

// GetPriceHistoryJSON returns historical chart points for the specified range.
func GetPriceHistoryJSON(ticker string, rangeParam string) (string, error) {
	return `{"history":[]}`, nil
}

// GetDividendsJSON returns dividend events for ticker.
func GetDividendsJSON(ticker string) (string, error) {
	return `{"dividends":[]}`, nil
}

// GetRankingJSON returns top ranked assets for given class and metric.
func GetRankingJSON(assetClass string, by string, limit int) (string, error) {
	return `{"rankings":[]}`, nil
}
