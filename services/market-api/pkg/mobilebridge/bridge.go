package mobilebridge

import (
	"fmt"
)

// InitEngine initializes the SQLite database at dbPath, executes schema migrations,
// seeds production catalog and macro rates (if isProd is true) or sample market data,
// and initializes the embedded market engine singleton.
func InitEngine(dbPath string, isProd bool) error {
	return fmt.Errorf("InitEngine not implemented")
}

// CloseEngine closes any open SQLite connection and releases engine resources.
func CloseEngine() error {
	return fmt.Errorf("CloseEngine not implemented")
}

// SetCustomBaseURLs overrides the default Yahoo Finance and BCB SGS base URLs (for tests and offline mocking).
func SetCustomBaseURLs(yahooPrimary, yahooFallback, bcbBaseURL string) {
}

// CheckHealthJSON returns the health status of the embedded engine in JSON format.
func CheckHealthJSON() (string, error) {
	return "", fmt.Errorf("CheckHealthJSON not implemented")
}

// FetchQuotesJSON fetches quotes for comma-separated tickers, respecting the 15-minute SQLite cache TTL,
// or returning stale cached quotes when offline.
func FetchQuotesJSON(tickersCSV string, forceRefresh bool) (string, error) {
	return "", fmt.Errorf("FetchQuotesJSON not implemented")
}

// GetHistoricalPriceJSON queries local quotes and performs on-demand Yahoo sync if missing,
// returning the nominal close price and adjusted close in JSON format.
func GetHistoricalPriceJSON(ticker string, date string) (string, error) {
	return "", fmt.Errorf("GetHistoricalPriceJSON not implemented")
}

// SearchCatalogJSON searches assets by query and optional assetClass in the local catalog and quotes,
// falling back to Yahoo Finance if query length >= 4 and nothing is found locally.
func SearchCatalogJSON(query string, assetClass string) (string, error) {
	return "", fmt.Errorf("SearchCatalogJSON not implemented")
}

// FetchMacroRatesJSON syncs incremental BCB SGS rates (CDI series 12 and IPCA series 433)
// and returns historical macro rates from fromDate in JSON format.
func FetchMacroRatesJSON(fromDate string) (string, error) {
	return "", fmt.Errorf("FetchMacroRatesJSON not implemented")
}

// GetCorporateEventsJSON returns corporate events (splits, inplits, dividends) for given tickers from fromDate.
func GetCorporateEventsJSON(tickersCSV string, fromDate string) (string, error) {
	return "", fmt.Errorf("GetCorporateEventsJSON not implemented")
}

// IngestCotahistZipJSON ingests a local B3 COTAHIST ZIP archive, filtering quotes by allowedTickersCSV.
func IngestCotahistZipJSON(zipPath string, allowedTickersCSV string) (string, error) {
	return "", fmt.Errorf("IngestCotahistZipJSON not implemented")
}
