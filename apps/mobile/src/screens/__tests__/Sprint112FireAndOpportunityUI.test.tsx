import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finGoalsRepository } from '../../repositories/finGoalsRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { sandboxRepository } from '../../repositories/sandboxRepository';
import { marketApiService } from '../../services/marketApi';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';
import { FinanceMoreScreen } from '../finance/FinanceMoreScreen';
import { SandboxHubScreen } from '../sandbox/SandboxHubScreen';
import { FireScreen } from '../sandbox/FireScreen';
import { OpportunityCostScreen } from '../sandbox/OpportunityCostScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

async function seedFinanceMonths(months: string[], monthlyExpenseCents: number) {
  await finRepository.createAccount({
    name: 'Conta Corrente',
    type: 'checking',
    initial_balance_cents: 5_000_000, // R$ 50.000
  });
  const accounts = await finRepository.listAccounts();
  const checking = accounts.find((a) => a.type === 'checking')!;
  await finRepository.createCategory({ name: 'Moradia', kind: 'expense' });
  await finRepository.createCategory({ name: 'Salário', kind: 'income' });
  const expCats = await finRepository.listCategories('expense');
  const incCats = await finRepository.listCategories('income');

  for (const ym of months) {
    await finRepository.createEntry({
      account_id: checking.id,
      category_id: incCats[0].id,
      kind: 'income',
      amount_cents: monthlyExpenseCents * 2,
      description: `Salário ${ym}`,
      due_date: `${ym}-05`,
      status: 'paid',
      paid_amount_cents: monthlyExpenseCents * 2,
      paid_at: `${ym}-05`,
    });
    await finRepository.createEntry({
      account_id: checking.id,
      category_id: expCats[0].id,
      kind: 'expense',
      amount_cents: monthlyExpenseCents,
      description: `Gasto ${ym}`,
      due_date: `${ym}-10`,
      status: 'paid',
      paid_amount_cents: monthlyExpenseCents,
      paid_at: `${ym}-10`,
    });
  }
  return { checkingId: checking.id, expenseCategoryId: expCats[0].id };
}

