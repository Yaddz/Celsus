import type { FinAccount, FinEntry } from '../../../db/schema';
import {
  calculateAccountBalance,
  calculateMonthlySummary,
  detectOverdueAndDueSoonWithBills,
  monthlyAccountFlows,
  projectCashflow,
} from '../../financeFlow';
import { mapPluggyTransaction } from '../index';
import {
  collectAppNumbers,
  computePluggyTruth,
  reconcileAppVsPluggy,
} from '../pluggyTruth';
import { makePluggyAccounts, makePluggyItem } from '../../../services/pluggy/__tests__/pluggyFixtures';
import type { PluggyTransaction } from '../../../services/pluggy/types';

function makeCheckingTx(overrides: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id: 'tx-chk-1',
    accountId: 'acc-checking-1',
    description: 'Pix',
    descriptionRaw: 'Pix',
    currencyCode: 'BRL',
    amount: -120,
    amountInAccountCurrency: null,
    date: '2026-11-15T00:00:00.000Z',
    type: 'DEBIT',
    balance: null,
    providerCode: null,
    providerId: null,
    status: 'POSTED',
    category: 'Transfers',
    categoryId: '05070000',
    operationType: 'PIX',
    operationTypeAdditionalInfo: null,
    paymentData: null,
    merchant: null,
    creditCardMetadata: null,
    order: 0,
    createdAt: '2026-11-15T12:00:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
    ...overrides,
  };
}

function makeLocalChecking(overrides: Partial<FinAccount> = {}): FinAccount {
  return {
    id: 'local-chk-1',
    name: 'XP · Conta',
    type: 'checking',
    initial_balance_cents: 0,
    color: '#000',
    archived: 0,
    closing_day: null,
    due_day: null,
    credit_limit_cents: null,
    of_account_id: 'acc-checking-1',
    source: 'OPEN_FINANCE',
    reported_balance_cents: 6051,
    reported_balance_at: '2026-11-17T09:00:00.000Z',
    masked_number: '1234',
    owner: null,
    auto_name: 'XP · Conta',
    of_linked_at: '2026-11-01T00:00:00.000Z',
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
  };
}

function toFinEntry(mapped: ReturnType<typeof mapPluggyTransaction>, id: string): FinEntry {
  return {
    id,
    kind: mapped.kind,
    amount_cents: mapped.amountCents,
    due_date: mapped.dueDate,
    paid_date: mapped.paidDate,
    paid_amount_cents: mapped.paidAmountCents,
    status: mapped.status,
    account_id: mapped.accountId,
    category_id: mapped.categoryId,
    description: mapped.description,
    recurrence_id: null,
    recurrence_period: null,
    installment_group_id: null,
    installment_number: mapped.installmentNumber,
    installment_total: mapped.installmentTotal,
    bill_month: mapped.billMonth,
    transfer_group_id: null,
    source: mapped.source,
    external_id: mapped.externalId,
    import_batch_id: null,
    description_raw: mapped.descriptionRaw,
    user_edited_fields: null,
    linked_income_id: null,
    of_removed_at: null,
    of_category_id: mapped.ofCategoryId ?? null,
    of_class_reason: mapped.classReason ?? null,
    of_provider_id: mapped.ofProviderId,
    of_bill_id: mapped.ofBillId,
    of_bill_forecast_month: mapped.ofBillForecastMonth,
    of_bill_post_date: mapped.ofBillPostDate,
    of_operation_type: mapped.ofOperationType,
    of_raw_status: mapped.ofRawStatus,
    of_raw_type: mapped.ofRawType,
    of_raw_amount_cents: mapped.ofRawAmountCents,
    of_created_at: mapped.ofCreatedAt,
    of_installment_number: mapped.ofInstallmentNumber,
    of_installment_total: mapped.ofInstallmentTotal,
    of_bill_month_source: mapped.ofBillMonthSource,
    created_at: '2026-11-17T12:00:00.000Z',
  };
}

