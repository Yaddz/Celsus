package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/pedro/celsus/services/market-api/internal/brapi"
	"github.com/pedro/celsus/services/market-api/internal/cotahist"
	"github.com/pedro/celsus/services/market-api/internal/macro"
)

// Server sets up the HTTP router and dependency injection.
type Server struct {
	router       *chi.Mux
	cotahistRepo cotahist.Repository
	brapiClient  *brapi.Client
	macroRepo    macro.Repository
}

// NewServer creates a new HTTP server with chi router and registered endpoints.
func NewServer(cotahistRepo cotahist.Repository, brapiClient *brapi.Client, macroRepo macro.Repository) *Server {
	s := &Server{
		router:       chi.NewRouter(),
		cotahistRepo: cotahistRepo,
		brapiClient:  brapiClient,
		macroRepo:    macroRepo,
	}

	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)

	s.routes()

	return s
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
	})
}
