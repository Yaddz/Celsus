import { getDatabase, resetDatabase } from '../../db/client';
import { assets, portfolios } from '../../db/schema';
import { finRepository } from '../../repositories/finRepository';
import { finGoalsService } from '../finGoalsService';
import { finService } from '../finService';

describe('Sprint 70 — Correções médias: patrimônio, parcelas e fatura na edição', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S70-S01: patrimônio usa o valor de posição informado (Open Finance) antes de quantidade × preço', async () => {
    const db = getDatabase();
    const now = '2026-11-16T12:00:00.000Z';
    await db.insert(portfolios).values({
      id: 'p-1',
      name: 'Investimentos',
      docket_code: 'CEL-70',
      is_archived: 0,
      created_at: now,
      updated_at: now,
    });
    await db.insert(assets).values({
      id: 'a-of',
      portfolio_id: 'p-1',
      asset_class: 'FIXED_INCOME',
      ticker: 'CDB-BANCO',
      name: 'CDB Banco 110% CDI',
      target_percentage_in_class: 50,
      quantity: '1',
      average_price: '5000.00',
      manual_price_override: null,
      manual_position_value: '5234.56',
      source: 'OPEN_FINANCE',
      created_at: now,
      updated_at: now,
    });
    await db.insert(assets).values({
      id: 'a-manual',
      portfolio_id: 'p-1',
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras',
      target_percentage_in_class: 50,
      quantity: '100',
      average_price: '35.00',
      manual_price_override: '40.00',
      created_at: now,
      updated_at: now,
    });

    const nw = await finGoalsService.computeCurrentNetWorth('2026-11-16');
    expect(nw.investmentsCents).toBe(523456 + 400000);
  });

  test('S70-S02: dívida de cartão no patrimônio inclui lançamentos sem mês de fatura gravado', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão',
      type: 'card',
      closingDay: 3,
      dueDay: 10,
    });
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 12000,
      due_date: '2026-11-05',
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-assinaturas',
      description: 'Assinatura no cartão',
      bill_month: null,
    });

    const nw = await finGoalsService.computeCurrentNetWorth('2026-11-16');
    expect(nw.cardDebtCents).toBe(12000);
  });

  test('S70-S03: mudar a data em "todas as parcelas" mantém uma parcela por mês', async () => {
    const acc = await finRepository.createAccount({
      name: 'Conta',
      type: 'checking',
      initialBalanceCents: 0,
    });
    const parts = await finService.createInstallmentPurchase({
      totalAmountCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-10',
      accountId: acc.id,
      categoryId: 'cat-outros-despesa',
      description: 'Curso',
    });

    // usuário edita a 2ª parcela (10/12) para 15/12 e aplica a todas
    await finService.updateInstallmentEntries(parts[1].id, 'all', { due_date: '2026-12-15' });

    const group = await finRepository.listEntriesByInstallmentGroup(parts[0].installment_group_id!);
    const dates = group
      .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
      .map((e) => e.due_date);
    expect(dates).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });

  test('S70-S04: "esta e as próximas" desloca só as parcelas a partir da editada, inclusive de mês', async () => {
    const acc = await finRepository.createAccount({
      name: 'Conta',
      type: 'checking',
      initialBalanceCents: 0,
    });
    const parts = await finService.createInstallmentPurchase({
      totalAmountCents: 30000,
      installmentTotal: 3,
      firstDueDate: '2026-11-30',
      accountId: acc.id,
      categoryId: 'cat-outros-despesa',
      description: 'Curso',
    });

    // 2ª parcela (30/12) adiada para 31/01: a 3ª acompanha um mês à frente, com o dia limitado ao mês
    await finService.updateInstallmentEntries(parts[1].id, 'this_and_next', {
      due_date: '2027-01-31',
    });

    const group = await finRepository.listEntriesByInstallmentGroup(parts[0].installment_group_id!);
    const dates = group
      .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
      .map((e) => e.due_date);
    expect(dates).toEqual(['2026-11-30', '2027-01-31', '2027-02-28']);
  });

  test('S70-S05: mudar a data de parcelas no cartão recalcula o mês da fatura de cada uma', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão',
      type: 'card',
      closingDay: 20,
      dueDay: 27,
    });
    const parts = await finService.createInstallmentPurchase({
      totalAmountCents: 20000,
      installmentTotal: 2,
      firstDueDate: '2026-11-10',
      accountId: card.id,
      categoryId: 'cat-outros-despesa',
      description: 'Geladeira',
    });
    expect(parts.map((p) => p.bill_month)).toEqual(['2026-11', '2026-12']);

    await finService.updateInstallmentEntries(parts[0].id, 'all', { due_date: '2026-11-22' });

    const group = await finRepository.listEntriesByInstallmentGroup(parts[0].installment_group_id!);
    const months = group
      .sort((a, b) => (a.installment_number ?? 0) - (b.installment_number ?? 0))
      .map((e) => e.bill_month);
    expect(months).toEqual(['2026-12', '2027-01']);
  });

  test('S70-S06: updateEntryRecalculatingBill recalcula a fatura ao mudar data ou conta e limpa ao sair do cartão', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão',
      type: 'card',
      closingDay: 20,
      dueDay: 27,
    });
    const checking = await finRepository.createAccount({
      name: 'Conta',
      type: 'checking',
      initialBalanceCents: 0,
    });
    const entry = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 9000,
      due_date: '2026-11-10',
      status: 'pending',
      account_id: card.id,
      category_id: 'cat-lazer',
      description: 'Show',
      bill_month: '2026-11',
    });

    const moved = await finService.updateEntryRecalculatingBill(entry.id, {
      due_date: '2026-11-25',
    });
    expect(moved.bill_month).toBe('2026-12');

    const toChecking = await finService.updateEntryRecalculatingBill(entry.id, {
      account_id: checking.id,
    });
    expect(toChecking.bill_month).toBeNull();

    const backToCard = await finService.updateEntryRecalculatingBill(entry.id, {
      account_id: card.id,
      due_date: '2026-11-05',
    });
    expect(backToCard.bill_month).toBe('2026-11');
  });

  test('S70-S07: lançamento vindo do Open Finance mantém o mês da fatura informado pelo banco', async () => {
    const card = await finRepository.createAccount({
      name: 'Cartão',
      type: 'card',
      closingDay: 20,
      dueDay: 27,
    });
    const entry = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 9000,
      due_date: '2026-11-10',
      status: 'paid',
      paid_date: '2026-11-10',
      paid_amount_cents: 9000,
      account_id: card.id,
      category_id: 'cat-lazer',
      description: 'Compra',
      bill_month: '2026-12',
      source: 'OPEN_FINANCE',
      external_id: 'pg-1',
    });

    const updated = await finService.updateEntryRecalculatingBill(entry.id, {
      description: 'Compra renomeada',
    });
    expect(updated.description).toBe('Compra renomeada');
    expect(updated.bill_month).toBe('2026-12');
  });
});
