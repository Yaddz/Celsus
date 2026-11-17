import { resetDatabase } from '../../../db/client';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import type { PluggyClient } from '../pluggyClient';
import { pluggyDiagnosticsService } from '../pluggyDiagnosticsService';
import {
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from './pluggyFixtures';

describe('Sprint 97 — Diagnóstico v3 (D36, D37, D43)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S97-T10: diagnóstico v3 traz fieldPresence, bills sem PII, forecastVsBill e categoryMap sem owner/taxNumber/number/itemId', async () => {
    const secretItemId = 'item-s97-secret-1234';
    await openFinanceRepository.addItem(secretItemId);

    const card = makeSprint97CardAccount7ccce4de({
      itemId: secretItemId,
      owner: 'MARIA OLIVEIRA SILVA',
      taxNumber: '987.654.321-00',
      number: '44556677',
    });
    const bill = makeSprint97RawBill({
      id: 'bill-diag-1',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 198.34,
    });
    const tx1 = makeSprint97RawCardTx({
      id: 'tx-diag-1',
      accountId: card.id,
      amount: 98.34,
      type: 'DEBIT',
      category: 'Online shopping',
      categoryId: '08010000',
      providerId: 'prov-1',
      operationType: 'PAGAMENTO',
      creditCardMetadata: {
        billId: bill.id,
        billForecastDate: '2026-11',
        billPostDate: '2026-11-02',
        paymentType: 'INSTALLMENT',
        transactionDateTime: '2026-11-02T14:00:00.000Z',
        installmentNumber: 1,
      },
    });
    const tx2 = makeSprint97RawCardTx({
      id: 'tx-diag-2',
      accountId: card.id,
      description: 'Pgto fatura MARIA OLIVEIRA SILVA',
      amount: -100,
      type: 'CREDIT',
      category: 'Transfers',
      categoryId: '05000000',
      providerId: 'prov-2',
      operationType: 'PAGAMENTO_FATURA',
      creditCardMetadata: {
        billId: bill.id,
        billForecastDate: '2026-11',
      },
    });

    const client = {
      getItem: async () =>
        makePluggyItem({
          id: secretItemId,
          connector: { id: 200, name: 'MeuPluggy', isOpenFinance: false },
          status: 'UPDATED',
          executionStatus: 'PARTIAL_SUCCESS',
          lastUpdatedAt: '2026-11-17T09:00:00.000Z',
          nextAutoSyncAt: '2026-11-18T09:00:00.000Z',
          statusDetail: {
            creditCards: {
              isUpdated: false,
              warnings: [{ code: 'CC_005', message: 'Not authorized' }],
            },
          },
        }),
      listAccounts: async () => [card],
      listTransactions: async () => [tx1, tx2],
      listBills: async () => [bill],
      listInvestments: async () => [],
      listInvestmentTransactions: async () => [],
    } as unknown as PluggyClient;

    const report = (await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: [secretItemId],
    })) as any;

    const json = JSON.stringify(report);
    expect(json).not.toContain(secretItemId);
    expect(json).not.toContain('MARIA OLIVEIRA SILVA');
    expect(json).not.toContain('987.654.321-00');
    expect(json).not.toContain('44556677');

    const itemDiag = report.items[0];
    expect(itemDiag.categoryMap['05000000']).toBe('Transfers');
    expect(itemDiag.item.connectorId).toBe(200);
    expect(itemDiag.item.isOpenFinance).toBe(false);
    expect(itemDiag.item.productsNotUpdated).toContain('creditCards');
    expect(itemDiag.item.warningCodes).toContain('CC_005');

    const accDiag = itemDiag.accounts[0];
    expect(accDiag.fieldPresence.providerId).toBe(2);
    expect(accDiag.fieldPresence.billId).toBe(2);
    expect(accDiag.fieldPresence.billForecastDate).toBe(2);
    expect(accDiag.fieldPresence.operationType).toBe(2);
    expect(accDiag.bills).toHaveLength(1);
    expect(accDiag.bills[0].payments).toHaveLength(1);
    expect(accDiag.bills[0].financeCharges).toHaveLength(5);
    expect(accDiag.forecastVsBill.totalWithBoth).toBe(2);
    expect(accDiag.forecastVsBill.matchesDueDateMonth).toBe(2);
  });

  it('S97-T14: diagnóstico v3 traz txCount, contagem por ano de date e contagem local por of_class_reason/removidos (D43)', async () => {
    const itemId = 'item-d43-1';
    await openFinanceRepository.addItem(itemId);
    const localAcc = await finRepository.createAccount({
      name: 'Nubank Conta',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: 'acc-nubank-1',
    });

    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 1000,
        due_date: '2026-11-10',
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-outros-despesa',
        description: 'Compra',
        source: 'OPEN_FINANCE',
        external_id: 'tx-2026-1',
        of_class_reason: 'SIGN',
      },
      {
        kind: 'transfer_out',
        amount_cents: 5000,
        due_date: '2025-05-10',
        status: 'paid',
        account_id: localAcc.id,
        category_id: 'cat-outros-despesa',
        description: 'Aplicação',
        source: 'OPEN_FINANCE',
        external_id: 'tx-2025-1',
        of_class_reason: 'INVESTMENT_MOVE',
        of_removed_at: '2026-11-01T00:00:00.000Z',
      },
    ]);

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [
        {
          id: 'acc-nubank-1',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          number: '1234',
          name: 'Conta',
          balance: 100,
          itemId,
          currencyCode: 'BRL',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2026-11-17T00:00:00.000Z',
        },
      ],
      listTransactions: async () => [
        {
          id: 'tx-2024',
          accountId: 'acc-nubank-1',
          description: 'Antiga',
          currencyCode: 'BRL',
          amount: -10,
          date: '2024-06-15T12:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2024-06-15T12:00:00.000Z',
          updatedAt: '2024-06-15T12:00:00.000Z',
        },
        {
          id: 'tx-2025',
          accountId: 'acc-nubank-1',
          description: 'Média',
          currencyCode: 'BRL',
          amount: -50,
          date: '2025-05-10T12:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2025-05-10T12:00:00.000Z',
          updatedAt: '2025-05-10T12:00:00.000Z',
        },
        {
          id: 'tx-2026',
          accountId: 'acc-nubank-1',
          description: 'Recente',
          currencyCode: 'BRL',
          amount: -10,
          date: '2026-11-10T12:00:00.000Z',
          type: 'DEBIT',
          status: 'POSTED',
          createdAt: '2026-11-10T12:00:00.000Z',
          updatedAt: '2026-11-10T12:00:00.000Z',
        },
      ],
      listBills: async () => [],
      listInvestments: async () => [],
      listInvestmentTransactions: async () => [],
    } as unknown as PluggyClient;

    const report = (await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: [itemId],
    })) as any;

    const accDiag = report.items[0].accounts[0];
    expect(accDiag.txCount).toBe(3);
    expect(accDiag.txCountByYear).toEqual({ '2024': 1, '2025': 1, '2026': 1 });
    expect(accDiag.localEntriesSummary.total).toBe(2);
    expect(accDiag.localEntriesSummary.removedCount).toBe(1);
    expect(accDiag.localEntriesSummary.byReason.SIGN).toBe(1);
    expect(accDiag.localEntriesSummary.byReason.INVESTMENT_MOVE).toBe(1);
  });
});
