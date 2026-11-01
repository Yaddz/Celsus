package yahoo

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/quotes"
)

const (
	DefaultPrimaryBaseURL  = "https://query1.finance.yahoo.com"
	DefaultFallbackBaseURL = "https://query2.finance.yahoo.com"
	DefaultUserAgent       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
	MaxConcurrency         = 4
)

type cachedQuote struct {
	quote     quotes.Quote
	expiresAt time.Time
}

// Client interacts with Yahoo Finance v8 chart API with failover, User-Agent, concurrency semaphore, and TTL cache.
type Client struct {
	primaryBaseURL  string
	fallbackBaseURL string
	userAgent       string
	httpClient      *http.Client
	cacheTTL        time.Duration
	cache           map[string]cachedQuote
	mu              sync.RWMutex
	sem             chan struct{}
}

// NewClient creates a new Yahoo Finance Client with configurable primary and fallback base URLs.
func NewClient(primaryBaseURL, fallbackBaseURL string, cacheTTL time.Duration) *Client {
	return &Client{
		primaryBaseURL:  primaryBaseURL,
		fallbackBaseURL: fallbackBaseURL,
		userAgent:       DefaultUserAgent,
		httpClient:      &http.Client{Timeout: 10 * time.Second},
		cacheTTL:        cacheTTL,
		cache:           make(map[string]cachedQuote),
		sem:             make(chan struct{}, MaxConcurrency),
	}
}

// NewDefaultClient creates a Yahoo Finance Client pointing to query1 and query2.finance.yahoo.com.
func NewDefaultClient(cacheTTL time.Duration) *Client {
	return NewClient(DefaultPrimaryBaseURL, DefaultFallbackBaseURL, cacheTTL)
}

// ToYahooSymbol converts a clean Celsus ticker (e.g. "PETR4", "HGLG11", "BTC") into a Yahoo Finance symbol ("PETR4.SA", "HGLG11.SA", "BTC-BRL").
func ToYahooSymbol(ticker, assetClass string) string {
	// Stub Fase A (Red Phase)
	return ""
}

// FromYahooSymbol strips Yahoo Finance suffixes (".SA", "-BRL") and returns the clean uppercase ticker ("PETR4", "HGLG11", "BTC").
func FromYahooSymbol(symbol string) string {
	// Stub Fase A (Red Phase)
	return ""
}

// FetchQuotes fetches quotes for B3 stocks, FIIs, and crypto in batch with TTL caching and query1->query2 failover.
func (c *Client) FetchQuotes(ctx context.Context, tickers []string) (map[string]quotes.Quote, error) {
	// Stub Fase A (Red Phase)
	return map[string]quotes.Quote{}, nil
}

// FetchCryptoQuotes fetches crypto quotes priced in BRL (delegates to FetchQuotes with -BRL normalization).
func (c *Client) FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]quotes.Quote, error) {
	// Stub Fase A (Red Phase)
	return map[string]quotes.Quote{}, nil
}

// FetchChartHistory fetches historical daily bars (nominal close + adjclose) and corporate events (splits, dividends) for a ticker.
func (c *Client) FetchChartHistory(ctx context.Context, ticker string, rangeParam string) ([]quotes.HistoricalBar, []quotes.CorporateEvent, error) {
	// Stub Fase A (Red Phase)
	return nil, nil, nil
}

// CheckHealth verifies Yahoo client configuration.
func (c *Client) CheckHealth(ctx context.Context) error {
	// Stub Fase A (Red Phase)
	return nil
}
