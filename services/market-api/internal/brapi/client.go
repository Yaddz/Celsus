package brapi

import (
	"context"
	"net/http"
	"sync"
	"time"
)

// Quote represents a quote fetched from BRAPI.
type Quote struct {
	Ticker    string    `json:"ticker"`
	Price     float64   `json:"price"`
	Change24h float64   `json:"change_24h"`
	UpdatedAt time.Time `json:"updated_at"`
}

type cachedQuote struct {
	quote     Quote
	expiresAt time.Time
}

// Client interacts with BRAPI for stock, FII, and crypto quotes with TTL caching.
type Client struct {
	token      string
	baseURL    string
	httpClient *http.Client
	cacheTTL   time.Duration
	cache      map[string]cachedQuote
	mu         sync.RWMutex
}

// NewClient creates a new BRAPI Client.
func NewClient(token string, baseURL string, cacheTTL time.Duration) *Client {
	return &Client{
		token:      token,
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		cacheTTL:   cacheTTL,
		cache:      make(map[string]cachedQuote),
	}
}

// FetchQuotes fetches stock and FII quotes in batch with in-memory TTL caching.
func (c *Client) FetchQuotes(ctx context.Context, tickers []string) (map[string]Quote, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, nil
}

// FetchCryptoQuotes fetches crypto quotes priced in BRL with in-memory TTL caching.
func (c *Client) FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]Quote, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, nil
}

// CheckHealth verifies connectivity to BRAPI.
func (c *Client) CheckHealth(ctx context.Context) error {
	// Stub for Phase A (TDD Red Phase)
	return nil
}
