import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';

async function seedTwoMonthsData() {
  await finService.initializeFinanceModule('2026-11-13');
  const acc = await finRepository.createAccount({
    name: 'Conta Principal',
    type: 'checking',
    initialBalanceCents: 100000,
    color: '#D96628',
  });
  const cats = await finRepository.listCategories(false);
  const catId = cats[0]?.id ?? 'cat-outros';

  await finRepository.createEntry({
    kind: 'income',
    amount_cents: 500000,
    description: 'Salário Novembro',
    due_date: '2026-11-05',
    status: 'paid',
    paid_date: '2026-11-05',
    paid_amount_cents: 500000,
    account_id: acc.id,
    category_id: catId,
  });
  await finRepository.createEntry({
    kind: 'expense',
    amount_cents: 120000,
    description: 'Aluguel Novembro',
    due_date: '2026-11-10',
    status: 'paid',
    paid_date: '2026-11-10',
    paid_amount_cents: 120000,
    account_id: acc.id,
    category_id: catId,
  });

  await finRepository.createEntry({
    kind: 'income',
    amount_cents: 750000,
    description: 'Salário + 13º Dezembro',
    due_date: '2026-12-05',
    status: 'pending',
    account_id: acc.id,
    category_id: catId,
  });
  await finRepository.createEntry({
    kind: 'expense',
    amount_cents: 200000,
    description: 'Presentes Dezembro',
    due_date: '2026-12-15',
    status: 'pending',
    account_id: acc.id,
    category_id: catId,
  });
}

describe('Sprint 77 — FinanceHomeScreen: carrossel de mês e tiles Receitas/Despesas navegáveis', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.reset();
    finStore.setSelectedMonth('2026-11');
  });

  it('S77-T07: trocar de mês sincroniza finStore, atualiza os tiles sem piscar esqueleto e Hoje volta ao mês corrente', async () => {
    await seedTwoMonthsData();

    await render(
      <FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />
    );

    await waitFor(() => {
      expect(screen.getByTestId('finance-month-balance')).toBeTruthy();
    });

    expect(screen.getByTestId('finance-month-balance')).toHaveTextContent(/3\.800,00/);
    expect(screen.getByTestId('finance-month-income')).toHaveTextContent(/5\.000,00/);
    expect(screen.getByTestId('finance-month-expense')).toHaveTextContent(/1\.200,00/);
    expect(screen.queryByTestId('finance-month-today-btn')).toBeNull();

    // Arrastar para esquerda vai para 2026-12
    const track = screen.getByTestId('finance-month-carousel-track');
    fireEvent(track, 'layout', {
      nativeEvent: { layout: { width: 320, height: 160, x: 0, y: 0 } },
    });
    fireEvent(track, 'responderRelease', { gestureState: { dx: -180, dy: 0 } });

    await waitFor(() => {
      expect(finStore.getState().selectedMonth).toBe('2026-12');
      expect(screen.getByTestId('finance-home-month-label')).toHaveTextContent('Dezembro 2026');
    });

    // Não deve piscar esqueleto de carregamento ao trocar de mês
    expect(screen.queryByTestId('finance-loading')).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('finance-month-income')).toHaveTextContent(/7\.500,00/);
      expect(screen.getByTestId('finance-month-expense')).toHaveTextContent(/2\.000,00/);
    });

    // Botão Hoje aparece e volta para 2026-11
    const todayBtn = screen.getByTestId('finance-month-today-btn');
    fireEvent.press(todayBtn);

    await waitFor(() => {
      expect(finStore.getState().selectedMonth).toBe('2026-11');
      expect(screen.getByTestId('finance-home-month-label')).toHaveTextContent('Novembro 2026');
    });
    expect(screen.queryByTestId('finance-month-today-btn')).toBeNull();
  });

  it('S77-T08: tocar em Receitas ou Despesas abre Lançamentos filtrado com título Receitas/Despesas e limpar volta para Lançamentos', async () => {
    await seedTwoMonthsData();

    await render(
      <FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-13" />
    );

    await waitFor(() => {
      expect(screen.getByTestId('finance-month-income-tile')).toBeTruthy();
      expect(screen.getByTestId('finance-month-expense-tile')).toBeTruthy();
    });

    const incomeTile = screen.getByTestId('finance-month-income-tile');
    const expenseTile = screen.getByTestId('finance-month-expense-tile');

    expect(incomeTile.props.accessibilityRole).toBe('button');
    expect(incomeTile.props.accessibilityLabel).toMatch(/Ver receitas de novembro 2026/i);
    expect(expenseTile.props.accessibilityRole).toBe('button');
    expect(expenseTile.props.accessibilityLabel).toMatch(/Ver despesas de novembro 2026/i);

    // Tocar em Receitas
    fireEvent.press(incomeTile);

    await waitFor(() => {
      expect(screen.getByTestId('entries-list-screen')).toBeTruthy();
    });
    expect(finStore.getState().filters.kind).toBe('income');
    expect(screen.getAllByText('Receitas').length).toBeGreaterThanOrEqual(2);
    await waitFor(() => {
      expect(screen.getByText('Salário Novembro')).toBeTruthy();
    });
    expect(screen.queryByText('Aluguel Novembro')).toBeNull();

    // Limpar o filtro (selecionar Todos) volta o título para Lançamentos
    fireEvent.press(screen.getByTestId('entries-filter-kind-all'));
    await waitFor(() => {
      expect(finStore.getState().filters.kind).toBe('all');
      expect(screen.getAllByText('Lançamentos').length).toBeGreaterThanOrEqual(2);
    });
  });
});
