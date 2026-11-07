package fundamentals

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeProvider struct {
	data map[string]*AssetProfileDTO
}

func (f fakeProvider) FetchProfile(_ context.Context, ticker, _ string) (*AssetProfileDTO, error) {
	if d, ok := f.data[ticker]; ok {
		return d, nil
	}
	return nil, errors.New("sem dados")
}

type memCache struct {
	mu sync.Mutex
	m  map[string]*AssetProfileDTO
}

func (c *memCache) Load(_ context.Context, t string) (*AssetProfileDTO, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	d, ok := c.m[t]
	return d, ok
}
func (c *memCache) Save(_ context.Context, t string, d *AssetProfileDTO) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.m[t] = d
}

func prof(t string, price, dy, pvp float64) *AssetProfileDTO {
	return &AssetProfileDTO{Ticker: t, Name: t + " S.A.", Price: price, Change24h: 1,
		Indicators: map[string]interface{}{"dy": dy, "pvp": pvp}}
}

func TestBuildRanking_CacheVazio_HidrataEOrdenaComNulosPorUltimo(t *testing.T) {
	items := []CatalogItem{
		{"AAAA11", "Fundo A", "FII"}, {"BBBB11", "Fundo B", "FII"},
		{"CCCC11", "Fundo C", "FII"}, {"DDDD11", "Fundo D", "FII"},
	}
	provider := fakeProvider{data: map[string]*AssetProfileDTO{
		"AAAA11": prof("AAAA11", 10, 8, 0.9),
		"BBBB11": prof("BBBB11", 20, 14, 1.1),
		"DDDD11": prof("DDDD11", 30, 11, 0.8),
	}} // CCCC11 falha
	cache := &memCache{m: map[string]*AssetProfileDTO{}}

	got := BuildRanking(context.Background(), items, cache, provider, "dy", 10, 5*time.Second)
	if len(got) != 4 {
		t.Fatalf("o ranking deve manter todos os itens do catálogo, veio %d", len(got))
	}
	order := []string{got[0].Ticker, got[1].Ticker, got[2].Ticker, got[3].Ticker}
	want := []string{"BBBB11", "DDDD11", "AAAA11", "CCCC11"}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("ordem = %v, want %v", order, want)
		}
	}
	if got[3].DY12m != nil || got[3].PVP != nil {
		t.Errorf("item sem dados deve ter DY/P-VP nulos (nunca 0): %+v", got[3])
	}
	if got[3].Name != "Fundo C" {
		t.Errorf("sem perfil, o nome vem do catálogo: %q", got[3].Name)
	}
	if _, ok := cache.m["BBBB11"]; !ok {
		t.Errorf("perfil hidratado deve ser gravado no cache")
	}
}

func TestBuildRanking_PVPCrescenteELimite(t *testing.T) {
	items := []CatalogItem{{"AAAA11", "A", "FII"}, {"BBBB11", "B", "FII"}, {"CCCC11", "C", "FII"}}
	provider := fakeProvider{data: map[string]*AssetProfileDTO{
		"AAAA11": prof("AAAA11", 10, 8, 0.9),
		"BBBB11": prof("BBBB11", 20, 14, 0.7),
		"CCCC11": prof("CCCC11", 30, 11, 1.2),
	}}
	got := BuildRanking(context.Background(), items, &memCache{m: map[string]*AssetProfileDTO{}}, provider, "pvp", 2, time.Second)
	if len(got) != 2 || got[0].Ticker != "BBBB11" || got[1].Ticker != "AAAA11" {
		t.Fatalf("P/VP crescente com limite 2: %+v", got)
	}
}

func TestBuildRanking_SemProvedorNemCache_DevolveCatalogo(t *testing.T) {
	items := []CatalogItem{{"ZZZZ3", "Zeta", "STOCK"}, {"AAAA3", "Alfa", "STOCK"}}
	got := BuildRanking(context.Background(), items, nil, nil, "dy", 10, time.Second)
	if len(got) != 2 || got[0].Ticker != "AAAA3" {
		t.Fatalf("sem dados nenhum, lista o catálogo em ordem alfabética: %+v", got)
	}
}
