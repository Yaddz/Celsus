import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase, getDatabase } from '../../db/client';
import { marketPriceCache } from '../../db/schema';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { finGoalsRepository } from '../../repositories/finGoalsRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { patrimonyService } from '../patrimonyService';
import { finGoalsService } from '../finGoalsService';
import { finService } from '../finService';
import { NetWorthScreen } from '../../screens/finance/NetWorthScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

describe('Sprint 105 — Patrimônio único e Metas unificadas (R42, R44)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S105-T01..T04: patrimonyService aplica precedência manual → cotação → PM, coloca broker em investido e cartão como passivo', async () => {
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 150000, // R$ 1.500,00
    });
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 50000, // R$ 500,00 -> entra em investido!
    });
    const card = await finRepository.createAccount({
      name: 'Cartão Visa',
      type: 'card',
      initialBalanceCents: 0,
      closingDay: 5,
      dueDay: 12,
    });

    // Despesa aberta no cartão: R$ 400,00
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 40000,
      due_date: '2026-11-12',
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-mercado',
      description: 'Compra cartão',
      bill_month: '2026-11',
    });

    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'PR-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    // Ativo 1: preço manual (10 un * R$ 40,00 = R$ 400,00), mesmo havendo cotação R$ 35,00 no cache
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '30.00',
      manual_price_override: '40.00',
    });
    // Ativo 2: sem cotação e sem manual -> usa PM (20 un * R$ 25,00 = R$ 500,00)
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '20',
      average_price: '25.00',
    });

    const db = getDatabase();
    await db.insert(marketPriceCache).values({
      ticker: 'PETR4',
      current_price: '35.00',
      change_percent: '0.0',
      updated_at: '2026-11-10T00:00:00.000Z',
    });

    // Conta à mão:
    // ativos = 40000 + 50000 = 90000 (R$ 900,00)
    // broker = 50000 (R$ 500,00) => investedCents = 90000 + 50000 = 140000 (R$ 1.400,00)
    // accountsCents (sem broker) = 150000 (R$ 1.500,00)
    // cardsCents = 40000 (R$ 400,00)
    // totalCents = 140000 + 150000 - 40000 = 250000 (R$ 2.500,00)
    const pat = await patrimonyService.getPatrimony('2026-11-10');
    expect(pat.investedCents).toBe(140000);
    expect(pat.accountsCents).toBe(150000);
    expect(pat.cardsCents).toBe(40000);
    expect(pat.totalCents).toBe(250000);
    expect(pat.byPortfolio).toHaveLength(1);
    expect(pat.byPortfolio[0].marketValueCents).toBe(90000);
    expect(pat.byAccount.some((a) => a.accountId === checking.id)).toBe(true);
  });

  test('S105-T05: igualdade — patrimonyService, finGoalsService e NetWorthScreen devolvem o mesmo total', async () => {
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 200000,
    });
    const broker = await finRepository.createAccount({
      name: 'XP',
      type: 'broker',
      initialBalanceCents: 30000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'ITUB4',
      name: 'Itaú',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '30.00',
    });

    const pat = await patrimonyService.getPatrimony('2026-11-10');
    const nw = await finGoalsService.computeCurrentNetWorth('2026-11-10');

    expect(nw.totalCents).toBe(pat.totalCents);
    expect(nw.investmentsCents).toBe(pat.investedCents);
    expect(nw.accountsCents).toBe(pat.accountsCents);
    expect(nw.cardDebtCents).toBe(pat.cardsCents);
    expect(pat.byAccount.find((a) => a.accountId === checking.id)?.balanceCents).toBe(200000);

    const { getByTestId } = render(
      <SafeAreaProvider initialMetrics={SAFE_METRICS}>
        <NetWorthScreen onBack={() => {}} referenceDateIso="2026-11-10" />
      </SafeAreaProvider>
    );

    await waitFor(() => {
      // Total: 200000 + 30000 + 30000 = 260000 => R$ 2.600,00
      const text = String(getByTestId('net-worth-total').props.children);
      expect(text).toContain('2.600,00');
    });
  });

  test('S105-T10..T11: migração migration:portfolio-goals-to-fin-goals:v1 é idempotente e salvar meta da carteira grava em fin_goals', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Aposentadoria',
      docket_code: 'AP-1',
    });
    await portfolioRepository.setGoal(portfolio.id, {
      patrimonyGoal: '500000.00',
      monthlyContribution: '2500.00',
    });

    await finService.initializeFinanceModule();
    expect(await appMetaRepository.get('migration:portfolio-goals-to-fin-goals:v1')).toBe('1');

    let goals = await finGoalsRepository.listGoals(true);
    expect(goals).toHaveLength(1);
    expect(goals[0].source_type).toBe('portfolio');
    expect(goals[0].target_cents).toBe(50000000);
    expect(goals[0].monthly_contribution_cents).toBe(250000);

    // 2ª execução não duplica
    await finService.initializeFinanceModule();
    goals = await finGoalsRepository.listGoals(true);
    expect(goals).toHaveLength(1);

    // S105-T11: editar meta pela carteira grava em fin_goals
    await finGoalsService.savePortfolioGoal(portfolio.id, {
      portfolioName: portfolio.name,
      patrimonyGoal: '750000.00',
      monthlyContribution: '3000.00',
    });
    const updatedGoals = await finGoalsService.listGoalsForPortfolio(portfolio.id);
    expect(updatedGoals).toHaveLength(1);
    expect(updatedGoals[0].goal.target_cents).toBe(75000000);
    expect(updatedGoals[0].goal.monthly_contribution_cents).toBe(300000);
  });
});
