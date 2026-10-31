package cotahist

import (
	"archive/zip"
	"bufio"
	"context"
	"fmt"
	"io"
	"strconv"
	"strings"
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
	if len(line) < 245 {
		return nil, false, nil
	}

	tipreg := line[0:2]
	if tipreg != "01" {
		// Header (00), Trailer (99) or other non-quote records
		return nil, false, nil
	}

	tpmerc := line[24:27]
	// 010 = Mercado à vista, 020 = Mercado fracionário
	// 070 = Opções de compra, 080 = Opções de venda (ignorar)
	if tpmerc != "010" && tpmerc != "020" {
		return nil, false, nil
	}

	codbdi := line[10:12]
	var assetClass string
	switch codbdi {
	case "02":
		assetClass = "STOCK"
	case "12":
		assetClass = "FII"
	default:
		// Not a standard stock or FII
		return nil, false, nil
	}

	datpre := line[2:10]
	if len(datpre) != 8 {
		return nil, false, fmt.Errorf("tamanho de data inválido: %s", datpre)
	}
	formattedDate := fmt.Sprintf("%s-%s-%s", datpre[0:4], datpre[4:6], datpre[6:8])

	ticker := strings.TrimSpace(line[12:24])
	name := strings.TrimSpace(line[27:39])

	openPrice, err := parsePrice(line[56:69])
	if err != nil {
		return nil, false, fmt.Errorf("erro no parse de PREABE: %w", err)
	}

	highPrice, err := parsePrice(line[69:82])
	if err != nil {
		return nil, false, fmt.Errorf("erro no parse de PREMAX: %w", err)
	}

	lowPrice, err := parsePrice(line[82:95])
	if err != nil {
		return nil, false, fmt.Errorf("erro no parse de PREMIN: %w", err)
	}

	closePrice, err := parsePrice(line[108:121])
	if err != nil {
		return nil, false, fmt.Errorf("erro no parse de PREULT: %w", err)
	}

	volume, err := parsePrice(line[170:188])
	if err != nil {
		return nil, false, fmt.Errorf("erro no parse de VOLTOT: %w", err)
	}

	q := &Quote{
		Date:       formattedDate,
		Ticker:     ticker,
		AssetClass: assetClass,
		Name:       name,
		Open:       openPrice,
		High:       highPrice,
		Low:        lowPrice,
		Close:      closePrice,
		Volume:     volume,
	}

	return q, true, nil
}

func parsePrice(s string) (float64, error) {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return 0, nil
	}
	val, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		return 0, err
	}
	return float64(val) / 100.0, nil
}

// ParseReader parses a stream of lines from an io.Reader.
func (p *Parser) ParseReader(r io.Reader, handleQuote func(q Quote) error) error {
	reader := bufio.NewReader(r)
	for {
		line, err := reader.ReadString('\n')
		if len(line) > 0 {
			cleanLine := strings.TrimRight(line, "\r\n")
			quote, shouldInclude, parseErr := p.ParseLine(cleanLine)
			if parseErr != nil {
				return parseErr
			}
			if shouldInclude && quote != nil {
				if err := handleQuote(*quote); err != nil {
					return err
				}
			}
		}
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
	}
	return nil
}

// ParseZip parses a ZIP archive containing COTAHIST_AXXXX.TXT in a streaming fashion.
func (p *Parser) ParseZip(r io.ReaderAt, size int64, handleQuote func(q Quote) error) error {
	zr, err := zip.NewReader(r, size)
	if err != nil {
		return fmt.Errorf("falha ao abrir zip: %w", err)
	}

	for _, file := range zr.File {
		upperName := strings.ToUpper(file.Name)
		if strings.Contains(upperName, "COTAHIST") || strings.HasSuffix(upperName, ".TXT") {
			rc, err := file.Open()
			if err != nil {
				return fmt.Errorf("falha ao abrir arquivo %s no zip: %w", file.Name, err)
			}
			err = p.ParseReader(rc, handleQuote)
			_ = rc.Close()
			if err != nil {
				return err
			}
		}
	}

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
