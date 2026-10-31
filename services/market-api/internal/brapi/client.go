package brapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		cacheTTL:   cacheTTL,
		cache:      make(map[string]cachedQuote),
	}
}

type brapiQuoteResult struct {
	Symbol                     string  `json:"symbol"`
	RegularMarketPrice         float64 `json:"regularMarketPrice"`
	RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
	RegularMarketTime          string  `json:"regularMarketTime"`
}

type brapiQuoteResponse struct {
	Results []brapiQuoteResult `json:"results"`
}

// FetchQuotes fetches stock and FII quotes in batch with in-memory TTL caching.
func (c *Client) FetchQuotes(ctx context.Context, tickers []string) (map[string]Quote, error) {
	if len(tickers) == 0 {
		return map[string]Quote{}, nil
	}

	results := make(map[string]Quote)
	var missing []string
	now := time.Now()

	c.mu.RLock()
	for _, ticker := range tickers {
		t := strings.ToUpper(strings.TrimSpace(ticker))
		if cached, ok := c.cache[t]; ok && now.Before(cached.expiresAt) {
			results[t] = cached.quote
		} else {
			missing = append(missing, t)
		}
	}
	c.mu.RUnlock()

	if len(missing) == 0 {
		return results, nil
	}

	url := fmt.Sprintf("%s/api/quote/%s?token=%s", c.baseURL, strings.Join(missing, ","), c.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar requisicao brapi: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar brapi: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status inesperado da brapi: %d", resp.StatusCode)
	}

	var brapiResp brapiQuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&brapiResp); err != nil {
		return nil, fmt.Errorf("falha ao decodificar resposta brapi: %w", err)
	}

	c.mu.Lock()
	for _, item := range brapiResp.Results {
		var updatedAt time.Time
		if item.RegularMarketTime != "" {
			updatedAt, _ = time.Parse(time.RFC3339, item.RegularMarketTime)
		}
		if updatedAt.IsZero() {
			updatedAt = now
		}

		symbol := strings.ToUpper(item.Symbol)
		q := Quote{
			Ticker:    symbol,
			Price:     item.RegularMarketPrice,
			Change24h: item.RegularMarketChangePercent,
			UpdatedAt: updatedAt,
		}

		c.cache[symbol] = cachedQuote{
			quote:     q,
			expiresAt: now.Add(c.cacheTTL),
		}
		results[symbol] = q
	}
	c.mu.Unlock()

	return results, nil
}

type brapiCryptoCoin struct {
	Coin                       string  `json:"coin"`
	Currency                   string  `json:"currency"`
	RegularMarketPrice         float64 `json:"regularMarketPrice"`
	RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
	RegularMarketTime          string  `json:"regularMarketTime"`
}

type brapiCryptoResponse struct {
	Coins []brapiCryptoCoin `json:"coins"`
}

// FetchCryptoQuotes fetches crypto quotes priced in BRL with in-memory TTL caching.
func (c *Client) FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]Quote, error) {
	if len(coins) == 0 {
		return map[string]Quote{}, nil
	}

	results := make(map[string]Quote)
	var missing []string
	now := time.Now()

	c.mu.RLock()
	for _, coin := range coins {
		cUpper := strings.ToUpper(strings.TrimSpace(coin))
		cacheKey := "crypto:" + cUpper
		if cached, ok := c.cache[cacheKey]; ok && now.Before(cached.expiresAt) {
			results[cUpper] = cached.quote
		} else {
			missing = append(missing, cUpper)
		}
	}
	c.mu.RUnlock()

	if len(missing) == 0 {
		return results, nil
	}

	url := fmt.Sprintf("%s/api/v2/crypto?coin=%s&currency=BRL&token=%s", c.baseURL, strings.Join(missing, ","), c.token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar requisicao brapi crypto: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar brapi crypto: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status inesperado da brapi crypto: %d", resp.StatusCode)
	}

	var brapiResp brapiCryptoResponse
	if err := json.NewDecoder(resp.Body).Decode(&brapiResp); err != nil {
		return nil, fmt.Errorf("falha ao decodificar resposta brapi crypto: %w", err)
	}

	c.mu.Lock()
	for _, item := range brapiResp.Coins {
		var updatedAt time.Time
		if item.RegularMarketTime != "" {
			updatedAt, _ = time.Parse(time.RFC3339, item.RegularMarketTime)
		}
		if updatedAt.IsZero() {
			updatedAt = now
		}

		coinUpper := strings.ToUpper(item.Coin)
		q := Quote{
			Ticker:    coinUpper,
			Price:     item.RegularMarketPrice,
			Change24h: item.RegularMarketChangePercent,
			UpdatedAt: updatedAt,
		}

		cacheKey := "crypto:" + coinUpper
		c.cache[cacheKey] = cachedQuote{
			quote:     q,
			expiresAt: now.Add(c.cacheTTL),
		}
		results[coinUpper] = q
	}
	c.mu.Unlock()

	return results, nil
}

// CheckHealth verifies connectivity to BRAPI.
func (c *Client) CheckHealth(ctx context.Context) error {
	if c.baseURL == "" {
		return fmt.Errorf("baseURL nao configurada")
	}
	return nil
}