describe('Sprint 112 — Independência Financeira e Custo de Oportunidade (Artboards 5 e 6, R52, R53)', () => {
  beforeEach(async () => {
    await resetDatabase();
    jest.restoreAllMocks();
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([
      { date: '2026-01-01', cdi: 0.9 },
      { date: '2026-06-01', cdi: 0.9 },
      { date: '2026-11-01', cdi: 0.9 },
    ]);
  });

  test('S112-T09: "Virar aporte mensal" cria recorrência de transferência para conta corretora vinculada (ou pede escolha sem vínculo)', async () => {
    await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initial_balance_cents: 500_000,
    });
    await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initial_balance_cents: 0,
    });
    const accounts = await finRepository.listAccounts();
    const checking = accounts.find((a) => a.type === 'checking')!;
    const broker = accounts.find((a) => a.type === 'broker')!;

    await finRepository.createCategory({ name: 'Streaming', kind: 'expense' });
    const cats = await finRepository.listCategories('expense');

    await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 5_990, // R$ 59,90
      description: 'Netflix',
      account_id: checking.id,
      category_id: cats[0].id,
      frequency: 'monthly',
      day_of_month: 10,
      start_date: '2026-01-10',
      is_subscription: 1,
    });

    // 1) Sem carteira vinculada: clicar em "Virar aporte mensal" pede para escolher conta corretora
    const screenNoLink = render(
      wrap(<OpportunityCostScreen onBack={jest.fn()} referenceDateIso="2026-11-27" />)
    );
    await waitFor(() => {
      expect(screenNoLink.getByText('Netflix')).toBeTruthy();
    });
    fireEvent.press(screenNoLink.getByTestId('opp-turn-into-contribution-btn'));
    await waitFor(() => {
      expect(screenNoLink.getByTestId('opp-broker-picker')).toBeTruthy();
    });
    screenNoLink.unmount();

    // 2) Com carteira vinculada à conta corretora (R39): cria recorrência de transferência direto
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Principal' });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const screenLinked = render(
      wrap(<OpportunityCostScreen onBack={jest.fn()} referenceDateIso="2026-11-27" />)
    );
    await waitFor(() => {
      expect(screenLinked.getByText('Netflix')).toBeTruthy();
    });
    fireEvent.press(screenLinked.getByTestId('opp-turn-into-contribution-btn'));

    await waitFor(async () => {
      const recs = await finRepository.listRecurrences({ onlyActive: true });
      const transferRec = recs.find((r) => r.kind === 'transfer');
      expect(transferRec).toBeTruthy();
      expect(transferRec!.amount_cents).toBe(5_990);
      expect(transferRec!.target_account_id).toBe(broker.id);
    });
  });

  test('S112-T10: FireScreen exibe origem do gasto, KPIs (Chega em, Poupança, Reserva), gráfico, sliders recalculando e "Criar meta com esse número"', async () => {
    await seedFinanceMonths(['2026-08', '2026-09', '2026-10'], 500_000); // R$ 5.000/mês

    const screen = render(
      wrap(<FireScreen onBack={jest.fn()} referenceDateIso="2026-11-27" />)
    );

    await waitFor(() => {
      expect(screen.getByTestId('fire-number-tile')).toBeTruthy();
    });

    // Origem do gasto vem de Finanças
    expect(screen.getByTestId('fire-expense-origin').props.children).toMatch(/Finanças/i);
    expect(screen.getByTestId('fire-progress-bar')).toBeTruthy();
    expect(screen.getByTestId('fire-kpi-arrival')).toBeTruthy();
    expect(screen.getByTestId('fire-kpi-savings')).toBeTruthy();
    expect(screen.getByTestId('fire-kpi-reserve')).toBeTruthy();
    expect(screen.getByTestId('fire-projection-chart')).toBeTruthy();
    expect(screen.getByText(/aporte pela metade/i)).toBeTruthy();

    // Número inicial: R$ 5.000 * 12 / 4% = R$ 1.500.000,00
    const initialText = String(screen.getByTestId('fire-number-value').props.children);
    expect(initialText).toContain('1.500.000');

    // Alterar taxa de retirada (aumentar) diminui o número FIRE
    fireEvent.press(screen.getByTestId('fire-withdrawal-plus'));
    await waitFor(() => {
      const updatedText = String(screen.getByTestId('fire-number-value').props.children);
      expect(updatedText).not.toBe(initialText);
    });

    // Criar meta com esse número grava em fin_goals com source_type = 'net_worth'
    fireEvent.press(screen.getByTestId('fire-create-goal-btn'));
    await waitFor(async () => {
      const goals = await finGoalsRepository.listGoals();
      const nwGoal = goals.find((g) => g.source_type === 'net_worth');
      expect(nwGoal).toBeTruthy();
      expect(nwGoal!.target_cents).toBeGreaterThan(0);
    });
  });

  test('S112-T11: OpportunityCostScreen alterna abas, exibe KPIs 5/10/20 anos, tile de dividendos condicional, "Ver assinaturas" e modo privacidade', async () => {
    await seedFinanceMonths(['2026-08', '2026-09', '2026-10'], 300_000);
    const onOpenSubscriptions = jest.fn();

    // 1) Sem cenário dividend_goal salvo -> tile "Na meta de dividendos" não aparece
    const screen1 = render(
      wrap(
        <OpportunityCostScreen
          onBack={jest.fn()}
          onOpenSubscriptions={onOpenSubscriptions}
          isPrivacyMode={false}
          referenceDateIso="2026-11-27"
        />
      )
    );
    await waitFor(() => {
      expect(screen1.getByTestId('opp-result-tile')).toBeTruthy();
    });
    expect(screen1.queryByTestId('opp-dividend-goal-tile')).toBeNull();
    expect(screen1.getByTestId('opp-kpi-5y')).toBeTruthy();
    expect(screen1.getByTestId('opp-kpi-10y')).toBeTruthy();
    expect(screen1.getByTestId('opp-kpi-20y')).toBeTruthy();

    // Aba Categorias mostra média 6 meses
    fireEvent.press(screen1.getByTestId('opp-tab-categories'));
    await waitFor(() => {
      expect(screen1.getByText('Moradia')).toBeTruthy();
    });

    // Aba Uma compra
    fireEvent.press(screen1.getByTestId('opp-tab-purchase'));
    expect(screen1.getByTestId('opp-purchase-amount-input')).toBeTruthy();

    // Voltar para Assinaturas e tocar em "Ver assinaturas"
    fireEvent.press(screen1.getByTestId('opp-tab-subscriptions'));
    fireEvent.press(screen1.getByTestId('opp-view-subscriptions-btn'));
    expect(onOpenSubscriptions).toHaveBeenCalledTimes(1);
    screen1.unmount();

    // 2) Com cenário dividend_goal salvo -> tile "Na meta de dividendos" aparece
    await sandboxRepository.saveScenario({
      name: 'Meta Dividendos',
      kind: 'dividend_goal',
      spec: {
        monthlyGoalBRL: 3000,
        useFixedExpenses: false,
        adjustByIpca: false,
        mode: 'free',
        maxPerAssetPct: 20,
        assetClassFilter: 'ALL',
        snowballMonthlyBRL: 1000,
      },
    });

    const screen2 = render(
      wrap(
        <OpportunityCostScreen
          onBack={jest.fn()}
          isPrivacyMode={true}
          referenceDateIso="2026-11-27"
        />
      )
    );
    await waitFor(() => {
      expect(screen2.getByTestId('opp-dividend-goal-tile')).toBeTruthy();
    });
    // Modo privacidade oculta valores
    expect(screen2.getByTestId('opp-result-value').props.children).toContain('•••');
  });

  test('S112-T12: Atalhos em Finanças › Mais, ativação no SandboxHubScreen e botão voltar do Android', () => {
    const onOpenMore = jest.fn();
    const more = render(wrap(<FinanceMoreScreen onBack={jest.fn()} onOpen={onOpenMore} />));
    fireEvent.press(more.getByTestId('finance-more-fire'));
    expect(onOpenMore).toHaveBeenCalledWith('fire');
    fireEvent.press(more.getByTestId('finance-more-opportunity-cost'));
    expect(onOpenMore).toHaveBeenCalledWith('opportunityCost');

    const onOpenFire = jest.fn();
    const onOpenOpportunityCost = jest.fn();
    const hub = render(
      wrap(
        <SandboxHubScreen
          onOpenFire={onOpenFire}
          onOpenOpportunityCost={onOpenOpportunityCost}
        />
      )
    );
    fireEvent.press(hub.getByTestId('sandbox-tile-independencia'));
    expect(onOpenFire).toHaveBeenCalledTimes(1);
    fireEvent.press(hub.getByTestId('sandbox-tile-custo-oportunidade'));
    expect(onOpenOpportunityCost).toHaveBeenCalledTimes(1);

    const baseState: BackState = {
      activeTab: 'stats',
      isSettingsOpen: false,
      isTransactionDetailOpen: false,
      isAllTransactionsOpen: false,
      isClassDetailOpen: false,
      isTransactionModalOpen: false,
      isPortfolioManagerOpen: false,
      isSimulatorOpen: false,
      isSandboxHubOpen: true,
    };
    expect(resolveBackAction({ ...baseState, isFireOpen: true })).toBe('close-fire');
    expect(resolveBackAction({ ...baseState, isOpportunityCostOpen: true })).toBe(
      'close-opportunity-cost'
    );
  });
});
