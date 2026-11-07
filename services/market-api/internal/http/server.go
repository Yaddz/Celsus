package http

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/fundamentals"
	"github.com/pedro/celsus/services/market-api/internal/macro"
	"github.com/pedro/celsus/services/market-api/internal/quotes"
)

// Server sets up the HTTP router and dependency injection.
type Server struct {
	router               *chi.Mux
	cotahistRepo         cotahist.Repository
	quoteProvider        quotes.QuoteProvider
	macroRepo            macro.Repository
	fundamentalsProvider fundamentals.FundamentalsProvider
	db                   *sql.DB
}

// NewServer creates a new HTTP server with chi router and registered endpoints.
func NewServer(cotahistRepo cotahist.Repository, quoteProvider quotes.QuoteProvider, macroRepo macro.Repository) *Server {
	s := &Server{
		router:        chi.NewRouter(),
		cotahistRepo:  cotahistRepo,
		quoteProvider: quoteProvider,
		macroRepo:     macroRepo,
	}

	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)

	s.routes()

	return s
}

func (s *Server) SetFundamentalsProvider(fp fundamentals.FundamentalsProvider) {
	s.fundamentalsProvider = fp
}

func (s *Server) SetDB(db *sql.DB) {
	s.db = db
}

// Router returns the underlying http.Handler.
func (s *Server) Router() http.Handler {
	return s.router
}

func (s *Server) routes() {
	s.router.Route("/v1", func(r chi.Router) {
		r.Get("/health", s.handleHealth())
		r.Get("/catalog/search", s.handleCatalogSearch())
		r.Get("/quotes", s.handleQuotes())
		r.Get("/history", s.handleHistory())
		r.Get("/rates/macro", s.handleRatesMacro())
		r.Get("/assets/{ticker}/profile", s.handleAssetProfile())
		r.Get("/assets/{ticker}/history", s.handleAssetPriceHistory())
		r.Get("/assets/{ticker}/dividends", s.handleAssetDividends())
		r.Get("/rankings", s.handleRankings())
	})
}
