package cotahist

import (
	"context"
	"fmt"

	"github.com/pedro/celsus/services/market-api/internal/macro"
)

// SeedProductionCatalogAndMacro populates the public catalog_assets and the open BCB SGS
// macro rates (CDI and IPCA) with zero proprietary historical quote bars in compliance with licensing rules.
func SeedProductionCatalogAndMacro(ctx context.Context, cotahistRepo *SQLiteRepository, macroRepo *macro.SQLiteRepository) error {
	if cotahistRepo == nil || macroRepo == nil {
		return fmt.Errorf("repositories cannot be nil")
	}

	catalogAssets := []CatalogAsset{
		// Ações (Stocks)
		{Ticker: "PETR4", Name: "PETROBRAS PN", AssetClass: "STOCK"},
		{Ticker: "PETR3", Name: "PETROBRAS ON", AssetClass: "STOCK"},
		{Ticker: "VALE3", Name: "VALE ON", AssetClass: "STOCK"},
		{Ticker: "ITUB4", Name: "ITAU UNIBANCO PN", AssetClass: "STOCK"},
		{Ticker: "BBDC4", Name: "BANCO BRADESCO PN", AssetClass: "STOCK"},
		{Ticker: "BBAS3", Name: "BANCO DO BRASIL ON", AssetClass: "STOCK"},
		{Ticker: "WEGE3", Name: "WEG ON", AssetClass: "STOCK"},
		{Ticker: "RENT3", Name: "LOCALIZA ON", AssetClass: "STOCK"},
		{Ticker: "MGLU3", Name: "MAGAZINE LUIZA ON", AssetClass: "STOCK"},
		{Ticker: "ABEV3", Name: "AMBEV S/A ON", AssetClass: "STOCK"},
		{Ticker: "PRIO3", Name: "PRIO ON", AssetClass: "STOCK"},
		{Ticker: "ELET3", Name: "ELETROBRAS ON", AssetClass: "STOCK"},
		{Ticker: "ITSA4", Name: "ITAUSA PN", AssetClass: "STOCK"},

		// FIIs (Real Estate Funds)
		{Ticker: "HGLG11", Name: "CSHG LOGISTICA FII", AssetClass: "FII"},
		{Ticker: "KNIP11", Name: "KINEA RENDIMENTOS IMOBILIARIOS FII", AssetClass: "FII"},
		{Ticker: "XPLG11", Name: "XP LOG FII", AssetClass: "FII"},
		{Ticker: "MXRF11", Name: "MAXI RENDA FII", AssetClass: "FII"},
		{Ticker: "KNCR11", Name: "KINEA RENDIMENTOS FII", AssetClass: "FII"},
		{Ticker: "BTLG11", Name: "BTG PACTUAL LOGISTICA FII", AssetClass: "FII"},
		{Ticker: "VISC11", Name: "VINCI SHOPPING CENTERS FII", AssetClass: "FII"},
		{Ticker: "XPML11", Name: "XP MALLS FII", AssetClass: "FII"},
		{Ticker: "HGRU11", Name: "CSHG RENDA URBANA FII", AssetClass: "FII"},

		// Criptomoedas (Crypto)
		{Ticker: "BTC", Name: "BITCOIN", AssetClass: "CRYPTO"},
		{Ticker: "ETH", Name: "ETHEREUM", AssetClass: "CRYPTO"},
		{Ticker: "SOL", Name: "SOLANA", AssetClass: "CRYPTO"},
		{Ticker: "USDT", Name: "TETHER USD", AssetClass: "CRYPTO"},
		{Ticker: "USDC", Name: "USD COIN", AssetClass: "CRYPTO"},
		{Ticker: "BNB", Name: "BINANCE COIN", AssetClass: "CRYPTO"},
		{Ticker: "ADA", Name: "CARDANO", AssetClass: "CRYPTO"},
		{Ticker: "AVAX", Name: "AVALANCHE", AssetClass: "CRYPTO"},
		{Ticker: "DOT", Name: "POLKADOT", AssetClass: "CRYPTO"},
		{Ticker: "LINK", Name: "CHAINLINK", AssetClass: "CRYPTO"},
	}

	if err := cotahistRepo.UpsertCatalogAssets(ctx, catalogAssets); err != nil {
		return fmt.Errorf("falha ao inserir ativos no catalogo de producao: %w", err)
	}

	// Snapshot público e aberto das séries do Banco Central do Brasil (SGS #12 e #433)
	macroRates := []macro.Rate{
		// Taxas CDI Diárias (Série SGS 12)
		{Date: "2024-01-02", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-03", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-04", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-05", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-08", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-09", Type: "CDI", Value: 0.000450},
		{Date: "2024-01-10", Type: "CDI", Value: 0.000450},

		// Taxas IPCA Mensais (Série SGS 433)
		{Date: "2024-01-01", Type: "IPCA", Value: 0.42},
		{Date: "2024-02-01", Type: "IPCA", Value: 0.83},
		{Date: "2024-03-01", Type: "IPCA", Value: 0.16},
		{Date: "2024-04-01", Type: "IPCA", Value: 0.38},
		{Date: "2024-05-01", Type: "IPCA", Value: 0.46},
	}

	if err := macroRepo.SaveRates(ctx, macroRates); err != nil {
		return fmt.Errorf("falha ao inserir taxas macro no seed de producao: %w", err)
	}

	return nil
}
