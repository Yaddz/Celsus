import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { FinanceHomeScreen } from '../finance';

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

async function seed() {
  await finService.initializeFinanceModule('2026-11-13');
  const acc = await finRepository.createAccount({
    name: 'Nubank',
    type: 'checking',
    initialBalanceCents: 0,
    color: '#D96628',
  });
  const base = {
    paid_date: null,
    paid_amount_cents: null,
    account_id: acc.id,
    recurrence_id: null,
    installment_group_id: null,
    installment_number: null,
    installment_total: null,
    kind: 'expense' as const,
    status: 'pending' as const,
  };
  await finRepository.createEntry({
    ...base,
    category_id: 'cat-moradia',
    amount_cents: 185000,
    due_date: '2026-11-15',
    description: 'Aluguel',
  });
  await finRepository.createEntry({
    ...base,
    category_id: 'cat-mercado',
    amount_cents: 30000,
    due_date: '2026-11-20',
    description: 'Feira',
  });
  finStore.setSelectedMonth('2026-11');
}

async function openHome() {
  await seed();
  await render(
    <FinanceHomeScreen onBack={jest.fn()} themeMode="light" referenceDateIso="2026-11-13" />
  );
  await waitFor(() => expect(screen.getByTestId('finance-category-chart')).toBeTruthy());
}

describe('Sprint 57 — Resumo do módulo Finanças: alinhamento e gasto por categoria navegável', () => {
  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
  });

  describe('S57-T01: Gasto por categoria abre os lançamentos filtrados', () => {
    it('tocar numa linha de categoria abre Lançamentos filtrando despesas dessa categoria', async () => {
      await openHome();

      fireEvent.press(screen.getByTestId('finance-category-dot-row-cat-moradia'));

      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      const f = finStore.getState().filters;
      expect(f.categoryId).toBe('cat-moradia');
      expect(f.kind).toBe('expense');
      expect(f.status).toBe('all');
    });

    it('"Ver tudo" abre Lançamentos só de despesas, limpando filtros antigos de categoria', async () => {
      finStore.setFilters({ categoryId: 'cat-mercado', status: 'paid' });
      await openHome();

      fireEvent.press(screen.getByTestId('finance-category-chart-action'));

      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      const f = finStore.getState().filters;
      expect(f.categoryId).toBeNull();
      expect(f.status).toBe('all');
      expect(f.kind).toBe('expense');
    });

    it('a linha de categoria é um botão acessível', async () => {
      await openHome();
      const row = screen.getByTestId('finance-category-dot-row-cat-moradia');
      expect(row.props.accessibilityRole).toBe('button');
      expect(row.props.accessibilityLabel).toMatch(/Moradia/);
    });
  });

  describe('S57-T02: Tiles "A vencer" e "Atrasadas" alinhados e navegáveis', () => {
    it('os dois tiles da linha usam o mesmo tipo de contêiner (botão) para ter larguras iguais', async () => {
      await openHome();
      const upcoming = screen.getByTestId('finance-upcoming-7d-btn');
      const overdue = screen.getByTestId('finance-overdue-tile');
      expect(upcoming.props.accessibilityRole).toBe('button');
      expect(overdue.props.accessibilityRole).toBe('button');
    });

    it('tocar em "A vencer" abre Lançamentos com pendentes', async () => {
      await openHome();

      fireEvent.press(screen.getByTestId('finance-upcoming-7d-btn'));

      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      expect(finStore.getState().filters.status).toBe('pending');
    });

    it('tocar em "Atrasadas" abre Lançamentos com pendentes e sem filtro de categoria', async () => {
      finStore.setFilters({ categoryId: 'cat-mercado' });
      await openHome();

      fireEvent.press(screen.getByTestId('finance-overdue-tile'));

      await waitFor(() => expect(screen.getByTestId('entries-list-screen')).toBeTruthy());
      expect(finStore.getState().filters.status).toBe('pending');
      expect(finStore.getState().filters.categoryId).toBeNull();
    });
  });

  describe('S57-T03: Rolagem não esconde o último atalho atrás do botão flutuante', () => {
    it('a rolagem da Home tem espaço inferior de pelo menos 120', async () => {
      await openHome();
      const scroll = screen.getByTestId('finance-home-scroll');
      const content = StyleSheet.flatten(scroll.props.contentContainerStyle);
      expect(content.paddingBottom).toBeGreaterThanOrEqual(120);
    });
  });
});
