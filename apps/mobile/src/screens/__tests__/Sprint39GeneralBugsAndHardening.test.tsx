import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { View, Text } from 'react-native';
import App from '../../../App';
import { TransactionDetailHistoryScreen } from '../TransactionDetailHistoryScreen';
import { StackedWalletDeck } from '../../components/ui/StackedWalletDeck';
import { walletStore } from '../../stores/walletStore';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { marketApiService } from '../../services/marketApi';
import { resetDatabase } from '../../db/client';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, testID, style }: any) => {
      const { View } = require('react-native');
      return <View testID={testID || 'safe-area-view'} style={style}>{children}</View>;
    },
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 39: General Bug Hardening (B12–B20, A11y, Privacy & Precision)', () => {
  beforeEach(async () => {
    resetDatabase();
    walletStore.reset();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S39-T01: Market Quote Valuation in Total Patrimony and Class Detail (B12, Decimal)
  // =========================================================================
  describe('S39-T01: Market Quote Valuation in Total Patrimony and Class Breakdown (B12, Decimal)', () => {
    it('should value active wallet patrimony using cached market quote rather than average price', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Mercado',
        docket_code: 'REV-MKT-001',
      });

      // Ativo: BBAS3, 10 ações, Preço Médio R$ 30,00 (Total Investido = R$ 300,00)
      await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'BBAS3',
        name: 'Banco do Brasil S.A.',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '30.00',
        target_percentage_in_class: 100,
      });

      // Cotação no cache: R$ 45,00 (Valor de Mercado deve ser 10 * 45 = R$ 450,00, Lucro = +R$ 150,00 (+50,00% total))
      jest.spyOn(marketApiService, 'getCachedQuote').mockImplementation(async (ticker: string) => {
        if (ticker === 'BBAS3') {
          return {
            ticker: 'BBAS3',
            assetClass: 'STOCK',
            currentPrice: '45.00',
            changePercent24h: 5.0,
            updatedAt: new Date().toISOString(),
          };
        }
        return null;
      });

      await render(<App />);

      // Verifica se o patrimônio na Home reflete o valor a mercado (R$ 450,00) e não o PM (R$ 300,00)
      await waitFor(() => {
        expect(screen.getByText('R$ 450,00')).toBeTruthy();
      });

      // Resumo de lucro reflete rentabilidade a mercado real (+50,0% total ou +50,00% total)
      expect(screen.getByText(/\+50,0/)).toBeTruthy();
    });

    it('should fall back to average price when asset has no market quote in cache', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Sem Cache',
        docket_code: 'REV-NOCACHE-001',
      });

      await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'DESCONHECIDO3',
        name: 'Ativo Sem Cotacao',
        asset_class: 'STOCK',
        quantity: '10',
        average_price: '25.00',
        target_percentage_in_class: 100,
      });

      jest.spyOn(marketApiService, 'getCachedQuote').mockResolvedValue(null);

      await render(<App />);

      await waitFor(() => {
        // Fallback: 10 * 25.00 = R$ 250,00
        expect(screen.getByText('R$ 250,00')).toBeTruthy();
      });
    });

    it('should display real market currentPrice, gross balance and profitability in ClassDetailScreen without hardcoded +0,00% or #DB5A42', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Classes',
        docket_code: 'REV-CLS-001',
      });

      await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'VALE3',
        name: 'Vale S.A.',
        asset_class: 'STOCK',
        quantity: '20',
        average_price: '50.00',
        target_percentage_in_class: 100,
      });

      // Cotação no cache de mercado: R$ 60,00 (investido 1.000, mercado 1.200, lucro +R$ 200,00 (+20,00%))
      jest.spyOn(marketApiService, 'getCachedQuote').mockImplementation(async (ticker: string) => {
        if (ticker === 'VALE3') {
          return {
            ticker: 'VALE3',
            assetClass: 'STOCK',
            currentPrice: '60.00',
            changePercent24h: 3.2,
            updatedAt: new Date().toISOString(),
          };
        }
        return null;
      });

      await render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('allocation-stat-stock')).toBeTruthy();
      });

      // Abre a tela de detalhe da classe Ações
      fireEvent.press(screen.getByTestId('allocation-stat-stock'));

      await waitFor(() => {
        expect(screen.getByTestId('class-detail-screen')).toBeTruthy();
      });

      // Valida métricas a mercado do ativo VALE3
      await waitFor(() => {
        expect(screen.getByText('VALE3')).toBeTruthy();
        expect(screen.getByText(/1\.200,00/)).toBeTruthy(); // Saldo bruto a mercado
        expect(screen.getByText(/60,00/)).toBeTruthy(); // Cotação atual a mercado
        expect(screen.getByText(/\+20,0/)).toBeTruthy(); // Rentabilidade real percentual
      });
    });
  });

  // =========================================================================
  // S39-T02: Transaction Details Real Values Preservation (B13, B20)
  // =========================================================================
  describe('S39-T02: Transaction Details Real Values Preservation (B13, B20)', () => {
    it('should preserve real unitPrice, quantity and fees on transactions and display them in TransactionDetailHistoryScreen', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Transacoes',
        docket_code: 'REV-TX-001',
      });

      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'ITUB4',
        name: 'Itaú Unibanco Holding S.A.',
        asset_class: 'STOCK',
        quantity: '100',
        average_price: '32.50',
      });

      await transactionRepository.createTransaction({
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'BUY',
        quantity: '50',
        unit_price: '32.50',
        total_amount: '1629.50',
        fees: '4.50',
        trade_date: '2026-10-25',
      });

      await render(<App />);

      await waitFor(() => {
        expect(screen.getByTestId('home-recent-transactions')).toBeTruthy();
      });

      // Clica na transação ITUB4
      const row = await screen.findByTestId('recent-tx-row-ITUB4');
      fireEvent.press(row);

      await waitFor(() => {
        expect(screen.getByTestId('transaction-detail-history-screen')).toBeTruthy();
      });

      // Confere se preservou quantidade 50 (não fallback '1')
      const qtyNode = screen.getByTestId('tx-detail-quantity');
      expect(qtyNode.props.children).toContain('50');

      // Confere se preservou cotação R$ 32,50 (não o valor total da operação)
      const priceNode = screen.getByTestId('tx-detail-unit-price');
      expect(priceNode).toBeTruthy();
      expect(screen.getByText(/32,50/)).toBeTruthy();

      // Confere se preservou taxas R$ 4,50 (não fallback 'R$ 0,00')
      const feesNode = screen.getByTestId('tx-detail-fees');
      expect(feesNode).toBeTruthy();
      expect(screen.getByText(/4,50/)).toBeTruthy();

      // Confere se o nome do ativo é o nome real do banco de dados (B20)
      expect(screen.getByText('Itaú Unibanco Holding S.A.')).toBeTruthy();
    });
  });

  // =========================================================================
  // S39-T03: Privacy Mode Strict Masking on Transaction Detail (B14, [REDACTED])
  // =========================================================================
  describe('S39-T03: Privacy Mode Strict Masking on Transaction Detail & Timeline (B14)', () => {
    it('should mask unitPrice, quantity and fees in TransactionDetailHistoryScreen when isPrivacyMode is true', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={{
            id: 'tx-sec-1',
            ticker: 'B3SA3',
            assetName: 'B3 S.A.',
            assetClass: 'STOCK',
            type: 'BUY',
            tradeDate: '2026-10-30',
            investedAmount: 'R$ 5.000,00',
            unitPrice: 'R$ 12,50',
            quantity: '400',
            fees: 'R$ 15,00',
            portfolioName: 'Carteira Sigilosa',
          }}
          isPrivacyMode={true}
        />
      );

      // Nenhum valor financeiro ou quantidade deve estar visível
      expect(screen.queryByText('R$ 5.000,00')).toBeNull();
      expect(screen.queryByText('R$ 12,50')).toBeNull();
      expect(screen.queryByText('400')).toBeNull();
      expect(screen.queryByText('R$ 15,00')).toBeNull();

      // Todos os campos de detalhe devem exibir máscara
      const qtyNode = screen.getByTestId('tx-detail-quantity');
      expect(qtyNode.props.children).toMatch(/••••••|██████/);

      const priceNode = screen.getByTestId('tx-detail-unit-price');
      expect(priceNode.props.children).toMatch(/••••••|██████/);

      const feesNode = screen.getByTestId('tx-detail-fees');
      expect(feesNode.props.children).toMatch(/••••••|██████/);
    });

    it('should mask quantities and amounts in timeline history items under privacy mode', async () => {
      await render(
        <TransactionDetailHistoryScreen
          transaction={{
            id: 'tx-sec-2',
            ticker: 'PETR4',
            assetName: 'Petrobras',
            assetClass: 'STOCK',
            type: 'BUY',
            tradeDate: '2026-10-31',
            investedAmount: 'R$ 1.000,00',
            unitPrice: 'R$ 30,00',
            quantity: '33',
            fees: 'R$ 2,00',
          }}
          history={[
            {
              id: 'hist-1',
              tradeDate: '2026-10-15',
              type: 'BUY',
              quantity: '77',
              unitPrice: 'R$ 29,00',
              totalAmount: 'R$ 2.233,00',
              fees: 'R$ 3,00',
            },
          ]}
          isPrivacyMode={true}
        />
      );

      // Na timeline histórica, não deve expor a quantidade nem o valor total
      expect(screen.queryByText('R$ 2.233,00')).toBeNull();
      expect(screen.queryByText('77 cotas')).toBeNull();
    });
  });

  // =========================================================================
  // S39-T04: Error Logging & Full Cleanup on Last Wallet Deletion (B16)
  // =========================================================================
  describe('S39-T04: Robust Error Logging & Complete Cleanup on Last Wallet Deletion (B16)', () => {
    it('should log errors with console.error instead of silently ignoring in empty catch blocks', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(portfolioRepository, 'listPortfolios').mockRejectedValueOnce(new Error('Simulated DB Failure'));

      await render(<App />);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should completely reset patrimony, allocations, assets and transactions when all wallets are deleted', async () => {
      // 1. Cria carteira inicial com ativos e transações
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira Efêmera',
        docket_code: 'REV-EFE-001',
      });

      const asset = await assetRepository.createAsset({
        portfolio_id: port.id,
        ticker: 'CSNA3',
        name: 'CSN',
        asset_class: 'STOCK',
        quantity: '50',
        average_price: '12.00',
      });

      await transactionRepository.createTransaction({
        portfolio_id: port.id,
        asset_id: asset.id,
        type: 'BUY',
        quantity: '50',
        unit_price: '12.00',
        total_amount: '600.00',
        trade_date: '2026-10-20',
      });

      await render(<App />);

      await waitFor(() => {
        expect(screen.getByText('R$ 600,00')).toBeTruthy();
      });

      // 2. Deleta a carteira do banco e atualiza walletStore para estado vazio
      await portfolioRepository.deletePortfolio(port.id);
      act(() => {
        walletStore.setActiveIndex(0, undefined);
      });

      // 3. Monta novamente / renderiza e valida limpeza completa de estado
      const { unmount } = render(<App />);

      await waitFor(() => {
        // Patrimônio zerado
        expect(screen.getByText('R$ 0,00')).toBeTruthy();
        // Zero transações residuais
        expect(screen.queryByText('CSNA3')).toBeNull();
      });

      unmount();
    });
  });

  // =========================================================================
  // S39-T05: Health Check Engine Decoupling & Clean Wallet Store Subscriptions (B17, B18)
  // =========================================================================
  describe('S39-T05: Engine Health Check Decoupling & Safe Store Subscriptions (B17, B18)', () => {
    it('should check connectivity using checkHealth rather than hardcoded PETR4 quote', async () => {
      const checkHealthSpy = jest.spyOn(marketApiService, 'checkHealth').mockResolvedValue({
        status: 'ok',
        provider: 'YAHOO',
      });

      await render(<App />);

      await waitFor(() => {
        expect(checkHealthSpy).toHaveBeenCalled();
      });
    });

    it('should preserve active subscribers when walletStore.reset() is called', () => {
      const listener = jest.fn();
      const unsubscribe = walletStore.subscribe(listener);

      walletStore.setActiveIndex(2, 'port-2');
      expect(listener).toHaveBeenCalledTimes(1);

      // reset não deve desinscrever o listener
      walletStore.reset();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(walletStore.getState().activeWalletIndex).toBe(0);

      unsubscribe();
      walletStore.setActiveIndex(1, 'port-1');
      expect(listener).toHaveBeenCalledTimes(2); // cancelado após unsub
    });
  });

  // =========================================================================
  // S39-T06: Accessibility Hardening & Removal of Inaudible Ghost Duplications (a11y)
  // =========================================================================
  describe('S39-T06: Accessibility Hardening & Removal of Inaudible Ghost Duplications (a11y)', () => {
    it('should hide ghost duplicated text from accessibility tree using aria-hidden or accessibilityElementsHidden', async () => {
      const mockPortfolios = [
        {
          id: 'port-a11y-1',
          name: 'Carteira Alpha',
          docketCode: 'REV-A11Y-001',
          balance: 'R$ 1.000,00',
          subtitle: 'Patrimônio',
          profitText: '+2,0% total',
          accentColor: '#1A3B32',
          paletteId: 'classic',
        },
      ];

      await render(
        <StackedWalletDeck
          portfolios={mockPortfolios}
          activeIndex={0}
        />
      );

      // Elementos que existiam como duplicata fantasma para testes legados não devem ser audíveis em leitores de tela
      const uppercaseTexts = screen.queryAllByText('CARTEIRA ALPHA');
      uppercaseTexts.forEach((node) => {
        const isHidden =
          node.props['aria-hidden'] === true ||
          node.props.accessibilityElementsHidden === true ||
          node.props.importantForAccessibility === 'no-hide-descendants' ||
          node.props.importantForAccessibility === 'no';
        expect(isHidden).toBe(true);
      });
    });
  });
});
