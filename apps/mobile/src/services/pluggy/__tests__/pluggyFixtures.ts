import {
  PluggyAccount,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from '../types';

export const FAKE_PLUGGY_CREDENTIALS = {
  clientId: '00000000-0000-4000-8000-000000000001',
  clientSecret: 'test-secret-do-not-use-in-prod-xyz',
};

export const makePluggyItem = (overrides: Partial<PluggyItem> = {}): PluggyItem => ({
  id: 'item-itau-001',
  connector: {
    id: 601,
    name: 'Itaú',
    institutionUrl: 'https://www.itau.com.br',
    type: 'PERSONAL_BANK',
    country: 'BR',
    products: ['ACCOUNTS', 'CREDIT_CARDS', 'INVESTMENTS'],
  },
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  error: null,
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
  lastUpdatedAt: '2026-11-16T10:00:00.000Z',
  consentExpiresAt: '2027-06-01T00:00:00.000Z',
  products: ['ACCOUNTS', 'CREDIT_CARDS', 'INVESTMENTS'],
  ...overrides,
});

export const makePluggyAccounts = (): PluggyAccount[] => [
  {
    id: 'acc-checking-1',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '12345-6',
    name: 'Conta Corrente',
    balance: 4520.5,
    itemId: 'item-itau-001',
    currencyCode: 'BRL',
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
  {
    id: 'acc-card-1',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    number: '**** 4321',
    name: 'Cartão Itaú Black',
    balance: 1890.0,
    itemId: 'item-itau-001',
    currencyCode: 'BRL',
    creditData: {
      level: 'Black',
      brand: 'Mastercard',
      balanceCloseDate: '2026-11-10T00:00:00.000Z',
      balanceDueDate: '2026-11-20T00:00:00.000Z',
      availableCreditLimit: 8110.0,
      creditLimit: 10000.0,
      minimumPayment: 280.0,
    },
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
];

export const makePluggyTransactions = (page: number, count: number): PluggyTransaction[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: `tx-p${page}-${idx + 1}`,
    description: `Compra p${page} #${idx + 1}`,
    currencyCode: 'BRL',
    amount: -50 - idx,
    date: '2026-11-15T12:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    accountId: 'acc-checking-1',
    createdAt: '2026-11-15T12:00:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
  }));

export const makePluggyBills = (): PluggyBill[] => [
  {
    id: 'bill-2026-11',
    dueDate: '2026-11-20T00:00:00.000Z',
    billClosingDate: '2026-11-10T00:00:00.000Z',
    totalAmount: 1890.0,
    totalAmountCurrencyCode: 'BRL',
    minimumPaymentAmount: 280.0,
    allowsInstallments: true,
  },
];

export const makePluggyInvestments = (): PluggyInvestment[] => [
  {
    id: 'inv-cdb-1',
    itemId: 'item-itau-001',
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    balance: 15000.0,
    name: 'CDB DI 100% Itaú',
    currencyCode: 'BRL',
    amountOriginal: 14000.0,
    rate: 100,
    rateType: 'CDI',
    dueDate: '2028-01-10T00:00:00.000Z',
    status: 'ACTIVE',
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
  {
    id: 'inv-stock-1',
    itemId: 'item-itau-001',
    type: 'EQUITY',
    subtype: 'STOCK',
    balance: 3800.0,
    name: 'ITUB4',
    code: 'ITUB4',
    quantity: 100,
    value: 38.0,
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
  {
    id: 'inv-fii-1',
    itemId: 'item-itau-001',
    type: 'EQUITY',
    subtype: 'REAL_ESTATE_FUND',
    balance: 2040.0,
    name: 'HGLG11',
    code: 'HGLG11',
    quantity: 12,
    value: 170.0,
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
  },
];

export const makePluggyInvestmentTransactions = (): PluggyInvestmentTransaction[] => [
  {
    id: 'inv-tx-1',
    type: 'BUY',
    movementType: 'DEBIT',
    quantity: 100,
    value: 35.0,
    amount: 3500.0,
    date: '2026-05-10T00:00:00.000Z',
    tradeDate: '2026-05-10T00:00:00.000Z',
    netAmount: 3500.0,
  },
];
