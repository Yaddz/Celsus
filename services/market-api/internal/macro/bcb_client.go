package macro

import (
	"context"
	"net/http"
	"time"
)

const (
	DefaultBCBBaseURL = "https://api.bcb.gov.br"
	SeriesCDI         = 12  // Taxa de juros - CDI (% ao dia)
	SeriesIPCA        = 433 // IPCA - Variação mensal (%)
)

// BCBClient interacts with Banco Central do Brasil SGS API for incremental macro rates synchronization.
type BCBClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewBCBClient creates a new BCB SGS API client.
func NewBCBClient(baseURL string, httpClient *http.Client) *BCBClient {
	if baseURL == "" {
		baseURL = DefaultBCBBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &BCBClient{
		baseURL:    baseURL,
		httpClient: httpClient,
	}
}

// FetchSGSSeries fetches a BCB SGS series (12 = CDI, 433 = IPCA) for [fromDate, toDate] (accepts YYYY-MM-DD or DD/MM/YYYY)
// and returns normalized Rate structs with YYYY-MM-DD dates.
func (c *BCBClient) FetchSGSSeries(ctx context.Context, seriesCode int, fromDate, toDate string) ([]Rate, error) {
	// Stub Fase A (Red Phase)
	return nil, nil
}

// SyncIncrementalRates checks the last stored date for CDI and IPCA in repo and fetches only newer observations up to targetDate.
func (c *BCBClient) SyncIncrementalRates(ctx context.Context, repo Repository, targetDate string) (int, error) {
	// Stub Fase A (Red Phase)
	return 0, nil
}
