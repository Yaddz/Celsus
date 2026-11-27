import type { FinEntry } from '../../db/schema';
import {
  matchAppInvestmentTransferOut,
  monthSummary,
  resolveDefaultCashSource,
} from '../financeFlow';

function makeEntry(overrides: Partial<FinEntry>): FinEntry {
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
    installment_number: overrides.installment_number ?? null,
    installment_total: overrides.installment_total ?? null,
    bill_month: overrides.bill_month ?? null,
    source: overrides.source ?? 'MANUAL',
    external_id: overrides.external_id ?? null,
    import_batch_id: overrides.import_batch_id ?? null,
    linked_transaction_id: overrides.linked_transaction_id ?? null,
    linked_income_id: overrides.linked_income_id ?? null,
    of_provider_id: overrides.of_provider_id ?? null,
    of_bill_id: overrides.of_bill_id ?? null,
    of_bill_forecast_month: overrides.of_bill_forecast_month ?? null,
    of_bill_post_date: overrides.of_bill_post_date ?? null,
    of_operation_type: overrides.of_operation_type ?? null,
    of_raw_status: overrides.of_raw_status ?? null,
    of_raw_type: overrides.of_raw_type ?? null,
    of_raw_amount_cents: overrides.of_raw_amount_cents ?? null,
    of_created_at: overrides.of_created_at ?? null,
    of_installment_number: overrides.of_installment_number ?? null,
    of_installment_total: overrides.of_installment_total ?? null,
    of_category_id: overrides.of_category_id ?? null,
    of_class_reason: overrides.of_class_reason ?? null,
    of_removed_at: overrides.of_removed_at ?? null,
    of_bill_month_source: overrides.of_bill_month_source ?? null,
    user_edited_fields: overrides.user_edited_fields ?? null,
    created_at: overrides.created_at ?? '2026-10-05T12:00:00.000Z',
  };
}

