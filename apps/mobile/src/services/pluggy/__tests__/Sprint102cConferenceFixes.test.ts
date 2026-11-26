import Decimal from 'decimal.js';
import { resetDatabase } from '../../../db/client';
import { calculateAccountBalance } from '../../../domain/financeFlow';
import { keepPendingOutOfClosedBills } from '../../../domain/openFinance/cardBills';
import { computeLedgerQuantity, resolveDisplayedAssetValue } from '../../../domain/openFinance/diagnostics';
import { computePluggyTruth, reconcileAppVsPluggy, type AppNumbersResult } from '../../../domain/openFinance/pluggyTruth';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { describeDiffKey } from '../../../screens/OpenFinanceReconciliationScreen';
import type { PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from '../types';
import { OF_RECLOSE_S102B_META_PREFIX, pluggySyncService } from '../pluggySyncService';
import { buildPluggyRealSnapshot } from './pluggyRealSnapshot';

/**
 * Achados da conferência no aparelho (17/11/2026, depois da Sprint 102), com o padrão real das conexões Meu Pluggy:
 * sem operationType, "Pgto fatura" da fatura anterior dentro da fatura seguinte e pendentes sem billId.
 */
const item: PluggyItem = {
  id: 'item-xp',
  connector: { id: 200, name: 'MeuPluggy', isOpenFinance: false },
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  lastUpdatedAt: '2026-11-17T09:12:00.000Z',
} as PluggyItem;

const card: PluggyAccount = {
  id: 'card-xp',
  itemId: 'item-xp',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  name: 'Cartão XP Visa Infinite',
  number: '8297',
  balance: 10794.02,
  currencyCode: 'BRL',
  creditData: { creditLimit: 14410.23, availableCreditLimit: 3616.21, balanceCloseDate: null, balanceDueDate: null },
} as unknown as PluggyAccount;

const bills: PluggyBill[] = [
  // ordem decrescente de propósito: a API não garante ordem
  {
    id: 'bill-2026-11',
    dueDate: '2026-11-10T00:00:00.000Z',
    billClosingDate: '2026-11-03T00:00:00.000Z',
    totalAmount: 2900.13,
    totalAmountCurrencyCode: 'BRL',
    financeCharges: [],
    payments: [],
  },
  {
    id: 'bill-2026-10',
    dueDate: '2026-10-10T00:00:00.000Z',
    billClosingDate: '2026-10-03T00:00:00.000Z',
    totalAmount: 3139.25,
    totalAmountCurrencyCode: 'BRL',
    financeCharges: [],
    payments: [],
  },
] as unknown as PluggyBill[];

function tx(p: Partial<PluggyTransaction> & { id: string; amount: number; date: string }): PluggyTransaction {
  return {
    accountId: 'card-xp',
    description: 'COMPRA',
    currencyCode: 'BRL',
    type: p.amount < 0 ? 'CREDIT' : 'DEBIT',
    status: 'POSTED',
    category: 'Groceries',
    categoryId: '10000000',
    creditCardMetadata: {},
    ...p,
  } as PluggyTransaction;
}

const cardTxs: PluggyTransaction[] = [
  // fatura de nov/2026: compras de 2.900,13 + o pagamento da fatura de out (sem operationType, como no Meu Pluggy)
  tx({ id: 't1', amount: 2000.13, date: '2026-10-15T00:00:00.000Z', creditCardMetadata: { billId: 'bill-2026-11' } }),
  tx({ id: 't2', amount: 900.0, date: '2026-10-20T00:00:00.000Z', creditCardMetadata: { billId: 'bill-2026-11' } }),
  tx({
    id: 't3',
    amount: -3139.25,
    date: '2026-10-09T00:00:00.000Z',
    description: 'Pgto fatura',
    category: 'Transfers',
    categoryId: '05000000',
    creditCardMetadata: { billId: 'bill-2026-11' },
  }),
  // fatura aberta: duas compras pendentes sem billId cujo billForecastDate aponta para o mês da fatura já fechada,
  // e o pagamento pendente da fatura de nov
  tx({
    id: 't4',
    amount: 206.66,
    date: '2026-11-15T00:00:00.000Z',
    status: 'PENDING',
    creditCardMetadata: { billForecastDate: '2026-11' },
  }),
  tx({
    id: 't5',
    amount: 13.6,
    date: '2026-11-15T00:00:00.000Z',
    status: 'PENDING',
    creditCardMetadata: { billForecastDate: '2026-11' },
  }),
  tx({
    id: 't6',
    amount: -2900.13,
    date: '2026-11-06T00:00:00.000Z',
    status: 'PENDING',
    description: 'Pgto fatura',
    category: 'Transfers',
    categoryId: '05000000',
  }),
];

describe('Sprint 102c — conferência Pluggy × app sem falsos positivos', () => {
  beforeEach(() => {
    resetDatabase();
  });

  const truth = () =>
    computePluggyTruth(
      {
        item,
        accounts: [card],
        transactionsByAccount: { 'card-xp': cardTxs },
        billsByAccount: { 'card-xp': bills },
        investments: [],
      },
      '2026-11-17'
    );

  it('S102c-T01: "Pgto fatura" sem operationType não entra nos itens da fatura (itens = total do banco)', () => {
    const nov = truth().cardAccounts['card-xp'].closedBills.find((b) => b.billId === 'bill-2026-11')!;
    expect(nov.itemsCents).toBe(290013);
    expect(nov.itemsVsTotalDiffCents).toBe(0);
  });

  it('S102c-T02: fatura atual = compras pendentes, sem o pagamento e sem descartar pendente que cai em mês fechado', () => {
    const c = truth().cardAccounts['card-xp'];
    expect(c.openBill).toBe(22026);
  });

  it('S102c-T03: keepPendingOutOfClosedBills move pendente para a 1ª fatura em aberto; POSTED e meses futuros ficam', () => {
    expect(keepPendingOutOfClosedBills({ status: 'PENDING' }, '2026-11', bills)).toBe('2026-12');
    expect(keepPendingOutOfClosedBills({ status: 'PENDING' }, '2026-09', bills)).toBe('2026-12');
    expect(keepPendingOutOfClosedBills({ status: 'PENDING' }, '2027-01', bills)).toBe('2027-01');
    expect(keepPendingOutOfClosedBills({ status: 'POSTED' }, '2026-11', bills)).toBe('2026-11');
    expect(keepPendingOutOfClosedBills({ status: 'PENDING' }, '2026-11', [])).toBe('2026-11');
  });

  it('S102c-T04: despesas futuras comparadas só com as contas da conexão (não com o total do app inteiro)', () => {
    const t = truth();
    const appNumbers: AppNumbersResult = {
      bankBalancesByOfAccountId: {},
      pendingOutflowCents: t.totals.pendingOutflowCents + 349864, // total global inclui outra conexão
      pendingOutflowByOfAccountId: { 'card-xp': t.totals.pendingOutflowCents, 'outra-conta': 349864 },
      cardsByOfAccountId: {},
    };
    const diffs = reconcileAppVsPluggy(t, appNumbers);
    expect(diffs.find((d) => d.key === 'pending_outflow')).toBeUndefined();

    appNumbers.pendingOutflowByOfAccountId!['card-xp'] += 100;
    const diffs2 = reconcileAppVsPluggy(t, appNumbers);
    expect(diffs2.find((d) => d.key === 'pending_outflow')?.diffCents).toBe(100);
  });

  it('S102c-T05: chave de diferença legível (conta pelo nome, mês mm/aaaa, sem UUID)', () => {
    const names = { '561d073e-64e4-4708-a4f3-5f9dcfe8f576': 'Nubank · Platinum ·· 8926' };
    expect(describeDiffKey('561d073e-64e4-4708-a4f3-5f9dcfe8f576:2025-08:items', names)).toBe(
      'Nubank · Platinum ·· 8926 · 08/2025 · itens da fatura'
    );
    expect(describeDiffKey('pending_outflow', names)).toBe('Despesas futuras');
    expect(describeDiffKey('62619f00-1111-2222-3333-444455556666:2026-01:items', {})).toBe(
      'conta 6261 · 01/2026 · itens da fatura'
    );
  });

  it('S102c-T06: valor do ativo na conferência = valor exibido pelo app (cotação × quantidade), não preço médio', () => {
    // MXRF11 com custo desconhecido (average_price '') aparecia como R$ 0,00 na conferência
    const mxrf = {
      id: 'a1',
      ticker: 'MXRF11',
      quantity: '637',
      value_source: 'QUOTE',
      of_reported_value: '5465.46',
      manual_position_value: null,
      average_price: '',
    };
    expect(resolveDisplayedAssetValue(mxrf, new Map([['MXRF11', '8.65']]))).toBe('5510.05');
    expect(resolveDisplayedAssetValue(mxrf, new Map())).toBe('5465.46');
    expect(
      resolveDisplayedAssetValue({ ...mxrf, value_source: 'INSTITUTION' }, new Map([['MXRF11', '8.65']]))
    ).toBe('5465.46');

    const ledger = computeLedgerQuantity('a1', [
      { asset_id: 'a1', type: 'BUY', quantity: '600' },
      { asset_id: 'a1', type: 'BUY', quantity: '40' },
      { asset_id: 'a1', type: 'SELL', quantity: '15' },
      { asset_id: 'a1', type: 'BUY', quantity: '99', archived_at: '2026-01-01' },
      { asset_id: 'outro', type: 'BUY', quantity: '5' },
    ]);
    expect(ledger.equals(new Decimal(625))).toBe(true);
  });

  it('S102c-T07: conexão que já importou o histórico completo refecha o saldo inicial uma vez (sem divergência)', async () => {
    const snap = buildPluggyRealSnapshot();
    await openFinanceRepository.addItem(snap.item.id);
    const now = () => new Date('2026-11-17T12:00:00Z');
    await pluggySyncService.syncFinance(snap.item.id, { client: snap.client, now });

    const bank = (await finRepository.listAccounts(true)).find((a) => a.of_account_id === snap.bankAccount.id)!;
    const reportedCents = Math.round(snap.bankAccount.balance * 100);

    // Simula lançamento antigo que entrou depois (histórico completo) e desfaz o fechamento do saldo
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 20656,
      due_date: '2024-03-10',
      paid_date: '2024-03-10',
      paid_amount_cents: 20656,
      status: 'paid',
      account_id: bank.id,
      category_id: 'cat-outros-despesa',
      description: 'Lançamento antigo',
    } as any);
    const before = await finRepository.listAllEntries();
    const accBefore = (await finRepository.listAccounts(true)).find((a) => a.id === bank.id)!;
    expect(calculateAccountBalance(accBefore.initial_balance_cents, before, bank.id)).not.toBe(reportedCents);

    // Conexão que importou o histórico antes da correção: marca de refechamento ainda não gravada
    await appMetaRepository.set(`${OF_RECLOSE_S102B_META_PREFIX}${snap.item.id}`, '0');
    await pluggySyncService.syncFinance(snap.item.id, { client: snap.client, now });

    const after = await finRepository.listAllEntries();
    const accAfter = (await finRepository.listAccounts(true)).find((a) => a.id === bank.id)!;
    expect(calculateAccountBalance(accAfter.initial_balance_cents, after, bank.id)).toBe(reportedCents);
    expect(await appMetaRepository.get(`${OF_RECLOSE_S102B_META_PREFIX}${snap.item.id}`)).toBe('1');

    // Com a marca gravada, um lançamento manual novo não é "absorvido" pelo saldo inicial
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 1000,
      due_date: '2026-11-17',
      paid_date: '2026-11-17',
      paid_amount_cents: 1000,
      status: 'paid',
      account_id: bank.id,
      category_id: 'cat-outros-despesa',
      description: 'Manual',
    } as any);
    await pluggySyncService.syncFinance(snap.item.id, { client: snap.client, now });
    const accFinal = (await finRepository.listAccounts(true)).find((a) => a.id === bank.id)!;
    expect(accFinal.initial_balance_cents).toBe(accAfter.initial_balance_cents);
  });
});
