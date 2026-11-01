package macro

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
	}
}

type bcbSGSDataPoint struct {
	Data  string `json:"data"`  // DD/MM/YYYY
	Valor string `json:"valor"` // decimal string
}

func toBCBDateFormat(dateStr string) (string, error) {
	trimmed := strings.TrimSpace(dateStr)
	if strings.Contains(trimmed, "/") {
		return trimmed, nil
	}
	t, err := time.Parse("2006-01-02", trimmed)
	if err != nil {
		return "", fmt.Errorf("formato de data invalido %q: %w", dateStr, err)
	}
	return t.Format("02/01/2006"), nil
}

func fromBCBDateFormat(bcbDate string) (string, error) {
	trimmed := strings.TrimSpace(bcbDate)
	t, err := time.Parse("02/01/2006", trimmed)
	if err != nil {
		return "", fmt.Errorf("data BCB invalida %q: %w", bcbDate, err)
	}
	return t.Format("2006-01-02"), nil
}

func seriesCodeToRateType(seriesCode int) string {
	switch seriesCode {
	case SeriesCDI:
		return "CDI"
	case SeriesIPCA:
		return "IPCA"
	default:
		return fmt.Sprintf("SGS_%d", seriesCode)
	}
}

// FetchSGSSeries fetches a BCB SGS series (12 = CDI, 433 = IPCA) for [fromDate, toDate] (accepts YYYY-MM-DD or DD/MM/YYYY)
// and returns normalized Rate structs with YYYY-MM-DD dates.
func (c *BCBClient) FetchSGSSeries(ctx context.Context, seriesCode int, fromDate, toDate string) ([]Rate, error) {
	fromBR, err := toBCBDateFormat(fromDate)
	if err != nil {
		return nil, err
	}
	toBR, err := toBCBDateFormat(toDate)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/dados/serie/bcdata.sgs.%d/dados?formato=json&dataInicial=%s&dataFinal=%s",
		c.baseURL, seriesCode, fromBR, toBR)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("falha ao criar requisicao BCB SGS: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("erro ao consultar BCB SGS serie %d: %w", seriesCode, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status inesperado do BCB SGS serie %d: %d", seriesCode, resp.StatusCode)
	}

	var rawPoints []bcbSGSDataPoint
	if err := json.NewDecoder(resp.Body).Decode(&rawPoints); err != nil {
		return nil, fmt.Errorf("falha ao decodificar JSON do BCB SGS serie %d: %w", seriesCode, err)
	}

	rateType := seriesCodeToRateType(seriesCode)
	rates := make([]Rate, 0, len(rawPoints))

	for _, pt := range rawPoints {
		isoDate, err := fromBCBDateFormat(pt.Data)
		if err != nil {
			continue
		}
		cleanVal := strings.ReplaceAll(strings.TrimSpace(pt.Valor), ",", ".")
		if cleanVal == "" {
			continue
		}
		val, err := strconv.ParseFloat(cleanVal, 64)
		if err != nil {
			continue
		}
		rates = append(rates, Rate{
			Date:  isoDate,
			Type:  rateType,
			Value: val,
		})
	}

	return rates, nil
}

// SyncIncrementalRates checks the last stored date for CDI and IPCA in repo and fetches only newer observations up to targetDate.
func (c *BCBClient) SyncIncrementalRates(ctx context.Context, repo Repository, targetDate string) (int, error) {
	if repo == nil {
		return 0, fmt.Errorf("macro repository nao pode ser nil")
	}

	targetISO := strings.TrimSpace(targetDate)
	if targetISO == "" {
		targetISO = time.Now().UTC().Format("2006-01-02")
	}

	seriesList := []struct {
		code     int
		rateType string
	}{
		{code: SeriesCDI, rateType: "CDI"},
		{code: SeriesIPCA, rateType: "IPCA"},
	}

	totalSynced := 0

	for _, item := range seriesList {
		lastDate, err := repo.GetLastDate(ctx, item.rateType)
		if err != nil {
			return totalSynced, fmt.Errorf("falha ao obter ultima data de %s: %w", item.rateType, err)
		}

		startISO := "2020-01-01"
		if lastDate != "" {
			parsedLast, err := time.Parse("2006-01-02", lastDate)
			if err != nil {
				return totalSynced, fmt.Errorf("ultima data invalida no banco (%s): %w", lastDate, err)
			}
			startISO = parsedLast.AddDate(0, 0, 1).Format("2006-01-02")
		}

		if startISO > targetISO {
			continue
		}

		fetched, err := c.FetchSGSSeries(ctx, item.code, startISO, targetISO)
		if err != nil {
			return totalSynced, err
		}

		var delta []Rate
		for _, r := range fetched {
			if lastDate == "" || r.Date > lastDate {
				delta = append(delta, r)
			}
		}

		if len(delta) > 0 {
			if err := repo.SaveRates(ctx, delta); err != nil {
				return totalSynced, err
			}
			totalSynced += len(delta)
		}
	}

	return totalSynced, nil
}
