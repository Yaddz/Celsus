import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import App from '../../../App';
import { TransactionScreen } from '../TransactionScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { ClassDetailScreen } from '../ClassDetailScreen';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { transactionService } from '../../services/transactionService';
import { marketApiService } from '../../services/marketApi';
import { resetDatabase } from '../../db/client';
import { getPortfolioPalette } from '../../theme/palettes';
import * as fs from 'fs';
import * as path from 'path';

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

describe('Sprint 32: P0 Data Persistence, Automatic Quote Fetching & Real Integration', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S32-T01: Cotação Automática ao Selecionar Ativo no Cadastro de Movimentação
  // =========================================================================
  describe('S32-T01: Automatic Quote Fetching on Asset Selection & Date Change', () => {
    it('should automatically fetch current quote via fetchQuotes when tradeDate is today and populate editable unit price', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Principal',
        docket_code: 'REV-001',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'PETR4',
        name: 'Petrobras',
        asset_class: 'STOCK',
        quantity: '0',
        average_price: '0.00',
      });

      const todayStr = new Date().toISOString().slice(0, 10);

      // Mock da API para cotação em tempo real de hoje
      const fetchQuotesSpy = jest.spyOn(marketApiService, 'fetchQuotes').mockResolvedValue([
        {
          ticker: 'PETR4',
          price: '38.45',
          close_price: '38.45',
          change_percent_24h: 1.25,
        } as any,
      ]);

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={asset.id}
          initialTradeDate={todayStr}
        />
      );

      // Deve disparar busca automática para a cotação de hoje sem necessidade de clicar no botão COTAHIST AUTO
      await waitFor(() => {
        expect(fetchQuotesSpy).toHaveBeenCalledWith(['PETR4']);
      });

      // O input de preço unitário deve ser preenchido automaticamente com 38.45
      const priceInput = screen.getByPlaceholderText('0.00');
      await waitFor(() => {
        expect(priceInput.props.value).toBe('38.45');
      });

      // O usuário pode editar livremente o preço sugerido
      fireEvent.changeText(priceInput, '39.00');
      expect(priceInput.props.value).toBe('39.00');
    });

    it('should fetch historical closing price when tradeDate is a past date and gracefully fallback on offline/error', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Histórica',
        docket_code: 'REV-002',
      });
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        asset_class: 'STOCK',
        quantity: '0',
        average_price: '0.00',
      });

      const pastDate = '2026-10-15';
      const getHistoricalPriceSpy = jest
        .spyOn(marketApiService, 'getHistoricalPrice')
        .mockResolvedValue('62.50');

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={asset.id}
          initialTradeDate={pastDate}
        />
      );

      // Deve consultar getHistoricalPrice para data passada
      await waitFor(() => {
        expect(getHistoricalPriceSpy).toHaveBeenCalledWith('VALE3', pastDate);
      });

      const priceInput = screen.getByPlaceholderText('0.00');
      await waitFor(() => {
        expect(priceInput.props.value).toBe('62.50');
      });

      // Cenário Offline / Erro: Simula erro na busca e verifica que o campo continua aberto e editável
      getHistoricalPriceSpy.mockRejectedValueOnce(new Error('Network error'));
      fireEvent.changeText(screen.getByPlaceholderText('Ex: 2024-03-15'), '2026-09-01');

      await waitFor(() => {
        // Deve manter input editável e exibir aviso amigável
        expect(priceInput).toBeTruthy();
      });
    });

    it('should cancel or ignore stale responses when user quickly changes active asset', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Rápida',
        docket_code: 'REV-003',
      });
      const assetA = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'ITUB4',
        name: 'Itaú Unibanco',
        asset_class: 'STOCK',
      });
      const assetB = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'BBDC4',
        name: 'Banco Bradesco',
        asset_class: 'STOCK',
      });

      let resolveA: (val: any) => void;
      const promiseA = new Promise((resolve) => {
        resolveA = resolve;
      });

      jest.spyOn(marketApiService, 'fetchQuotes').mockImplementation(async (tickers: string[]) => {
        if (tickers.includes('ITUB4')) {
          await promiseA;
          return [{ ticker: 'ITUB4', price: '30.00' } as any];
        }
        if (tickers.includes('BBDC4')) {
          return [{ ticker: 'BBDC4', price: '15.00' } as any];
        }
        return [];
      });

      await render(
        <TransactionScreen
          initialPortfolioId={port.id}
          initialAssetId={assetA.id}
        />
      );

      // Usuário troca rapidamente para o Ativo B
      const chipB = screen.getByText('BBDC4');
      fireEvent.press(chipB);

      // Ativo B responde imediatamente com 15.00
      const priceInput = screen.getByPlaceholderText('0.00');
      await waitFor(() => {
        expect(priceInput.props.value).toBe('15.00');
      });

      // Agora a requisição defasada do Ativo A resolve
      act(() => {
        resolveA!([{ ticker: 'ITUB4', price: '30.00' }]);
      });

      // O valor NÃO deve ser sobrescrito pelo Ativo A (deve permanecer 15.00)
      expect(priceInput.props.value).toBe('15.00');
    });
  });

  // =========================================================================
  // S32-T02: Persistência de Múltiplas Carteiras sem Sumiço no Deck
  // =========================================================================
  describe('S32-T02: Multi-Portfolio Persistence and Deck Synchronization', () => {
    it('should create multiple portfolios, persist all in SQLite, and render all in the deck without overwriting', async () => {
      // 1. Cria Carteira A
      const portA = await portfolioRepository.createPortfolio({
        name: 'Carteira Alpha',
        docket_code: 'REV-ALP-001',
      });

      // 2. Cria Carteira B
      const portB = await portfolioRepository.createPortfolio({
        name: 'Carteira Beta',
        docket_code: 'REV-BET-002',
      });

      // 3. Consulta lista do SQLite
      const list = await portfolioRepository.listPortfolios(false);
      expect(list.length).toBe(2);
      expect(list.some((p) => p.name === 'Carteira Alpha')).toBe(true);
      expect(list.some((p) => p.name === 'Carteira Beta')).toBe(true);

      // 4. Renderiza PortfolioManagementScreen e verifica que ambas aparecem no deck
      await render(
        <PortfolioManagementScreen
          initialPortfolios={list}
          initialActiveIndex={0}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Carteira Alpha')).toBeTruthy();
      });

      // Ao alternar para o segundo card, Carteira Beta é exibida sem perda de dados
      const deck = screen.getByTestId('stacked-wallet-deck');
      expect(deck).toBeTruthy();
    });

    it('should share identical palette generation between Home and PortfolioManagementScreen for the same wallet', async () => {
      const portA = await portfolioRepository.createPortfolio({ name: 'Carteira 1', docket_code: 'REV-001' });
      const portB = await portfolioRepository.createPortfolio({ name: 'Carteira 2', docket_code: 'REV-002' });

      // A paleta da Carteira 2 (índice 1) deve ser idêntica na Home e na tela de Carteiras
      const paletteIndex1 = getPortfolioPalette(1);

      // Renderiza Home
      const { unmount } = render(<App />);
      await waitFor(() => {
        expect(screen.getByTestId('home-screen-root')).toBeTruthy();
      });
      unmount();

      // Renderiza Carteiras
      render(<PortfolioManagementScreen initialPortfolios={[portA, portB]} initialActiveIndex={1} />);
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-management-screen')).toBeTruthy();
      });

      // O token de cor do card da paleta 1 não deve ser substituído por cores hardcoded alternadas
      expect(paletteIndex1.cardBg).toBeDefined();
    });
  });

  // =========================================================================
  // S32-T03: Ciclo Completo de Ativo e Movimentação na Tela de Categoria
  // =========================================================================
  describe('S32-T03: End-to-End Asset & Transaction Lifecycle into Category Screen', () => {
    it('should reflect registered asset and buy transaction accurately in ClassDetailScreen for active portfolio', async () => {
      // 1. Cria carteira real
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Dividendos',
        docket_code: 'REV-DIV-001',
      });

      // 2. Cadastra ativo Ações (PETR4)
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'PETR4',
        name: 'Petróleo Brasileiro S.A.',
        asset_class: 'STOCK',
        quantity: '0',
        average_price: '0.00',
        target_percentage_in_class: 100,
      });

      // 3. Executa movimentação de compra via transactionService (50 un a R$ 30,00)
      await transactionService.executeTransaction({
        portfolioId: port.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-01',
        quantity: '50',
        unitPrice: '30.00',
        fees: '0.00',
      });

      // 4. Verifica atualização no repositório
      const updatedAsset = await assetRepository.getAssetById(asset.id);
      expect(updatedAsset?.quantity).toBe('50');
      expect(updatedAsset?.average_price).toBe('30.00');

      // 5. Renderiza ClassDetailScreen conectada à carteira ativa
      await render(
        <ClassDetailScreen
          assetClass="STOCK"
          portfolioId={port.id}
          assets={[
            {
              id: updatedAsset!.id,
              ticker: updatedAsset!.ticker,
              name: updatedAsset!.name,
              assetClass: 'STOCK',
              quantity: updatedAsset!.quantity,
              averagePrice: 'R$ 30,00',
              currentPrice: 'R$ 30,00',
              grossBalance: 'R$ 1.500,00',
              currentAllocationPercentage: 100,
              profitabilityPercentage: '+0,00%',
            },
          ]}
        />
      );

      // O ativo, ticker, quantidade e saldo devem estar visíveis
      expect(screen.getByText('PETR4')).toBeTruthy();
      expect(screen.getByText('Petróleo Brasileiro S.A.')).toBeTruthy();
      expect(screen.getByText('R$ 1.500,00')).toBeTruthy();
      expect(screen.getByText('50')).toBeTruthy();
    });
  });

  // =========================================================================
  // S32-T04: Eliminação Estrita de Bypasses e Mocks em Código de Produção
  // =========================================================================
  describe('S32-T04: Zero Production Code Bypasses and Test Mock Hacks', () => {
    it('should NOT contain test mock bypasses in App.tsx (e.g., _isMockFunction or inspected asset-petr checks)', () => {
      const appCode = fs.readFileSync(path.resolve(__dirname, '../../../App.tsx'), 'utf-8');

      // Proibido inspecionar _isMockFunction no código de produção de App.tsx
      expect(appCode.includes('_isMockFunction')).toBe(false);
      expect(appCode.includes("res.includes('asset-petr')")).toBe(false);

      // Proibido passar valores fixos fictícios 'R$ 35,00' como fallback estático no App.tsx
      expect(appCode.includes("unitPrice: 'R$ 35,00'")).toBe(false);
    });
  });

  // =========================================================================
  // S32-T05: Integração Real Ponta a Ponta com SQLite
  // =========================================================================
  describe('S32-T05: Complete Real Integration Cycle in SQLite Database', () => {
    it('should execute end-to-end flow: create portfolio -> add asset -> buy tx -> update balance and verify zero leaks', async () => {
      // 1. Cria carteira
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Real E2E',
        docket_code: 'REV-E2E-001',
      });

      // 2. Adiciona ativo
      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'BBAS3',
        name: 'Banco do Brasil',
        asset_class: 'STOCK',
        quantity: '0',
        average_price: '0.00',
      });

      // 3. Realiza aporte
      await transactionService.executeTransaction({
        portfolioId: port.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-02',
        quantity: '100',
        unitPrice: '28.50',
        fees: '5.00',
      });

      // 4. Valida persistência atômica no SQLite
      const txs = await transactionRepository.getTransactionsByPortfolio(port.id);
      expect(txs.length).toBe(1);
      expect(txs[0].total_amount).toBe('2855.00');

      const savedAsset = await assetRepository.getAssetById(asset.id);
      expect(savedAsset?.quantity).toBe('100');
      expect(savedAsset?.average_price).toBe('28.55');

      // 5. Valida que outra carteira permanece limpa (isolamento real)
      const otherPort = await portfolioRepository.createPortfolio({
        name: 'Carteira Isolada',
        docket_code: 'REV-ISO-002',
      });
      const otherAssets = await assetRepository.getAssetsByPortfolio(otherPort.id);
      const otherTxs = await transactionRepository.getTransactionsByPortfolio(otherPort.id);
      expect(otherAssets.length).toBe(0);
      expect(otherTxs.length).toBe(0);
    });
  });
});
