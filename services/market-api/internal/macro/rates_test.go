package macro

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

// S1-T08: Armazenamento e consulta da série histórica diária de CDI e IPCA por intervalo de datas
func TestFetchAndStoreDailyCDIAndIPCA(t *testing.T) {
	ctx := context.Background()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite em memória: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteRepository(db)
	if err := repo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema de macro taxas: %v", err)
	}

	rates := []Rate{
		{Date: "2024-01-02", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-03", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-04", Type: "CDI", Value: 0.000460},
		{Date: "2024-01-02", Type: "SELIC", Value: 0.000455},
		{Date: "2024-01-01", Type: "IPCA", Value: 0.42},
		{Date: "2024-02-01", Type: "IPCA", Value: 0.83},
	}

	if err := repo.SaveRates(ctx, rates); err != nil {
		t.Fatalf("falha ao salvar taxas macro: %v", err)
	}

	// Consulta CDI por intervalo [2024-01-02, 2024-01-03]
	cdiRates, err := repo.GetRates(ctx, "CDI", "2024-01-02", "2024-01-03")
	if err != nil {
		t.Fatalf("falha ao buscar série de CDI: %v", err)
	}
	if len(cdiRates) != 2 {
		t.Fatalf("esperava 2 observações de CDI no período, obtido %d", len(cdiRates))
	}
	if cdiRates[0].Date != "2024-01-02" || cdiRates[0].Value != 0.000450 {
		t.Errorf("primeira taxa de CDI incorreta: %+v", cdiRates[0])
	}
	if cdiRates[1].Date != "2024-01-03" || cdiRates[1].Value != 0.000450 {
		t.Errorf("segunda taxa de CDI incorreta: %+v", cdiRates[1])
	}

	// Consulta IPCA por intervalo
	ipcaRates, err := repo.GetRates(ctx, "IPCA", "2024-01-01", "2024-02-28")
	if err != nil {
		t.Fatalf("falha ao buscar série de IPCA: %v", err)
	}
	if len(ipcaRates) != 2 {
		t.Fatalf("esperava 2 observações de IPCA, obtido %d", len(ipcaRates))
	}

	// Idempotência: re-salvar com taxa corrigida
	updatedCDI := []Rate{
		{Date: "2024-01-04", Type: "CDI", Value: 0.000475}, // corrigido
	}
	if err := repo.SaveRates(ctx, updatedCDI); err != nil {
		t.Fatalf("falha ao re-salvar taxa: %v", err)
	}

	allCDI, err := repo.GetRates(ctx, "CDI", "2024-01-01", "2024-01-10")
	if err != nil {
		t.Fatalf("falha ao buscar todas taxas CDI: %v", err)
	}
	if len(allCDI) != 3 {
		t.Fatalf("re-salvar duplicou linha! Esperado 3 taxas CDI, obtido %d", len(allCDI))
	}
	if allCDI[2].Value != 0.000475 {
		t.Errorf("taxa corrigida não foi atualizada no banco: esperado 0.000475, obtido %f", allCDI[2].Value)
	}
}
