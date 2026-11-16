/**
 * Tipos das respostas da API Pluggy (https://api.pluggy.ai),
 * derivados da especificação OpenAPI 3.1.0 oficial (/openapi/pluggy-api.json).
 */

export interface PluggyAuthResponse {
  apiKey: string;
}

export interface PluggyConnector {
  id: number;
  name: string;
  institutionUrl?: string;
  imageUrl?: string;
  primaryColor?: string;
  type?: string;
  country?: string;
  hasMFA?: boolean;
  products?: string[];
}

export type PluggyItemStatus =
  | 'UPDATED'
  | 'UPDATING'
  | 'WAITING_USER_INPUT'
  | 'WAITING_USER_ACTION'
  | 'MERGING'
  | 'LOGIN_ERROR'
  | 'OUTDATED'
  | 'ERROR'
  | (string & {});

export type PluggyExecutionStatus =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'LOGIN_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'USER_AUTHORIZATION_EXPIRED'
  | 'ERROR'
  | (string & {});

export interface PluggyItemError {
  code?: string;
  message?: string;
  providerMessage?: string;
}

export interface PluggyItem {
  id: string;
  connector: PluggyConnector;
  status: PluggyItemStatus;
  executionStatus: PluggyExecutionStatus;
  error?: PluggyItemError | null;
  webhookUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lastUpdatedAt?: string | null;
  nextAutoSyncAt?: string | null;
  consecutiveFailedLoginAttempts?: number;
  consentExpiresAt?: string | null;
  resourcesCollectedAt?: string[] | null;
  hasResourcesPendingAuthorization?: boolean | null;
  products?: string[];
}

export type PluggyAccountType = 'BANK' | 'CREDIT';

export type PluggyAccountSubtype =
  | 'SAVINGS_ACCOUNT'
  | 'CHECKING_ACCOUNT'
  | 'CREDIT_CARD';

export interface PluggyBankData {
  transferNumber?: string | null;
  closingBalance?: number | null;
  automaticallyInvestedBalance?: number | null;
}

export interface PluggyCreditData {
  level?: string | null;
  brand?: string | null;
  brandAdditionalInfo?: string | null;
  balanceCloseDate?: string | null;
  balanceDueDate?: string | null;
  availableCreditLimit?: number | null;
  balanceForeignCurrency?: number | null;
  minimumPayment?: number | null;
  creditLimit?: number | null;
  status?: string | null;
}

export interface PluggyAccount {
  id: string;
  type: PluggyAccountType;
  subtype: PluggyAccountSubtype;
  number: string;
  name: string;
  marketingName?: string | null;
  balance: number;
  itemId: string;
  taxNumber?: string | null;
  owner?: string | null;
  currencyCode: string;
  bankData?: PluggyBankData | null;
  creditData?: PluggyCreditData | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluggyPageResponse<T> {
  page: number;
  total: number;
  totalPages: number;
  results: T[];
}

export interface PluggyCursorPageResponse<T> {
  results: T[];
  next: string | null;
}

export type PluggyTransactionType = 'DEBIT' | 'CREDIT';
export type PluggyTransactionStatus = 'POSTED' | 'PENDING';

export interface PluggyCreditCardMetadata {
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  payeeMCC?: number | null;
  cardNumber?: string | null;
  billId?: string | null;
}

export interface PluggyTransaction {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  currencyCode: string;
  amount: number;
  amountInAccountCurrency?: number | null;
  date: string;
  type: PluggyTransactionType;
  balance?: number | null;
  providerCode?: string | null;
  status: PluggyTransactionStatus;
  category?: string | null;
  categoryId?: string | null;
  creditCardMetadata?: PluggyCreditCardMetadata | null;
  operationType?: string | null;
  providerId?: string | null;
  accountId: string;
  order?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  billClosingDate?: string | null;
  totalAmount: number;
  totalAmountCurrencyCode: string;
  minimumPaymentAmount?: number | null;
  allowsInstallments?: boolean | null;
  financeCharges?: unknown[];
}

export type PluggyInvestmentType =
  | 'COE'
  | 'EQUITY'
  | 'ETF'
  | 'FIXED_INCOME'
  | 'MUTUAL_FUND'
  | 'SECURITY'
  | 'OTHER';

export type PluggyInvestmentSubtype =
  | 'STRUCTURED_NOTE'
  | 'STOCK'
  | 'ETF'
  | 'REAL_ESTATE_FUND'
  | 'BDR'
  | 'DERIVATIVES'
  | 'OPTION'
  | 'TREASURY'
  | 'LCI'
  | 'LCA'
  | 'LF'
  | 'CDB'
  | 'CRI'
  | 'CRA'
  | 'CORPORATE_DEBT'
  | 'LC'
  | 'DEBENTURES'
  | 'INVESTMENT_FUND'
  | 'MULTIMARKET_FUND'
  | 'FIXED_INCOME_FUND'
  | 'STOCK_FUND'
  | 'ETF_FUND'
  | 'OFFSHORE_FUND'
  | 'FIP_FUND'
  | 'EXCHANGE_FUND'
  | 'FI_INFRA'
  | 'FI_AGRO'
  | 'RETIREMENT'
  | 'OTHER';

export interface PluggyInvestment {
  id: string;
  itemId: string;
  type: PluggyInvestmentType;
  subtype?: PluggyInvestmentSubtype | null;
  number?: string | null;
  balance: number;
  name: string;
  lastMonthRate?: number | null;
  lastTwelveMonthsRate?: number | null;
  annualRate?: number | null;
  currencyCode: string;
  code?: string | null;
  isin?: string | null;
  value?: number | null;
  quantity?: number | null;
  amount?: number | null;
  taxes?: number | null;
  taxes2?: number | null;
  date?: string | null;
  owner?: string | null;
  amountProfit?: number | null;
  amountWithdrawal?: number | null;
  amountOriginal?: number | null;
  dueDate?: string | null;
  issuer?: string | null;
  issuerCNPJ?: string | null;
  issueDate?: string | null;
  purchaseDate?: string | null;
  rate?: number | null;
  rateType?: string | null;
  fixedAnnualRate?: number | null;
  taxExempt?: boolean | null;
  status?: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL' | null;
  createdAt: string;
  updatedAt: string;
}

export type PluggyInvestmentTransactionType =
  | 'BUY'
  | 'SELL'
  | 'TAX'
  | 'TRANSFER'
  | 'INTEREST'
  | 'AMORTIZATION';

export interface PluggyInvestmentTransaction {
  id: string;
  type: PluggyInvestmentTransactionType;
  movementType?: 'CREDIT' | 'DEBIT' | null;
  quantity?: number | null;
  value?: number | null;
  amount?: number | null;
  agreedRate?: number | null;
  indexerPercentage?: number | null;
  priceFactor?: number | null;
  date: string;
  tradeDate?: string | null;
  description?: string | null;
  netAmount?: number | null;
  brokerageNumber?: string | null;
}
