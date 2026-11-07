package mobilebridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Teste manual do mesmo caminho que o Android usa (sem JNI), contra o Fundamentus real:
// CELSUS_LIVE=1 go test ./pkg/mobilebridge -run Live -v
func TestLive_RankingEPerfilComBancoNovo(t *testing.T) {
	if os.Getenv("CELSUS_LIVE") != "1" {
		t.Skip("defina CELSUS_LIVE=1")
	}
	db := filepath.Join(t.TempDir(), "fresh.db") // app recém-instalado: cache vazio
	if err := InitEngine(db, true); err != nil {
		t.Fatal(err)
	}
	defer CloseEngine()

	out, err := GetRankingJSON("FII", "dy", 20)
	if err != nil {
		t.Fatal(err)
	}
	var r struct {
		Rankings []struct {
			Ticker string   `json:"ticker"`
			Name   string   `json:"name"`
			Price  float64  `json:"price"`
			DY     *float64 `json:"dy12m"`
			PVP    *float64 `json:"pvp"`
		} `json:"rankings"`
	}
	if err := json.Unmarshal([]byte(out), &r); err != nil {
		t.Fatal(err)
	}
	if len(r.Rankings) == 0 {
		t.Fatalf("ranking de FIIs veio vazio com cache frio: %s", out)
	}
	withData := 0
	for _, e := range r.Rankings {
		if e.DY != nil {
			withData++
		}
		t.Logf("%-8s %-35.35s preço=%8.2f dy=%v pvp=%v", e.Ticker, e.Name, e.Price, deref(e.DY), deref(e.PVP))
	}
	if withData == 0 {
		t.Errorf("nenhum FII veio com DY (fonte de fundamentos indisponível?)")
	}

	prof, err := GetAssetProfileJSON("PETR4")
	if err != nil {
		t.Fatal(err)
	}
	var p map[string]interface{}
	_ = json.Unmarshal([]byte(prof), &p)
	t.Logf("PETR4: name=%v price=%v source=%v sector=%v", p["name"], p["price"], p["source"], p["sector"])
	if pr, _ := p["price"].(float64); pr <= 0 || p["source"] == "OFFLINE" {
		t.Errorf("perfil PETR4 sem dados: %s", prof)
	}
}

func deref(f *float64) interface{} {
	if f == nil {
		return nil
	}
	return *f
}
