import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { getDatabase, initializeDatabase, resetDatabase } from '../../db/client';
import { assets, finAccounts, finEntries, portfolios } from '../../db/schema';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { finService } from '../../services/finService';
import type { PluggyClient } from '../../services/pluggy/pluggyClient';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from '../../services/pluggy/__tests__/pluggyFixtures';
import { sandboxService } from '../../services/sandboxService';
import { SimulatorScreen } from '../SimulatorScreen';
import { AccountsScreen } from '../finance/AccountsScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';
import { CompareScreen } from '../sandbox/CompareScreen';

describe('Sprint 115 — UI e Fluxos (V2, V3a, V7b, V7c)', () => {
  beforeEach(async () => {
    resetDatabase();
    await initializeDatabase();
    const db = getDatabase();
    await db.delete(finEntries);
    await db.delete(assets);
    await db.delete(portfolios);
    await db.delete(finAccounts);
  });

  test('S115-T11 (V2): FinanceHomeScreen conta aporte uma vez quando carteira está vinculada a conta checking', async () => {
    const itemId = 'item-ui-v2';
    await openFinanceRepository.addItem(itemId);
    const pgAcc = { ...makePluggyAccounts()[0], id: 'pg-ui-v2', itemId, balance: 2000 };
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [pgAcc],
      listTransactions: async () => [],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-10T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const linkedChecking = accounts.find((a) => a.of_account_id === 'pg-ui-v2')!;
    const mainChecking = await finRepository.createAccount({
      name: 'Conta Principal',
      type: 'checking',
      initialBalanceCents: 500_000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Checking',
      targetReturn: '12',
      ofItemId: itemId,
    });
    await portfolioRepository.linkFinAccount(portfolio.id, linkedChecking.id);

    await finService.createTransfer({
      fromAccountId: mainChecking.id,
      toAccountId: linkedChecking.id,
      amountCents: 100_000,
      dateIso: '2026-10-10',
      description: 'Aporte mensal',
    });

    const screen = await render(
      <FinanceHomeScreen
        onBack={jest.fn()}
        referenceDateIso="2026-10-20"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('month-summary-contributions')).toBeTruthy();
      expect(screen.getByText(/1\.000,00/)).toBeTruthy();
    });
  });

  test('S115-T12 (V3a): SimulatorScreen aberto direto com corretora sem saldo escolhe corrente por padrão e exibe aviso de saldo negativo', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora Vazia',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 80_000, // R$ 800,00
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Sim',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '25.00',
      target_percentage_in_class: 100,
    });

    const screen = await render(
      <SimulatorScreen
        initialPortfolioId={portfolio.id}
        initialAmount="962,50"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`sim-cash-account-${checking.id}`)).toBeTruthy();
      expect(screen.getByTestId('sim-cash-negative-warning')).toBeTruthy();
      expect(screen.getByText(/A conta Itaú ficará negativa/i)).toBeTruthy();
    });
  });

  test('S115-T13 (V7b): AccountsScreen com hideFab permite criar 2 contas seguidas', async () => {
    const screen = await render(<AccountsScreen hideFab onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Nova conta')).toBeTruthy();
    });

    // Cria 1ª conta
    fireEvent.press(screen.getByText('Nova conta'));
    fireEvent.changeText(screen.getByTestId('account-name-input'), 'Conta 1');
    fireEvent.press(screen.getByTestId('account-save-btn'));

    await waitFor(() => {
      expect(screen.getByText('Conta 1')).toBeTruthy();
    });

    // Botão Nova conta continua acessível para criar a 2ª conta
    expect(screen.getByTestId('accounts-add-inline-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('accounts-add-inline-btn'));
    fireEvent.changeText(screen.getByTestId('account-name-input'), 'Conta 2');
    fireEvent.press(screen.getByTestId('account-save-btn'));

    await waitFor(() => {
      expect(screen.getByText('Conta 2')).toBeTruthy();
    });
  });

  test('S115-T14 (V7c): CompareScreen renderiza o gráfico comparativo', async () => {
    const spy = jest.spyOn(sandboxService, 'getHistory').mockResolvedValue([
      { date: '2026-01-02', close: 100 },
      { date: '2026-02-02', close: 112 },
    ]);
    const macroSpy = jest.spyOn(sandboxService, 'getMacroSeries').mockResolvedValue({
      cdi: [
        { date: '2026-01-02', ratePct: 0.04 },
        { date: '2026-02-02', ratePct: 0.04 },
      ],
      ipca: [],
      poupanca: [],
    });

    const screen = await render(<CompareScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('compare-chart')).toBeTruthy();
    });

    spy.mockRestore();
    macroSpy.mockRestore();
  });
});
