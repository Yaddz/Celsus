package fundamentals

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"sync"
	"time"
)

// CatalogItem é um ativo do catálogo local (tabela catalog_assets).
type CatalogItem struct {
	Ticker     string
	Name       string
	AssetClass string
}

// RankingEntry é uma linha do ranking. DY/P-VP/variação são ponteiros: ausentes viram null no JSON
// (nunca 0), para a tela mostrar "—" e a ordenação colocar esses itens por último.
type RankingEntry struct {
	Ticker     string   `json:"ticker"`
	Name       string   `json:"name"`
	AssetClass string   `json:"asset_class"`
	Price      float64  `json:"price"`
	DY12m      *float64 `json:"dy12m"`
	PVP        *float64 `json:"pvp"`
	Change24h  *float64 `json:"change_24h"`
}

// ProfileCache guarda perfis já buscados (válidos por ProfileTTL).
type ProfileCache interface {
	Load(ctx context.Context, ticker string) (*AssetProfileDTO, bool)
	Save(ctx context.Context, ticker string, dto *AssetProfileDTO)
}

const ProfileTTL = 12 * time.Hour

// SQLProfileCache implementa ProfileCache sobre a tabela asset_profiles do market.db.
type SQLProfileCache struct{ DB *sql.DB }

func (c SQLProfileCache) ensure(ctx context.Context) {
	_, _ = c.DB.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS asset_profiles (
		ticker TEXT PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL)`)
}

func (c SQLProfileCache) Load(ctx context.Context, ticker string) (*AssetProfileDTO, bool) {
	if c.DB == nil {
		return nil, false
	}
	c.ensure(ctx)
	var raw, updated string
	if err := c.DB.QueryRowContext(ctx, "SELECT profile_json, updated_at FROM asset_profiles WHERE ticker = ?", ticker).Scan(&raw, &updated); err != nil {
		return nil, false
	}
	var dto AssetProfileDTO
	if err := json.Unmarshal([]byte(raw), &dto); err != nil || dto.Price <= 0 {
		return nil, false
	}
	t, err := time.Parse(time.RFC3339, updated)
	fresh := err == nil && time.Since(t) < ProfileTTL
	return &dto, fresh
}

func (c SQLProfileCache) Save(ctx context.Context, ticker string, dto *AssetProfileDTO) {
	if c.DB == nil || dto == nil || dto.Price <= 0 {
		return
	}
	c.ensure(ctx)
	b, err := json.Marshal(dto)
	if err != nil {
		return
	}
	_, _ = c.DB.ExecContext(ctx, `INSERT INTO asset_profiles (ticker, profile_json, updated_at) VALUES (?, ?, ?)
		ON CONFLICT(ticker) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`,
		ticker, string(b), time.Now().UTC().Format(time.RFC3339))
}

// LoadCatalog lê os ativos de uma classe (ou todos, se class == "") do catálogo local.
func LoadCatalog(ctx context.Context, db *sql.DB, class string) []CatalogItem {
	if db == nil {
		return nil
	}
	q := "SELECT ticker, name, asset_class FROM catalog_assets"
	args := []interface{}{}
	if class != "" {
		q += " WHERE asset_class = ?"
		args = append(args, class)
	}
	q += " ORDER BY ticker"
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []CatalogItem
	for rows.Next() {
		var it CatalogItem
		if rows.Scan(&it.Ticker, &it.Name, &it.AssetClass) == nil {
			out = append(out, it)
		}
	}
	return out
}

func indicatorFloat(m map[string]interface{}, key string) *float64 {
	if v, ok := m[key].(float64); ok {
		return &v
	}
	return nil
}

// BuildRanking monta o ranking de uma classe. Perfis ausentes/vencidos são buscados sob demanda
// (concorrência 4, dentro de `budget`) e gravados no cache; quem não conseguir dado continua na
// lista, com indicadores nulos. Ordena por `by` (dy | pvp | change | price | ticker), nulos por último.
func BuildRanking(ctx context.Context, items []CatalogItem, cache ProfileCache, provider FundamentalsProvider,
	by string, limit int, budget time.Duration) []RankingEntry {

	if limit <= 0 {
		limit = 20
	}
	profiles := make(map[string]*AssetProfileDTO, len(items))
	var missing []CatalogItem
	for _, it := range items {
		if cache != nil {
			if dto, fresh := cache.Load(ctx, it.Ticker); dto != nil {
				profiles[it.Ticker] = dto
				if fresh {
					continue
				}
			}
		}
		missing = append(missing, it)
	}

	if provider != nil && len(missing) > 0 {
		hctx, cancel := context.WithTimeout(ctx, budget)
		defer cancel()
		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)
		for _, it := range missing {
			wg.Add(1)
			go func(it CatalogItem) {
				defer wg.Done()
				select {
				case sem <- struct{}{}:
					defer func() { <-sem }()
				case <-hctx.Done():
					return
				}
				dto, err := provider.FetchProfile(hctx, it.Ticker, it.AssetClass)
				if err != nil || dto == nil || dto.Price <= 0 {
					return
				}
				if cache != nil {
					cache.Save(ctx, it.Ticker, dto)
				}
				mu.Lock()
				profiles[it.Ticker] = dto
				mu.Unlock()
			}(it)
		}
		wg.Wait()
	}

	out := make([]RankingEntry, 0, len(items))
	for _, it := range items {
		e := RankingEntry{Ticker: it.Ticker, Name: it.Name, AssetClass: it.AssetClass}
		if dto := profiles[it.Ticker]; dto != nil {
			e.Price = dto.Price
			e.DY12m = indicatorFloat(dto.Indicators, "dy")
			e.PVP = indicatorFloat(dto.Indicators, "pvp")
			ch := dto.Change24h
			e.Change24h = &ch
		}
		out = append(out, e)
	}

	key := func(e RankingEntry) (float64, bool) {
		switch by {
		case "pvp":
			if e.PVP != nil {
				return *e.PVP, true
			}
		case "change":
			if e.Change24h != nil {
				return *e.Change24h, true
			}
		case "price":
			if e.Price > 0 {
				return e.Price, true
			}
		default:
			if e.DY12m != nil {
				return *e.DY12m, true
			}
		}
		return 0, false
	}
	asc := by == "pvp"
	sort.SliceStable(out, func(i, j int) bool {
		a, aok := key(out[i])
		b, bok := key(out[j])
		if aok != bok {
			return aok // com dado vem antes
		}
		if !aok || a == b {
			return out[i].Ticker < out[j].Ticker
		}
		if asc {
			return a < b
		}
		return a > b
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
