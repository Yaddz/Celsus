import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { EntriesListScreen } from '../finance';

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

async function seedTransfer() {
  await finService.initializeFinanceModule('2026-11-13');
  const from = await finRepository.createAccount({
    name: 'Nubank',
    type: 'checking',
    initialBalanceCents: 100000,
  });
  const to = await finRepository.createAccount({
    name: 'Reserva',
    type: 'checking',
    initialBalanceCents: 0,
  });
  return finService.createTransfer({
    fromAccountId: from.id,
    toAccountId: to.id,
    amountCents: 25000,
    dateIso: '2026-11-12',
    description: 'Guardar reserva',
  });
}

describe('Sprint 70 — Transferências na lista de lançamentos', () => {
  beforeEach(() => {
    resetDatabase();
    finStore.reset();
    jest.clearAllMocks();
  });

  it('S70-U01: a perna de entrada aparece com sinal positivo e a de saída com negativo, ambas marcadas como transferência', async () => {
    const { outEntry, inEntry } = await seedTransfer();
    finStore.setSelectedMonth('2026-11');
    render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId(`entry-row-${inEntry.id}`)).toBeTruthy());

    expect(screen.getByTestId(`entry-amount-${inEntry.id}`)).toHaveTextContent(/^\+/);
    expect(screen.getByTestId(`entry-amount-${outEntry.id}`)).toHaveTextContent(/^-/);
    expect(screen.getByTestId(`entry-subtitle-${inEntry.id}`)).toHaveTextContent(/Transferência/);
    expect(screen.getByTestId(`entry-subtitle-${outEntry.id}`)).toHaveTextContent(/Transferência/);
  });

  it('S70-U02: a folha de ações de uma transferência só oferece excluir', async () => {
    const { inEntry } = await seedTransfer();
    finStore.setSelectedMonth('2026-11');
    render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId(`entry-row-${inEntry.id}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`entry-row-${inEntry.id}`));

    await waitFor(() =>
      expect(screen.getByTestId(`entry-action-delete-${inEntry.id}`)).toBeTruthy()
    );
    expect(screen.queryByTestId(`entry-action-edit-${inEntry.id}`)).toBeNull();
    expect(screen.queryByTestId(`entry-action-reopen-${inEntry.id}`)).toBeNull();
    expect(screen.queryByTestId(`entry-action-pay-${inEntry.id}`)).toBeNull();
  });

  it('S70-U03: excluir uma perna apaga a transferência inteira', async () => {
    const { outEntry, inEntry } = await seedTransfer();
    finStore.setSelectedMonth('2026-11');
    render(<EntriesListScreen onBack={jest.fn()} referenceDateIso="2026-11-13" themeMode="dark" />);

    await waitFor(() => expect(screen.getByTestId(`entry-row-${inEntry.id}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`entry-row-${inEntry.id}`));
    await waitFor(() =>
      expect(screen.getByTestId(`entry-action-delete-${inEntry.id}`)).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId(`entry-action-delete-${inEntry.id}`));

    await waitFor(() => expect(screen.getByTestId('entry-delete-confirm-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('entry-delete-confirm-btn'));

    await waitFor(async () => {
      expect(await finRepository.getEntryById(inEntry.id)).toBeNull();
      expect(await finRepository.getEntryById(outEntry.id)).toBeNull();
    });
    await waitFor(() => expect(screen.queryByTestId(`entry-row-${outEntry.id}`)).toBeNull());
  });
});
