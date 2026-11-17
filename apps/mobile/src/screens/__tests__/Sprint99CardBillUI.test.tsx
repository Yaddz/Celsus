import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import * as cardsDomain from '../../domain/financeFlow/cards';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { AccountsScreen } from '../finance/AccountsScreen';
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

describe('Sprint 99 — UI de Contas e Fatura do Cartão (D27, D29, D40, D41, D45)', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    await finService.initializeFinanceModule('2026-11-17');
  });

  it('S99-T09: D27 — CardBillScreen exibe totalAmount 1.250,35 da Pluggy e faixa de diferença quando itens somam 1.240,35', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
      creditLimitCents: 1441023,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-xp-1',
      creditUsedCents: 1079402,
      ofAvailableLimitCents: 361621,
      calendarSource: 'PLUGGY_BILLS',
    } as any);

    await finRepository.upsertBill({
      accountId: card.id,
      externalId: 'bill-ext-1250',
      billMonth: '2026-11',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      totalAmountCents: 125035,
      minimumPaymentCents: 18755,
      payments: [
        {
          id: 'p1',
          paymentDate: '2026-11-06T00:00:00.000Z',
          amount: 1250.35,
          valueType: 'FULL_PAYMENT',
          paymentMode: 'DEBIT_ACCOUNT',
        },
      ],
      financeCharges: [
        {
          id: 'c1',
          type: 'IOF',
          amount: 7.01,
          currencyCode: 'BRL',
          additionalInfo: null,
        },
      ],
    });

    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 124035,
      due_date: '2026-11-01',
      paid_date: '2026-11-01',
      paid_amount_cents: 124035,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-compras',
      description: 'Compras do mês',
      bill_month: '2026-11',
      source: 'OPEN_FINANCE',
      external_id: 'tx-124035',
    });

    render(
      <CardBillScreen
        accountId={card.id}
        initialBillMonth="2026-11"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('card-bill-total').props.children).toContain('1.250,35');
    });
    expect(
      screen.getByText(/Itens somam R\$\s*1\.240,35;\s*fatura do banco:\s*R\$\s*1\.250,35/i)
    ).toBeTruthy();
    expect(screen.getByText(/já incluídos no total/i)).toBeTruthy();
  });

  it('S99-T10 & S99-T18: D29/D41 — AccountsScreen mostra limite usado/disponível/fatura atual da Pluggy sem chamar availableLimit e sem "Dif. calculado"', async () => {
    const availSpy = jest.spyOn(cardsDomain, 'availableLimit');

    const card = await finRepository.createAccount({
      name: 'Cartão XP Visa Infinite ·· 8297',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
      creditLimitCents: 1441023,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-xp-8297',
      reportedBalanceCents: 1079402,
      creditUsedCents: 1079402,
      ofAvailableLimitCents: 361621,
      calendarSource: 'PLUGGY_BILLS',
    } as any);

    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 92096,
      due_date: '2026-11-12',
      paid_date: '2026-11-12',
      paid_amount_cents: 92096,
      status: 'paid',
      account_id: card.id,
      category_id: 'cat-compras',
      description: 'Compra atual',
      bill_month: '2026-12',
      source: 'OPEN_FINANCE',
      external_id: 'tx-open-92096',
    });

    render(<AccountsScreen onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId(`account-row-${card.id}`)).toBeTruthy();
    });

    expect(availSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Limite usado R\$\s*10\.794,02/i)).toBeTruthy();
    expect(screen.getByText(/Disponível R\$\s*3\.616,21/i)).toBeTruthy();
    expect(screen.getByText(/Fatura atual R\$/i)).toBeTruthy();
    expect(screen.queryByTestId(`account-balance-diff-${card.id}`)).toBeNull();

    availSpy.mockRestore();
  });

  it('S99-T17 & S99-T19: D40/D45 — Nubank 9.160,38 e XP 3.616,21 disponíveis + total nos cartões R$ 11.333,64 · 47% do limite de R$ 24.110,23', async () => {
    const nubank = await finRepository.createAccount({
      name: 'Nubank Platinum ·· 8926',
      type: 'card',
      closingDay: 2,
      dueDay: 9,
      creditLimitCents: 970000,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-nubank-8926',
      reportedBalanceCents: 53962,
      creditUsedCents: 53962,
      ofAvailableLimitCents: 916038,
      calendarSource: 'PLUGGY_BILLS',
    } as any);

    const xp = await finRepository.createAccount({
      name: 'Cartão XP Visa Infinite ·· 8297',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
      creditLimitCents: 1441023,
      source: 'OPEN_FINANCE',
      ofAccountId: 'of-xp-8297',
      reportedBalanceCents: 1079402,
      creditUsedCents: 1079402,
      ofAvailableLimitCents: 361621,
      calendarSource: 'PLUGGY_BILLS',
    } as any);

    render(<AccountsScreen onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId(`account-row-${nubank.id}`)).toBeTruthy();
      expect(screen.getByTestId(`account-row-${xp.id}`)).toBeTruthy();
    });

    expect(screen.getByText(/Disponível R\$\s*9\.160,38/i)).toBeTruthy();
    expect(screen.getByText(/Disponível R\$\s*3\.616,21/i)).toBeTruthy();
    expect(
      screen.getByText(/Total nos cartões R\$\s*11\.333,64\s*·\s*47% do limite de R\$\s*24\.110,23/i)
    ).toBeTruthy();

    // Também no resumo do CardBillScreen para o Nubank
    render(
      <CardBillScreen
        accountId={nubank.id}
        initialBillMonth="2026-11"
        onBack={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Disponível:\s*R\$\s*9\.160,38/i)).toBeTruthy();
    });
  });
});