describe('Sprint 101 — Pendentes da conta, datas BRT e entradas/saídas brutas (R34, R35)', () => {
  it('S101-T01: D35 — Pix 120.00 em 2026-12-01T01:15:00.000Z => due_date 2026-11-30 e entra em 2026-11', () => {
    const tx = makeCheckingTx({
      id: 'tx-brt-1',
      amount: -120,
      date: '2026-12-01T01:15:00.000Z',
      categoryId: '08010000',
      category: 'Online shopping',
    });
    const mapped = mapPluggyTransaction(tx, {
      accountId: 'local-chk-1',
      accountType: 'checking',
      todayIso: '2026-11-17',
    } as any);
    expect(mapped.dueDate).toBe('2026-11-30');

    const entry = toFinEntry(mapped, 'e-1');
    const summary = calculateMonthlySummary([entry], '2026-11');
    expect(summary.totalExpenseCents).toBe(12000);
    const flows = monthlyAccountFlows([entry], 'local-chk-1', '2026-11');
    expect(flows.outflowCents).toBe(12000);
  });

  it('S101-T02: data pura 2026-11-15T00:00:00.000Z mantém 2026-11-15', () => {
    const tx = makeCheckingTx({ date: '2026-11-15T00:00:00.000Z' });
    const mapped = mapPluggyTransaction(tx, {
      accountId: 'local-chk-1',
      accountType: 'checking',
      todayIso: '2026-11-17',
    } as any);
    expect(mapped.dueDate).toBe('2026-11-15');
  });

  it('S101-T03: D34 — PENDING -300.00 em 2026-11-25 (hoje 2026-11-17) => SCHEDULED, entra em A vencer e previsão sem mexer no saldo', () => {
    const acc = makeLocalChecking({ initial_balance_cents: 100000 });
    const tx = makeCheckingTx({
      id: 'tx-sched-out',
      amount: -300,
      type: 'DEBIT',
      status: 'PENDING',
      date: '2026-11-25T12:00:00.000Z',
      categoryId: '07000000',
    });
    const mapped = mapPluggyTransaction(tx, {
      accountId: acc.id,
      accountType: 'checking',
      todayIso: '2026-11-17',
    } as any);
    expect(mapped.status).toBe('pending');
    expect(mapped.classReason).toBe('SCHEDULED');

    const entry = toFinEntry(mapped, 'e-sched');
    expect(calculateAccountBalance([entry], 100000)).toBe(100000);

    const due18 = detectOverdueAndDueSoonWithBills([entry], [acc], '2026-11-18', 7);
    expect(due18.dueSoon).toHaveLength(1);
    expect(due18.dueSoonTotalCents).toBe(30000);

    const cashflow = projectCashflow([acc], [entry], '2026-11-17', '2026-11-30');
    const day25 = cashflow.days.find((d) => d.date === '2026-11-25');
    expect(day25?.deltaCents).toBe(-30000);
  });

  it('S101-T04: PENDING +1500.00 em 2026-11-30 => SCHEDULED a receber', () => {
    const tx = makeCheckingTx({
      id: 'tx-sched-in',
      amount: 1500,
      type: 'CREDIT',
      status: 'PENDING',
      date: '2026-11-30T12:00:00.000Z',
      categoryId: '01010000',
    });
    const mapped = mapPluggyTransaction(tx, {
      accountId: 'local-chk-1',
      accountType: 'checking',
      todayIso: '2026-11-17',
    } as any);
    expect(mapped.kind).toBe('income');
    expect(mapped.status).toBe('pending');
    expect(mapped.classReason).toBe('SCHEDULED');
  });

  it('S101-T08: monthlyAccountFlows na conexão 7ccce4de (Pix próprio, provento MXRF11 60.51 e APLICAÇÃO AUTOMÁTICA) bate com R23 ao centavo', () => {
    const pgBank = {
      ...makePluggyAccounts()[0],
      id: 'pg-xp-bank',
      itemId: 'item-7ccce4de',
      balance: 60.51,
    };
    const localAcc = makeLocalChecking({
      id: 'local-xp-bank',
      of_account_id: pgBank.id,
      initial_balance_cents: 0,
      reported_balance_cents: 6051,
    });

    const txs: PluggyTransaction[] = [
      makeCheckingTx({
        id: 'tx-pix-proprio',
        accountId: pgBank.id,
        description: 'Pix mesma titularidade',
        amount: 200,
        type: 'CREDIT',
        status: 'POSTED',
        date: '2026-11-05T12:00:00.000Z',
        categoryId: '04000000',
      }),
      makeCheckingTx({
        id: 'tx-mxrf11',
        accountId: pgBank.id,
        description: 'Rendimento MXRF11',
        amount: 60.51,
        type: 'CREDIT',
        status: 'POSTED',
        date: '2026-11-14T12:00:00.000Z',
        categoryId: '04070000',
      }),
      makeCheckingTx({
        id: 'tx-aplic-auto',
        accountId: pgBank.id,
        description: 'APLICACAO AUTOMATICA',
        amount: -200,
        type: 'DEBIT',
        status: 'POSTED',
        date: '2026-11-06T12:00:00.000Z',
        categoryId: '03000000',
      }),
    ];

    const entries = txs.map((tx, i) =>
      toFinEntry(
        mapPluggyTransaction(tx, {
          accountId: localAcc.id,
          accountType: 'checking',
          todayIso: '2026-11-17',
          isIncomeLinked: tx.id === 'tx-mxrf11',
        } as any),
        `e-${i}`
      )
    );

    const flows = monthlyAccountFlows(entries, localAcc.id, '2026-11');
    expect(flows.inflowCents).toBe(26051);
    expect(flows.outflowCents).toBe(20000);

    const truth = computePluggyTruth(
      {
        item: makePluggyItem({ id: 'item-7ccce4de' }),
        accounts: [pgBank],
        transactionsByAccount: { [pgBank.id]: txs },
        billsByAccount: {},
      },
      '2026-11-17'
    );
    const appNums = collectAppNumbers({
      accounts: [localAcc],
      entries,
      todayIso: '2026-11-17',
    });
    expect(reconcileAppVsPluggy(truth, appNums)).toEqual([]);
  });
});
