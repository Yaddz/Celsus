package cotahist

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

// S1-T05: Reimportar o mesmo arquivo COTAHIST não duplica linhas (INSERT OR REPLACE)
func TestIdempotentBatchUpsert(t *testing.T) {
	ctx := context.Background()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite em memória: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteRepository(db)
	if err := repo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema: %v", err)
	}

	batch1 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      38.50,
			Volume:     500000.00,
		},
		{
			Date:       "2024-01-02",
			Ticker:     "HGLG11",
			AssetClass: "FII",
			Name:       "CSHG LOGISTICA",
			Open:       160.00,
			High:       163.00,
			Low:        159.50,
			Close:      162.50,
			Volume:     150000.00,
		},
	}

	// 1ª Inserção em batch
	if err := repo.UpsertQuotes(ctx, batch1); err != nil {
		t.Fatalf("falha no primeiro lote de upsert: %v", err)
	}

	quotes, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil {
		t.Fatalf("falha ao buscar cotações PETR4: %v", err)
	}
	if len(quotes) != 1 {
		t.Fatalf("esperava 1 cotação para PETR4, obtido %d", len(quotes))
	}
	if quotes[0].Close != 38.50 {
		t.Errorf("preço esperado 38.50, obtido %.2f", quotes[0].Close)
	}

	// 2ª Inserção idêntica com preço corrigido (reimportação do arquivo)
	batch2 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      39.10, // Preço retificado
			Volume:     550000.00,
		},
		{
			Date:       "2024-01-02",
			Ticker:     "HGLG11",
			AssetClass: "FII",
			Name:       "CSHG LOGISTICA",
			Open:       160.00,
			High:       163.00,
			Low:        159.50,
			Close:      162.50,
			Volume:     150000.00,
		},
	}

	if err := repo.UpsertQuotes(ctx, batch2); err != nil {
		t.Fatalf("falha no segundo lote de upsert idempotente: %v", err)
	}

	// Verifica se a reimportação não duplicou o registro
	quotesAfter, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil {
		t.Fatalf("falha ao buscar cotações após reimportação: %v", err)
	}
	if len(quotesAfter) != 1 {
		t.Fatalf("reimportação duplicou linhas! Esperado 1 registro, obtido %d", len(quotesAfter))
	}
	if quotesAfter[0].Close != 39.10 {
		t.Errorf("preço não foi atualizado na reimportação: esperado 39.10, obtido %.2f", quotesAfter[0].Close)
	}

	// Verifica GetLastDate
	lastDate, err := repo.GetLastDate(ctx)
	if err != nil {
		t.Fatalf("falha ao buscar última data: %v", err)
	}
	if lastDate != "2024-01-02" {
		t.Errorf("última data esperada 2024-01-02, obtido %s", lastDate)
	}

	// Verifica catálogo
	catalog, err := repo.SearchCatalog(ctx, "PETR", "STOCK")
	if err != nil {
		t.Fatalf("falha ao buscar catálogo: %v", err)
	}
	if len(catalog) != 1 || catalog[0].Ticker != "PETR4" {
		t.Errorf("busca no catálogo falhou: %+v", catalog)
	}
}
