import { resetDatabase } from '../../../db/client';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { collectAppNumbers, computePluggyTruth, reconcileAppVsPluggy } from '../../../domain/openFinance/pluggyTruth';
import { pluggySyncService } from '../pluggySyncService';
import { buildPluggyRealSnapshot } from './pluggyRealSnapshot';

describe('Sprint 102 — Sync ponta a ponta com pluggyRealSnapshot', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S102-T07: sync em banco vazio + re-sync com 3 ids trocados, 1 sumida e 1 agendado liquidado => zero diferenças e contagem igual', async () => {
    const snap1 = buildPluggyRealSnapshot();
    await openFinanceRepository.addItem(snap1.item.id);
    await pluggySyncService.syncFinance(snap1.item.id, {
      client: snap1.client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    const entries1 = (await finRepository.listAllEntries()).filter((e) => !e.of_removed_at);

    const snap2 = buildPluggyRealSnapshot({
      swapTxIds: true,
      dropOneBankTx: true,
      settleScheduled: true,
    });
    await pluggySyncService.syncFinance(snap2.item.id, {
      client: snap2.client,
      now: () => new Date('2026-11-25T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const entries2 = await finRepository.listAllEntries();
    const bills = await finRepository.listAllBills();
    const activeEntries2 = entries2.filter((e) => !e.of_removed_at);

    // 1 lançamentos sumiu da busca -> active count = entries1.length - 1 (nenhuma duplicação nos 3 ids trocados)
    expect(activeEntries2).toHaveLength(entries1.length - 1);

    const truth = computePluggyTruth({
      item: snap2.item,
      accounts: [snap2.bankAccount, snap2.cardAccount],
      transactionsByAccountId: {
        [snap2.bankAccount.id]: snap2.bankTransactions,
        [snap2.cardAccount.id]: snap2.cardTransactions,
      },
      billsByAccountId: {
        [snap2.cardAccount.id]: snap2.bills,
      },
      investments: snap2.investments,
      todayIso: '2026-11-25',
    });

    const appNumbers = collectAppNumbers({
      accounts,
      entries: entries2,
      bills,
      todayIso: '2026-11-25',
    });

    const diffs = reconcileAppVsPluggy(truth, appNumbers);
    expect(diffs).toEqual([]);
  });
});
