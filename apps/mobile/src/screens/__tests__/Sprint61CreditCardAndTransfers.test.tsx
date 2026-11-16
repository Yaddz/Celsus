import React from 'react';
import { BackHandler } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import {
  AccountsScreen,
  EntryFormSheet,
  FinanceHomeScreen,
} from '../finance';
import { CardBillScreen } from '../finance/CardBillScreen';

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

describe('Sprint 61 — Telas de Cartão, Fatura e Transferências', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-12');
  });

  test('S61-T15: AccountsScreen exibe campos de fechamento/vencimento/limite no cartão e resumo na linha', async () => {
    const card = await (finRepository as any).createAccount({
      name: 'Nubank Ultravioleta',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 1000000,
    });
    await (finRepository as any).createEntry({
      kind: 'expense',
      amountCents: 250000,
      dueDate: '2026-11-05',
      accountId: card.id,
      categoryId: 'cat-mercado',
      description: 'Compra mês',
      billMonth: '2026-11',
    });

    const onOpenCardBill = jest.fn();
    render(<AccountsScreen onBack={jest.fn()} onOpenCardBill={onOpenCardBill} /> as any);

    await waitFor(() => {
      expect(screen.getByText('Nubank Ultravioleta')).toBeTruthy();
    });

    // Linha do cartão mostra fatura atual, vencimento e limite disponível (10.000 - 2.500 = 7.500)
    expect(screen.getByText(/Fatura atual/i)).toBeTruthy();
    expect(screen.getByText(/7\.500,00/)).toBeTruthy();
    expect(screen.getByText(/Venc\.?\s*dia 17|17\/11/i)).toBeTruthy();

    // Tocar no cartão abre a CardBillScreen
    fireEvent.press(screen.getByText('Nubank Ultravioleta'));
    expect(onOpenCardBill).toHaveBeenCalledWith(card.id);

    // Formulário de novo cartão exibe fechamento, vencimento e limite
    fireEvent.press(screen.getByTestId('accounts-add-btn'));
    fireEvent.press(screen.getByText('Cartão'));
    expect(screen.getByTestId('account-closing-day-input')).toBeTruthy();
    expect(screen.getByTestId('account-due-day-input')).toBeTruthy();
    expect(screen.getByTestId('account-credit-limit-input')).toBeTruthy();
  });

  test('S61-T16: CardBillScreen exibe fatura, compras e permite pagamento parcial', async () => {
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 500000,
    });
    const card = await (finRepository as any).createAccount({
      name: 'Nubank',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 500000,
    });
    await (finRepository as any).createEntry({
      kind: 'expense',
      amountCents: 180000,
      dueDate: '2026-11-03',
      accountId: card.id,
      categoryId: 'cat-mercado',
      description: 'Mercado Central',
      billMonth: '2026-11',
    });

    render(
      <CardBillScreen
        accountId={card.id}
        initialBillMonth="2026-11"
        onBack={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('card-bill-screen')).toBeTruthy();
      expect(screen.getByText('Mercado Central')).toBeTruthy();
    });

    expect(screen.getByTestId('card-bill-total')).toHaveTextContent(/1\.800,00/);

    // Abre folha de pagamento e paga parcialmente R$ 800,00
    fireEvent.press(screen.getByTestId('card-bill-pay-btn'));
    fireEvent.changeText(screen.getByTestId('bill-pay-amount-input'), '800,00');
    fireEvent.changeText(screen.getByTestId('bill-pay-date-input'), '16/11/2026');
    fireEvent.press(screen.getByTestId('bill-pay-confirm-btn'));

    await waitFor(async () => {
      const all = await finRepository.listAllEntries();
      const transfers = all.filter((e) => e.kind === 'transfer_in' || e.kind === 'transfer_out');
      expect(transfers).toHaveLength(2);
      expect(transfers.some((e) => e.account_id === checking.id && e.amount_cents === 80000)).toBe(true);
    });
  });

  test('S61-T17: EntryFormSheet oferece opção Transferência com conta de origem e destino', async () => {
    const contaA = await finRepository.createAccount({
      name: 'Conta A',
      type: 'checking',
      initialBalanceCents: 100000,
    });
    const contaB = await finRepository.createAccount({
      name: 'Conta B',
      type: 'cash',
      initialBalanceCents: 20000,
    });

    const onSaved = jest.fn();
    render(
      <EntryFormSheet
        visible
        onClose={jest.fn()}
        onSaved={onSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Transferência')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Transferência'));
    expect(screen.getByTestId('entry-transfer-from-picker')).toBeTruthy();
    expect(screen.getByTestId('entry-transfer-to-picker')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('entry-form-amount'), '350,00');
    fireEvent.changeText(screen.getByTestId('entry-form-description'), 'Pix entre contas');
    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(async () => {
      const entries = await finRepository.listAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.some((e) => e.kind === 'transfer_out' && e.account_id === contaA.id)).toBe(true);
      expect(entries.some((e) => e.kind === 'transfer_in' && e.account_id === contaB.id)).toBe(true);
    });
    expect(onSaved).toHaveBeenCalled();
  });

  test('S61-T18: FinanceHomeScreen navega para CardBillScreen com voltar do Android e soma faturas nos tiles de atenção', async () => {
    await finRepository.createAccount({
      name: 'Conta Principal',
      type: 'checking',
      initialBalanceCents: 400000,
    });
    const card = await (finRepository as any).createAccount({
      name: 'Cartão XP',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 10,
      dueDay: 17,
      creditLimitCents: 500000,
    });
    // Compra no dia 05/11 -> fatura 2026-11 vence em 17/11/2026 (dentro de 7 dias de 12/11/2026)
    await (finRepository as any).createEntry({
      kind: 'expense',
      amountCents: 95000,
      dueDate: '2026-11-05',
      accountId: card.id,
      categoryId: 'cat-mercado',
      description: 'Compra XP',
      billMonth: '2026-11',
    });

    const addListenerSpy = jest.spyOn(BackHandler, 'addEventListener');
    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-12" />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-upcoming-tile')).toBeTruthy();
    });

    // Tile A vencer inclui a fatura de R$ 950,00, e tile Atrasadas está zerado (compra do dia 05/11 não é atrasada!)
    expect(screen.getByTestId('finance-upcoming-tile')).toHaveTextContent(/950,00/);
    expect(screen.getByTestId('finance-overdue-tile')).toHaveTextContent(/0,00/);

    // Navega para Contas -> toca no Cartão XP -> abre CardBillScreen -> BackHandler volta para Contas
    fireEvent.press(screen.getByTestId('fin-dock-accounts'));
    await waitFor(() => {
      expect(screen.getByText('Cartão XP')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Cartão XP'));
    await waitFor(() => {
      expect(screen.getByTestId('card-bill-screen')).toBeTruthy();
    });

    const lastCall = addListenerSpy.mock.calls[addListenerSpy.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe('hardwareBackPress');
    (lastCall?.[1] as () => boolean | null | undefined)();

    await waitFor(() => {
      expect(screen.getByTestId('accounts-screen')).toBeTruthy();
    });
  });
});
