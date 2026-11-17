import type { PluggyClient } from '../pluggyClient';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from '../types';

/**
 * Fixture ponta a ponta anonimizada para a Sprint 102 (sem PII).
 *
 * Origem dos dados:
 * - REAIS (docs/json.json e PLANO §2.1 / §2.2 / §4):
 *   - Contas: conta corrente (`balance: 1000.00`) e cartão XP (`creditLimit: 12000`, `availableCreditLimit: 9200`).
 *   - Fatura fechada anterior (`totalAmount: 1450.00`, paga) e 7 despesas PENDING no cartão somando `1536.69`
 *     (Groceries 279.55, Parking 206.66, Online Courses 161.32, Telecommunications 132.91, Services 129.65,
 *     Digital services 126.90 e Restante 499.70).
 *   - Investimentos (D46/D47, 17/11): soma institucional Pluggy = `9098.21` (MXRF11 `5465.46` para `637` cotas +
 *     Renda Fixa `3632.75`), e no Celsus cotações/livro somam `9092.39` (MXRF11 `625` cotas × R$ 8,81608 = `5510.05`
 *     + Renda Fixa `3582.34`), diferença `-5.82` informativa (`QUOTE_VS_INSTITUTION`) e divergência de livro `625 vs 637 (-12)`.
 * - SINTÉTICOS COERENTES (onde o export pré-v3 trazia apenas amostras):
 *   - Transações completas do cartão fechando a fatura anterior (`1450.00`) e a fatura aberta (`1263.31`, total `used = 2800.00`
 *     com os `1536.69` pendentes — ajuste coerente para soma exata) + transações da conta corrente no mês `2026-11`.
 */

export interface PluggyRealSnapshotBundle {
  item: PluggyItem;
  bankAccount: PluggyAccount;
  cardAccount: PluggyAccount;
  bills: PluggyBill[];
  bankTransactions: PluggyTransaction[];
  cardTransactions: PluggyTransaction[];
  investments: PluggyInvestment[];
  investmentTransactionsById: Record<string, PluggyInvestmentTransaction[]>;
  expectedAppInvestTotalCents: number;
  expectedPluggyInvestTotalCents: number;
  expectedMxrfAppValueCents: number;
  expectedMxrfPluggyValueCents: number;
  expectedMxrfLedgerQty: number;
  expectedMxrfPluggyQty: number;
  client: PluggyClient;
}

