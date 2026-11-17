import { detectRemovedOpenFinanceEntries } from '../index';
import { calculateAccountBalance, calculateMonthlySummary } from '../../financeFlow';

describe('Sprint 87 — Exclusões Open Finance e saldos (Fase A)', () => {
  it('S87-T04: lançamento pago removido pela instituição => mark_removed e fora do saldo/resumo calculado (R10)', () => {
    const existing = [
      {
        id: 'e-paid-1',
        source: 'OPEN_FINANCE',
        external_id: 'pg-1',
        due_date: '2026-11-05',
        status: 'paid',
        user_edited_fields: null,
        of_removed_at: null,
      },
    ];
    const removals = detectRemovedOpenFinanceEntries(
      existing,
      new Set<string>(),
      '2026-10-08'
    );
    expect(removals).toEqual([{ entryId: 'e-paid-1', action: 'mark_removed' }]);

    const entries = [
      {
        id: 'e-paid-1',
        kind: 'expense' as const,
        amount_cents: 25000,
        due_date: '2026-11-05',
        paid_date: '2026-11-05',
        paid_amount_cents: 25000,
        status: 'paid' as const,
        account_id: 'acc-1',
        category_id: 'cat-outros-despesa',
        description: 'Removido',
        recurrence_id: null,
        recurrence_period: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
        bill_month: null,
        transfer_group_id: null,
        source: 'OPEN_FINANCE',
        external_id: 'pg-1',
        import_batch_id: null,
        description_raw: null,
        user_edited_fields: null,
        linked_income_id: null,
        of_removed_at: '2026-11-17T12:00:00Z',
        created_at: '2026-11-05T12:00:00Z',
      },
    ];

    expect(calculateAccountBalance(100000, entries as any, 'acc-1')).toBe(100000);
    const summary = calculateMonthlySummary(entries as any, '2026-11');
    expect(summary.expensesCents).toBe(0);
  });

  it('S87-T05: lançamento editado pelo usuário e removido => conflict (mantido) (R10)', () => {
    const existing = [
      {
        id: 'e-edited-1',
        source: 'OPEN_FINANCE',
        external_id: 'pg-edited',
        due_date: '2026-11-10',
        status: 'paid',
        user_edited_fields: '["description"]',
        of_removed_at: null,
      },
    ];
    const removals = detectRemovedOpenFinanceEntries(
      existing,
      new Set<string>(),
      '2026-10-08'
    );
    expect(removals).toEqual([{ entryId: 'e-edited-1', action: 'conflict' }]);
  });

  it('S87-T06: lançamento fora da janela de 40 dias que não voltou => intacto (R10)', () => {
    const existing = [
      {
        id: 'e-old-1',
        source: 'OPEN_FINANCE',
        external_id: 'pg-old',
        due_date: '2026-08-01', // fora da janela >= 2026-10-08
        status: 'paid',
        user_edited_fields: null,
        of_removed_at: null,
      },
    ];
    const removals = detectRemovedOpenFinanceEntries(
      existing,
      new Set<string>(),
      '2026-10-08'
    );
    expect(removals).toEqual([]);
  });
});
