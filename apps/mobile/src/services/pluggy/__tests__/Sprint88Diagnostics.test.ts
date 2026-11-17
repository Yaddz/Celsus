import { resetDatabase } from '../../../db/client';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { pluggyDiagnosticsService } from '../pluggyDiagnosticsService';
import {
  makePluggyAccounts,
  makePluggyBills,
  makePluggyItem,
  makeSprint84OpenApiInvestment,
  makeSprint84OpenApiInvestmentTx,
} from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';

describe('Sprint 88 — Diagnóstico anonimizado Pluggy (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S88-T01: relatório não contém owner, taxNumber, number nem itemId em claro', async () => {
    const secretItemId = 'item-secreto-998877';
    await openFinanceRepository.addItem(secretItemId);

    const acc = {
      ...makePluggyAccounts()[0],
      itemId: secretItemId,
      owner: 'JOAO SILVA SAURO',
      taxNumber: '123.456.789-00',
      number: '998877-6',
    };
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-pii-1',
      itemId: secretItemId,
      owner: 'JOAO SILVA SAURO',
      number: '55443322',
    });

    const client = {
      getItem: async () => makePluggyItem({ id: secretItemId }),
      listAccounts: async () => [acc],
      listTransactions: async () => [],
      listBills: async () => makePluggyBills(),
      listInvestments: async () => [inv],
      listInvestmentTransactions: async () => [],
    } as unknown as PluggyClient;

    const report = await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: [secretItemId],
    });

    expect(report.items).toHaveLength(1);
    const json = JSON.stringify(report);
    expect(json).not.toContain(secretItemId);
    expect(json).not.toContain('JOAO SILVA SAURO');
    expect(json).not.toContain('123.456.789-00');
    expect(json).not.toContain('998877-6');
    expect(json).not.toContain('55443322');
  });

  it('S88-T05: transação com value×quantity != amount => contada em valueQtyMismatchCount', async () => {
    const itemId = 'item-diag-1';
    await openFinanceRepository.addItem(itemId);

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-diag-1',
      itemId,
      type: 'MUTUAL_FUND',
      subtype: 'MULTIMARKET_FUND',
    });
    const badTx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-bad-1',
      type: 'BUY',
      quantity: null,
      value: 2.0,
      amount: 5000.0,
      netAmount: 5000.0,
    });
    const okTx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-ok-1',
      type: 'BUY',
      quantity: 2500,
      value: 2.0,
      amount: 5000.0,
      priceFactor: 10,
    });

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [],
      listTransactions: async () => [],
      listBills: async () => [],
      listInvestments: async () => [inv],
      listInvestmentTransactions: async () => [badTx, okTx],
    } as unknown as PluggyClient;

    const report = await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: [itemId],
    });

    const summary = report.items[0].investments[0].transactionsSummary;
    expect(summary.total).toBe(2);
    expect(summary.valueQtyMismatchCount).toBe(1);
    expect(summary.withNetAmountCount).toBe(1);
    expect(summary.withPriceFactorCount).toBe(1);
  });
});
