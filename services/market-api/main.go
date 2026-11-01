package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pedro/celsus/services/market-api/internal/brapi"
	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	appHttp "github.com/pedro/celsus/services/market-api/internal/http"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/quotes"
	"github.com/pedro/celsus/services/market-api/internal/yahoo"
	_ "modernc.org/sqlite"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	dbPath := os.Getenv("MARKET_DB_PATH")
	if dbPath == "" {
		dbPath = "market.db"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	brapiToken := os.Getenv("BRAPI_TOKEN")

	log.Printf("[CELSUS MARKET-API] Inicializando banco SQLite em: %s", dbPath)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Erro ao abrir banco SQLite: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cotahistRepo := cotahist.NewSQLiteRepository(db)
	if err := cotahistRepo.InitSchema(ctx); err != nil {
		log.Fatalf("Erro ao inicializar schema cotahist: %v", err)
	}

	macroRepo := macro.NewSQLiteRepository(db)
	if err := macroRepo.InitSchema(ctx); err != nil {
		log.Fatalf("Erro ao inicializar schema macro: %v", err)
	}

	log.Println("[CELSUS MARKET-API] Executando seed de catálogo de mercado (Ações, FIIs, Cripto e Curvas CDI/IPCA)...")
	if err := cotahist.SeedMarketData(ctx, cotahistRepo, macroRepo); err != nil {
		log.Printf("Aviso: seed de mercado retornou: %v", err)
	} else {
		log.Println("[CELSUS MARKET-API] Seed concluído com sucesso!")
	}

	var quoteProvider quotes.QuoteProvider
	if brapiToken != "" {
		quoteProvider = brapi.NewClient(brapiToken, "https://brapi.dev", 15*time.Minute)
	} else {
		quoteProvider = yahoo.NewDefaultClient(15 * time.Minute)
	}

	server := appHttp.NewServer(cotahistRepo, quoteProvider, macroRepo)
	handler := corsMiddleware(server.Router())

	addr := fmt.Sprintf(":%s", port)
	log.Printf("[CELSUS MARKET-API] Servidor HTTP de mercado ouvindo em http://localhost%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Erro ao subir servidor HTTP: %v", err)
	}
}
