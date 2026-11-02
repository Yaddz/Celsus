package quotes

import (
	"context"
	"time"
)

// Quote represents a standardized real-time or delayed asset quote in BRL.
type Quote struct {
	Ticker    string    `json:"ticker"`
	Price     float64   `json:"price"`
	Change24h float64   `json:"change_24h"`
	UpdatedAt time.Time `json:"updated_at"`
	Source    string    `json:"source,omitempty"`
}

// HistoricalBar represents a single OHLCV + AdjClose daily trading bar.
type HistoricalBar struct {
	Date     string  `json:"date"`      // YYYY-MM-DD
	Open     float64 `json:"open"`      // Nominal open
	High     float64 `json:"high"`      // Nominal high
	Low      float64 `json:"low"`       // Nominal low
	Close    float64 `json:"close"`     // Nominal close (indicators.quote[0].close)
	AdjClose float64 `json:"adj_close"` // Adjusted close (indicators.adjclose[0].adjclose)
	Volume   float64 `json:"volume"`
}

// CorporateEvent represents a stock split, inplit (reverse split), or cash dividend.
type CorporateEvent struct {
	Ticker      string  `json:"ticker"`
	Type        string  `json:"type"`        // "SPLIT" | "DIVIDEND"
	Date        string  `json:"date"`        // YYYY-MM-DD (ex-date)
	Numerator   float64 `json:"numerator"`   // For SPLIT/INPLIT
	Denominator float64 `json:"denominator"` // For SPLIT/INPLIT
	Ratio       string  `json:"ratio"`       // e.g. "2:1" or "1:10"
	CashAmount  float64 `json:"cash_amount"` // For DIVIDEND
}

// QuoteProvider defines the contract for market quote providers (Yahoo Finance primary, BRAPI fallback).
type QuoteProvider interface {
	FetchQuotes(ctx context.Context, tickers []string) (map[string]Quote, error)
	FetchCryptoQuotes(ctx context.Context, coins []string) (map[string]Quote, error)
	CheckHealth(ctx context.Context) error
}
