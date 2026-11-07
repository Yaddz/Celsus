package fundamentals

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/pedro/celsus/services/market-api/internal/yahoo"
)

// Fundamentus devolve páginas em ISO-8859-1 e cada rótulo vem precedido de um "?" (ícone de ajuda).
// Este parser decodifica o texto, normaliza os rótulos (sem "?", acento ou caixa) e lê os pares
// rótulo/valor da tabela, usando a primeira ocorrência de cada rótulo.

var fundamentusPairRegex = regexp.MustCompile(`(?is)<td[^>]*class="label[^"]*"[^>]*>(.*?)</td>\s*<td[^>]*class="data[^"]*"[^>]*>(.*?)</td>`)

var accentReplacer = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "ê", "e", "è", "e",
	"í", "i", "î", "i",
	"ó", "o", "ô", "o", "õ", "o", "ò", "o",
	"ú", "u", "û", "u", "ü", "u",
	"ç", "c",
)

// latin1ToUTF8 converte bytes ISO-8859-1 em UTF-8 (cada byte é o próprio code point).
func latin1ToUTF8(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	runes := make([]rune, len(b))
	for i, c := range b {
		runes[i] = rune(c)
	}
	return string(runes)
}

func normalizeLabel(raw string) string {
	l := strings.ToLower(stripHTML(raw))
	l = strings.TrimSpace(strings.TrimPrefix(l, "?"))
	l = accentReplacer.Replace(l)
	return strings.Join(strings.Fields(l), " ")
}

// parseFundamentusPairs devolve rótulo normalizado → valor (primeira ocorrência).
func parseFundamentusPairs(html string) map[string]string {
	out := make(map[string]string)
	for _, m := range fundamentusPairRegex.FindAllStringSubmatch(html, -1) {
		if len(m) < 3 {
			continue
		}
		label := normalizeLabel(m[1])
		if label == "" {
			continue
		}
		if _, exists := out[label]; !exists {
			out[label] = stripHTML(m[2])
		}
	}
	return out
}

// ParseFundamentusProfile transforma o HTML (já em UTF-8) de detalhes.php em AssetProfileDTO.
// Retorna erro se a página não trouxer cotação (ativo inexistente ou layout inesperado).
func ParseFundamentusProfile(html, ticker, assetClass string) (*AssetProfileDTO, error) {
	pairs := parseFundamentusPairs(html)
	num := func(keys ...string) (float64, bool) {
		for _, k := range keys {
			if v, ok := pairs[k]; ok && strings.TrimSpace(v) != "" && strings.TrimSpace(v) != "-" {
				return parseBrazilianFloat(v), true
			}
		}
		return 0, false
	}

	price, ok := num("cotacao")
	if !ok || price <= 0 {
		return nil, fmt.Errorf("fundamentus: cotação não encontrada para %s", ticker)
	}

	indicators := make(map[string]interface{})
	set := func(key string, keys ...string) {
		if v, ok := num(keys...); ok {
			indicators[key] = v
		}
	}
	set("dy", "div. yield")
	set("pl", "p/l")
	set("pvp", "p/vp")
	set("roe", "roe")
	set("marketCap", "valor de mercado")
	set("dailyLiquidity", "vol $ med (2m)")
	set("netMargin", "marg. liquida")
	set("netDebtEbitda", "div liq / ebitda", "div. liquida/ebitda")
	set("netWorth", "patrim liquido", "patrim. liq")
	set("vacancy", "vacancia media")
	set("ffoYield", "ffo yield")
	if lo, okLo := num("min 52 sem"); okLo {
		if hi, okHi := num("max 52 sem"); okHi {
			indicators["range52w"] = fmt.Sprintf("%.2f – %.2f", lo, hi)
		}
	}

	name := firstNonEmpty(pairs["empresa"], pairs["nome"], ticker)
	sector := firstNonEmpty(pairs["setor"], pairs["segmento"])
	shares := firstNonEmpty(pairs["nro. acoes"], pairs["nro. cotas"])

	dto := &AssetProfileDTO{
		Ticker:            strings.ToUpper(ticker),
		Name:              name,
		AssetClass:        assetClass,
		Price:             price,
		Indicators:        indicators,
		CompanyName:       name,
		Sector:            sector,
		SharesOutstanding: shares,
		Source:            "FUNDAMENTUS",
		UpdatedAt:         nowUTC(),
		IsStale:           false,
	}
	if d, ok := num("dia"); ok {
		dto.Change24h = d
	}
	if d, ok := num("12 meses"); ok {
		dto.Change12m = d
	}
	return dto, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// FundamentusProvider busca a página pública de detalhes do papel (ações e FIIs).
type FundamentusProvider struct {
	baseURL    string
	httpClient *http.Client
}

// FundamentusFallbackProvider mantém o nome antigo por compatibilidade.
type FundamentusFallbackProvider = FundamentusProvider

func NewFundamentusProvider(baseURL string) *FundamentusProvider {
	if baseURL == "" {
		baseURL = "https://www.fundamentus.com.br"
	}
	return &FundamentusProvider{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Timeout: 10 * secondDuration},
	}
}

func NewFundamentusFallbackProvider(baseURL string) *FundamentusProvider {
	return NewFundamentusProvider(baseURL)
}

func (f *FundamentusProvider) FetchProfile(ctx context.Context, ticker string, assetClass string) (*AssetProfileDTO, error) {
	clean := strings.ToUpper(strings.TrimSpace(ticker))
	if assetClass == "CRYPTO" || assetClass == "FIXED_INCOME" {
		return nil, fmt.Errorf("fundamentus não cobre a classe %s", assetClass)
	}
	url := fmt.Sprintf("%s/detalhes.php?papel=%s", f.baseURL, clean)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", yahoo.DefaultUserAgent)
	req.Header.Set("Accept", "text/html")

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fundamentus network error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fundamentus returned status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	return ParseFundamentusProfile(latin1ToUTF8(body), clean, assetClass)
}
