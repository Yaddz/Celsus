package macro

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
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

// S20-T05: Cliente BCB SGS (Séries #12 CDI e #433 IPCA) com conversão DD/MM/YYYY -> YYYY-MM-DD e sincronização incremental
func TestBCBClient_FetchIncrementalCDIAndIPCA(t *testing.T) {
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

	// Seed inicial até 2026-01-02 (CDI) e 2026-01-01 (IPCA)
	initialRates := []Rate{
		{Date: "2026-01-02", Type: "CDI", Value: 0.050788},
		{Date: "2026-01-01", Type: "IPCA", Value: 0.33},
	}
	if err := repo.SaveRates(ctx, initialRates); err != nil {
		t.Fatalf("falha ao salvar seed inicial: %v", err)
	}

	lastCDI, err := repo.GetLastDate(ctx, "CDI")
	if err != nil {
		t.Fatalf("erro ao consultar GetLastDate(CDI): %v", err)
	}
	if lastCDI != "2026-01-02" {
		t.Fatalf("esperava GetLastDate(CDI) == '2026-01-02', obtido %q", lastCDI)
	}

	var sgsRequests int32
	var receivedCDIDataInicial string

	mockBCB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&sgsRequests, 1)

		if r.URL.Query().Get("formato") != "json" {
			http.Error(w, "formato=json obrigatório", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/dados/serie/bcdata.sgs.12/dados":
			receivedCDIDataInicial = r.URL.Query().Get("dataInicial")
			_, _ = w.Write([]byte(`[
				{"data":"05/01/2026","valor":"0.050788"},
				{"data":"06/01/2026","valor":"0.051000"}
			]`))
		case "/dados/serie/bcdata.sgs.433/dados":
			_, _ = w.Write([]byte(`[
				{"data":"01/02/2026","valor":"0.48"}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer mockBCB.Close()

	bcbClient := NewBCBClient(mockBCB.URL, mockBCB.Client())

	// Sincronização incremental até 2026-02-15
	syncedCount, err := bcbClient.SyncIncrementalRates(ctx, repo, "2026-02-15")
	if err != nil {
		t.Fatalf("falha em SyncIncrementalRates: %v", err)
	}
	if syncedCount != 3 {
		t.Fatalf("esperava 3 novas taxas sincronizadas (2 CDI + 1 IPCA), obtido %d", syncedCount)
	}

	// Verifica se buscou incrementalmente a partir do dia seguinte a 2026-01-02 (03/01/2026)
	if receivedCDIDataInicial != "03/01/2026" {
		t.Errorf("esperava dataInicial incremental '03/01/2026' para CDI, obtido %q", receivedCDIDataInicial)
	}

	// Verifica persistência e conversão de data DD/MM/YYYY -> YYYY-MM-DD no banco
	cdiAll, err := repo.GetRates(ctx, "CDI", "2026-01-01", "2026-01-31")
	if err != nil {
		t.Fatalf("falha ao consultar CDI após sync: %v", err)
	}
	if len(cdiAll) != 3 {
		t.Fatalf("esperava 3 registros de CDI no banco após sync incremental, obtido %d", len(cdiAll))
	}
	if cdiAll[1].Date != "2026-01-05" || cdiAll[1].Value != 0.050788 {
		t.Errorf("registro incremental de CDI incorreto: %+v", cdiAll[1])
	}
	if cdiAll[2].Date != "2026-01-06" || cdiAll[2].Value != 0.051000 {
		t.Errorf("registro incremental de CDI incorreto: %+v", cdiAll[2])
	}

	ipcaAll, err := repo.GetRates(ctx, "IPCA", "2026-01-01", "2026-02-28")
	if err != nil {
		t.Fatalf("falha ao consultar IPCA após sync: %v", err)
	}
	if len(ipcaAll) != 2 || ipcaAll[1].Date != "2026-02-01" || ipcaAll[1].Value != 0.48 {
		t.Errorf("registros de IPCA após sync incorretos: %+v", ipcaAll)
	}
}
