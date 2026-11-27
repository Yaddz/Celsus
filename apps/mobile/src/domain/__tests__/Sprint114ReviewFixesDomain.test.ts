import type { FinEntry } from '../../db/schema';
import { matchOpenFinanceInvestmentOutflow, monthSummary } from '../financeFlow';
import { findMatchingOpenFinanceIncomeEntry } from '../finance/incomeDedup';
import { runBacktest } from '../sandbox/backtest';
import { trailingYield } from '../sandbox/dividendGoal';

function makeFinEntry(overrides: Partial<FinEntry>): FinEntry {
  return {
    id: overrides.id ?? 'e-1',
    kind: overrides.kind ?? 'expense',
    amount_cents: overrides.amount_cents ?? 100_000,
    due_date: overrides.due_date ?? '2026-10-05',
    paid_date: overrides.paid_date ?? '2026-10-05',
    paid_amount_cents: overrides.paid_amount_cents ?? (overrides.amount_cents ?? 100_000),
    status: overrides.status ?? 'paid',
    account_id: overrides.account_id ?? 'acc-checking',
    category_id: overrides.category_id ?? 'cat-outros-despesa',
    description: overrides.description ?? 'Teste',
    description_raw: overrides.description_raw ?? null,
    recurrence_id: overrides.recurrence_id ?? null,
    recurrence_period: overrides.recurrence_period ?? null,
    transfer_group_id: overrides.transfer_group_id ?? null,
    installment_group_id: overrides.installment_group_id ?? null,
    installment_index: overrides.installment_index ?? null,
    installment_total: overrides.installment_total ?? null,
    bill_month: overrides.bill_month ?? null,
    source: overrides.source ?? 'MANUAL',
    external_id: overrides.external_id ?? null,
    notes: overrides.notes ?? null,
    linked_transaction_id: overrides.linked_transaction_id ?? null,
    linked_income_id: overrides.linked_income_id ?? null,
    of_provider_id: overrides.of_provider_id ?? null,
    of_bill_id: overrides.of_bill_id ?? null,
    of_bill_forecast_month: overrides.of_bill_forecast_month ?? null,
    of_class_reason: overrides.of_class_reason ?? null,
    of_removed_at: overrides.of_removed_at ?? null,
    of_bill_month_source: overrides.of_bill_month_source ?? null,
    user_edited_fields: overrides.user_edited_fields ?? null,
    created_at: overrides.created_at ?? '2026-10-05T12:00:00.000Z',
  };
}

