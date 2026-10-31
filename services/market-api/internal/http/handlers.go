package http

import (
	"net/http"
)

// handleHealth returns server status, cotahist last date, and brapi status.
func (s *Server) handleHealth() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Stub for Phase A (TDD Red Phase)
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}

// handleCatalogSearch searches tickers and names for autocomplete.
func (s *Server) handleCatalogSearch() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Stub for Phase A (TDD Red Phase)
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}

// handleQuotes returns current prices for given tickers.
func (s *Server) handleQuotes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Stub for Phase A (TDD Red Phase)
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}

// handleHistory returns historical closing prices for given tickers.
func (s *Server) handleHistory() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Stub for Phase A (TDD Red Phase)
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}

// handleRatesMacro returns daily historical macro rates (CDI, SELIC, IPCA).
func (s *Server) handleRatesMacro() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Stub for Phase A (TDD Red Phase)
		http.Error(w, "not implemented", http.StatusNotImplemented)
	}
}
