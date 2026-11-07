package fundamentals

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/yahoo"
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

// YahooFundamentalsProvider fetches fundamental data from Yahoo Finance quoteSummary API.
type YahooFundamentalsProvider struct {
	baseURL    string
	httpClient *http.Client
}

func NewYahooFundamentalsProvider(baseURL string) *YahooFundamentalsProvider {
	if baseURL == "" {
		baseURL = yahoo.DefaultPrimaryBaseURL
	}
	return &YahooFundamentalsProvider{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

type yahooQuoteSummaryResponse struct {
	QuoteSummary struct {
		Result []struct {
			SummaryDetail struct {
				DividendYield struct {
					Raw float64 `json:"raw"`
				} `json:"dividendYield"`
				TrailingPE struct {
					Raw float64 `json:"raw"`
				} `json:"trailingPE"`
				PriceToBook struct {
					Raw float64 `json:"raw"`
				} `json:"priceToBook"`
				MarketCap struct {
					Raw float64 `json:"raw"`
				} `json:"marketCap"`
				RegularMarketPrice struct {
					Raw float64 `json:"raw"`
				} `json:"regularMarketPrice"`
				FiftyTwoWeekLow struct {
					Raw float64 `json:"raw"`
				} `json:"fiftyTwoWeekLow"`
				FiftyTwoWeekHigh struct {
					Raw float64 `json:"raw"`
				} `json:"fiftyTwoWeekHigh"`
			} `json:"summaryDetail"`
			FinancialData struct {
				ReturnOnEquity struct {
					Raw float64 `json:"raw"`
				} `json:"returnOnEquity"`
				ProfitMargins struct {
					Raw float64 `json:"raw"`
				} `json:"profitMargins"`
			} `json:"financialData"`
			DefaultKeyStatistics struct {
				SharesOutstanding struct {
					Raw float64 `json:"raw"`
					Fmt string  `json:"fmt"`
				} `json:"sharesOutstanding"`
			} `json:"defaultKeyStatistics"`
			AssetProfile struct {
				LongBusinessSummary string `json:"longBusinessSummary"`
				Sector              string `json:"sector"`
				Website             string `json:"website"`
			} `json:"assetProfile"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"quoteSummary"`
}

func (y *YahooFundamentalsProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	clean := strings.ToUpper(strings.TrimSpace(ticker))
	yahooSymbol := yahoo.ToYahooSymbol(clean, assetClass)

	url := fmt.Sprintf("%s/v10/finance/quoteSummary/%s?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile", y.baseURL, yahooSymbol)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", yahoo.DefaultUserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := y.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("yahoo quoteSummary network error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("yahoo quoteSummary returned status %d", resp.StatusCode)
	}

	var data yahooQuoteSummaryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode quoteSummary: %w", err)
	}
	if data.QuoteSummary.Error != nil {
		return nil, fmt.Errorf("yahoo quoteSummary error: %s", data.QuoteSummary.Error.Description)
	}
	if len(data.QuoteSummary.Result) == 0 {
		return nil, fmt.Errorf("no quoteSummary results for %s", ticker)
	}

	res := data.QuoteSummary.Result[0]
	indicators := make(map[string]interface{})

	if res.SummaryDetail.DividendYield.Raw > 0 {
		indicators["dy"] = res.SummaryDetail.DividendYield.Raw * 100
	}
	if res.SummaryDetail.TrailingPE.Raw != 0 {
		indicators["pl"] = res.SummaryDetail.TrailingPE.Raw
	}
	if res.SummaryDetail.PriceToBook.Raw != 0 {
		indicators["pvp"] = res.SummaryDetail.PriceToBook.Raw
	}
	if res.SummaryDetail.MarketCap.Raw > 0 {
		indicators["marketCap"] = res.SummaryDetail.MarketCap.Raw
	}
	if res.FinancialData.ReturnOnEquity.Raw != 0 {
		indicators["roe"] = res.FinancialData.ReturnOnEquity.Raw * 100
	}
	if res.FinancialData.ProfitMargins.Raw != 0 {
		indicators["netMargin"] = res.FinancialData.ProfitMargins.Raw * 100
	}

	sharesStr := res.DefaultKeyStatistics.SharesOutstanding.Fmt
	if sharesStr == "" && res.DefaultKeyStatistics.SharesOutstanding.Raw > 0 {
		sharesStr = fmt.Sprintf("%.2f B", res.DefaultKeyStatistics.SharesOutstanding.Raw/1e9)
	}

	price := res.SummaryDetail.RegularMarketPrice.Raw

	return &AssetProfileDTO{
		Ticker:            clean,
		Name:              clean,
		AssetClass:        assetClass,
		Price:             price,
		Indicators:        indicators,
		Sector:            res.AssetProfile.Sector,
		Website:           res.AssetProfile.Website,
		SharesOutstanding: sharesStr,
		Source:            "YAHOO",
		UpdatedAt:         time.Now().UTC(),
		IsStale:           false,
	}, nil
}

var tagRegex = regexp.MustCompile(`<[^>]*>`)

func stripHTML(s string) string {
	return strings.TrimSpace(tagRegex.ReplaceAllString(s, ""))
}

func parseBrazilianFloat(s string) float64 {
	clean := strings.TrimSpace(s)
	clean = strings.ReplaceAll(clean, ".", "")
	clean = strings.ReplaceAll(clean, ",", ".")
	clean = strings.ReplaceAll(clean, "%", "")
	clean = strings.ReplaceAll(clean, "R$", "")
	clean = strings.TrimSpace(clean)
	val, _ := strconv.ParseFloat(clean, 64)
	return val
}

// MultiFundamentalsProvider chains primary and fallback providers.
type MultiFundamentalsProvider struct {
	primary  FundamentalsProvider
	fallback FundamentalsProvider
}

func NewMultiFundamentalsProvider(primary, fallback FundamentalsProvider) *MultiFundamentalsProvider {
	return &MultiFundamentalsProvider{
		primary:  primary,
		fallback: fallback,
	}
}

func (m *MultiFundamentalsProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	if m.primary != nil {
		dto, err := m.primary.FetchProfile(ctx, ticker, assetClass)
		if err == nil && dto != nil {
			return dto, nil
		}
	}

	if m.fallback != nil {
		dto, err := m.fallback.FetchProfile(ctx, ticker, assetClass)
		if err == nil && dto != nil {
			return dto, nil
		}
		return nil, err
	}

	return nil, fmt.Errorf("no fundamentals provider succeeded for %s", ticker)
}