describe('Sprint 115 — Domínio (V2, V3a, V6)', () => {
  test('S115-T01 (V3a): resolveDefaultCashSource escolhe corretora se cobre, senão maior saldo checking/cash com flag negativa', () => {
    const accounts = [
      { id: 'acc-broker', name: 'XP Corretora', type: 'broker', balanceCents: 20_000 },
      { id: 'acc-nubank', name: 'Nubank', type: 'checking', balanceCents: 15_000 },
      { id: 'acc-itau', name: 'Itaú', type: 'checking', balanceCents: 80_000 },
    ];

    // 1. Corretora cobre R$ 150,00 -> fica na corretora
    const resBroker = resolveDefaultCashSource({
      brokerAccountId: 'acc-broker',
      brokerBalanceCents: 20_000,
      totalCents: 15_000,
      accounts,
    });
    expect(resBroker.accountId).toBe('acc-broker');
    expect(resBroker.willBeNegative).toBe(false);

    // 2. Corretora não cobre R$ 50,00? Não, total R$ 500,00 > R$ 200,00 -> escolhe Itaú (R$ 800,00)
    const resChecking = resolveDefaultCashSource({
      brokerAccountId: 'acc-broker',
      brokerBalanceCents: 20_000,
      totalCents: 50_000,
      accounts,
    });
    expect(resChecking.accountId).toBe('acc-itau');
    expect(resChecking.projectedBalanceCents).toBe(30_000);
    expect(resChecking.willBeNegative).toBe(false);

    // 3. Total R$ 962,50 > R$ 800,00 -> escolhe Itaú e sinaliza negativo (-R$ 162,50)
    const resNegative = resolveDefaultCashSource({
      brokerAccountId: 'acc-broker',
      brokerBalanceCents: 0,
      totalCents: 96_250,
      accounts: [
        { id: 'acc-broker', name: 'XP Corretora', type: 'broker', balanceCents: 0 },
        { id: 'acc-nubank', name: 'Nubank', type: 'checking', balanceCents: 15_000 },
        { id: 'acc-itau', name: 'Itaú', type: 'checking', balanceCents: 80_000 },
      ],
    });
    expect(resNegative.accountId).toBe('acc-itau');
    expect(resNegative.projectedBalanceCents).toBe(-16_250);
    expect(resNegative.willBeNegative).toBe(true);
  });

  test('S115-T02 (V6): matchAppInvestmentTransferOut casa transferência do app com OF tardio [-2, +10] dias, escolhe mais próximo e retorna null fora da janela', () => {
    const entries: FinEntry[] = [
      makeEntry({
        id: 'app-out-far',
        kind: 'transfer_out',
        source: 'MANUAL',
        account_id: 'acc-checking',
        amount_cents: 100_000,
        due_date: '2026-10-01',
        transfer_group_id: 'grp-far',
        linked_transaction_id: 'tx-far',
      }),
      makeEntry({
        id: 'app-in-far',
        kind: 'transfer_in',
        source: 'MANUAL',
        account_id: 'acc-broker',
        amount_cents: 100_000,
        due_date: '2026-10-01',
        transfer_group_id: 'grp-far',
        linked_transaction_id: 'tx-far',
      }),
      makeEntry({
        id: 'app-out-near',
        kind: 'transfer_out',
        source: 'MANUAL',
        account_id: 'acc-checking',
        amount_cents: 100_000,
        due_date: '2026-10-04',
        transfer_group_id: 'grp-near',
        linked_transaction_id: 'tx-near',
      }),
      makeEntry({
        id: 'app-in-near',
        kind: 'transfer_in',
        source: 'MANUAL',
        account_id: 'acc-broker',
        amount_cents: 100_000,
        due_date: '2026-10-04',
        transfer_group_id: 'grp-near',
        linked_transaction_id: 'tx-near',
      }),
    ];

    // OF chega dia 2026-10-06 (+5 dias de app-out-far, +2 dias de app-out-near) -> escolhe app-out-near
    const matched = matchAppInvestmentTransferOut(entries, {
      accountId: 'acc-checking',
      amountCents: 100_200, // dentro de 0,5%
      entryDate: '2026-10-06',
    });
    expect(matched?.id).toBe('app-out-near');

    // Fora da janela (+12 dias) -> null
    const noMatch = matchAppInvestmentTransferOut(entries, {
      accountId: 'acc-checking',
      amountCents: 100_000,
      entryDate: '2026-10-20',
    });
    expect(noMatch).toBeNull();
  });

  test('S115-T03 (V2): monthSummary com linkedAccountIds conta transferência para checking vinculada como aporte', () => {
    const accounts = [
      { id: 'acc-main', type: 'checking' as const },
      { id: 'acc-linked-checking', type: 'checking' as const },
    ];
    const entries: FinEntry[] = [
      makeEntry({
        id: 'sal',
        kind: 'income',
        account_id: 'acc-main',
        amount_cents: 500_000,
        due_date: '2026-10-05',
      }),
      makeEntry({
        id: 'tr-out',
        kind: 'transfer_out',
        account_id: 'acc-main',
        amount_cents: 120_000,
        due_date: '2026-10-10',
        transfer_group_id: 'grp-1',
      }),
      makeEntry({
        id: 'tr-in',
        kind: 'transfer_in',
        account_id: 'acc-linked-checking',
        amount_cents: 120_000,
        due_date: '2026-10-10',
        transfer_group_id: 'grp-1',
      }),
      makeEntry({
        id: 'inv-buy',
        kind: 'investment_buy',
        account_id: 'acc-linked-checking',
        amount_cents: 120_000,
        due_date: '2026-10-10',
        linked_transaction_id: 'tx-1',
      }),
    ];

    const summary = monthSummary(entries, '2026-10', {
      todayIso: '2026-10-20',
      accounts,
      linkedAccountIds: ['acc-linked-checking'],
    });
    expect(summary.contributionCents).toBe(120_000);
    expect(summary.netCents).toBe(380_000);
  });
});
