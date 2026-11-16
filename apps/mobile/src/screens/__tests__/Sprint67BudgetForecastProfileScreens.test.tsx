import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import {
  BudgetScreen,
  FinanceHomeScreen,
  FinanceMoreScreen,
} from '../finance';
import { SettingsBackupScreen } from '../SettingsBackupScreen';

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

describe('Sprint 67 — Telas de Orçamento, Previsão de Saldo no Resumo e Lembretes no Perfil', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.reset();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S67-T14: FinanceMoreScreen exibe opção "Orçamento" e navega para budgets', () => {
    const onOpen = jest.fn();
    render(<FinanceMoreScreen onBack={jest.fn()} onOpen={onOpen} />);

    const budgetRow = screen.getByTestId('finance-more-budgets');
    expect(budgetRow).toBeTruthy();
    expect(screen.getByText('Orçamento')).toBeTruthy();

    fireEvent.press(budgetRow);
    expect(onOpen).toHaveBeenCalledWith('budgets');
  });

  test('S67-T15: BudgetScreen exibe DotTrack por categoria, gasto/limite, quanto resta por dia, sugestão 3 meses e "Definir limite" inline', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 300000,
    });
    // Histórico nos 3 meses anteriores para cat-mercado: 600, 900, 1200 -> média = 900,00
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 60000,
      dueDate: '2026-08-10',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Ago',
      status: 'paid',
      paidDate: '2026-08-10',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 90000,
      dueDate: '2026-09-10',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Set',
      status: 'paid',
      paidDate: '2026-09-10',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 120000,
      dueDate: '2026-10-10',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Out',
      status: 'paid',
      paidDate: '2026-10-10',
    });
    // Gasto no mês atual (novembro) = 450,00
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 45000,
      dueDate: '2026-11-10',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Nov',
      status: 'paid',
      paidDate: '2026-11-10',
    });

    const repo = finRepository as any;
    await repo.upsertBudget({
      categoryId: 'cat-mercado',
      yearMonth: null,
      limitCents: 100000, // R$ 1.000,00
    });

    render(<BudgetScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('budget-screen')).toBeTruthy();
      expect(screen.getByTestId('budget-dot-track-cat-mercado')).toBeTruthy();
    });

    expect(screen.getByText(/450,00/)).toBeTruthy();
    expect(screen.getByText(/1\.000,00/)).toBeTruthy();
    expect(screen.getByText(/por dia/i)).toBeTruthy();

    // Edição inline "Definir limite" com sugestão da média dos últimos 3 meses (R$ 900,00)
    const setLimitBtn = screen.getByTestId('budget-set-limit-cat-mercado');
    fireEvent.press(setLimitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('budget-limit-input-cat-mercado')).toBeTruthy();
      expect(screen.getByText(/Sugestão.*900,00/i)).toBeTruthy();
    });
  });

  test('S67-T16: FinanceHomeScreen exibe previsão sob Saldo do mês, aviso negativo, abre PriceAreaChart ao tocar e destaca % do orçamento em ouro/laranja', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 100000, // R$ 1.000,00
    });
    // Gasto pago em novembro: cat-mercado 850,00 (85% de 1000 -> ouro), cat-lazer 550,00 (110% de 500 -> laranja)
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 85000,
      dueDate: '2026-11-05',
      accountId: checking.id,
      categoryId: 'cat-mercado',
      description: 'Supermercado',
      status: 'paid',
      paidDate: '2026-11-05',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 55000,
      dueDate: '2026-11-06',
      accountId: checking.id,
      categoryId: 'cat-lazer',
      description: 'Viagem',
      status: 'paid',
      paidDate: '2026-11-06',
    });
    // Conta pendente grande no dia 20/11 que deixa o menor saldo negativo
    await finRepository.createEntry({
      kind: 'expense',
      amountCents: 120000,
      dueDate: '2026-11-20',
      accountId: checking.id,
      categoryId: 'cat-moradia',
      description: 'Aluguel',
      status: 'pending',
    });

    const repo = finRepository as any;
    await repo.upsertBudget({ categoryId: 'cat-mercado', yearMonth: null, limitCents: 100000 }); // 85%
    await repo.upsertBudget({ categoryId: 'cat-lazer', yearMonth: null, limitCents: 50000 }); // 110%

    render(<FinanceHomeScreen onBack={jest.fn()} themeMode="light" />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-cashflow-forecast')).toBeTruthy();
    });

    // Frase de previsão sob o Saldo do mês + aviso de menor saldo negativo
    expect(screen.getByTestId('finance-cashflow-forecast')).toHaveTextContent(/Previsão para 30\/11/i);
    expect(screen.getByTestId('finance-cashflow-forecast')).toHaveTextContent(/menor saldo/i);
    expect(screen.getByTestId('finance-cashflow-negative-warning')).toBeTruthy();

    // Linhas de Gasto por categoria mostram % do limite do orçamento
    expect(screen.getByTestId('finance-category-budget-pct-cat-mercado')).toHaveTextContent(/85%/);
    expect(screen.getByTestId('finance-category-budget-pct-cat-lazer')).toHaveTextContent(/110%/);

    // Tocar na previsão abre o gráfico PriceAreaChart
    fireEvent.press(screen.getByTestId('finance-cashflow-forecast'));
    await waitFor(() => {
      expect(screen.getByTestId('finance-cashflow-chart-modal')).toBeTruthy();
      expect(screen.getByTestId('price-area-chart-container')).toBeTruthy();
    });
  });

  test('S67-T17: SettingsBackupScreen (Perfil) exibe preferências de Lembretes de vencimento (ligado/desligado, antecedência e horário)', async () => {
    render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-reminders-tile')).toBeTruthy();
    });

    expect(screen.getByTestId('profile-reminders-switch')).toBeTruthy();
    expect(screen.getByTestId('profile-reminders-lead-0')).toBeTruthy();
    expect(screen.getByTestId('profile-reminders-lead-1')).toBeTruthy();
    expect(screen.getByTestId('profile-reminders-lead-3')).toBeTruthy();
    expect(screen.getByTestId('profile-reminders-time-input')).toBeTruthy();
  });
});
