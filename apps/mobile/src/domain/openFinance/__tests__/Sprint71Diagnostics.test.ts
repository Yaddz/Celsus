import { buildSyncDiagnostics, formatDiagnosticsReportText } from '../diagnostics';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyTransaction,
} from '../../../services/pluggy/types';

describe('Sprint 71 — Diagnóstico e Cobertura de Campos Open Finance (Fase A)', () => {
  const accounts: PluggyAccount[] = [
    {
      id: 'acc-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      number: '0012345-6',
      name: 'Conta Corrente',
      balance: 2500.0,
      owner: 'PEDRO SILVA',
      taxNumber: '123.456.789-00',
      itemId: 'item-1',
      currencyCode: 'BRL',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    },
  ];
  const txs: PluggyTransaction[] = [
    {
      id: 'tx-1',
      description: 'PIX ENVIADO - PADARIA DO ZE',
      descriptionRaw: 'PIX ENVIADO - PADARIA DO ZE 99999',
      currencyCode: 'BRL',
      amount: -45.0,
      date: '2026-11-10T10:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      category: 'Groceries',
      accountId: 'acc-1',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'tx-2',
      description: 'COMPRA NAO GRAVADA',
      currencyCode: 'BRL',
      amount: -120.0,
      date: '2026-11-11T10:00:00Z',
      type: 'DEBIT',
      status: 'POSTED',
      accountId: 'acc-1',
      createdAt: '2026-11-11T10:00:00Z',
      updatedAt: '2026-11-11T10:00:00Z',
    },
  ];
  const bills: PluggyBill[] = [
    {
      id: 'bill-1',
      dueDate: '2026-12-10T00:00:00Z',
      billClosingDate: '2026-12-03T00:00:00Z',
      totalAmount: 1500.0,
      totalAmountCurrencyCode: 'BRL',
      minimumPaymentAmount: 225.0,
    },
  ];
  const investments: PluggyInvestment[] = [
    {
      id: 'inv-1',
      itemId: 'item-1',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'PETROBRAS PN',
      quantity: 100,
      balance: 3500.0,
      issuerCNPJ: '33.000.167/0001-01',
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T00:00:00Z',
    },
  ];
  const invTxs: PluggyInvestmentTransaction[] = [
    {
      id: 'itx-1',
      type: 'BUY',
      quantity: 100,
      value: 30,
      amount: 3000,
      date: '2026-01-10',
      expenses: { brokerageFee: 5 },
    },
    {
      id: 'itx-2',
      type: 'INTEREST',
      amount: 120,
      date: '2026-03-10',
    },
  ];

  it('S71-T15: buildSyncDiagnostics compara recebidos × gravados e agrupa investimentos e movimentações por tipo', () => {
    const report = buildSyncDiagnostics(
      {
        itemId: 'item-1',
        connectorName: 'Itaú',
        accounts,
        transactions: txs,
        bills,
        investments,
        investmentTransactions: invTxs,
        investmentErrors: 0,
      },
      {
        accounts: [
          {
            ofAccountId: 'acc-1',
            reportedBalanceCents: 250000,
            calculatedBalanceCents: 250000,
            hasOwner: true,
            hasMaskedNumber: true,
          },
        ],
        transactions: [
          { externalId: 'tx-1', hasDescriptionRaw: true, hasCategory: true },
          { externalId: 'tx-2', hasDescriptionRaw: false, hasCategory: false },
        ],
        bills: [{ billId: 'bill-1', hasClosingDate: true, hasMinimumPayment: true }],
        assets: [{ externalId: 'inv-1', quantity: '100', hasIssuerCnpj: true }],
        investmentTransactions: [{ externalId: 'itx-1', type: 'BUY', hasFees: true }],
      }
    );

    expect(report.counts.accounts).toEqual({ received: 1, persisted: 1 });
    expect(report.counts.transactions).toEqual({ received: 2, persisted: 2 });
    expect(report.counts.bills).toEqual({ received: 1, persisted: 1 });
    expect(report.counts.investments).toEqual({ received: 1, persisted: 1 });
    expect(report.counts.investmentTransactions).toEqual({ received: 2, persisted: 1 });
    expect(report.investmentsByKind).toEqual([{ type: 'EQUITY', subtype: 'STOCK', count: 1 }]);
    expect(report.investmentTransactionsByType).toEqual(
      expect.arrayContaining([
        { type: 'BUY', count: 1 },
        { type: 'INTEREST', count: 1 },
      ])
    );
  });

  it('S71-T16: buildSyncDiagnostics detecta divergências de quantidade, saldo de conta e transação não gravada', () => {
    const report = buildSyncDiagnostics(
      {
        itemId: 'item-1',
        accounts,
        transactions: txs,
        investments,
        investmentTransactions: [],
      },
      {
        accounts: [
          {
            ofAccountId: 'acc-1',
            reportedBalanceCents: 250000,
            calculatedBalanceCents: 240000,
          },
        ],
        transactions: [{ externalId: 'tx-1' }], // tx-2 não gravada
        assets: [{ externalId: 'inv-1', quantity: '80' }], // 80 != 100
        investmentTransactions: [],
      }
    );

    const kinds = report.divergences.map((d) => d.kind);
    expect(kinds).toContain('ACCOUNT_BALANCE_MISMATCH');
    expect(kinds).toContain('TRANSACTION_NOT_PERSISTED');
    expect(kinds).toContain('QUANTITY_MISMATCH');
  });

  it('S71-T17: buildSyncDiagnostics gera tabela de cobertura campo a campo por recurso', () => {
    const report = buildSyncDiagnostics(
      {
        itemId: 'item-1',
        accounts,
        transactions: txs,
        bills,
        investments,
        investmentTransactions: invTxs,
      },
      {
        accounts: [{ ofAccountId: 'acc-1', reportedBalanceCents: 250000, calculatedBalanceCents: 250000, hasOwner: true, hasMaskedNumber: true }],
        transactions: [{ externalId: 'tx-1', hasDescriptionRaw: true, hasCategory: true }],
        bills: [{ billId: 'bill-1', hasClosingDate: true, hasMinimumPayment: true }],
        assets: [{ externalId: 'inv-1', quantity: '100', hasIssuerCnpj: true }],
        investmentTransactions: [{ externalId: 'itx-1', type: 'BUY', hasFees: true }],
      }
    );

    const accTable = report.fieldCoverage.find((t) => t.resource === 'account')!;
    const billTable = report.fieldCoverage.find((t) => t.resource === 'bill')!;
    const invTable = report.fieldCoverage.find((t) => t.resource === 'investment')!;

    expect(accTable.fields.find((f) => f.field === 'owner')).toEqual({
      field: 'owner',
      filledCount: 1,
      persistedCount: 1,
    });
    expect(billTable.fields.find((f) => f.field === 'minimumPaymentAmount')).toEqual({
      field: 'minimumPaymentAmount',
      filledCount: 1,
      persistedCount: 1,
    });
    expect(invTable.fields.find((f) => f.field === 'issuerCNPJ')).toEqual({
      field: 'issuerCNPJ',
      filledCount: 1,
      persistedCount: 1,
    });
  });

  it('S71-T18: formatDiagnosticsReportText não contém nomes, números de conta, CPF, descrições nem valores individuais', () => {
    const report = buildSyncDiagnostics(
      {
        itemId: 'item-1',
        connectorName: 'Itaú',
        accounts,
        transactions: txs,
        bills,
        investments,
        investmentTransactions: invTxs,
      },
      {
        accounts: [{ ofAccountId: 'acc-1', reportedBalanceCents: 250000, calculatedBalanceCents: 250000 }],
        transactions: [{ externalId: 'tx-1' }],
        bills: [{ billId: 'bill-1' }],
        assets: [{ externalId: 'inv-1', quantity: '100' }],
        investmentTransactions: [{ externalId: 'itx-1', type: 'BUY' }],
      }
    );

    const text = formatDiagnosticsReportText(report);
    expect(text).toContain('Diagnóstico Open Finance');
    expect(text).not.toContain('PEDRO SILVA');
    expect(text).not.toContain('123.456.789-00');
    expect(text).not.toContain('0012345-6');
    expect(text).not.toContain('PADARIA DO ZE');
    expect(text).not.toContain('COMPRA NAO GRAVADA');
    expect(text).not.toContain('PETROBRAS');
  });
});
