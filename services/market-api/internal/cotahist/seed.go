package cotahist

import (
	"context"
	"fmt"

	"github.com/pedro/celsus/services/market-api/internal/macro"
)

// SeedMarketData populates cotahist and macro repositories with a baseline set of market data.
func SeedMarketData(ctx context.Context, cotahistRepo *SQLiteRepository, macroRepo *macro.SQLiteRepository) error {
	if cotahistRepo == nil || macroRepo == nil {
		return fmt.Errorf("repositories cannot be nil")
	}

	quotes := []Quote{
		// Ações (Stocks)
		{Date: "2024-01-02", Ticker: "PETR4", AssetClass: "STOCK", Name: "PETROBRAS PN", Open: 37.50, High: 39.00, Low: 37.00, Close: 38.50, Volume: 50000000.0},
		{Date: "2024-01-03", Ticker: "PETR4", AssetClass: "STOCK", Name: "PETROBRAS PN", Open: 38.50, High: 39.50, Low: 38.20, Close: 39.10, Volume: 45000000.0},
		{Date: "2024-01-04", Ticker: "PETR4", AssetClass: "STOCK", Name: "PETROBRAS PN", Open: 39.10, High: 39.80, Low: 38.70, Close: 39.40, Volume: 48000000.0},
		{Date: "2024-01-05", Ticker: "PETR4", AssetClass: "STOCK", Name: "PETROBRAS PN", Open: 39.40, High: 40.20, Low: 39.00, Close: 40.00, Volume: 52000000.0},

		{Date: "2024-01-02", Ticker: "VALE3", AssetClass: "STOCK", Name: "VALE ON", Open: 68.00, High: 69.20, Low: 67.50, Close: 68.80, Volume: 40000000.0},
		{Date: "2024-01-05", Ticker: "VALE3", AssetClass: "STOCK", Name: "VALE ON", Open: 68.80, High: 70.00, Low: 68.50, Close: 69.50, Volume: 42000000.0},

		{Date: "2024-01-02", Ticker: "ITUB4", AssetClass: "STOCK", Name: "ITAU UNIBANCO PN", Open: 32.00, High: 33.10, Low: 31.80, Close: 32.90, Volume: 30000000.0},
		{Date: "2024-01-05", Ticker: "ITUB4", AssetClass: "STOCK", Name: "ITAU UNIBANCO PN", Open: 32.90, High: 33.50, Low: 32.60, Close: 33.20, Volume: 31000000.0},

		{Date: "2024-01-02", Ticker: "WEGE3", AssetClass: "STOCK", Name: "WEG ON", Open: 36.00, High: 37.00, Low: 35.80, Close: 36.80, Volume: 25000000.0},
		{Date: "2024-01-05", Ticker: "WEGE3", AssetClass: "STOCK", Name: "WEG ON", Open: 36.80, High: 37.80, Low: 36.50, Close: 37.40, Volume: 27000000.0},

		// FIIs
		{Date: "2024-01-02", Ticker: "HGLG11", AssetClass: "FII", Name: "CSHG LOGISTICA FII", Open: 161.00, High: 163.00, Low: 160.50, Close: 162.50, Volume: 5000000.0},
		{Date: "2024-01-05", Ticker: "HGLG11", AssetClass: "FII", Name: "CSHG LOGISTICA FII", Open: 162.50, High: 164.00, Low: 162.00, Close: 163.50, Volume: 4800000.0},

		{Date: "2024-01-02", Ticker: "KNIP11", AssetClass: "FII", Name: "KINEA RENDIMENTOS IMOBILIARIOS", Open: 92.00, High: 93.50, Low: 91.80, Close: 93.00, Volume: 4200000.0},
		{Date: "2024-01-05", Ticker: "KNIP11", AssetClass: "FII", Name: "KINEA RENDIMENTOS IMOBILIARIOS", Open: 93.00, High: 94.00, Low: 92.50, Close: 93.80, Volume: 4100000.0},

		{Date: "2024-01-02", Ticker: "XPLG11", AssetClass: "FII", Name: "XP LOG FII", Open: 104.00, High: 106.00, Low: 103.80, Close: 105.20, Volume: 3800000.0},
		{Date: "2024-01-02", Ticker: "MXRF11", AssetClass: "FII", Name: "MAXI RENDA FII", Open: 10.20, High: 10.60, Low: 10.15, Close: 10.45, Volume: 8000000.0},

		// Criptomoedas (Crypto)
		{Date: "2024-01-02", Ticker: "BTC", AssetClass: "CRYPTO", Name: "BITCOIN", Open: 340000.0, High: 355000.0, Low: 338000.0, Close: 350000.0, Volume: 150000000.0},
		{Date: "2024-01-05", Ticker: "BTC", AssetClass: "CRYPTO", Name: "BITCOIN", Open: 350000.0, High: 362000.0, Low: 348000.0, Close: 360000.0, Volume: 160000000.0},

		{Date: "2024-01-02", Ticker: "ETH", AssetClass: "CRYPTO", Name: "ETHEREUM", Open: 16500.0, High: 17200.0, Low: 16300.0, Close: 17000.0, Volume: 80000000.0},
		{Date: "2024-01-05", Ticker: "ETH", AssetClass: "CRYPTO", Name: "ETHEREUM", Open: 17000.0, High: 17800.0, Low: 16900.0, Close: 17500.0, Volume: 85000000.0},

		{Date: "2024-01-02", Ticker: "SOL", AssetClass: "CRYPTO", Name: "SOLANA", Open: 750.0, High: 820.0, Low: 740.0, Close: 805.0, Volume: 35000000.0},
	}

	if err := cotahistRepo.UpsertQuotes(ctx, quotes); err != nil {
		return fmt.Errorf("falha ao inserir cotações no seed: %w", err)
	}

	rates := []macro.Rate{
		// Taxas CDI Diárias
		{Date: "2024-01-02", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-03", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-04", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-05", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-08", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-09", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-10", Type: "CDI", Value: 0.000450},

		// Taxas IPCA Mensais
		{Date: "2024-01-01", Type: "IPCA", Value: 0.42},
		{Date: "2024-02-01", Type: "IPCA", Value: 0.83},
		{Date: "2024-03-01", Type: "IPCA", Value: 0.16},
		{Date: "2024-04-01", Type: "IPCA", Value: 0.38},
		{Date: "2024-05-01", Type: "IPCA", Value: 0.46},
	}

	if err := macroRepo.SaveRates(ctx, rates); err != nil {
		return fmt.Errorf("falha ao inserir taxas macro no seed: %w", err)
	}

	return nil
}

// SeedProductionCatalogAndMacro populates catalog_assets and BCB CDI/IPCA macro series
// with zero historical price bars in production.
func SeedProductionCatalogAndMacro(ctx context.Context, cotahistRepo *SQLiteRepository, macroRepo *macro.SQLiteRepository) error {
	return fmt.Errorf("SeedProductionCatalogAndMacro not implemented")
}

