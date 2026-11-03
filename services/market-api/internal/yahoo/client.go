package yahoo

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
	"github.com/pedro/celsus/services/market-api/internal/quotes"
)

const (
	DefaultPrimaryBaseURL  = "https://query1.finance.yahoo.com"
	DefaultFallbackBaseURL = "https://query2.finance.yahoo.com"
	DefaultUserAgent       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
	MaxConcurrency         = 4
)

type cachedQuote struct {
	quote      quotes.Quote
	expiresAt  time.Time
	isNegative bool
	err        error
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
	requestGroup    singleflight.Group
}

// NewClient creates a new Yahoo Finance Client with configurable primary and fallback base URLs.
func NewClient(primaryBaseURL, fallbackBaseURL string, cacheTTL time.Duration) *Client {
	return &Client{
		primaryBaseURL:  strings.TrimRight(primaryBaseURL, "/"),
		fallbackBaseURL: strings.TrimRight(fallbackBaseURL, "/"),
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

func isKnownCryptoTicker(t string) bool {
	switch strings.ToUpper(strings.TrimSpace(t)) {
	case "BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK":
		return true
	default:
		return false
	}
}

// ToYahooSymbol converts a clean Celsus ticker (e.g. "PETR4", "HGLG11", "BTC") into a Yahoo Finance symbol ("PETR4.SA", "HGLG11.SA", "BTC-BRL").
func ToYahooSymbol(ticker, assetClass string) string {
	t := strings.ToUpper(strings.TrimSpace(ticker))
	if t == "" {
		return ""
	}
	if strings.HasSuffix(t, ".SA") || strings.HasSuffix(t, "-BRL") {
		return t
	}
	cls := strings.ToUpper(strings.TrimSpace(assetClass))
	if cls == "CRYPTO" || isKnownCryptoTicker(t) {
		return t + "-BRL"
	}
	return t + ".SA"
}

// FromYahooSymbol strips Yahoo Finance suffixes (".SA", "-BRL") and returns the clean uppercase ticker ("PETR4", "HGLG11", "BTC").
func FromYahooSymbol(symbol string) string {
	s := strings.ToUpper(strings.TrimSpace(symbol))
	s = strings.TrimSuffix(s, ".SA")
	s = strings.TrimSuffix(s, "-BRL")
	return s
}

type yahooChartResponse struct {
	Chart struct {
		Result []yahooChartResult `json:"result"`
		Error  *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

type yahooChartResult struct {
	Meta struct {
		Currency                   string  `json:"currency"`
		Symbol                     string  `json:"symbol"`
		RegularMarketPrice         float64 `json:"regularMarketPrice"`
		ChartPreviousClose         float64 `json:"chartPreviousClose"`
		RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
		RegularMarketTime          int64   `json:"regularMarketTime"`
	} `json:"meta"`
	Timestamp []int64 `json:"timestamp"`
	Events    *struct {
		Splits map[string]struct {
			Date        int64   `json:"date"`
			Numerator   float64 `json:"numerator"`
			Denominator float64 `json:"denominator"`
			SplitRatio  string  `json:"splitRatio"`
		} `json:"splits"`
		Dividends map[string]struct {
			Amount float64 `json:"amount"`
			Date   int64   `json:"date"`
		} `json:"dividends"`
	} `json:"events"`
	Indicators struct {
		Quote []struct {
			Open   []*float64 `json:"open"`
			High   []*float64 `json:"high"`
			Low    []*float64 `json:"low"`
			Close  []*float64 `json:"close"`
			Volume []*float64 `json:"volume"`
		} `json:"quote"`
		AdjClose []struct {
			AdjClose []*float64 `json:"adjclose"`
		} `json:"adjclose"`
	} `json:"indicators"`
}

func (c *Client) doChartRequest(ctx context.Context, baseURL, yahooSymbol, rangeParam, interval string, includeEvents bool) (*yahooChartResult, int, error) {
	eventsQuery := ""
	if includeEvents {
		eventsQuery = "&events=div,splits"
	}
	url := fmt.Sprintf("%s/v8/finance/chart/%s?range=%s&interval=%s%s", baseURL, yahooSymbol, rangeParam, interval, eventsQuery)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao criar requisicao yahoo: %w", err)
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("erro de rede no yahoo (%s): %w", baseURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("status inesperado do yahoo (%s): %d", baseURL, resp.StatusCode)
	}

	var parsed yahooChartResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("falha ao decodificar json do yahoo: %w", err)
	}
	if parsed.Chart.Error != nil {
		return nil, resp.StatusCode, fmt.Errorf("erro retornado pela api do yahoo: %s - %s", parsed.Chart.Error.Code, parsed.Chart.Error.Description)
	}
	if len(parsed.Chart.Result) == 0 {
		return nil, resp.StatusCode, fmt.Errorf("nenhum resultado retornado pelo yahoo para %s", yahooSymbol)
	}

	return &parsed.Chart.Result[0], resp.StatusCode, nil
}

func (c *Client) fetchChartWithFailover(ctx context.Context, yahooSymbol, rangeParam, interval string, includeEvents bool) (*yahooChartResult, error) {
	c.sem <- struct{}{}
	defer func() { <-c.sem }()

	res, status, err := c.doChartRequest(ctx, c.primaryBaseURL, yahooSymbol, rangeParam, interval, includeEvents)
	if err == nil {
		return res, nil
	}

	shouldFailover := status == 0 || status == http.StatusTooManyRequests || status >= 500
	if shouldFailover && c.fallbackBaseURL != "" && c.fallbackBaseURL != c.primaryBaseURL {
		resFallback, _, errFallback := c.doChartRequest(ctx, c.fallbackBaseURL, yahooSymbol, rangeParam, interval, includeEvents)
		if errFallback == nil {
			return resFallback, nil
		}
		return nil, errFallback
	}

	return nil, err
}

func (c *Client) fetchSingleQuote(ctx context.Context, cleanTicker string) (quotes.Quote, error) {
	val, err, _ := c.requestGroup.Do(cleanTicker, func() (interface{}, error) {
		now := time.Now()
		c.mu.RLock()
		if cached, ok := c.cache[cleanTicker]; ok && now.Before(cached.expiresAt) {
			if cached.isNegative {
				c.mu.RUnlock()
				return quotes.Quote{}, cached.err
			}
			c.mu.RUnlock()
			return cached.quote, nil
		}
		c.mu.RUnlock()

		yahooSym := ToYahooSymbol(cleanTicker, "")
		chartRes, err := c.fetchChartWithFailover(ctx, yahooSym, "5d", "1d", false)
		if err != nil {
			if isKnownCryptoTicker(cleanTicker) {
				if qCrypto, errCrypto := c.fetchCryptoFallback(ctx, cleanTicker); errCrypto == nil {
					c.mu.Lock()
					c.cache[cleanTicker] = cachedQuote{
						quote:     qCrypto,
						expiresAt: time.Now().Add(c.cacheTTL),
					}
					c.mu.Unlock()
					return qCrypto, nil
				}
			}
			if strings.Contains(err.Error(), "429") {
				c.mu.Lock()
				c.cache[cleanTicker] = cachedQuote{
					isNegative: true,
					err:        err,
					expiresAt:  time.Now().Add(60 * time.Second),
				}
				c.mu.Unlock()
			}
			return quotes.Quote{}, err
		}

		price := chartRes.Meta.RegularMarketPrice
		prevClose := chartRes.Meta.ChartPreviousClose
		change24h := chartRes.Meta.RegularMarketChangePercent
		if change24h == 0 && prevClose > 0 {
			change24h = ((price - prevClose) / prevClose) * 100.0
		}

		var updatedAt time.Time
		if chartRes.Meta.RegularMarketTime > 0 {
			updatedAt = time.Unix(chartRes.Meta.RegularMarketTime, 0).UTC()
		} else {
			updatedAt = time.Now().UTC()
		}

		clean := FromYahooSymbol(chartRes.Meta.Symbol)
		if clean == "" {
			clean = cleanTicker
		}

		q := quotes.Quote{
			Ticker:    clean,
			Price:     price,
			Change24h: change24h,
			UpdatedAt: updatedAt,
			Source:    "YAHOO",
		}

		c.mu.Lock()
		c.cache[cleanTicker] = cachedQuote{
			quote:     q,
			expiresAt: time.Now().Add(c.cacheTTL),
		}
		c.mu.Unlock()
		return q, nil
	})

	if err != nil {
		return quotes.Quote{}, err
	}
	return val.(quotes.Quote), nil
}

// FetchQuotes fetches quotes for B3 stocks, FIIs, and crypto in batch with TTL caching, singleflight and query1->query2 failover.
func (c *Client) FetchQuotes(ctx context.Context, tickers []string) (map[string]quotes.Quote, error) {
	if len(tickers) == 0 {
		return map[string]quotes.Quote{}, nil
	}

	results := make(map[string]quotes.Quote)
	var missing []string
	now := time.Now()

	for _, raw := range tickers {
		clean := FromYahooSymbol(raw)
		if clean == "" {
			continue
		}
		c.mu.RLock()
		cached, ok := c.cache[clean]
		c.mu.RUnlock()
		if ok && now.Before(cached.expiresAt) {
			if cached.isNegative {
				return nil, cached.err
			}
			results[clean] = cached.quote
		} else {
			missing = append(missing, clean)
		}
	}

	if len(missing) == 0 {
		return results, nil
	}

	type fetchOutcome struct {
		cleanTicker string
		quote       quotes.Quote
		err         error
	}

	outcomes := make(chan fetchOutcome, len(missing))
	var wg sync.WaitGroup

	for _, cleanTicker := range missing {
		wg.Add(1)
		go func(tkr string) {
			defer wg.Done()
			q, err := c.fetchSingleQuote(ctx, tkr)
			outcomes <- fetchOutcome{cleanTicker: tkr, quote: q, err: err}
		}(cleanTicker)
	}

	wg.Wait()
	close(outcomes)

	var firstErr error
	for out := range outcomes {
		if out.err != nil {
			if firstErr == nil {
				firstErr = out.err
			}
			continue
		}
		results[out.cleanTicker] = out.quote
	}

	if len(results) == 0 && firstErr != nil {
		return nil, firstErr
	}

	return results, nil
}

// FetchCryptoQuotes fetches crypto quotes priced in BRL (delegates to FetchQuotes with -BRL normalization).
func (c *Client) FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]quotes.Quote, error) {
	return c.FetchQuotes(ctx, coins)
}

// FetchChartHistory fetches historical daily bars (nominal close + adjclose) and corporate events (splits, dividends) for a ticker.
func (c *Client) FetchChartHistory(ctx context.Context, ticker string, rangeParam string) ([]quotes.HistoricalBar, []quotes.CorporateEvent, error) {
	yahooSym := ToYahooSymbol(ticker, "")
	cleanTicker := FromYahooSymbol(yahooSym)
	if rangeParam == "" {
		rangeParam = "1mo"
	}

	chartRes, err := c.fetchChartWithFailover(ctx, yahooSym, rangeParam, "1d", true)
	if err != nil {
		return nil, nil, err
	}

	var bars []quotes.HistoricalBar
	if len(chartRes.Indicators.Quote) > 0 {
		qInd := chartRes.Indicators.Quote[0]
		var adjSlice []*float64
		if len(chartRes.Indicators.AdjClose) > 0 {
			adjSlice = chartRes.Indicators.AdjClose[0].AdjClose
		}

		for i, ts := range chartRes.Timestamp {
			if i >= len(qInd.Close) || qInd.Close[i] == nil {
				continue
			}
			closeVal := *qInd.Close[i]
			openVal := closeVal
			if i < len(qInd.Open) && qInd.Open[i] != nil {
				openVal = *qInd.Open[i]
			}
			highVal := closeVal
			if i < len(qInd.High) && qInd.High[i] != nil {
				highVal = *qInd.High[i]
			}
			lowVal := closeVal
			if i < len(qInd.Low) && qInd.Low[i] != nil {
				lowVal = *qInd.Low[i]
			}
			var volVal float64
			if i < len(qInd.Volume) && qInd.Volume[i] != nil {
				volVal = *qInd.Volume[i]
			}
			adjVal := closeVal
			if i < len(adjSlice) && adjSlice[i] != nil {
				adjVal = *adjSlice[i]
			}

			dateStr := time.Unix(ts, 0).UTC().Format("2006-01-02")
			bars = append(bars, quotes.HistoricalBar{
				Date:     dateStr,
				Open:     openVal,
				High:     highVal,
				Low:      lowVal,
				Close:    closeVal,
				AdjClose: adjVal,
				Volume:   volVal,
			})
		}
	}

	var events []quotes.CorporateEvent
	if chartRes.Events != nil {
		for _, sp := range chartRes.Events.Splits {
			ratio := sp.SplitRatio
			if ratio == "" && sp.Numerator > 0 && sp.Denominator > 0 {
				ratio = fmt.Sprintf("%g:%g", sp.Numerator, sp.Denominator)
			}
			events = append(events, quotes.CorporateEvent{
				Ticker:      cleanTicker,
				Type:        "SPLIT",
				Date:        time.Unix(sp.Date, 0).UTC().Format("2006-01-02"),
				Numerator:   sp.Numerator,
				Denominator: sp.Denominator,
				Ratio:       ratio,
			})
		}
		for _, div := range chartRes.Events.Dividends {
			events = append(events, quotes.CorporateEvent{
				Ticker:     cleanTicker,
				Type:       "DIVIDEND",
				Date:       time.Unix(div.Date, 0).UTC().Format("2006-01-02"),
				CashAmount: div.Amount,
			})
		}
		sort.Slice(events, func(i, j int) bool {
			if events[i].Date == events[j].Date {
				return events[i].Type < events[j].Type
			}
			return events[i].Date < events[j].Date
		})
	}

	return bars, events, nil
}

// CheckHealth verifies Yahoo client configuration.
func (c *Client) CheckHealth(ctx context.Context) error {
	if c.primaryBaseURL == "" {
		return fmt.Errorf("primaryBaseURL nao configurada")
	}
	return nil
}

func (c *Client) fetchCryptoFallback(ctx context.Context, cleanTicker string) (quotes.Quote, error) {
	sym := strings.ToUpper(strings.TrimSpace(cleanTicker))
	url := fmt.Sprintf("https://economia.awesomeapi.com.br/last/%s-BRL", sym)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return quotes.Quote{}, err
	}
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return quotes.Quote{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return quotes.Quote{}, fmt.Errorf("crypto fallback status: %d", resp.StatusCode)
	}

	var raw map[string]struct {
		Bid       string `json:"bid"`
		PctChange string `json:"pctChange"`
		Timestamp string `json:"timestamp"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return quotes.Quote{}, err
	}

	key := sym + "BRL"
	data, ok := raw[key]
	if !ok {
		return quotes.Quote{}, fmt.Errorf("crypto data missing for %s", key)
	}

	price, err := strconv.ParseFloat(data.Bid, 64)
	if err != nil {
		return quotes.Quote{}, err
	}

	change, _ := strconv.ParseFloat(data.PctChange, 64)

	var updatedAt time.Time
	if ts, err := strconv.ParseInt(data.Timestamp, 10, 64); err == nil && ts > 0 {
		updatedAt = time.Unix(ts, 0).UTC()
	} else {
		updatedAt = time.Now().UTC()
	}

	return quotes.Quote{
		Ticker:    sym,
		Price:     price,
		Change24h: change,
		UpdatedAt: updatedAt,
		Source:    "CRYPTO_API",
	}, nil
}
