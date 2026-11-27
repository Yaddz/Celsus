import type { FinAccount, FinEntry } from '../../db/schema';
import { monthSummary } from '../financeFlow';

const mkEntry = (overrides: Partial<FinEntry> = {}): FinEntry => ({
  id: 'e-1',
  kind: 'expense',
  amount_cents: 10000,
  due_date: '2026-11-10',
  paid_date: '2026-11-10',
  paid_amount_cents: 10000,
  status: 'paid',
  account_id: 'acc-checking',
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

const mkBroker = (id = 'acc-broker'): FinAccount => ({
  id,
  name: 'Corretora XP',
  type: 'broker',
  initial_balance_cents: 0,
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
});

describe('Sprint 105 — monthSummary (R43)', () => {
  test('S105-T06 & S105-T09: mês só com despesas tem sobra negativa e taxa de poupança "—"', () => {
    const entries: FinEntry[] = [
      mkEntry({ id: 'd1', kind: 'expense', amount_cents: 150000, paid_amount_cents: 150000 }),
      mkEntry({ id: 'd2', kind: 'expense', amount_cents: 50000, paid_amount_cents: 50000 }),
    ];

    // Conta à mão:
    // receitas = 0, proventos = 0, despesas = 150000 + 50000 = 200000, aportes = 0
    // sobra = 0 - 200000 - 0 = -200000; sem receita => taxa = null / "—"
    const res = monthSummary(entries, '2026-11');
    expect(res.incomeCents).toBe(0);
    expect(res.dividendIncomeCents).toBe(0);
    expect(res.expenseCents).toBe(200000);
    expect(res.contributionCents).toBe(0);
    expect(res.netCents).toBe(-200000);
    expect(res.savingsRatePercent).toBeNull();
    expect(res.savingsRateLabel).toBe('—');
  });

  test('S105-T07: transferência para corretora + investment_buy da mesma compra conta UMA vez nos aportes', () => {
    const broker = mkBroker('acc-broker');
    const entries: FinEntry[] = [
      // Salário: R$ 10.000,00
      mkEntry({
        id: 'inc-1',
        kind: 'income',
        amount_cents: 1000000,
        paid_amount_cents: 1000000,
        account_id: 'acc-checking',
      }),
      // Compra tx-1 de R$ 1.000,00 paga pela corrente -> transfer_out + transfer_in + investment_buy
      mkEntry({
        id: 'tr-out-1',
        kind: 'transfer_out',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        account_id: 'acc-checking',
        transfer_group_id: 'tr-1',
        linked_transaction_id: 'tx-1',
      }),
      mkEntry({
        id: 'tr-in-1',
        kind: 'transfer_in',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        account_id: 'acc-broker',
        transfer_group_id: 'tr-1',
        linked_transaction_id: 'tx-1',
      }),
      mkEntry({
        id: 'buy-1',
        kind: 'investment_buy',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        account_id: 'acc-broker',
        linked_transaction_id: 'tx-1',
      }),
      // Compra tx-2 de R$ 500,00 usando saldo que já estava na corretora (sem transferência)
      mkEntry({
        id: 'buy-2',
        kind: 'investment_buy',
        amount_cents: 50000,
        paid_amount_cents: 50000,
        account_id: 'acc-broker',
        linked_transaction_id: 'tx-2',
      }),
    ];

    // Conta à mão:
    // aportes = 100000 (transfer_out para corretora, NÃO soma buy-1 de novo!) + 50000 (buy-2 sem transferência) = 150000
    // sobra = 1000000 - 0 - 150000 = 850000
    const res = monthSummary(entries, '2026-11', { accounts: [broker] });
    expect(res.contributionCents).toBe(150000);
    expect(res.netCents).toBe(850000);
  });

  test('S105-T08: receitas incluem proventos, separa "dos quais proventos" e calcula taxa de poupança', () => {
    const entries: FinEntry[] = [
      // Salário: R$ 4.000,00
      mkEntry({
        id: 'sal',
        kind: 'income',
        amount_cents: 400000,
        paid_amount_cents: 400000,
      }),
      // Provento carteira: R$ 500,00
      mkEntry({
        id: 'prov-1',
        kind: 'investment_income',
        amount_cents: 50000,
        paid_amount_cents: 50000,
        account_id: 'acc-broker',
        linked_income_id: 'inc-ev-1',
      }),
      // Provento Open Finance vinculado: R$ 500,00
      mkEntry({
        id: 'prov-2',
        kind: 'income',
        amount_cents: 50000,
        paid_amount_cents: 50000,
        account_id: 'acc-broker',
        linked_income_id: 'inc-ev-2',
      }),
      // Despesas: R$ 3.000,00
      mkEntry({
        id: 'exp-1',
        kind: 'expense',
        amount_cents: 300000,
        paid_amount_cents: 300000,
      }),
      // Aporte: R$ 1.000,00
      mkEntry({
        id: 'buy-1',
        kind: 'investment_buy',
        amount_cents: 100000,
        paid_amount_cents: 100000,
        account_id: 'acc-broker',
        linked_transaction_id: 'tx-10',
      }),
    ];

    // Conta à mão:
    // receitas = 400000 + 50000 + 50000 = 500000 (R$ 5.000,00)
    // proventos = 50000 + 50000 = 100000 (R$ 1.000,00)
    // despesas = 300000 (R$ 3.000,00)
    // aportes = 100000 (R$ 1.000,00)
    // sobra = 500000 - 300000 - 100000 = 100000 (R$ 1.000,00)
    // taxa de poupança = (500000 - 300000) / 500000 = 200000 / 500000 = 40.0%
    const res = monthSummary(entries, '2026-11');
    expect(res.incomeCents).toBe(500000);
    expect(res.dividendIncomeCents).toBe(100000);
    expect(res.expenseCents).toBe(300000);
    expect(res.contributionCents).toBe(100000);
    expect(res.netCents).toBe(100000);
    expect(res.savingsRatePercent).toBe(40);
    expect(res.savingsRateLabel).toBe('40,0%');
  });
});
