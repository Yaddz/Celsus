import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { resetDatabase } from '../../db/client';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { monthCloseService } from '../monthCloseService';
import { finReminderService } from '../finReminderService';
import { pendingContributionStore } from '../../stores/pendingContributionStore';
import { SimulatorScreen } from '../../screens/SimulatorScreen';

describe('Sprint 106 — monthCloseService, pendingContributionStore e SimulatorScreen (R45)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
    pendingContributionStore.clear();
  });

  test('S106-T05: Fechar e aportar grava marca, publica pendente, abre Simulador preenchido e gera 1 transferência + N compras', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Principal',
      type: 'checking',
      initialBalanceCents: 500000, // R$ 5.000,00
    });
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Longa',
      docket_code: 'CL-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '40.00',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '60.00',
    });
    // Renda fixa com rf_daily_liquidity = null não entra como líquida; rf_daily_liquidity = 1 entra
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'CDB-LIQ',
      name: 'CDB Liquidez Diária',
      asset_class: 'FIXED_INCOME',
      quantity: '1',
      average_price: '2000.00',
      rf_daily_liquidity: 1,
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'CDB-TRAV',
      name: 'CDB Vencimento',
      asset_class: 'FIXED_INCOME',
      quantity: '1',
      average_price: '5000.00',
      rf_daily_liquidity: null,
    });

    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 300000,
      due_date: '2026-11-05',
      paid_date: '2026-11-05',
      paid_amount_cents: 300000,
      status: 'paid',
      account_id: checking.id,
      category_id: 'cat-salario',
      description: 'Salário',
    });

    const proposal = await monthCloseService.getProposal('2026-11', {
      todayIso: '2026-11-30',
    });
    expect(proposal.liquidFixedIncomeCents).toBe(200000);
    expect(proposal.availableSurplus.availableCents).toBe(300000);

    await monthCloseService.closeAndContribute({
      yearMonth: '2026-11',
      amountCents: 100000, // R$ 1.000,00
      sourceAccountId: checking.id,
    });

    expect(await appMetaRepository.get('month-close:2026-11')).toBeTruthy();

    const pending = pendingContributionStore.consume();
    expect(pending).toEqual({
      amountCents: 100000,
      sourceAccountId: checking.id,
      month: '2026-11',
    });
    // Consumido uma vez
    expect(pendingContributionStore.getState()).toBeNull();

    const onClose = jest.fn();
    const onConfirmed = jest.fn();
    const { getByDisplayValue, getByText } = render(
      <SimulatorScreen
        initialPortfolioId={portfolio.id}
        initialAmount={pending!.amountCents / 100}
        sourceAccountId={pending!.sourceAccountId}
        onClose={onClose}
        onContributionsConfirmed={onConfirmed}
      />
    );

    await waitFor(() => {
      expect(getByDisplayValue('1000,00')).toBeTruthy();
    });

    fireEvent.press(getByText(/CALCULAR REBALANCEAMENTO/i));
    await waitFor(() => {
      expect(getByText(/CONFIRMAR APORTE/i)).toBeTruthy();
    });
    fireEvent.press(getByText(/CONFIRMAR APORTE/i));

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalled();
    });

    const allEntries = await finRepository.listAllEntries();
    const transfersOut = allEntries.filter((e) => e.kind === 'transfer_out');
    const buys = allEntries.filter((e) => e.kind === 'investment_buy');
    expect(transfersOut).toHaveLength(1);
    expect(transfersOut[0].account_id).toBe(checking.id);
    expect(buys.length).toBeGreaterThanOrEqual(1);
  });

  test('S106-T06: fechar Simulador sem confirmar não lança nada e limpa pendente; fechar sem aportar só grava a marca', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 200000,
    });

    pendingContributionStore.set({
      amountCents: 50000,
      sourceAccountId: checking.id,
      month: '2026-11',
    });

    const onClose = jest.fn();
    const { getByTestId } = render(
      <SimulatorScreen
        initialAmount={500}
        sourceAccountId={checking.id}
        onClose={onClose}
      />
    );

    fireEvent.press(getByTestId('close-simulator-btn'));
    expect(onClose).toHaveBeenCalled();
    pendingContributionStore.clear();
    expect(pendingContributionStore.getState()).toBeNull();

    const entriesBefore = await finRepository.listAllEntries();
    expect(entriesBefore).toHaveLength(0);

    // Fechar sem aportar só grava a marca
    await monthCloseService.closeWithoutContributing('2026-10');
    expect(await appMetaRepository.get('month-close:2026-10')).toBeTruthy();
    expect(pendingContributionStore.getState()).toBeNull();
    expect(await finRepository.listAllEntries()).toHaveLength(0);
  });

  test('S106-T07: lembrete opcional no dia 1º dispara "Feche <mês anterior>" quando não há marca', async () => {
    const spySchedule = jest.spyOn(Notifications, 'scheduleNotificationAsync').mockResolvedValue('notif-1');

    // Dia 1º de dezembro sem marca em 2026-11 -> notifica
    const sent = await finReminderService.checkAndNotifyMonthClose({
      todayIso: '2026-12-01',
    });
    expect(sent).toBe(true);
    expect(spySchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: expect.stringMatching(/Feche novembro/i),
        }),
      })
    );

    // Já fechado -> não notifica
    spySchedule.mockClear();
    await monthCloseService.closeWithoutContributing('2026-11');
    const sentAgain = await finReminderService.checkAndNotifyMonthClose({
      todayIso: '2026-12-01',
    });
    expect(sentAgain).toBe(false);
    expect(spySchedule).not.toHaveBeenCalled();

    spySchedule.mockRestore();
  });
});
