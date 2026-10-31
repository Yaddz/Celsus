package cotahist

import (
	"context"
	"database/sql"
	"testing"

	"github.com/pedro/celsus/services/market-api/internal/macro"
	_ "modernc.org/sqlite"
)

// S7-T03: TestLocalMarketSeedBootstrap
// Bootstrap e seed automático do banco de mercado Go garantindo catálogo populado
// de Ações, FIIs, Cripto e curvas CDI/IPCA para teste local imediato e idempotência.
func TestLocalMarketSeedBootstrap(t *testing.T) {
	ctx := context.Background()

	// 1. Setup Cotahist SQLite in-memory DB
	cotahistDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite cotahist: %v", err)
	}
	defer cotahistDB.Close()

	cotahistRepo := NewSQLiteRepository(cotahistDB)
	if err := cotahistRepo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema cotahist: %v", err)
	}

	// 2. Setup Macro SQLite in-memory DB
	macroDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite macro: %v", err)
	}
	defer macroDB.Close()

	macroRepo := macro.NewSQLiteRepository(macroDB)
	if err := macroRepo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema macro: %v", err)
	}

	// 3. Executa o Seed inicial
	if err := SeedMarketData(ctx, cotahistRepo, macroRepo); err != nil {
		t.Fatalf("SeedMarketData falhou na execução inicial: %v", err)
	}

	// ==========================================
	// Verificação 1: Catálogo de Ações Populado
	// ==========================================
	t.Run("Catalog_Stocks_Seeded", func(t *testing.T) {
		stocks, err := cotahistRepo.SearchCatalog(ctx, "PETR", "STOCK")
		if err != nil {
			t.Fatalf("erro ao buscar Ações no catálogo: %v", err)
		}
		if len(stocks) == 0 {
			t.Fatalf("esperava encontrar PETR no catálogo de Ações, obtido 0")
		}
		foundPETR4 := false
		for _, s := range stocks {
			if s.Ticker == "PETR4" {
				foundPETR4 = true
				if s.AssetClass != "STOCK" {
					t.Errorf("classe esperada STOCK, obtida %s", s.AssetClass)
				}
			}
		}
		if !foundPETR4 {
			t.Errorf("PETR4 não encontrada no catálogo de Ações")
		}
	})

	// ==========================================
	// Verificação 2: Catálogo de FIIs Populado
	// ==========================================
	t.Run("Catalog_FIIs_Seeded", func(t *testing.T) {
		fiis, err := cotahistRepo.SearchCatalog(ctx, "HGLG", "FII")
		if err != nil {
			t.Fatalf("erro ao buscar FIIs no catálogo: %v", err)
		}
		if len(fiis) == 0 {
			t.Fatalf("esperava encontrar HGLG11 no catálogo de FIIs, obtido 0")
		}
		if fiis[0].Ticker != "HGLG11" || fiis[0].AssetClass != "FII" {
			t.Errorf("FII incorreto: %+v", fiis[0])
		}
	})

	// ==========================================
	// Verificação 3: Catálogo de Cripto Populado
	// ==========================================
	t.Run("Catalog_Crypto_Seeded", func(t *testing.T) {
		cryptos, err := cotahistRepo.SearchCatalog(ctx, "BTC", "CRYPTO")
		if err != nil {
			t.Fatalf("erro ao buscar Cripto no catálogo: %v", err)
		}
		if len(cryptos) == 0 {
			t.Fatalf("esperava encontrar BTC no catálogo de Cripto, obtido 0")
		}
		if cryptos[0].Ticker != "BTC" || cryptos[0].AssetClass != "CRYPTO" {
			t.Errorf("Cripto incorreta: %+v", cryptos[0])
		}
	})

	// ==========================================
	// Verificação 4: Histórico de Preços
	// ==========================================
	t.Run("Historical_Quotes_Queryable", func(t *testing.T) {
		quotes, err := cotahistRepo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-12-31")
		if err != nil {
			t.Fatalf("erro ao consultar histórico de PETR4: %v", err)
		}
		if len(quotes) == 0 {
			t.Fatalf("esperava histórico de cotações para PETR4, obtido 0")
		}
		if quotes[0].Close <= 0 {
			t.Errorf("preço de fechamento inválido: %f", quotes[0].Close)
		}
	})

	// ==========================================
	// Verificação 5: Taxas Macroeconômicas (CDI / IPCA)
	// ==========================================
	t.Run("Macro_Rates_CDI_And_IPCA_Seeded", func(t *testing.T) {
		cdiRates, err := macroRepo.GetRates(ctx, "CDI", "2024-01-01", "2024-12-31")
		if err != nil {
			t.Fatalf("erro ao consultar taxas de CDI: %v", err)
		}
		if len(cdiRates) == 0 {
			t.Fatalf("esperava encontrar taxas de CDI seedadas, obtido 0")
		}

		ipcaRates, err := macroRepo.GetRates(ctx, "IPCA", "2024-01-01", "2024-12-31")
		if err != nil {
			t.Fatalf("erro ao consultar taxas de IPCA: %v", err)
		}
		if len(ipcaRates) == 0 {
			t.Fatalf("esperava encontrar taxas de IPCA seedadas, obtido 0")
		}
	})

	// ==========================================
	// Verificação 6: Idempotência do Seed
	// ==========================================
	t.Run("Seed_Idempotence", func(t *testing.T) {
		// Executar o seed uma segunda vez não deve falhar nem duplicar dados
		if err := SeedMarketData(ctx, cotahistRepo, macroRepo); err != nil {
			t.Fatalf("segunda execução de SeedMarketData falhou: %v", err)
		}

		quotes, err := cotahistRepo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-12-31")
		if err != nil {
			t.Fatalf("erro ao consultar cotações pós re-seed: %v", err)
		}
		// Verifica que não duplicou os registros para a mesma data
		dateSet := make(map[string]bool)
		for _, q := range quotes {
			if dateSet[q.Date] {
				t.Errorf("duplicação detectada para data %s em PETR4", q.Date)
			}
			dateSet[q.Date] = true
		}
	})

	// ==========================================
	// Verificação 7: Última Data Registrada
	// ==========================================
	t.Run("Last_Date_Available", func(t *testing.T) {
		lastDate, err := cotahistRepo.GetLastDate(ctx)
		if err != nil {
			t.Fatalf("erro ao buscar última data: %v", err)
		}
		if lastDate == "" {
			t.Errorf("esperava data válida em GetLastDate(), obtido vazio")
		}
	})
}