describe('Sprint 114 — Domínio (P3b, P4, P6c, P8a, P8b)', () => {
  test('S114-T01 (P3b): matchOpenFinanceInvestmentOutflow casa saída OF na conta corrente com tolerância e escolhe data mais próxima', () => {
    const entries: FinEntry[] = [
      makeFinEntry({
        id: 'of-far',
        kind: 'expense',
        source: 'OPEN_FINANCE',
        of_class_reason: 'INVESTMENT_MOVE',
        account_id: 'acc-checking',
        amount_cents: 100_000,
        due_date: '2026-10-01',
      }),
      makeFinEntry({
        id: 'of-near',
        kind: 'transfer_out',
        source: 'OPEN_FINANCE',
        of_class_reason: 'INVESTMENT_MOVE',
        account_id: 'acc-checking',
        amount_cents: 100_300, // +0,3% dentro de 0,5%
        due_date: '2026-10-04',
      }),
      makeFinEntry({
        id: 'of-linked',
        kind: 'transfer_out',
        source: 'OPEN_FINANCE',
        of_class_reason: 'INVESTMENT_MOVE',
        account_id: 'acc-checking',
        amount_cents: 100_000,
        due_date: '2026-10-05',
        linked_transaction_id: 'tx-old',
      }),
    ];

    const matched = matchOpenFinanceInvestmentOutflow(entries, {
      accountId: 'acc-checking',
      amountCents: 100_000,
      tradeDate: '2026-10-05',
      brokerAccountId: 'acc-broker',
    });
    expect(matched?.id).toBe('of-near');

    const miss = matchOpenFinanceInvestmentOutflow(entries, {
      accountId: 'acc-checking',
      amountCents: 200_000,
      tradeDate: '2026-10-05',
      brokerAccountId: 'acc-broker',
    });
    expect(miss).toBeNull();
  });

  test('S114-T02 (P4): monthSummary não conta aporte em dobro (transferência dia 1 + compra dia 5 = 1.000; lote = 1x; compra pela corretora = 0; resgate reduz)', () => {
    const accounts = [
      { id: 'acc-checking', type: 'checking' as const },
      { id: 'acc-broker', type: 'broker' as const },
    ];

    // 1. Transferência dia 1 (R$ 1.000) + compra dia 5 (R$ 1.000) sem linked_transaction_id compartilhado
    const transferAndBuyLater = monthSummary(
      [
        makeFinEntry({
          id: 't-out',
          kind: 'transfer_out',
          account_id: 'acc-checking',
          transfer_group_id: 'grp-1',
          amount_cents: 100_000,
          due_date: '2026-10-01',
        }),
        makeFinEntry({
          id: 't-in',
          kind: 'transfer_in',
          account_id: 'acc-broker',
          transfer_group_id: 'grp-1',
          amount_cents: 100_000,
          due_date: '2026-10-01',
        }),
        makeFinEntry({
          id: 'buy-1',
          kind: 'investment_buy',
          account_id: 'acc-broker',
          linked_transaction_id: 'tx-1',
          amount_cents: 100_000,
          due_date: '2026-10-05',
        }),
      ],
      '2026-10',
      { accounts }
    );
    expect(transferAndBuyLater.contributionCents).toBe(100_000);

    // 2. Aporte em lote: 1 transferência de R$ 900 + 3 investment_buy de R$ 300
    const batch = monthSummary(
      [
        makeFinEntry({
          id: 'b-out',
          kind: 'transfer_out',
          account_id: 'acc-checking',
          transfer_group_id: 'grp-batch',
          amount_cents: 90_000,
          due_date: '2026-10-10',
        }),
        makeFinEntry({
          id: 'b-in',
          kind: 'transfer_in',
          account_id: 'acc-broker',
          transfer_group_id: 'grp-batch',
          amount_cents: 90_000,
          due_date: '2026-10-10',
        }),
        makeFinEntry({
          id: 'b-1',
          kind: 'investment_buy',
          account_id: 'acc-broker',
          linked_transaction_id: 'tx-b1',
          amount_cents: 30_000,
          due_date: '2026-10-10',
        }),
        makeFinEntry({
          id: 'b-2',
          kind: 'investment_buy',
          account_id: 'acc-broker',
          linked_transaction_id: 'tx-b2',
          amount_cents: 30_000,
          due_date: '2026-10-10',
        }),
        makeFinEntry({
          id: 'b-3',
          kind: 'investment_buy',
          account_id: 'acc-broker',
          linked_transaction_id: 'tx-b3',
          amount_cents: 30_000,
          due_date: '2026-10-10',
        }),
      ],
      '2026-10',
      { accounts }
    );
    expect(batch.contributionCents).toBe(90_000);

    // 3. Compra pela corretora usando saldo próprio (sem transferência) = 0 de aporte
    const buyFromBrokerCash = monthSummary(
      [
        makeFinEntry({
          id: 'buy-cash',
          kind: 'investment_buy',
          account_id: 'acc-broker',
          linked_transaction_id: 'tx-cash',
          amount_cents: 50_000,
          due_date: '2026-10-12',
        }),
      ],
      '2026-10',
      { accounts }
    );
    expect(buyFromBrokerCash.contributionCents).toBe(0);

    // 4. Resgate (transfer_out da corretora para conta corrente) reduz aporte
    const withRedemption = monthSummary(
      [
        makeFinEntry({
          id: 'ap-out',
          kind: 'transfer_out',
          account_id: 'acc-checking',
          transfer_group_id: 'grp-ap',
          amount_cents: 100_000,
          due_date: '2026-10-02',
        }),
        makeFinEntry({
          id: 'ap-in',
          kind: 'transfer_in',
          account_id: 'acc-broker',
          transfer_group_id: 'grp-ap',
          amount_cents: 100_000,
          due_date: '2026-10-02',
        }),
        makeFinEntry({
          id: 'res-out',
          kind: 'transfer_out',
          account_id: 'acc-broker',
          transfer_group_id: 'grp-res',
          amount_cents: 40_000,
          due_date: '2026-10-20',
        }),
        makeFinEntry({
          id: 'res-in',
          kind: 'transfer_in',
          account_id: 'acc-checking',
          transfer_group_id: 'grp-res',
          amount_cents: 40_000,
          due_date: '2026-10-20',
        }),
      ],
      '2026-10',
      { accounts }
    );
    expect(withRedemption.contributionCents).toBe(60_000);
  });

  test('S114-T03 (P6c): findMatchingOpenFinanceIncomeEntry encontra crédito em outra conta da mesma conexão Open Finance', () => {
    const matched = findMatchingOpenFinanceIncomeEntry(
      {
        ticker: 'PETR4',
        payDate: '2026-10-15',
        amount: '120.00',
        kind: 'DIVIDENDO',
      },
      'acc-broker-v1',
      [
        {
          id: 'of-inc-1',
          account_id: 'acc-of-xp',
          source: 'OPEN_FINANCE',
          kind: 'income',
          amount_cents: 12_000,
          paid_amount_cents: 12_000,
          due_date: '2026-10-15',
          description: 'DIVIDENDOS PETR4',
          description_raw: 'DIVIDENDOS PETR4',
          linked_income_id: null,
          transfer_group_id: null,
          of_removed_at: null,
        },
      ],
      { candidateAccountIds: ['acc-broker-v1', 'acc-of-xp'] }
    );

    expect(matched?.id).toBe('of-inc-1');
  });

  test('S114-T04 (P8a): backtest monthlySeries reflete proventos reinvestidos e último ponto iguala finalValueBRL', () => {
    const res = runBacktest({
      legs: [
        {
          ticker: 'HGLG11',
          assetClass: 'FII',
          investedBRL: 1000,
          buyDate: '2026-01-02',
          sellDate: '2026-03-31',
          priceSeries: [
            { date: '2026-01-02', close: 100 },
            { date: '2026-01-30', close: 100 },
            { date: '2026-02-15', close: 100 },
            { date: '2026-02-27', close: 100 },
            { date: '2026-03-31', close: 100 },
          ],
          dividends: [{ date: '2026-02-15', amountPerUnit: 10 }],
        },
      ],
      options: { reinvestDividends: true, taxEnabled: false },
    });

    expect(res.status).toBe('ok');
    expect(res.total.finalValueBRL).toBeCloseTo(1100, 2);
    const series = res.legs[0].monthlySeries;
    expect(series[series.length - 1]?.valueBRL).toBeCloseTo(res.legs[0].finalValueBRL ?? 0, 2);
  });

  test('S114-T05 (P8b): JCP de ativo B3 retém 15% na fonte no backtest (rótulo "JCP líquido de 15%") e no dividendGoal', () => {
    const bt = runBacktest({
      legs: [
        {
          ticker: 'ITUB4',
          assetClass: 'STOCK',
          investedBRL: 1000,
          buyDate: '2026-01-02',
          sellDate: '2026-03-31',
          priceSeries: [
            { date: '2026-01-02', close: 10 },
            { date: '2026-02-10', close: 10 },
            { date: '2026-03-31', close: 10 },
          ],
          dividends: [{ date: '2026-02-10', amountPerUnit: 1, type: 'JCP' }],
        },
      ],
      options: { reinvestDividends: false, taxEnabled: true },
    });

    expect(bt.legs[0].dividendsGrossBRL).toBeCloseTo(100, 2);
    expect(bt.legs[0].dividendsWithheldBRL).toBeCloseTo(15, 2);
    expect(bt.legs[0].dividendsNetBRL).toBeCloseTo(85, 2);
    expect(bt.total.taxLabel).toContain('JCP líquido de 15%');

    const ty = trailingYield(
      [
        { date: '2025-11-01', type: 'JCP', amount: 1.0 },
        { date: '2026-05-01', type: 'DIVIDEND', amount: 1.0 },
      ],
      20,
      '2026-10-01'
    );
    // JCP líquido = 0.85 + dividendo 1.00 = 1.85 -> yield = 1.85 / 20 = 0.0925
    expect(ty.total12m).toBeCloseTo(1.85, 4);
    expect(ty.yield).toBeCloseTo(0.0925, 4);
  });
});
