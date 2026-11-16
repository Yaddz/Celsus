import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../db/client';
import {
  assets,
  finAccounts,
  finEntries,
  finGoalContributions,
  finGoals,
  finGoalSources,
  netWorthSnapshots,
  portfolios,
} from '../../db/schema';
import { finGoalsRepository } from '../../repositories/finGoalsRepository';
import { finGoalsService } from '../finGoalsService';
import { backupService } from '../backupService';

describe('Sprint 68 — Serviços: Metas, Migração, Foto Mensal e Backup', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S68-T11: cria metas/origens e bloqueia divisão de carteira acima de 100%', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(portfolios).values({
      id: 'port-1',
      name: 'Carteira Principal',
      docket_code: 'CEL-01',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });

    await finGoalsService.saveGoalWithSources({
      id: 'goal-1',
      name: 'Meta 60%',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 10000000,
      source_type: 'portfolio',
      sources: [{ ref_type: 'portfolio', ref_id: 'port-1', share_percent: 60 }],
    });

    await expect(
      finGoalsService.saveGoalWithSources({
        id: 'goal-2',
        name: 'Meta 50% (estoura 100%)',
        icon: 'flag',
        color: '#D4A83B',
        target_cents: 5000000,
        source_type: 'portfolio',
        sources: [{ ref_type: 'portfolio', ref_id: 'port-1', share_percent: 50 }],
      })
    ).rejects.toThrow(/100%/);

    // 40% deve funcionar
    await finGoalsService.saveGoalWithSources({
      id: 'goal-2',
      name: 'Meta 40%',
      icon: 'flag',
      color: '#D4A83B',
      target_cents: 5000000,
      source_type: 'portfolio',
      sources: [{ ref_type: 'portfolio', ref_id: 'port-1', share_percent: 40 }],
    });

    const allGoals = await finGoalsRepository.listGoals();
    expect(allGoals).toHaveLength(2);
  });

  it('S68-T12: migra meta antiga de portfolios.patrimony_goal de forma idempotente sem duplicar', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(portfolios).values({
      id: 'port-legacy',
      name: 'Aposentadoria',
      docket_code: 'CEL-02',
      patrimony_goal: '100000',
      monthly_contribution: '2000',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });

    const first = await finGoalsService.migrateLegacyGoalsIfNeeded();
    expect(first).toBe(1);

    const second = await finGoalsService.migrateLegacyGoalsIfNeeded();
    expect(second).toBe(0);

    const goals = await finGoalsRepository.listGoals();
    expect(goals).toHaveLength(1);
    expect(goals[0].target_cents).toBe(10000000);
    expect(goals[0].monthly_contribution_cents).toBe(200000);
    expect(goals[0].source_type).toBe('portfolio');

    const sources = await finGoalsRepository.listGoalSources(goals[0].id);
    expect(sources).toHaveLength(1);
    expect(sources[0].ref_type).toBe('portfolio');
    expect(sources[0].ref_id).toBe('port-legacy');
    expect(sources[0].share_percent).toBe(100);
  });

  it('S68-T13: foto mensal de patrimônio líquido é idempotente ao abrir o app e atualiza no sync', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(finAccounts).values({
      id: 'acc-1',
      name: 'Conta',
      type: 'checking',
      initial_balance_cents: 500000,
      color: '#4F9A65',
      archived: 0,
      created_at: now,
    });

    const snap1 = await finGoalsService.captureMonthlySnapshot({ yearMonth: '2026-11' });
    expect(snap1.year_month).toBe('2026-11');
    expect(snap1.total_cents).toBe(500000);

    // Muda saldo sem forceUpdate -> mantém foto já gravada no mês
    await db.update(finAccounts).set({ initial_balance_cents: 800000 }).where(eq(finAccounts.id, 'acc-1'));
    const snap2 = await finGoalsService.captureMonthlySnapshot({ yearMonth: '2026-11' });
    expect(snap2.total_cents).toBe(500000);

    // Com forceUpdate: true (ao sincronizar) -> atualiza a mesma linha sem duplicar
    const snap3 = await finGoalsService.captureMonthlySnapshot({ yearMonth: '2026-11', forceUpdate: true });
    expect(snap3.total_cents).toBe(800000);

    const rows = await db.select().from(netWorthSnapshots);
    expect(rows).toHaveLength(1);
  });

  it('S68-T14: addManualContribution registra aporte e atualiza progresso avaliado', async () => {
    await finGoalsService.saveGoalWithSources({
      id: 'g-man',
      name: 'Reserva',
      icon: 'savings',
      color: '#4F9A65',
      target_cents: 1000000,
      source_type: 'manual',
    });

    await finGoalsService.addManualContribution({
      goalId: 'g-man',
      amountCents: 250000,
      date: '2026-11-16',
    });

    const items = await finGoalsService.listEvaluatedGoals({ referenceDateIso: '2026-11-16' });
    expect(items).toHaveLength(1);
    expect(items[0].evaluation.currentCents).toBe(250000);
    expect(items[0].evaluation.progressPercent).toBe(25);
  });

  it('S68-T15: listGoalsForPortfolio retorna todas as metas ligadas à carteira', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(portfolios).values({
      id: 'p-a',
      name: 'Carteira A',
      docket_code: 'CEL-A',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });

    await finGoalsService.saveGoalWithSources({
      id: 'g-a1',
      name: 'Meta 1',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 1000000,
      source_type: 'portfolio',
      sources: [{ ref_type: 'portfolio', ref_id: 'p-a', share_percent: 60 }],
    });
    await finGoalsService.saveGoalWithSources({
      id: 'g-a2',
      name: 'Meta 2',
      icon: 'star',
      color: '#D4A83B',
      target_cents: 1000000,
      source_type: 'portfolio',
      sources: [{ ref_type: 'portfolio', ref_id: 'p-a', share_percent: 40 }],
    });

    const linked = await finGoalsService.listGoalsForPortfolio('p-a', '2026-11-16');
    expect(linked.map((x) => x.goal.id).sort()).toEqual(['g-a1', 'g-a2']);
  });

  it('S68-T16: computeCurrentNetWorth integra contas, investimentos e fatura aberta de cartão', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(finAccounts).values([
      {
        id: 'chk-1',
        name: 'Conta Corrente',
        type: 'checking',
        initial_balance_cents: 400000,
        color: '#4F9A65',
        archived: 0,
        created_at: now,
      },
      {
        id: 'crd-1',
        name: 'Cartão',
        type: 'card',
        initial_balance_cents: 0,
        color: '#D96628',
        closing_day: 10,
        due_day: 17,
        archived: 0,
        created_at: now,
      },
    ]);
    await db.insert(finEntries).values({
      id: 'e-card-1',
      kind: 'expense',
      amount_cents: 150000,
      due_date: '2026-11-17',
      status: 'pending',
      account_id: 'crd-1',
      category_id: 'cat-1',
      description: 'Compra',
      bill_month: '2026-11',
      source: 'MANUAL',
      created_at: now,
    });
    await db.insert(portfolios).values({
      id: 'p-nw',
      name: 'Investimentos',
      docket_code: 'CEL-NW',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });
    await db.insert(assets).values({
      id: 'a-1',
      portfolio_id: 'p-nw',
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras',
      target_percentage_in_class: 100,
      quantity: '100',
      average_price: '35.00',
      manual_price_override: '40.00',
      created_at: now,
      updated_at: now,
    });

    const nw = await finGoalsService.computeCurrentNetWorth('2026-11-16');
    expect(nw.accountsCents).toBe(400000);
    expect(nw.investmentsCents).toBe(400000); // 100 * 40.00 = R$ 4.000
    expect(nw.cardDebtCents).toBe(150000);
    expect(nw.totalCents).toBe(650000);
  });

  it('S68-T17: backup .celsus.zip faz ida e volta de fin_goals, contribuições, fontes e fotos', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(finGoals).values({
      id: 'g-bk',
      name: 'Backup Goal',
      icon: 'flag',
      color: '#4F9A65',
      target_cents: 1000000,
      target_date: '2028-01-01',
      source_type: 'manual',
      monthly_contribution_cents: 50000,
      archived: 0,
      created_at: now,
    });
    await db.insert(finGoalContributions).values({
      id: 'gc-bk',
      goal_id: 'g-bk',
      amount_cents: 120000,
      date: '2026-11-16',
      notes: 'Aporte inicial',
      created_at: now,
    });
    await db.insert(finGoalSources).values({
      id: 'gs-bk',
      goal_id: 'g-bk',
      ref_type: 'portfolio',
      ref_id: 'p-bk',
      asset_class: 'FIXED_INCOME',
      share_percent: 75,
    });
    await db.insert(netWorthSnapshots).values({
      year_month: '2026-11',
      accounts_cents: 300000,
      investments_cents: 500000,
      card_debt_cents: 100000,
      total_cents: 700000,
    });

    const exported = await backupService.exportDossierArchive();
    expect(exported.files['fin_goals.csv']).toBeDefined();
    expect(exported.files['fin_goal_contributions.csv']).toBeDefined();
    expect(exported.files['fin_goal_sources.csv']).toBeDefined();
    expect(exported.files['net_worth_snapshots.csv']).toBeDefined();

    resetDatabase();
    await backupService.importDossierArchive(exported.zipBytes, 'RESTORE');

    expect(await db.select().from(finGoals)).toHaveLength(1);
    expect(await db.select().from(finGoalContributions)).toHaveLength(1);
    expect(await db.select().from(finGoalSources)).toHaveLength(1);
    expect(await db.select().from(netWorthSnapshots)).toHaveLength(1);
  });
});
