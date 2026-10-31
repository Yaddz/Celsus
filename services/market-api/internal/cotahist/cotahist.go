package cotahist

import (
	"context"
	"io"
)

// Quote represents a parsed stock or FII daily quote from B3 COTAHIST.
type Quote struct {
	Date       string  `json:"date"`        // YYYY-MM-DD
	Ticker     string  `json:"ticker"`      // e.g. PETR4, HGLG11
	AssetClass string  `json:"asset_class"` // STOCK or FII
	Name       string  `json:"name"`        // Company or Fund name
	Open       float64 `json:"open"`        // Preço de abertura em R$
	High       float64 `json:"high"`        // Preço máximo em R$
	Low        float64 `json:"low"`         // Preço mínimo em R$
	Close      float64 `json:"close"`       // Preço de fechamento em R$
	Volume     float64 `json:"volume"`      // Volume financeiro em R$
}

// Parser handles positional parsing of B3 COTAHIST fixed-width 245-byte records.
type Parser struct{}

// NewParser creates a new COTAHIST parser.
func NewParser() *Parser {
	return &Parser{}
}

// ParseLine parses a single 245-byte line from a COTAHIST file.
// Returns (quote, shouldInclude, error).
// Header ("00"), Trailer ("99"), options ("070", "080") or lines not matching
// CODBDI 02/12 and TPMERC 010/020 return shouldInclude = false, err = nil.
func (p *Parser) ParseLine(line string) (*Quote, bool, error) {
	// Stub for Phase A (TDD Red Phase)
	return nil, false, nil
}

// ParseReader parses a stream of lines from an io.Reader.
func (p *Parser) ParseReader(r io.Reader, handleQuote func(q Quote) error) error {
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// ParseZip parses a ZIP archive containing COTAHIST_AXXXX.TXT in a streaming fashion.
func (p *Parser) ParseZip(r io.ReaderAt, size int64, handleQuote func(q Quote) error) error {
	// Stub for Phase A (TDD Red Phase)
	return nil
}

// Repository defines data access for COTAHIST historical quotes and catalog.
type Repository interface {
	InitSchema(ctx context.Context) error
	UpsertQuotes(ctx context.Context, quotes []Quote) error
	GetQuotes(ctx context.Context, ticker string, from, to string) ([]Quote, error)
	SearchCatalog(ctx context.Context, query string, assetClass string) ([]Quote, error)
	GetLastDate(ctx context.Context) (string, error)
}
