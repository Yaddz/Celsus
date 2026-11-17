import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finAccounts, finEntries } from '../../../db/schema';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import type { PluggyClient } from '../pluggyClient';
import { pluggySyncService } from '../pluggySyncService';
import {
  makePluggyItem,
  makeSprint97CardAccount7ccce4de,
  makeSprint97RawBill,
  makeSprint97RawCardTx,
} from './pluggyFixtures';

describe('Sprint 99 — Sync de faturas, deriveCardCalendar e migração fin:of:billmonth:s99', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S99-T13: deriveCardCalendar grava closing_day/calendar_source PLUGGY_BILLS sem sobrescrever USER, e migração s99 reatribui bill_month idempotente', async () => {
    const itemId = 'item-s99-mig';
    await openFinanceRepository.addItem(itemId);

    const card = makeSprint97CardAccount7ccce4de({ itemId });
    const localCard = await finRepository.createAccount({
      name: 'Cartão XP',
      type: 'card',
      source: 'OPEN_FINANCE',
      ofAccountId: card.id,
      closingDay: null,
      dueDay: null,
    });

    // Lançamentos gravados antes da 99 com bill_month errado pelo padrão 1/10
    await finRepository.createEntriesBatch([
      {
        kind: 'expense',
        amount_cents: 5000,
        due_date: '2026-11-02',
        paid_date: '2026-11-02',
        paid_amount_cents: 5000,
        status: 'paid',
        account_id: localCard.id,
        category_id: 'cat-compras',
        description: 'Compra dia 2',
        bill_month: '2026-12',
        source: 'OPEN_FINANCE',
        external_id: 'tx-mig-1',
        of_bill_id: 'bill-s99-nov',
        of_bill_forecast_month: '2026-11',
      },
      {
        kind: 'expense',
        amount_cents: 8000,
        due_date: '2026-11-02',
        paid_date: '2026-11-02',
        paid_amount_cents: 8000,
        status: 'paid',
        account_id: localCard.id,
        category_id: 'cat-compras',
        description: 'Compra editada manualmente',
        bill_month: '2027-02',
        user_edited_fields: JSON.stringify(['bill_month']),
        source: 'OPEN_FINANCE',
        external_id: 'tx-mig-edited',
        of_bill_id: 'bill-s99-nov',
        of_bill_forecast_month: '2026-11',
      },
    ]);

    const billNov = makeSprint97RawBill({
      id: 'bill-s99-nov',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
    });

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [card],
      listTransactions: async () => [
        makeSprint97RawCardTx({
          id: 'tx-mig-1',
          accountId: card.id,
          amount: 50,
          date: '2026-11-02T00:00:00.000Z',
          status: 'POSTED',
          creditCardMetadata: { billId: billNov.id, billForecastDate: '2026-11' },
        }),
        makeSprint97RawCardTx({
          id: 'tx-mig-edited',
          accountId: card.id,
          amount: 80,
          date: '2026-11-02T00:00:00.000Z',
          status: 'POSTED',
          creditCardMetadata: { billId: billNov.id, billForecastDate: '2026-11' },
        }),
      ],
      listBills: async () => [billNov],
    } as unknown as PluggyClient;

    const res1 = await pluggySyncService.syncFinance(itemId, { client });
    expect(res1.accountsNeedingClosingDay).toHaveLength(0);

    const updatedAcc = (await finRepository.getAccountById(localCard.id)) as any;
    expect(updatedAcc.closing_day).toBe(3);
    expect(updatedAcc.due_day).toBe(10);
    expect(updatedAcc.calendar_source).toBe('PLUGGY_BILLS');

    const db = getDatabase();
    const entriesAfter = (await db
      .select()
      .from(finEntries)
      .where(eq(finEntries.account_id, localCard.id))) as any[];
    const e1 = entriesAfter.find((e) => e.external_id === 'tx-mig-1');
    const eEdited = entriesAfter.find((e) => e.external_id === 'tx-mig-edited');
    expect(e1.bill_month).toBe('2026-11');
    expect(e1.of_bill_month_source).toBe('BILL_ID');
    expect(eEdited.bill_month).toBe('2027-02');

    expect(await appMetaRepository.get('fin:of:billmonth:s99')).toBe('1');
    const logRaw = await appMetaRepository.get('fin:of:billmonth:s99:log');
    expect(logRaw).toBeTruthy();

    // Se usuário digitou closing_day manualmente (calendar_source = 'USER'), sync não sobrescreve
    await finRepository.updateAccount(localCard.id, {
      closing_day: 5,
      calendar_source: 'USER',
    } as any);
    await pluggySyncService.syncFinance(itemId, { client });
    const accAfterUser = (await finRepository.getAccountById(localCard.id)) as any;
    expect(accAfterUser.closing_day).toBe(5);
    expect(accAfterUser.calendar_source).toBe('USER');
  });
});
