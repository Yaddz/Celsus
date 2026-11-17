/**
 * Sprint 96 — Contas: as pílulas de ação (Open Finance, diferença, fechamento, arquivar) quebram linha
 * em vez de vazar pela lateral do cartão.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { AccountsScreen } from '../finance';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

describe('Sprint 96 — ações da linha de conta', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S96-T13: o contêiner de ações quebra linha e tem espaçamento vertical', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão XP Visa Infinite ·· 8297',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-card-xp',
      closingDay: null,
      reportedBalanceCents: 1079402,
    });

    render(<AccountsScreen onBack={jest.fn()} onOpenCardBill={jest.fn()} /> as any);

    await waitFor(() => {
      expect(screen.getByTestId(`account-actions-${card.id}`)).toBeTruthy();
    });
    const style = StyleSheet.flatten(screen.getByTestId(`account-actions-${card.id}`).props.style);
    expect(style.flexDirection).toBe('row');
    expect(style.flexWrap).toBe('wrap');
    expect(typeof style.rowGap === 'number' && style.rowGap > 0).toBe(true);
    expect(screen.getByTestId(`account-missing-closing-day-${card.id}`)).toBeTruthy();
    expect(screen.getByTestId(`account-archive-btn-${card.id}`)).toBeTruthy();
  });
});
