import type { FinAccount, FinEntry } from '../../db/schema';
import {
  availableSurplus,
  emergencyReserve,
  filterPendingUntilDay,
} from '../financeFlow/monthClose';

const mkEntry = (overrides: Partial<FinEntry> = {}): FinEntry => ({
  id: 'e-1',
  kind: 'expense',
  amount_cents: 10000,
  due_date: '2026-12-03',
  paid_date: null,
  paid_amount_cents: null,
  status: 'pending',
  account_id: 'acc-checking',
  category_id: 'cat-outros-despesa',
  description: 'Conta',
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

describe('Sprint 106 — domain/financeFlow/monthClose (R45)', () => {
  test('S106-T01: availableSurplus sem contas pendentes mantém toda a sobra do mês', () => {
    // Sobra do mês = R$ 2.500,00 (250000), sem contas pendentes até dia 5
    const res = availableSurplus({ yearMonth: '2026-11', netCents: 250000 }, []);
    expect(res.surplusCents).toBe(250000);
    expect(res.pendingCents).toBe(0);
    expect(res.availableCents).toBe(250000);
  });

  test('S106-T02: availableSurplus desconta apenas contas pendentes até o dia D do mês seguinte', () => {
    const entries: FinEntry[] = [
      // Pendente até dia 05/12 -> entra (R$ 400,00)
      mkEntry({ id: 'p-1', due_date: '2026-12-03', amount_cents: 40000, status: 'pending' }),
      // Pendente após dia 05/12 -> não entra
      mkEntry({ id: 'p-2', due_date: '2026-12-10', amount_cents: 90000, status: 'pending' }),
      // Já paga -> não entra
      mkEntry({ id: 'p-3', due_date: '2026-12-02', amount_cents: 20000, status: 'paid' }),
      // Receita pendente -> não desconta
      mkEntry({ id: 'p-4', kind: 'income', due_date: '2026-12-04', amount_cents: 50000, status: 'pending' }),
    ];

    const pending = filterPendingUntilDay(entries, '2026-11', 5);
    expect(pending).toHaveLength(1);

    // Sobra R$ 1.000,00 - R$ 400,00 = R$ 600,00 disponíveis
    const res = availableSurplus({ yearMonth: '2026-11', netCents: 100000 }, pending);
    expect(res.surplusCents).toBe(100000);
    expect(res.pendingCents).toBe(40000);
    expect(res.availableCents).toBe(60000);
  });

  test('S106-T03: emergencyReserve completa vs incompleta (sugere valor limitado à sobra)', () => {
    const accounts: Array<Pick<FinAccount, 'type'> & { balanceCents: number }> = [
      { type: 'checking', balanceCents: 500000 }, // R$ 5.000,00
      { type: 'cash', balanceCents: 100000 }, // R$ 1.000,00
      { type: 'broker', balanceCents: 999900 }, // corretora NÃO entra na reserva líquida de contas
    ];

    // Caso 1: completa -> contas (6.000) + RF líquida (12.000) = 18.000; gasto médio = 3.000; meta 6 meses = 18.000
    const complete = emergencyReserve(accounts, 1200000, 300000, 6);
    expect(complete.months).toBeCloseTo(6, 2);
    expect(complete.status).toBe('completa');
    expect(complete.suggestedToReserveCents).toBe(0);

    // Caso 2: incompleta -> contas (6.000) + RF líquida (3.000) = 9.000; meta 6 * 3.000 = 18.000; déficit = 9.000
    const incomplete = emergencyReserve(accounts, 300000, 300000, 6);
    expect(incomplete.months).toBeCloseTo(3, 2);
    expect(incomplete.status).toBe('incompleta');
    expect(incomplete.suggestedToReserveCents).toBe(900000);
  });

  test('S106-T04: emergencyReserve sem histórico de despesas retorna status "—"', () => {
    const accounts: Array<Pick<FinAccount, 'type'> & { balanceCents: number }> = [
      { type: 'checking', balanceCents: 500000 },
    ];
    const noHistory = emergencyReserve(accounts, 0, 0, 6);
    expect(noHistory.months).toBeNull();
    expect(noHistory.status).toBe('—');
    expect(noHistory.suggestedToReserveCents).toBe(0);
  });
});
