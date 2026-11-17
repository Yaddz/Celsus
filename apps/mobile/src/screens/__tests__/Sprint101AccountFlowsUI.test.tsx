import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { AccountsScreen } from '../finance/AccountsScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';

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

describe('Sprint 101 — UI de Conta Corrente, Cheque Especial, Reservado e Despesas Futuras', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-17');
  });

  it('S101-T07: PROCESSING -50.00 em 2026-11-16 aparece como "Em processamento R$ 50,00" e exibe Saldo contábil informativo sem alterar saldo', async () => {
    const acc = await finRepository.createAccount({
      name: 'Itaú · Conta',
      type: 'checking',
      initialBalanceCents: 100000,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-itau-1',
      reportedBalanceCents: 100000,
      closingBalanceCents: 105000,
    });

    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: '2026-11-16',
      status: 'pending',
      account_id: acc.id,
      category_id: 'cat-outros-despesa',
      description: 'Compra em processamento',
      source: 'OPEN_FINANCE',
      external_id: 'tx-proc-1',
      of_class_reason: 'PROCESSING',
    });

    render(<AccountsScreen onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId(`account-row-${acc.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/Em processamento R\$\s*50,00/i)).toBeTruthy();
    expect(screen.getByText(/Saldo contábil R\$\s*1\.050,00/i)).toBeTruthy();
    expect(screen.getAllByText('R$ 1.000,00').length).toBeGreaterThanOrEqual(1);
  });

  it('S101-T09 & S101-T10: Cheque especial usado e Reservado (caixinhas) aparecem na conta sem alterar saldo', async () => {
    const acc = await finRepository.createAccount({
      name: 'Nubank · Conta',
      type: 'checking',
      initialBalanceCents: -23000,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-nubank-1',
      reportedBalanceCents: -23000,
      ofOverdraftUsedCents: 23000,
      ofReservedCents: 35050,
    });

    render(<AccountsScreen onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId(`account-row-${acc.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/Cheque especial usado R\$\s*230,00/i)).toBeTruthy();
    expect(screen.getByText(/Reservado \(caixinhas\) R\$\s*350,50/i)).toBeTruthy();
    expect(screen.getAllByText(/-R\$\s*230,00/).length).toBeGreaterThanOrEqual(1);
  });

  it('S101-T12: D44 — FinanceHomeScreen mostra "Despesas futuras R$ 1.536,69" separado de "A vencer · 7 dias"', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-xp-card',
    });

    const pendingItems = [
      { desc: 'Groceries', cents: 27955 },
      { desc: 'Parking', cents: 20666 },
      { desc: 'Online Courses', cents: 16132 },
      { desc: 'Telecommunications', cents: 13291 },
      { desc: 'Services', cents: 12965 },
      { desc: 'Digital services', cents: 12690 },
      { desc: 'Restante', cents: 49970 },
    ];
    await finRepository.createEntriesBatch(
      pendingItems.map((it, idx) => ({
        kind: 'expense' as const,
        amount_cents: it.cents,
        due_date: '2026-11-15',
        paid_date: '2026-11-15',
        paid_amount_cents: it.cents,
        status: 'paid' as const,
        account_id: card.id,
        category_id: 'cat-compras',
        description: it.desc,
        bill_month: '2026-12',
        source: 'OPEN_FINANCE',
        external_id: `tx-pend-card-${idx}`,
        of_raw_status: 'PENDING',
        of_raw_type: 'DEBIT',
      }))
    );

    render(<FinanceHomeScreen referenceDateIso="2026-11-17" />);
    await waitFor(() => {
      expect(screen.getByText(/Despesas futuras/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/R\$\s*1\.536,69/).length).toBeGreaterThanOrEqual(1);
  });
});