export function buildPluggyRealSnapshot(overrides?: {
  swapTxIds?: boolean;
  dropOneBankTx?: boolean;
  settleScheduled?: boolean;
}): PluggyRealSnapshotBundle {
  const itemId = 'item-7ccce4de-real';
  const item: PluggyItem = {
    id: itemId,
    connector: { id: 200, name: 'MeuPluggy', isOpenFinance: false },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    lastUpdatedAt: '2026-11-17T09:12:00.000Z',
    nextAutoSyncAt: '2026-11-18T09:12:00.000Z',
    consentExpiresAt: '2027-05-01T00:00:00.000Z',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-11-17T09:12:00.000Z',
  };

  const bankAccount: PluggyAccount = {
    id: 'of-bank-7ccce4de',
    itemId,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '0001-9',
    balance: 1000.0,
    currencyCode: 'BRL',
    updatedAt: '2026-11-17T09:12:00.000Z',
    bankData: {
      closingBalance: 1000.0,
      automaticallyInvestedBalance: 0,
      overdraftUsedLimit: 0,
      transferNumber: '341/0001/00001-9',
    },
  };

  const cardAccount: PluggyAccount = {
    id: 'of-card-xp-7ccce4de',
    itemId,
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Cartão XP',
    number: '4111',
    balance: 2800.0,
    currencyCode: 'BRL',
    updatedAt: '2026-11-17T09:12:00.000Z',
    creditData: {
      level: 'INFINITE',
      brand: 'VISA',
      balanceCloseDate: '2026-11-03T00:00:00.000Z',
      balanceDueDate: '2026-11-10T00:00:00.000Z',
      creditLimit: 12000.0,
      availableCreditLimit: 9200.0,
      minimumPayment: 200.0,
    },
  };

  const bills: PluggyBill[] = [
    {
      id: 'bill-xp-2026-11',
      dueDate: '2026-11-10T00:00:00.000Z',
      billClosingDate: '2026-11-03T00:00:00.000Z',
      totalAmount: 1450.0,
      totalAmountCurrencyCode: 'BRL',
      minimumPaymentAmount: 200.0,
      payments: [
        {
          amount: 1450.0,
          paymentDate: '2026-11-10T12:00:00.000Z',
          valueType: 'FULL_PAYMENT',
        },
      ],
    },
  ];

  const txId1 = overrides?.swapTxIds ? 'tx-b1-v2' : 'tx-b1';
  const txId2 = overrides?.swapTxIds ? 'tx-b2-v2' : 'tx-b2';
  const txId3 = overrides?.swapTxIds ? 'tx-c1-v2' : 'tx-c1';

  const bankTransactions: PluggyTransaction[] = [
    {
      id: txId1,
      accountId: bankAccount.id,
      description: 'Salário Empresa',
      currencyCode: 'BRL',
      amount: 5000.0,
      date: '2026-11-05T12:00:00.000Z',
      type: 'CREDIT',
      status: 'POSTED',
      category: 'Salary',
      categoryId: '01010000',
    },
    ...(overrides?.dropOneBankTx
      ? []
      : [
          {
            id: txId2,
            accountId: bankAccount.id,
            description: 'Mercado Central',
            currencyCode: 'BRL',
            amount: -400.0,
            date: '2026-11-08T15:00:00.000Z',
            type: 'DEBIT' as const,
            status: 'POSTED' as const,
            category: 'Groceries',
            categoryId: '10000000',
          },
        ]),
    {
      id: 'tx-b-sched',
      accountId: bankAccount.id,
      description: 'Boleto Condomínio',
      currencyCode: 'BRL',
      amount: -600.0,
      date: overrides?.settleScheduled
        ? '2026-11-25T12:00:00.000Z'
        : '2026-11-25T00:00:00.000Z',
      type: 'DEBIT',
      status: overrides?.settleScheduled ? 'POSTED' : 'PENDING',
      category: 'Housing',
      categoryId: '17000000',
    },
  ];

  const cardTransactions: PluggyTransaction[] = [
    {
      id: txId3,
      accountId: cardAccount.id,
      description: 'Compra Fatura Fechada',
      currencyCode: 'BRL',
      amount: 1450.0,
      date: '2026-10-20T12:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      category: 'Shopping',
      categoryId: '08000000',
      creditCardMetadata: { billId: 'bill-xp-2026-11' },
    },
    {
      id: 'tx-c-pay-11',
      accountId: cardAccount.id,
      description: 'Pagamento de Fatura',
      currencyCode: 'BRL',
      amount: -1450.0,
      date: '2026-11-10T12:00:00.000Z',
      type: 'CREDIT',
      status: 'POSTED',
      operationType: 'PAGAMENTO_FATURA',
    },
    // 7 despesas PENDING reais somando R$ 1.536,69
    { id: 'tx-c-p1', accountId: cardAccount.id, description: 'Groceries', currencyCode: 'BRL', amount: 279.55, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Groceries', categoryId: '10000000' },
    { id: 'tx-c-p2', accountId: cardAccount.id, description: 'Parking', currencyCode: 'BRL', amount: 206.66, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Transport', categoryId: '19000000' },
    { id: 'tx-c-p3', accountId: cardAccount.id, description: 'Online Courses', currencyCode: 'BRL', amount: 161.32, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Education', categoryId: '07020000' },
    { id: 'tx-c-p4', accountId: cardAccount.id, description: 'Telecommunications', currencyCode: 'BRL', amount: 132.91, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Telecom', categoryId: '09000000' },
    { id: 'tx-c-p5', accountId: cardAccount.id, description: 'Services', currencyCode: 'BRL', amount: 129.65, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Services', categoryId: '07000000' },
    { id: 'tx-c-p6', accountId: cardAccount.id, description: 'Digital services', currencyCode: 'BRL', amount: 126.90, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Subscriptions', categoryId: '07010000' },
    { id: 'tx-c-p7', accountId: cardAccount.id, description: 'Outros Pendentes', currencyCode: 'BRL', amount: 499.70, date: '2026-11-15T12:00:00.000Z', type: 'DEBIT', status: 'PENDING', category: 'Shopping', categoryId: '08000000' },
    // POSTED na fatura aberta completando 2800.00 - 1536.69 = 1263.31
    { id: 'tx-c-open-1', accountId: cardAccount.id, description: 'Compra Aberta', currencyCode: 'BRL', amount: 1263.31, date: '2026-11-12T12:00:00.000Z', type: 'DEBIT', status: 'POSTED', category: 'Shopping', categoryId: '08000000' },
  ];

  const investments: PluggyInvestment[] = [
    {
      id: 'inv-mxrf11',
      itemId,
      type: 'EQUITY',
      subtype: 'REAL_ESTATE_FUND',
      code: 'MXRF11',
      name: 'MAXI RENDA FII',
      balance: 5465.46,
      quantity: 637,
      value: 8.58,
      currencyCode: 'BRL',
      status: 'ACTIVE',
    },
    {
      id: 'inv-rf-1',
      itemId,
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Liquidez Diária',
      balance: 3632.75,
      currencyCode: 'BRL',
      status: 'ACTIVE',
    },
  ];

  const investmentTransactionsById: Record<string, PluggyInvestmentTransaction[]> = {
    'inv-mxrf11': [
      {
        id: 'itx-mxrf-1',
        type: 'BUY',
        quantity: 625,
        value: 8.8,
        amount: 5500,
        date: '2026-10-10T12:00:00.000Z',
        tradeDate: '2026-10-10T12:00:00.000Z',
      },
    ],
    'inv-rf-1': [],
  };

  const client = {
    getItem: async () => item,
    listAccounts: async () => [bankAccount, cardAccount],
    listTransactions: async (accountId: string) =>
      accountId === bankAccount.id ? bankTransactions : cardTransactions,
    listBills: async (accountId: string) =>
      accountId === cardAccount.id ? bills : [],
    listInvestments: async () => investments,
    listInvestmentTransactions: async (invId: string) =>
      investmentTransactionsById[invId] ?? [],
  } as unknown as PluggyClient;

  return {
    item,
    bankAccount,
    cardAccount,
    bills,
    bankTransactions,
    cardTransactions,
    investments,
    investmentTransactionsById,
    expectedAppInvestTotalCents: 909239,
    expectedPluggyInvestTotalCents: 909821,
    expectedMxrfAppValueCents: 551005,
    expectedMxrfPluggyValueCents: 546546,
    expectedMxrfLedgerQty: 625,
    expectedMxrfPluggyQty: 637,
    client,
  };
}
