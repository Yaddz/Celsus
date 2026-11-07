package fundamentals

import (
	"context"
	"time"
)

// AssetProfileDTO represents complete fundamental metrics and company profile in standard format.
type AssetProfileDTO struct {
	Ticker            string                 `json:"ticker"`
	Name              string                 `json:"name"`
	AssetClass        string                 `json:"asset_class"`
	Price             float64                `json:"price"`
	Change24h         float64                `json:"change_24h"`
	Change12m         float64                `json:"change_12m"`
	Indicators        map[string]interface{} `json:"indicators"`
	CompanyName       string                 `json:"company_name"`
	Sector            string                 `json:"sector"`
	ListingSegment    string                 `json:"listing_segment"`
	SharesOutstanding string                 `json:"shares_outstanding"`
	Website           string                 `json:"website"`
	Source            string                 `json:"source"`
	UpdatedAt         time.Time              `json:"updated_at"`
	IsStale           bool                   `json:"is_stale"`
}

// FundamentalsProvider defines contract for retrieving fundamental metrics.
type FundamentalsProvider interface {
	FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error)
}

type YahooFundamentalsProvider struct {
	baseURL string
}

func NewYahooFundamentalsProvider(baseURL string) *YahooFundamentalsProvider {
	return &YahooFundamentalsProvider{baseURL: baseURL}
}

func (y *YahooFundamentalsProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	return nil, nil
}

type FundamentusFallbackProvider struct {
	baseURL string
}

func NewFundamentusFallbackProvider(baseURL string) *FundamentusFallbackProvider {
	return &FundamentusFallbackProvider{baseURL: baseURL}
}

func (f *FundamentusFallbackProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	return nil, nil
}

type MultiFundamentalsProvider struct {
	primary  FundamentalsProvider
	fallback FundamentalsProvider
}

func NewMultiFundamentalsProvider(primary, fallback FundamentalsProvider) *MultiFundamentalsProvider {
	return &MultiFundamentalsProvider{primary: primary, fallback: fallback}
}

func (m *MultiFundamentalsProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	return nil, nil
}
