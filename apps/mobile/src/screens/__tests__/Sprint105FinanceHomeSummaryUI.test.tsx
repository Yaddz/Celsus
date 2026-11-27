import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

describe('Sprint 105 — FinanceHomeScreen Resumo (artboard 7, R43, DEC-5)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S105-T12: Resumo renderiza tiles Saldo em contas, O mês em uma linha, Reserva e Próximos 7 dias', async () => {
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 300000, // R$ 3.000,00
    });
    const broker = await finRepository.createAccount({
      name: 'XP Corretora',
      type: 'broker',
      initialBalanceCents: 100000,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 500000,
      due_date: '2026-11-05',
      paid_date: '2026-11-05',
      paid_amount_cents: 500000,
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-salario',
      description: 'Salário',
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 200000,
      due_date: '2026-11-10',
      paid_date: '2026-11-10',
      paid_amount_cents: 200000,
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-mercado',
      description: 'Mercado',
    });
    await finRepository.createEntry({
      kind: 'transfer_out',
      amount_cents: 100000,
      due_date: '2026-11-12',
      paid_date: '2026-11-12',
      paid_amount_cents: 100000,
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-outros-despesa',
      description: 'Aporte XP',
      transfer_group_id: 'tr-1',
    });
    await finRepository.createEntry({
      kind: 'transfer_in',
      amount_cents: 100000,
      due_date: '2026-11-12',
      paid_date: '2026-11-12',
      paid_amount_cents: 100000,
      status: 'paid',
      account_id: broker.id,
      category_id: 'cat-outros-receita',
      description: 'Aporte XP',
      transfer_group_id: 'tr-1',
    });

    const { getByTestId, getByText } = render(
      wrap(<FinanceHomeScreen referenceDateIso="2026-11-15" />)
    );

    await waitFor(() => {
      expect(getByTestId('finance-accounts-balance-tile')).toBeTruthy();
      expect(getByTestId('finance-month-one-line-tile')).toBeTruthy();
      expect(getByTestId('finance-reserve-tile')).toBeTruthy();
      expect(getByTestId('finance-upcoming-tile')).toBeTruthy();
      expect(getByText(/Saldo em contas/i)).toBeTruthy();
      expect(getByText(/O mês em uma linha/i)).toBeTruthy();
      expect(getByText(/Enviado à corretora/i)).toBeTruthy();
      expect(getByText(/Reserva/i)).toBeTruthy();
    });
  });

  test('S105-T13: Resumo respeita modo privacidade (R$ ••••••)', async () => {
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 200000,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 100000,
      due_date: '2026-11-05',
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-salario',
      description: 'Salário',
    });

    const { getByTestId, queryByText } = render(
      wrap(<FinanceHomeScreen referenceDateIso="2026-11-15" isPrivacyMode={true} />)
    );

    await waitFor(() => {
      expect(getByTestId('finance-accounts-balance-tile')).toBeTruthy();
      expect(getByTestId('finance-month-one-line-tile')).toBeTruthy();
    });

    expect(queryByText(/2\.000,00/)).toBeNull();
    expect(queryByText(/1\.000,00/)).toBeNull();
  });

  test('S105-T14: DEC-5 — FinanceHomeScreen não renderiza nenhum valor ou bloco de carteira/investido', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Secreta XYZ',
      docket_code: 'SEC-99',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '100',
      average_price: '35.00',
    });
    await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    const { getByTestId, queryByText, queryByTestId } = render(
      wrap(<FinanceHomeScreen referenceDateIso="2026-11-15" />)
    );

    await waitFor(() => {
      expect(getByTestId('finance-accounts-balance-tile')).toBeTruthy();
    });

    expect(queryByText(/Carteira Secreta XYZ/i)).toBeNull();
    expect(queryByText(/PETR4/)).toBeNull();
    expect(queryByText(/3\.500,00/)).toBeNull();
    expect(queryByTestId('portfolio-goal-tile')).toBeNull();
    expect(queryByTestId('home-invested-tile')).toBeNull();
  });
});
