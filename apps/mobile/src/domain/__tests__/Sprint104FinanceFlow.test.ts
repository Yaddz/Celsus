import type { FinAccount, FinBudget, FinEntry } from '../../db/schema';
import {
  calculateAccountBalance,
  calculateMonthlySummary,
  calculateBudgetUsage,
  suggestBudgetLimit,
  projectCashflow,
} from '../financeFlow';

const mkAccount = (overrides: Partial<FinAccount> = {}): FinAccount => ({
  id: 'acc-broker',
  name: 'Corretora XP',
  type: 'broker',
  initial_balance_cents: 100000, // R$ 1.000,00
  color: '#D96628',
  archived: 0,
  closing_day: null,
  due_day: null,
  credit_limit_cents: null,
  of_account_id: null,
  source: 'MANUAL',
  reported_balance_cents: null,
  reported_balance_at: null,
  masked_number: null,
  owner: null,
  auto_name: null,
  of_linked_at: null,
  closing_balance_cents: null,
  auto_invested_cents: null,
  credit_used_cents: null,
  of_available_limit_cents: null,
  of_minimum_payment_cents: null,
  of_balance_due_date: null,
  of_overdraft_used_cents: null,
  of_reserved_cents: null,
  calendar_source: null,
  created_at: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const mkEntry = (overrides: Partial<FinEntry> = {}): FinEntry => ({
  id: 'entry-1',
  kind: 'expense',
  amount_cents: 10000,
  due_date: '2026-11-10',
  paid_date: '2026-11-10',
  paid_amount_cents: 10000,
  status: 'paid',
  account_id: 'acc-broker',
  category_id: 'cat-outros-despesa',
  description: 'Teste',
  recurrence_id: null,
  recurrence_period: null,
  installment_group_id: null,
  installment_number: null,
  installment_total: null,
  bill_month: null,
  transfer_group_id: null,
  source: 'MANUAL',
  external_id: null,
  import_batch_id: null,
  description_raw: null,
  user_edited_fields: null,
  linked_income_id: null,
  linked_transaction_id: null,
  of_removed_at: null,
  of_category_id: null,
  of_class_reason: null,
  of_provider_id: null,
  of_bill_id: null,
  of_bill_forecast_month: null,
  of_bill_post_date: null,
  of_operation_type: null,
  of_raw_status: null,
  of_raw_type: null,
  of_raw_amount_cents: null,
  of_created_at: null,
  of_installment_number: null,
  of_installment_total: null,
  of_bill_month_source: null,
  created_at: '2026-11-10T00:00:00.000Z',
  ...overrides,
});

describe('Sprint 104 — FinanceFlow & Budgets com investment_* (R40/R41)', () => {
  test('S104-T12: orçamento, categorias e resumo mensal ignoram investment_*, enquanto saldo e fluxo de caixa os incluem', () => {
    const broker = mkAccount({ id: 'acc-broker', initial_balance_cents: 100000 }); // R$ 1.000,00
    const entries: FinEntry[] = [
      // Despesa comum: R$ 200,00
      mkEntry({
        id: 'e-exp',
        kind: 'expense',
        account_id: 'acc-broker',
        category_id: 'cat-mercado',
        amount_cents: 20000,
        paid_amount_cents: 20000,
        due_date: '2026-11-05',
      }),
      // Compra de ativo: R$ 500,00 (sai do saldo, NÃO entra em despesa/orçamento)
      mkEntry({
        id: 'e-buy',
        kind: 'investment_buy',
        account_id: 'acc-broker',
        category_id: 'cat-outros-despesa',
        amount_cents: 50000,
        paid_amount_cents: 50000,
        due_date: '2026-11-10',
        linked_transaction_id: 'tx-1',
      }),
      // Venda de ativo: R$ 300,00 (entra no saldo, NÃO entra em despesa/receita do resumo mensal)
      mkEntry({
        id: 'e-sell',
        kind: 'investment_sell',
        account_id: 'acc-broker',
        category_id: 'cat-outros-receita',
        amount_cents: 30000,
        paid_amount_cents: 30000,
        due_date: '2026-11-12',
        linked_transaction_id: 'tx-2',
      }),
      // Provento: R$ 50,00 (entra no saldo, NÃO entra em despesas/orçamento)
      mkEntry({
        id: 'e-inc',
        kind: 'investment_income',
        account_id: 'acc-broker',
        category_id: 'cat-outros-receita',
        amount_cents: 5000,
        paid_amount_cents: 5000,
        due_date: '2026-11-15',
        linked_income_id: 'inc-1',
      }),
    ];

    const budgets: FinBudget[] = [
      {
        id: 'b-1',
        category_id: 'cat-outros-despesa',
        year_month: '2026-11',
        limit_cents: 100000,
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        id: 'b-2',
        category_id: 'cat-mercado',
        year_month: '2026-11',
        limit_cents: 50000,
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ];

    // Conta à mão:
    // Orçamento cat-outros-despesa: R$ 0,00 (investment_buy ignorado)
    // Orçamento cat-mercado: R$ 200,00 (20000 cents)
    const usage = calculateBudgetUsage(entries, budgets, '2026-11', { todayIso: '2026-11-20' });
    const outros = usage.find((u) => u.categoryId === 'cat-outros-despesa');
    const mercado = usage.find((u) => u.categoryId === 'cat-mercado');
    expect(outros?.spentCents).toBe(0);
    expect(mercado?.spentCents).toBe(20000);

    // Sugestão de orçamento nos últimos 3 meses ignora investment_buy
    expect(suggestBudgetLimit(entries, 'cat-outros-despesa', '2026-12')).toBe(0);

    // Resumo mensal: despesas = 20000, receitas = 0 (investment_sell e investment_income fora)
    const summary = calculateMonthlySummary(entries, '2026-11', '2026-11-20');
    expect(summary.totalExpenseCents).toBe(20000);
    expect(summary.totalIncomeCents).toBe(0);
    expect(summary.expenseByCategory).toHaveLength(1);
    expect(summary.expenseByCategory[0].categoryId).toBe('cat-mercado');

    // Saldo da conta corretora:
    // 100000 (inicial) - 20000 (despesa) - 50000 (buy) + 30000 (sell) + 5000 (income) = 65000 (R$ 650,00)
    const balance = calculateAccountBalance(broker.initial_balance_cents, entries, broker.id);
    expect(balance).toBe(65000);

    // Projeção de fluxo de caixa usa o mesmo saldo inicial calculado
    const cashflow = projectCashflow([broker], entries, '2026-11-20', '2026-11-30');
    expect(cashflow.startingBalanceCents).toBe(65000);
  });
});
