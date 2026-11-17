import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { CardBillScreen } from '../finance/CardBillScreen';
import { EntriesListScreen } from '../finance/EntriesListScreen';
import { EntryFormSheet } from '../finance/EntryFormSheet';

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

describe('Sprint 74 — Formulário, Lista e Extrato do Cartão (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-10');
  });

  test('S74-T10: EntryFormSheet em cartão mostra "Data da compra", hint dinâmico da fatura (e 1ª parcela), e salva como paid', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão Nubank',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 500000,
    });

    const onSaved = jest.fn();
    await render(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        onSaved={onSaved}
        defaultDueDate="2026-11-10"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-account-select')).toBeTruthy();
    });

    // Seleciona o cartão
    fireEvent.press(screen.getByTestId('entry-form-account-select'));
    await waitFor(() => {
      expect(screen.getAllByText('Cartão Nubank').length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.press(screen.getAllByText('Cartão Nubank').at(-1)!);

    // Rótulo vira "Data da compra" e aparece o hint da fatura de dezembro/2026
    await waitFor(() => {
      expect(screen.getByText('Data da compra')).toBeTruthy();
      expect(screen.getByTestId('entry-form-bill-hint')).toHaveTextContent(
        /Fatura de .*12\/2026|dezembro\/2026.*fecha 25\/11.*vence 05\/12/i
      );
    });

    // Troca a data para depois do fechamento (26/11/2026) -> fatura muda para janeiro/2027
    fireEvent.changeText(screen.getByTestId('entry-form-due-date'), '26/11/2026');
    await waitFor(() => {
      expect(screen.getByTestId('entry-form-bill-hint')).toHaveTextContent(
        /Fatura de .*01\/2027|janeiro\/2027.*fecha 25\/12.*vence 05\/01/i
      );
    });

    // Volta para 10/11/2026 e salva
    fireEvent.changeText(screen.getByTestId('entry-form-due-date'), '10/11/2026');
    fireEvent.changeText(screen.getByTestId('entry-form-amount'), '150,00');
    fireEvent.changeText(screen.getByTestId('entry-form-description'), 'Supermercado');
    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const entries = (await finRepository.listAllEntries()).filter((e) => e.account_id === card.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('paid');
    expect(entries[0].due_date).toBe('2026-11-10');
    expect(entries[0].paid_date).toBe('2026-11-10');
    expect(entries[0].bill_month).toBe('2026-12');
    expect(entries[0].account_id).toBe(card.id);
  });

  test('S74-T11: Cartão sem closing_day/due_day mostra aviso de datas estimadas com atalho no formulário e no extrato', async () => {
    const cardSemDatas = await finRepository.createAccount({
      name: 'Cartão Sem Datas',
      type: 'card',
      closingDay: null,
      dueDay: null,
      creditLimitCents: 200000,
    });

    const onEditFromForm = jest.fn();
    await render(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        onEditCardAccount={onEditFromForm}
        defaultDueDate="2026-11-10"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-account-select')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('entry-form-account-select'));
    await waitFor(() => expect(screen.getAllByText('Cartão Sem Datas').length).toBeGreaterThanOrEqual(2));
    fireEvent.press(screen.getAllByText('Cartão Sem Datas').at(-1)!);

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-estimated-dates-warning')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('entry-form-edit-card-shortcut'));
    expect(onEditFromForm).toHaveBeenCalledWith(cardSemDatas.id);

    const onEditFromBill = jest.fn();
    await render(
      <CardBillScreen
        accountId={cardSemDatas.id}
        initialBillMonth="2026-12"
        onBack={jest.fn()}
        onEditCardAccount={onEditFromBill}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('card-statement-estimated-warning')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('card-statement-edit-card-shortcut'));
    expect(onEditFromBill).toHaveBeenCalledWith(cardSemDatas.id);
  });

  test('S74-T12: EntriesListScreen exclui compras de cartão das pendências, mostra subtítulo com Fatura em Liquidados e exibe uma linha por fatura em aberto', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 500000,
    });

    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 12000,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 12000,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-alimentacao',
      description: 'Compra Cartão',
      bill_month: '2026-12',
      installment_number: 2,
      installment_total: 6,
    });

    const onOpenCardBill = jest.fn();
    await render(
      <EntriesListScreen
        onBack={jest.fn()}
        onOpenCardBill={onOpenCardBill}
        referenceDateIso="2026-12-01"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Fatura Nubank/i)).toBeTruthy();
    });

    // A fatura em aberto aparece em Próximos dias (vence 05/12, ref 01/12) e abre ao tocar
    fireEvent.press(screen.getByText(/Fatura Nubank/i));
    expect(onOpenCardBill).toHaveBeenCalledWith(card.id, '2026-12');

    // A compra individual aparece apenas em Liquidados com subtítulo contendo o cartão, Fatura e Parcela
    expect(screen.getByText(/10\/11\/2026 • Nubank • Fatura .* • Parcela 2\/6/i)).toBeTruthy();
  });

  test('S74-T13: CardBillScreen exibe extrato com seletor horizontal de faturas, período, agrupamento por dia, estorno positivo e bloco de pagamentos', async () => {
    const card = await finRepository.createAccount({
      name: 'Nubank',
      type: 'card',
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 500000,
    });

    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 10000,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 10000,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-alimentacao',
      description: 'Restaurante Dia 10',
      bill_month: '2026-12',
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 2500,
      due_date: '2026-11-12',
      paid_date: '2026-11-12',
      paid_amount_cents: 2500,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-outros-receita',
      description: 'Estorno Loja',
      bill_month: '2026-12',
    });
    await finRepository.createEntry({
      kind: 'transfer_in',
      amount_cents: 3000,
      due_date: '2026-12-01',
      paid_date: '2026-12-01',
      paid_amount_cents: 3000,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-outros-receita',
      description: 'Pagamento parcial',
      bill_month: '2026-12',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: '2026-12-10',
      paid_date: '2026-12-10',
      paid_amount_cents: 5000,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-compras',
      description: 'Parcela Futura',
      bill_month: '2027-01',
      installment_number: 2,
      installment_total: 2,
    });

    await render(
      <CardBillScreen
        accountId={card.id}
        initialBillMonth="2026-12"
        onBack={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('card-bill-screen')).toBeTruthy();
      expect(screen.getByTestId('card-statement-bill-selector')).toBeTruthy();
      expect(screen.getByTestId('card-statement-bill-pill-2026-12')).toBeTruthy();
      expect(screen.getByTestId('card-statement-bill-pill-2027-01')).toBeTruthy();
      expect(screen.getByTestId('card-statement-period')).toHaveTextContent(/25\/10.*24\/11/);
      expect(screen.getByTestId('card-statement-day-2026-11-10')).toBeTruthy();
      expect(screen.getByTestId('card-statement-day-2026-11-12')).toBeTruthy();
      expect(screen.getByTestId('card-bill-total')).toHaveTextContent(/75,00/);
      expect(screen.getByText(/\+R\$ 25,00/)).toBeTruthy();
      expect(screen.getByTestId('card-bill-pay-btn')).toBeTruthy();
      expect(screen.getByTestId('card-bill-import-btn')).toBeTruthy();
    });

    // Troca para a fatura futura pelo seletor
    fireEvent.press(screen.getByTestId('card-statement-bill-pill-2027-01'));
    await waitFor(() => {
      expect(screen.getByText('Parcela Futura')).toBeTruthy();
      expect(screen.getByTestId('card-bill-total')).toHaveTextContent(/50,00/);
    });
  });
});
