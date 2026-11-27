import React from 'react';
import { Alert, BackHandler } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { monthCloseService } from '../../services/monthCloseService';
import { MonthCloseScreen } from '../finance/MonthCloseScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

describe('Sprint 106 — MonthCloseScreen UI e BackState (artboard 8, R45)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S106-T08: MonthCloseScreen limita valor ao disponível, não mostra ativos/carteiras e pede confirmação extra se mês já fechado', async () => {
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 200000,
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 100000, // sobra R$ 1.000,00
      due_date: '2026-11-05',
      paid_date: '2026-11-05',
      paid_amount_cents: 100000,
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-salario',
      description: 'Salário',
    });

    // Ativos e carteiras no banco NÃO devem aparecer na tela
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Privada',
      docket_code: 'PRV-1',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'ITUB4',
      name: 'Itaú',
      asset_class: 'STOCK',
      quantity: '50',
      average_price: '30.00',
    });

    const onBack = jest.fn();
    const onClosedAndContribute = jest.fn();

    const { getByTestId, getByText, queryByText } = render(
      wrap(
        <MonthCloseScreen
          yearMonth="2026-11"
          referenceDateIso="2026-11-30"
          onBack={onBack}
          onClosedAndContribute={onClosedAndContribute}
        />
      )
    );

    await waitFor(() => {
      expect(getByTestId('month-close-screen')).toBeTruthy();
      expect(getByText(/Fechar novembro/i)).toBeTruthy();
      expect(getByText(/Separar para investir/i)).toBeTruthy();
      expect(getByText(/fica na conta/i)).toBeTruthy();
      expect(getByText(/Sai de/i)).toBeTruthy();
      expect(getByText(/Próximo passo em Investimentos/i)).toBeTruthy();
    });

    // Nenhum ativo/carteira renderizado
    expect(queryByText(/Carteira Privada/i)).toBeNull();
    expect(queryByText(/ITUB4/)).toBeNull();

    // Tenta digitar/ajustar acima do disponível (1.000,00): deve limitar a 100000
    const amountInput = getByTestId('month-close-amount-input');
    fireEvent.changeText(amountInput, '5000,00');
    await waitFor(() => {
      expect(getByTestId('month-close-remaining-text').props.children).toContain('0,00');
    });

    // Fecha uma primeira vez sem aportar
    fireEvent.press(getByTestId('month-close-keep-btn'));
    await waitFor(() => {
      expect(onBack).toHaveBeenCalled();
    });

    // S106-T07 (UI): fechar o mesmo mês duas vezes pede confirmação extra
    const alertSpy = jest.spyOn(Alert, 'alert');
    await monthCloseService.closeWithoutContributing('2026-11');

    const second = render(
      wrap(
        <MonthCloseScreen
          yearMonth="2026-11"
          referenceDateIso="2026-11-30"
          onBack={jest.fn()}
          onClosedAndContribute={jest.fn()}
        />
      )
    );

    await waitFor(() => {
      expect(second.getByTestId('month-close-keep-btn')).toBeTruthy();
    });
    fireEvent.press(second.getByTestId('month-close-keep-btn'));
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringMatching(/já fechado/i),
      expect.any(String),
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  test('S106-T09: botão "Fechar o mês" aparece no Resumo sem flag e voltar do Android fecha MonthCloseScreen', async () => {
    const baseState: BackState = {
      activeTab: 'home',
      isSettingsOpen: false,
      isTransactionDetailOpen: false,
      isAllTransactionsOpen: false,
      isClassDetailOpen: false,
      isTransactionModalOpen: false,
      isPortfolioManagerOpen: false,
      isSimulatorOpen: false,
      isFinanceOpen: true,
      isMonthCloseOpen: true,
    };
    expect(resolveBackAction(baseState)).toBe('close-month-close');

    await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 100000,
    });

    const listeners: Array<() => boolean> = [];
    const addSpy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_ev, cb) => {
      listeners.push(cb);
      return { remove: jest.fn() } as unknown as ReturnType<typeof BackHandler.addEventListener>;
    });

    const { getByTestId, queryByTestId } = render(
      wrap(<FinanceHomeScreen referenceDateIso="2026-11-15" />)
    );

    await waitFor(() => {
      expect(getByTestId('finance-close-month-btn')).toBeTruthy();
    });

    fireEvent.press(getByTestId('finance-close-month-btn'));
    await waitFor(() => {
      expect(getByTestId('month-close-screen')).toBeTruthy();
    });

    // Dispara voltar do Android -> volta para o Resumo
    const lastHandler = listeners[listeners.length - 1];
    expect(lastHandler()).toBe(true);
    await waitFor(() => {
      expect(queryByTestId('month-close-screen')).toBeNull();
      expect(getByTestId('finance-accounts-balance-tile')).toBeTruthy();
    });

    addSpy.mockRestore();
  });
});
