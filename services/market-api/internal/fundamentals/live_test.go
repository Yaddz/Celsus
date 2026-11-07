package fundamentals

import (
	"context"
	"os"
	"testing"
	"time"
)

// Teste manual contra o site real: CELSUS_LIVE=1 go test ./internal/fundamentals -run Live -v
func TestLive_Fundamentus(t *testing.T) {
	if os.Getenv("CELSUS_LIVE") != "1" {
		t.Skip("defina CELSUS_LIVE=1 para testar contra o Fundamentus real")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	p := NewFundamentusProvider("")
	for _, c := range []struct{ ticker, class string }{{"PETR4", "STOCK"}, {"VALE3", "STOCK"}, {"MXRF11", "FII"}, {"KNCR11", "FII"}} {
		dto, err := p.FetchProfile(ctx, c.ticker, c.class)
		if err != nil {
			t.Errorf("%s: %v", c.ticker, err)
			continue
		}
		t.Logf("%s: %q preço=%.2f dia=%.2f setor=%q ind=%v", c.ticker, dto.Name, dto.Price, dto.Change24h, dto.Sector, dto.Indicators)
	}
}
