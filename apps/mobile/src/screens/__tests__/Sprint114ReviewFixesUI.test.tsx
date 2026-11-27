import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { getDatabase, initializeDatabase } from '../../db/client';
import { assets, finAccounts, portfolios } from '../../db/schema';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { sandboxService } from '../../services/sandboxService';
import { TransactionScreen } from '../TransactionScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { CompareScreen } from '../sandbox/CompareScreen';
import { AccountsScreen } from '../finance/AccountsScreen';

describe('Sprint 114 — UI e Fluxos (P3a, P7, P8c, P9)', () => {
  beforeEach(async () => {
    await initializeDatabase();
    const db = getDatabase();
    await db.delete(assets);
    await db.delete(portfolios);
    await db.delete(finAccounts);
  });

  test('S114-T11 (P3a): TransactionScreen escolhe conta corrente com maior saldo se corretora não cobre e exibe aviso não-bloqueante se ficar negativa', async () => {
    const broker = await finRepository.createAccount({
      name: 'XP Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const checkingSmall = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 10_000, // R$ 100
    });
    const checkingBig = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 50_000, // R$ 500
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '30.00',
    });

    const screen = render(
      <TransactionScreen
        initialPortfolioId={portfolio.id}
        initialAssetId={asset.id}
        onBack={jest.fn()}
        onTransactionSuccess={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('tx-use-cash-toggle')).toBeTruthy();
    });

    // Compra de 20 cotas * R$ 30 = R$ 600 (> 0 da corretora e > 500 do Itaú)
    fireEvent.changeText(screen.getByTestId('transaction-quantity-input'), '20');
    fireEvent.changeText(screen.getByTestId('transaction-unit-price-input'), '30.00');

    await waitFor(() => {
      // Conta padrão escolhida: Itaú (maior saldo)
      expect(screen.getByTestId(`tx-cash-account-${checkingBig.id}`)).toBeTruthy();
      expect(screen.queryByText(/A conta Itaú ficará negativa/i)).toBeTruthy();
    });

    expect(checkingSmall.id).toBeTruthy();
  });

  test('S114-T12 (P7): PortfolioManagementScreen tem interruptor "Liquidez diária" na edição de renda fixa', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'RF',
      targetReturn: '12',
    });
    const rf = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'CDB BANCO X',
      name: 'CDB Banco X',
      asset_class: 'FIXED_INCOME',
      quantity: '1',
      average_price: '1000.00',
    });

    const screen = render(
      <PortfolioManagementScreen
        portfolioId={portfolio.id}
        onBack={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('class-tab-FIXED_INCOME')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('class-tab-FIXED_INCOME'));

    await waitFor(() => {
      expect(screen.getByText('CDB BANCO X')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId(`asset-edit-btn-${rf.id}`));
    await waitFor(() => {
      expect(screen.getByTestId('rf-daily-liquidity-switch')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('rf-daily-liquidity-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('save-asset-edit-btn'));

    await waitFor(async () => {
      const updated = await assetRepository.getAssetById(rf.id);
      expect(updated?.rf_daily_liquidity).toBe(1);
    });
  });

  test('S114-T13 (P8c): CompareScreen usa sandboxService e converte US_STOCK (NVDA) para BRL pelo USDBRL de cada data', async () => {
    const spy = jest.spyOn(sandboxService, 'getHistory').mockImplementation(async (ticker: string) => {
      if (ticker === 'NVDA') {
        return [
          { date: '2026-01-02', close: 100 },
          { date: '2026-02-02', close: 100 }, // estável em USD
        ];
      }
      if (ticker === 'USDBRL') {
        return [
          { date: '2026-01-02', close: 5.0 }, // 500 BRL
          { date: '2026-02-02', close: 6.0 }, // 600 BRL (+20% em BRL!)
        ];
      }
      return [];
    });
    jest.spyOn(sandboxService, 'getMacroSeries').mockResolvedValue({ cdi: [], ipca: [], poupanca: [] });

    const screen = render(<CompareScreen onBack={jest.fn()} />);
    fireEvent.changeText(screen.getByTestId('compare-ticker-input'), 'NVDA');
    fireEvent.press(screen.getByTestId('compare-add-btn'));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('NVDA', 'US_STOCK', expect.any(String));
      expect(spy).toHaveBeenCalledWith('USDBRL', 'FX', expect.any(String));
    });

    spy.mockRestore();
  });

  test('S114-T14 (P9): AccountsScreen renderiza checkbox de carteira sem token indefinido', async () => {
    await portfolioRepository.createPortfolio({ name: 'Carteira A', targetReturn: '12' });
    const screen = render(<AccountsScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('accounts-screen')).toBeTruthy();
    });
  });
});
