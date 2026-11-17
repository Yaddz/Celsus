import { auditOpenFinanceOutliers } from '../diagnostics';

describe('Sprint 88 — Auditoria de outliers Open Finance (Fase A)', () => {
  it('S88-T02: CDB com investido 1.000 e mercado 50.000 => alerta EXTREME_PROFITABILITY', () => {
    const alerts = auditOpenFinanceOutliers({
      assets: [
        {
          id: 'a-cdb',
          ticker: 'CDB BTG',
          name: 'CDB BTG Pactual',
          quantity: '1',
          average_price: '1000.00000000',
          marketValue: '50000.00',
          source: 'OPEN_FINANCE',
        },
      ],
    });

    expect(alerts.some((a) => a.kind === 'EXTREME_PROFITABILITY')).toBe(true);
  });

  it('S88-T03: PETR4 com valor local 38.000 e of_reported_value 3.800 => alerta MARKET_VALUE_DIVERGENCE', () => {
    const alerts = auditOpenFinanceOutliers({
      assets: [
        {
          id: 'a-petr',
          ticker: 'PETR4',
          name: 'Petrobras PN',
          quantity: '1000',
          average_price: '30.00000000',
          marketValue: '38000.00',
          of_reported_value: '3800.00',
          value_source: 'QUOTE',
          source: 'OPEN_FINANCE',
        },
      ],
    });

    expect(alerts.some((a) => a.kind === 'MARKET_VALUE_DIVERGENCE')).toBe(true);
  });

  it('S88-T04: dois lançamentos iguais com ids diferentes em 1 dia => alerta DUPLICATE_FIN_ENTRY', () => {
    const alerts = auditOpenFinanceOutliers({
      entries: [
        {
          id: 'e1',
          account_id: 'acc-1',
          kind: 'expense',
          amount_cents: 12000,
          due_date: '2026-11-10',
          source: 'OPEN_FINANCE',
          external_id: 'pg-1',
        },
        {
          id: 'e2',
          account_id: 'acc-1',
          kind: 'expense',
          amount_cents: 12000,
          due_date: '2026-11-11',
          source: 'OPEN_FINANCE',
          external_id: 'pg-2',
        },
      ],
    });

    expect(alerts.some((a) => a.kind === 'DUPLICATE_FIN_ENTRY')).toBe(true);
  });
});
