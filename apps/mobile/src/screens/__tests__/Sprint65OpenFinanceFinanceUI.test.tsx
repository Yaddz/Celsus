import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { finService } from '../../services/finService';
import { AccountsScreen } from '../finance/AccountsScreen';
import { EntriesListScreen } from '../finance/EntriesListScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';

describe('Sprint 65 — Telas Finanças Open Finance (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S65-UI01: AccountsScreen exibe selo Open Finance, saldo informado ("saldo de dd/mm"), diferença do calculado, bloqueia saldo inicial e pede closing_day nulo', async () => {
    const syncedChecking = await finRepository.createAccount({
      name: 'Itaú Sincronizado',
      type: 'checking',
      initialBalanceCents: 100000, // calculado = 1000,00
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-chk-ui',
      reportedBalanceCents: 125000, // informado = 1250,00 (diferença +250,00)
      reportedBalanceAt: '2026-11-16T10:00:00.000Z',
    } as any);

    const syncedCardNoClose = await finRepository.createAccount({
      name: 'Cartão Sem Fechamento',
      type: 'card',
      initialBalanceCents: 0,
      dueDay: 20,
      closingDay: null,
      creditLimitCents: 500000,
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-crd-ui',
      reportedBalanceCents: 80000,
      reportedBalanceAt: '2026-11-16T10:00:00.000Z',
    } as any);

    const { getByTestId, getByText } = await render(<AccountsScreen />);

    await waitFor(() => {
      expect(getByTestId(`account-row-${syncedChecking.id}`)).toBeTruthy();
    });

    // Selo Open Finance + "saldo de 16/11" + diferença
    expect(getByTestId(`account-of-badge-${syncedChecking.id}`)).toBeTruthy();
    expect(getByText(/saldo de 16\/11/i)).toBeTruthy();
    expect(getByTestId(`account-balance-diff-${syncedChecking.id}`)).toBeTruthy();

    // Ao editar conta sincronizada, campo de saldo inicial fica bloqueado
    fireEvent.press(getByTestId(`account-row-${syncedChecking.id}`));
    await waitFor(() => {
      const balanceInput = getByTestId('account-form-balance-input');
      expect(balanceInput.props.editable).toBe(false);
    });

    // Cartão sincronizado sem closing_day exibe aviso/prompt para informar o dia de fechamento
    expect(getByTestId(`account-missing-closing-day-${syncedCardNoClose.id}`)).toBeTruthy();
  });

  test('S65-UI02: EntriesListScreen exibe selo Open Finance nos lançamentos sincronizados', async () => {
    const acc = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 0,
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-nu',
    } as any);

    const entry = await finRepository.createEntry({
      kind: 'expense',
      amountCents: 4990,
      dueDate: '2026-11-15',
      status: 'paid',
      paidDate: '2026-11-15',
      paidAmountCents: 4990,
      accountId: acc.id,
      categoryId: 'cat-mercado',
      description: 'Padaria Open Finance',
      source: 'OPEN_FINANCE',
      externalId: 'pg-tx-ui-1',
    } as any);

    const { getByTestId } = await render(<EntriesListScreen />);

    await waitFor(() => {
      expect(getByTestId(`entry-row-${entry.id}`)).toBeTruthy();
      expect(getByTestId(`entry-of-badge-${entry.id}`)).toBeTruthy();
    });
  });

  test('S65-UI03: FinanceHomeScreen mostra "Atualizado há N h" e aviso discreto com "Tentar de novo" em falha de rede', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await openFinanceRepository.upsertItem({
      id: 'item-ui-1',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: '2027-06-01T00:00:00.000Z',
      last_synced_at: twoHoursAgo,
      last_error: 'Falha de rede temporária',
    });

    const { getByTestId, getByText } = await render(<FinanceHomeScreen />);

    await waitFor(() => {
      expect(getByTestId('finance-of-updated-ago')).toBeTruthy();
      expect(getByText(/Atualizado há 2 h/i)).toBeTruthy();
      expect(getByTestId('finance-of-sync-error-banner')).toBeTruthy();
      expect(getByText(/Tentar de novo/i)).toBeTruthy();
    });
  });
});
