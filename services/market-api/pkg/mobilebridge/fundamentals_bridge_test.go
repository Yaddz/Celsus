package mobilebridge

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestFundamentalsBridgeMethods(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_fundamentals.db")
	if err := InitEngine(dbPath, false); err != nil {
		t.Fatalf("failed to init engine: %v", err)
	}
	defer CloseEngine()

	t.Run("GetAssetProfileJSON", func(t *testing.T) {
		jsonStr, err := GetAssetProfileJSON("PETR4")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if parsed["ticker"] != "PETR4" {
			t.Errorf("expected PETR4, got %v", parsed["ticker"])
		}
	})

	t.Run("GetPriceHistoryJSON", func(t *testing.T) {
		jsonStr, err := GetPriceHistoryJSON("PETR4", "1y")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := parsed["history"]; !ok {
			t.Errorf("expected history field in response")
		}
	})

	t.Run("GetDividendsJSON", func(t *testing.T) {
		jsonStr, err := GetDividendsJSON("PETR4")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := parsed["dividends"]; !ok {
			t.Errorf("expected dividends field in response")
		}
	})

	t.Run("GetRankingJSON", func(t *testing.T) {
		jsonStr, err := GetRankingJSON("FII", "dy", 10)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
			t.Fatalf("failed to unmarshal JSON: %v", err)
		}
		if _, ok := parsed["rankings"]; !ok {
			t.Errorf("expected rankings field in response")
		}
	})
}
