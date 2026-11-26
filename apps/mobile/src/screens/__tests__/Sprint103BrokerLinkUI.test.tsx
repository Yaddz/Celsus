import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { finService } from '../../services/finService';
import { AccountsScreen } from '../finance/AccountsScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 103 — UI de Contas Corretora e Vínculo Carteira <-> Conta', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-26');
  });

  test('S103-T14: AccountsScreen agrupa "Corretoras" com carteiras vinculadas; formulário tem tipo Corretora sem campos de cartão', async () => {
    const broker = await finRepository.createAccount({
      name: 'XP Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'REV-CART-001',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    render(<AccountsScreen onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('accounts-section-brokers')).toBeTruthy();
    });
    expect(screen.getByText('XP Corretora')).toBeTruthy();
    expect(screen.getByText(/Carteira XP/)).toBeTruthy();

    // Abre formulário de nova conta e seleciona "Corretora"
    fireEvent.press(screen.getByTestId('accounts-add-btn'));
    await waitFor(() => {
      expect(screen.getByText('Corretora')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Corretora'));

    // Não exibe campos de cartão
    expect(screen.queryByText(/DIA DE FECHAMENTO/i)).toBeNull();
    // Exibe seletor de carteiras vinculadas
    expect(screen.getByText(/CARTEIRAS VINCULADAS/i)).toBeTruthy();
  });

  test('S103-T15: PortfolioManagementScreen exibe "Conta da corretora: <nome> ›" e vincular grava portfolios.fin_account_id', async () => {
    const broker = await finRepository.createAccount({
      name: 'BTG Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'REV-CART-001',
    });

    render(<PortfolioManagementScreen onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('portfolio-broker-link-row')).toBeTruthy();
    });
    expect(screen.getByText(/Conta da corretora:/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('portfolio-broker-link-row'));
    await waitFor(() => {
      expect(screen.getByTestId(`broker-link-option-${broker.id}`)).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId(`broker-link-option-${broker.id}`));

    await waitFor(async () => {
      const updated = await portfolioRepository.getPortfolioById(portfolio.id);
      expect(updated?.fin_account_id).toBe(broker.id);
    });
    expect(screen.getByText(/Conta da corretora:\s*BTG Corretora/)).toBeTruthy();
  });
});
