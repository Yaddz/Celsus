import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finBills, finEntries } from '../../../db/schema';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import {
  BackupService,
  type BackupDatabaseSnapshot,
  type IBackupStorageAdapter,
} from '../../backupService';
import type { PluggyClient } from '../pluggyClient';
import { pluggySyncService } from '../pluggySyncService';
import {
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from './pluggyFixtures';
import type { PluggyTransaction } from '../types';

class MemoryBackupDatabaseAdapter implements IBackupStorageAdapter {
  public snapshot: BackupDatabaseSnapshot = {
    portfolios: [],
    classTargets: [],
    assets: [],
    transactions: [],
  };
  async getSnapshot(): Promise<BackupDatabaseSnapshot> {
    return this.snapshot;
  }
  async replaceAll(incoming: BackupDatabaseSnapshot): Promise<void> {
    this.snapshot = incoming;
  }
  async mergeByUuid(incoming: BackupDatabaseSnapshot): Promise<void> {
    this.snapshot = incoming;
  }
}

describe('Sprint 97 — Contrato completo e campos crus (R24)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S97-T02: sync grava campos crus of_* e re-sync com operationType mudado atualiza in-place sem duplicar', async () => {
    const itemId = 'item-7ccce4de';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const bill = makeSprint97RawBill();
    const txCompra = makeSprint97RawCardTx({
      id: 'tx-compra-9834',
      accountId: card.id,
      amount: 98.34,
      type: 'DEBIT',
      status: 'PENDING',
      operationType: 'PAGAMENTO',
      providerId: 'prov-9834',
      createdAt: '2026-11-13T15:00:00.000Z',
      creditCardMetadata: {
        billId: bill.id,
        billForecastDate: '2026-11',
        billPostDate: '2026-11-13',
        installmentNumber: 12,
        totalInstallments: 12,
      },
    });
    const txCredito = makeSprint97RawCardTx({
      id: 'tx-credito-290013',
      accountId: card.id,
      description: 'Pgto fatura',
      amount: -2900.13,
      type: 'CREDIT',
      status: 'POSTED',
      operationType: 'PAGAMENTO_FATURA',
      providerId: 'prov-290013',
      createdAt: '2026-11-06T12:00:00.000Z',
      creditCardMetadata: {
        billId: bill.id,
        billForecastDate: '2026-11',
        billPostDate: '2026-11-06',
      },
    });

    let currentOperationType = 'PAGAMENTO';
    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        { ...txCompra, operationType: currentOperationType },
        txCredito,
      ],
      listBills: async () => [bill],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });

    const db = getDatabase();
    const rows = (await db.select().from(finEntries)) as any[];
    expect(rows).toHaveLength(2);

    const compraRow = rows.find((r) => r.external_id === 'tx-compra-9834');
    expect(compraRow.of_provider_id).toBe('prov-9834');
    expect(compraRow.of_bill_id).toBe(bill.id);
    expect(compraRow.of_bill_forecast_month).toBe('2026-11');
    expect(compraRow.of_bill_post_date).toBe('2026-11-13');
    expect(compraRow.of_operation_type).toBe('PAGAMENTO');
    expect(compraRow.of_raw_status).toBe('PENDING');
    expect(compraRow.of_raw_type).toBe('DEBIT');
    expect(compraRow.of_raw_amount_cents).toBe(9834);
    expect(compraRow.of_created_at).toBe('2026-11-13T15:00:00.000Z');
    expect(compraRow.of_installment_number).toBe(12);
    expect(compraRow.of_installment_total).toBe(12);

    const creditoRow = rows.find((r) => r.external_id === 'tx-credito-290013');
    expect(creditoRow.of_raw_amount_cents).toBe(-290013);
    expect(creditoRow.of_raw_type).toBe('CREDIT');
    expect(creditoRow.of_raw_status).toBe('POSTED');

    currentOperationType = 'OUTROS';
    await pluggySyncService.syncFinance(itemId, { client });

    const rowsAfter = (await db.select().from(finEntries)) as any[];
    expect(rowsAfter).toHaveLength(2);
    const compraAfter = rowsAfter.find((r) => r.external_id === 'tx-compra-9834');
    expect(compraAfter.id).toBe(compraRow.id);
    expect(compraAfter.of_operation_type).toBe('OUTROS');
  });

  it('S97-T03: mesma fixture SEM providerId/billId/billForecastDate/operationType (chaves ausentes) => colunas null sem erro', async () => {
    const itemId = 'item-no-of-fields';
    await openFinanceRepository.addItem(itemId);
    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const txSemCampos: PluggyTransaction = {
      id: 'tx-sem-of',
      accountId: card.id,
      description: 'Compra simples',
      currencyCode: 'BRL',
      amount: 45.9,
      date: '2026-11-10T00:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [txSemCampos],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance(itemId, { client });

    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.external_id, 'tx-sem-of'))) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].of_provider_id).toBeNull();
    expect(rows[0].of_bill_id).toBeNull();
    expect(rows[0].of_bill_forecast_month).toBeNull();
    expect(rows[0].of_bill_post_date).toBeNull();
    expect(rows[0].of_operation_type).toBeNull();
    expect(rows[0].of_raw_amount_cents).toBe(4590);
  });

  it('S97-T04: upsertBill grava payments_json, payments_total_cents, allows_installments e chargeable_charges_cents', async () => {
    const acc = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: 'acc-xp-1',
    });

    const bill = makeSprint97RawBill();
    await finRepository.upsertBill({
      accountId: acc.id,
      externalId: bill.id,
      billMonth: '2026-11',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      totalAmountCents: 290013,
      minimumPaymentCents: 43502,
      allowsInstallments: bill.allowsInstallments ?? null,
      payments: bill.payments ?? null,
      financeCharges: bill.financeCharges ?? null,
    } as any);

    const db = getDatabase();
    const rows = (await db
      .select()
      .from(finBills)
      .where(eq(finBills.account_id, acc.id))) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].payments_total_cents).toBe(51250);
    expect(JSON.parse(rows[0].payments_json)).toHaveLength(1);
    expect(rows[0].allows_installments).toBe(1);
    // IOF 7.01 (701) + LATE_PAYMENT_FEE 5.49 (549) + OTHER "Tarifa de emissão de boleto" 3.90 (390) = 1640
    expect(rows[0].chargeable_charges_cents).toBe(1640);
  });

  it('S97-T11: backup exportar/importar preserva as colunas novas e aceita backup antigo sem elas como null', async () => {
    const adapter = new MemoryBackupDatabaseAdapter();
    const service = new BackupService(adapter);

    const snapshotWithNewCols: BackupDatabaseSnapshot = {
      portfolios: [],
      classTargets: [],
      assets: [],
      transactions: [],
      incomeEvents: [],
      finAccounts: [
        {
          id: 'acc-1',
          name: 'Cartão XP',
          type: 'card',
          initial_balance_cents: 0,
          color: '#000000',
          archived: 0,
          closing_day: 3,
          due_day: 10,
          credit_limit_cents: 1441023,
          of_account_id: 'of-acc-1',
          source: 'OPEN_FINANCE',
          reported_balance_cents: 1079402,
          reported_balance_at: '2026-11-17T09:00:00.000Z',
          masked_number: '8297',
          owner: null,
          auto_name: 'Cartão XP',
          of_linked_at: '2026-11-01T00:00:00.000Z',
          closing_balance_cents: null,
          auto_invested_cents: null,
          credit_used_cents: 1079402,
          of_available_limit_cents: 361621,
          of_minimum_payment_cents: 43502,
          of_balance_due_date: '2026-12-10',
          of_overdraft_used_cents: null,
          of_reserved_cents: null,
          created_at: '2026-11-01T00:00:00.000Z',
        } as any,
      ],
      finCategories: [],
      finEntries: [
        {
          id: 'ent-1',
          kind: 'expense',
          amount_cents: 9834,
          due_date: '2026-11-13',
          paid_date: '2026-11-13',
          paid_amount_cents: 9834,
          status: 'paid',
          account_id: 'acc-1',
          category_id: 'cat-compras',
          description: 'Shopee',
          recurrence_id: null,
          recurrence_period: null,
          installment_group_id: null,
          installment_number: 12,
          installment_total: 12,
          bill_month: '2026-11',
          transfer_group_id: null,
          source: 'OPEN_FINANCE',
          external_id: 'tx-1',
          import_batch_id: null,
          description_raw: 'SHOPEE',
          user_edited_fields: null,
          linked_income_id: null,
          of_removed_at: null,
          of_category_id: '08010000',
          of_class_reason: null,
          of_provider_id: 'prov-1',
          of_bill_id: 'bill-1',
          of_bill_forecast_month: '2026-11',
          of_bill_post_date: '2026-11-13',
          of_operation_type: 'PAGAMENTO',
          of_raw_status: 'PENDING',
          of_raw_type: 'DEBIT',
          of_raw_amount_cents: 9834,
          of_created_at: '2026-11-13T15:00:00.000Z',
          of_installment_number: 12,
          of_installment_total: 12,
          of_bill_month_source: 'BILL_ID',
          created_at: '2026-11-13T15:00:00.000Z',
        } as any,
      ],
      ofItems: [
        {
          id: 'item-1',
          connector_name: 'MeuPluggy',
          status: 'UPDATED',
          execution_status: 'SUCCESS',
          consent_expires_at: '2027-06-01T00:00:00.000Z',
          last_synced_at: '2026-11-17T09:00:00.000Z',
          last_error: null,
          last_updated_at: '2026-11-17T08:00:00.000Z',
          next_auto_sync_at: '2026-11-18T08:00:00.000Z',
          status_detail_json: '{"creditCards":{"isUpdated":true}}',
          error_code: null,
        } as any,
      ],
    };

    const exported = await service.exportDossierArchive(snapshotWithNewCols);
    await service.importDossierArchive(exported.zipBytes, 'RESTORE');
    const restored = adapter.snapshot;

    const restoredAcc = (restored.finAccounts?.[0] ?? {}) as any;
    expect(restoredAcc.of_available_limit_cents).toBe(361621);
    expect(restoredAcc.of_minimum_payment_cents).toBe(43502);
    expect(restoredAcc.of_balance_due_date).toBe('2026-12-10');

    const restoredEntry = (restored.finEntries?.[0] ?? {}) as any;
    expect(restoredEntry.of_provider_id).toBe('prov-1');
    expect(restoredEntry.of_bill_id).toBe('bill-1');
    expect(restoredEntry.of_bill_forecast_month).toBe('2026-11');
    expect(restoredEntry.of_raw_amount_cents).toBe(9834);
    expect(restoredEntry.of_bill_month_source).toBe('BILL_ID');

    const restoredItem = (restored.ofItems?.[0] ?? {}) as any;
    expect(restoredItem.last_updated_at).toBe('2026-11-17T08:00:00.000Z');
    expect(restoredItem.next_auto_sync_at).toBe('2026-11-18T08:00:00.000Z');
    expect(restoredItem.status_detail_json).toBe('{"creditCards":{"isUpdated":true}}');

    // Simula backup antigo sem as colunas novas (objetos sem as chaves)
    const oldSnapshot: BackupDatabaseSnapshot = {
      portfolios: [],
      classTargets: [],
      assets: [],
      transactions: [],
      incomeEvents: [],
      finAccounts: [
        {
          id: 'acc-old',
          name: 'Conta Antiga',
          type: 'checking',
          initial_balance_cents: 1000,
          color: '#000',
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
          created_at: '2026-01-01T00:00:00.000Z',
        } as any,
      ],
    };
    const exportedOld = await service.exportDossierArchive(oldSnapshot);
    await service.importDossierArchive(exportedOld.zipBytes, 'RESTORE');
    const restoredOld = adapter.snapshot;
    const oldAcc = (restoredOld.finAccounts?.[0] ?? {}) as any;
    expect(oldAcc.of_available_limit_cents).toBeNull();
    expect(oldAcc.of_overdraft_used_cents).toBeNull();
  });
});
