import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { TransactionScreen } from '../TransactionScreen';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { marketApiService } from '../../services/marketApi';
import { resetDatabase } from '../../db/client';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 37: Transaction Auto-Fill Price, Free Ticker Input & Portfolio Asset Binding', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S37-T09: Auto-Fill Price using currentPrice and Local Timezone Date
  // =========================================================================
  describe('S37-T09: Auto-Fill Price from marketApiService.fetchQuotes(currentPrice)', () => {
    it('should populate unitPrice input using currentPrice from MarketQuote for today trade date', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Principal',
        docket_code: 'CART-001',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        name: 'Petrobras PN',
        ticker: 'PETR4',
        asset_class: 'STOCK',
      });

      const todayLocal = new Date().toLocaleDateString('sv-SE');

      jest.spyOn(marketApiService, 'fetchQuotes').mockResolvedValue([
        {
          ticker: 'PETR4',
          assetClass: 'STOCK',
          currentPrice: '38.45',
          changePercent24h: 1.2,
          updatedAt: new Date().toISOString(),
          source: 'YAHOO',
        },
      ]);

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={asset.id}
        />
      );

      const priceInput = screen.getByTestId('transaction-unit-price-input');
      await waitFor(() => {
        expect(priceInput.props.value).toBe('38.45');
      });

      expect(screen.getByText(/Cotação sugerida \(38.45\) preenchida/i)).toBeTruthy();
    });
  });

  // =========================================================================
  // S37-T10: Distinct Error Messages for Offline vs Missing Ticker
  // =========================================================================
  describe('S37-T10: Distinct User Messages for Offline Engine vs Not Found', () => {
    it('should display "Sem conexão com o motor de cotações" when fetch fails with network error', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Offline',
        docket_code: 'CART-002',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        name: 'Vale ON',
        ticker: 'VALE3',
        asset_class: 'STOCK',
      });

      jest.spyOn(marketApiService, 'fetchQuotes').mockRejectedValue(new Error('Network error: 502'));

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={asset.id}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Sem conexão com o motor de cotações/i)
        ).toBeTruthy();
      });

      // Campo de preço unitário permanece interativo e editável
      const priceInput = screen.getByTestId('transaction-unit-price-input');
      expect(priceInput).toBeTruthy();
    });

    it('should display "Cotação não encontrada" when quote array is empty', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Ticker Desconhecido',
        docket_code: 'CART-003',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        name: 'Ativo Misterioso',
        ticker: 'DESCONHECIDO3',
        asset_class: 'STOCK',
      });

      jest.spyOn(marketApiService, 'fetchQuotes').mockResolvedValue([]);

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={asset.id}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Cotação não encontrada/i)
        ).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // S37-T11: Free Ticker Search Input with Autocomplete
  // =========================================================================
  describe('S37-T11: Free Ticker Search Input with Catalog Autocomplete', () => {
    it('should allow typing arbitrary ticker and render autocomplete suggestions from catalog', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira de Busca',
        docket_code: 'CART-004',
      });

      jest.spyOn(marketApiService, 'searchCatalog').mockResolvedValue([
        { ticker: 'WEGE3', name: 'WEG S.A.', asset_class: 'STOCK' },
        { ticker: 'WIZC3', name: 'Wiz Co Participações', asset_class: 'STOCK' },
      ]);

      await render(<TransactionScreen initialPortfolioId={port.id} />);

      const tickerInput = screen.getByTestId('transaction-ticker-search-input');
      expect(tickerInput).toBeTruthy();

      fireEvent.changeText(tickerInput, 'WEGE');

      await waitFor(() => {
        expect(screen.getByTestId('ticker-autocomplete-suggestion-WEGE3')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // S37-T12: Confirming Ticker Outside Portfolio (Decision Q3: "Não" Blocks Save)
  // =========================================================================
  describe('S37-T12: Adding Asset to Portfolio on Selection or Blocking on Rejection', () => {
    it('should add asset to portfolio when user confirms popup for external ticker', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Crescimento',
        docket_code: 'CART-005',
      });

      jest.spyOn(marketApiService, 'searchCatalog').mockResolvedValue([
        { ticker: 'ITUB4', name: 'Itaú Unibanco', asset_class: 'STOCK' },
      ]);

      const alertSpy = jest.spyOn(Alert, 'alert');

      await render(<TransactionScreen initialPortfolioId={port.id} />);

      const tickerInput = screen.getByTestId('transaction-ticker-search-input');
      fireEvent.changeText(tickerInput, 'ITUB4');

      await waitFor(() => {
        expect(screen.getByTestId('ticker-autocomplete-suggestion-ITUB4')).toBeTruthy();
      });

      // Clica na sugestão ITUB4 (que não está na carteira)
      fireEvent.press(screen.getByTestId('ticker-autocomplete-suggestion-ITUB4'));

      // Deve disparar Alert.alert de confirmação
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringMatching(/adicionar/i),
        expect.stringMatching(/ITUB4/i),
        expect.any(Array)
      );

      // Simula confirmação ("Sim")
      const buttons = alertSpy.mock.calls[0][2] as any[];
      const simButton = buttons.find((b) => /sim|adicionar/i.test(b.text));
      await act(async () => {
        await simButton.onPress();
      });

      // O ativo ITUB4 agora deve existir na carteira com quantidade 0
      const portAssets = await assetRepository.getAssetsByPortfolio(port.id);
      const itub = portAssets.find((a) => a.ticker === 'ITUB4');
      expect(itub).toBeTruthy();
      expect(itub?.asset_class).toBe('STOCK');
    });

    it('should block transaction (disable Salvar) when user rejects adding asset to portfolio', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Restrita',
        docket_code: 'CART-006',
      });

      jest.spyOn(marketApiService, 'searchCatalog').mockResolvedValue([
        { ticker: 'BBDC4', name: 'Banco Bradesco', asset_class: 'STOCK' },
      ]);

      const alertSpy = jest.spyOn(Alert, 'alert');

      await render(<TransactionScreen initialPortfolioId={port.id} />);

      const tickerInput = screen.getByTestId('transaction-ticker-search-input');
      fireEvent.changeText(tickerInput, 'BBDC4');

      await waitFor(() => {
        expect(screen.getByTestId('ticker-autocomplete-suggestion-BBDC4')).toBeTruthy();
      });

      // Clica na sugestão BBDC4
      fireEvent.press(screen.getByTestId('ticker-autocomplete-suggestion-BBDC4'));

      // Simula rejeição ("Não")
      const buttons = alertSpy.mock.calls[0][2] as any[];
      const naoButton = buttons.find((b) => /não|cancelar/i.test(b.text));
      await act(async () => {
        if (naoButton && naoButton.onPress) {
          await naoButton.onPress();
        }
      });

      // Decisão Q3: O ativo NÃO é criado e o botão Salvar permanece desabilitado
      const portAssets = await assetRepository.getAssetsByPortfolio(port.id);
      expect(portAssets.find((a) => a.ticker === 'BBDC4')).toBeUndefined();

      const saveBtn = screen.getByTestId('transaction-save-submit-btn');
      expect(saveBtn.props.accessibilityState?.disabled || saveBtn.props.disabled).toBe(true);
    });
  });

  // =========================================================================
  // S37-T13: Warning Notice when Native Bridge is Missing (Expo Go / Fallback)
  // =========================================================================
  describe('S37-T13: Environment Notice when Native Bridge is Unavailable', () => {
    it('should display an environment notice when running without native Go bridge', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Dev',
        docket_code: 'CART-007',
      });

      // Simula ausência de bridge nativa
      jest.spyOn(marketApiService, 'checkHealth').mockResolvedValue({
        status: 'fallback',
        provider: 'HTTP_SERVER',
      });

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          isNativeBridgeAvailable={false}
        />
      );

      expect(screen.getByTestId('native-bridge-unavailable-notice')).toBeTruthy();
    });
  });
});
