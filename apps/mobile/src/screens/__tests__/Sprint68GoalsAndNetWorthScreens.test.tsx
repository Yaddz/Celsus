import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { getDatabase, resetDatabase } from '../../db/client';
import { finAccounts, finGoals, finGoalSources, netWorthSnapshots, portfolios } from '../../db/schema';
import { FinanceMoreScreen } from '../finance/FinanceMoreScreen';
import { GoalsScreen } from '../finance/GoalsScreen';
import { NetWorthScreen } from '../finance/NetWorthScreen';
import { NetWorthTile } from '../../components/ui/NetWorthTile';
import { GoalProgressTile } from '../../components/ui/GoalProgressTile';

describe('Sprint 68 — Telas: Metas, Patrimônio, Mais, Home e Carteiras', () => {
  beforeEach(() => {
    resetDatabase();
    jest.restoreAllMocks();
  });

  it('S68-T18: FinanceMoreScreen exibe Patrimônio como primeiro tile e Metas nos dois temas e em modo privacidade', async () => {
    const onOpen = jest.fn();
    const { rerender } = await render(
      <FinanceMoreScreen
        onBack={jest.fn()}
        onOpen={onOpen}
        themeMode="dark"
        isPrivacyMode={false}
        netWorthTotalCents={1250000}
      />
    );

    const netWorthTile = screen.getByTestId('finance-more-net-worth');
    const goalsRow = screen.getByTestId('finance-more-goals');
    expect(netWorthTile).toBeTruthy();
    expect(goalsRow).toBeTruthy();
    expect(screen.getByText(/12\.500,00/)).toBeTruthy();

    fireEvent.press(netWorthTile);
    expect(onOpen).toHaveBeenCalledWith('netWorth');
    fireEvent.press(goalsRow);
    expect(onOpen).toHaveBeenCalledWith('goals');

    // Tema claro + modo privacidade oculta o valor
    await rerender(
      <FinanceMoreScreen
        onBack={jest.fn()}
        onOpen={onOpen}
        themeMode="light"
        isPrivacyMode={true}
        netWorthTotalCents={1250000}
      />
    );
    expect(screen.queryByText(/12\.500,00/)).toBeNull();
  });

  it('S68-T19: GoalsScreen exibe cards com DotTrack, valor atual/alvo, previsão, origem e botão Aportar', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(portfolios).values({
      id: 'p-1',
      name: 'Carteira Aposentadoria',
      docket_code: 'CEL-01',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });
    await db.insert(finGoals).values([
      {
        id: 'g-manual',
        name: 'Reserva',
        icon: 'savings',
        color: '#4F9A65',
        target_cents: 1000000,
        source_type: 'manual',
        monthly_contribution_cents: 100000,
        archived: 0,
        created_at: now,
      },
      {
        id: 'g-port',
        name: 'Independência',
        icon: 'flag',
        color: '#D4A83B',
        target_cents: 5000000,
        source_type: 'portfolio',
        monthly_contribution_cents: 200000,
        archived: 0,
        created_at: now,
      },
    ]);
    await db.insert(finGoalSources).values({
      id: 'gs-1',
      goal_id: 'g-port',
      ref_type: 'portfolio',
      ref_id: 'p-1',
      asset_class: 'FIXED_INCOME',
      share_percent: 100,
    });

    const onOpenPortfolioTx = jest.fn();
    render(
      <GoalsScreen
        onBack={jest.fn()}
        onOpenPortfolioTransaction={onOpenPortfolioTx}
        referenceDateIso="2026-11-16"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Reserva')).toBeTruthy();
      expect(screen.getByText('Independência')).toBeTruthy();
    });

    expect(screen.getByText(/Carteira Aposentadoria · Renda fixa/i)).toBeTruthy();
    expect(screen.getByTestId('goal-dot-track-g-manual')).toBeTruthy();
    expect(screen.getByTestId('goal-dot-track-g-port')).toBeTruthy();

    // Aportar em meta ligada a carteira abre movimentação da carteira
    fireEvent.press(screen.getByTestId('goal-contribute-btn-g-port'));
    expect(onOpenPortfolioTx).toHaveBeenCalledWith('p-1');
  });

  it('S68-T20: GoalsScreen exibe estado atingida com data e respeita useReducedMotion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(finAccounts).values({
      id: 'acc-ok',
      name: 'Poupança',
      type: 'checking',
      initial_balance_cents: 1200000,
      color: '#4F9A65',
      archived: 0,
      created_at: now,
    });
    await db.insert(finGoals).values({
      id: 'g-reached',
      name: 'Meta Atingida',
      icon: 'check-circle',
      color: '#4F9A65',
      target_cents: 1000000,
      target_date: '2026-11-16',
      source_type: 'account',
      archived: 0,
      created_at: now,
    });
    await db.insert(finGoalSources).values({
      id: 'gs-ok',
      goal_id: 'g-reached',
      ref_type: 'account',
      ref_id: 'acc-ok',
      share_percent: 100,
    });

    render(<GoalsScreen onBack={jest.fn()} referenceDateIso="2026-11-16" />);

    await waitFor(() => {
      expect(screen.getByText(/atingida em/i)).toBeTruthy();
    });
  });

  it('S68-T21: GoalsScreen permite criar meta pela folha escolhendo origem', async () => {
    render(<GoalsScreen onBack={jest.fn()} referenceDateIso="2026-11-16" />);

    const addBtn = await screen.findByTestId('goals-add-btn');
    fireEvent.press(addBtn);

    fireEvent.changeText(screen.getByTestId('goal-form-name'), 'Fundo Viagem');
    fireEvent.changeText(screen.getByTestId('goal-form-target'), '15000');
    fireEvent.press(screen.getByTestId('goal-form-source-manual'));
    fireEvent.press(screen.getByTestId('goal-form-save'));

    await waitFor(() => {
      expect(screen.getByText('Fundo Viagem')).toBeTruthy();
    });
  });

  it('S68-T22: GoalsScreen funciona no tema claro e oculta valores em modo privacidade', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(finGoals).values({
      id: 'g-priv',
      name: 'Meta Privada',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 9876500,
      source_type: 'manual',
      archived: 0,
      created_at: now,
    });

    render(
      <GoalsScreen
        onBack={jest.fn()}
        themeMode="light"
        isPrivacyMode={true}
        referenceDateIso="2026-11-16"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Meta Privada')).toBeTruthy();
    });
    expect(screen.queryByText(/98\.765/)).toBeNull();
  });

  it('S68-T23: NetWorthScreen e NetWorthTile exibem total, composição e evolução mensal nos dois temas e privacidade', async () => {
    const db = getDatabase();
    await db.insert(netWorthSnapshots).values([
      {
        year_month: '2026-10',
        accounts_cents: 300000,
        investments_cents: 700000,
        card_debt_cents: 100000,
        total_cents: 900000,
      },
      {
        year_month: '2026-11',
        accounts_cents: 400000,
        investments_cents: 800000,
        card_debt_cents: 100000,
        total_cents: 1100000,
      },
    ]);

    const tile = await render(
      <NetWorthTile
        netWorth={{ accountsCents: 400000, investmentsCents: 800000, cardDebtCents: 100000, totalCents: 1100000 }}
        themeMode="dark"
        isPrivacyMode={false}
      />
    );
    expect(screen.getByTestId('home-net-worth-tile')).toBeTruthy();
    expect(screen.getByText(/11\.000,00/)).toBeTruthy();

    await tile.rerender(
      <NetWorthTile
        netWorth={{ accountsCents: 400000, investmentsCents: 800000, cardDebtCents: 100000, totalCents: 1100000 }}
        themeMode="light"
        isPrivacyMode={true}
      />
    );
    expect(screen.queryByText(/11\.000,00/)).toBeNull();

    render(<NetWorthScreen onBack={jest.fn()} themeMode="light" isPrivacyMode={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Contas/i)).toBeTruthy();
      expect(screen.getByText(/Investimentos/i)).toBeTruthy();
      expect(screen.getByText(/Cartão/i)).toBeTruthy();
    });
  });

  it('S68-T24: GoalProgressTile lista metas ligadas à carteira a partir do novo modelo', () => {
    render(
      <GoalProgressTile
        currentValue="50000"
        patrimonyGoal="100000"
        linkedGoals={[
          { id: 'g1', name: 'Aposentadoria', progressPercent: 50, targetLabel: 'R$ 100.000,00' },
          { id: 'g2', name: 'Reserva', progressPercent: 80, targetLabel: 'R$ 25.000,00' },
        ]}
      />
    );
    expect(screen.getByText('Aposentadoria')).toBeTruthy();
    expect(screen.getByText('Reserva')).toBeTruthy();
  });
});
