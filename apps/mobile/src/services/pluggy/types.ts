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
  isOpenFinance?: boolean | null;
  products?: string[];
  health?: {
    status?: string | null;
    incidents?: unknown[];
  } | null;
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
  providerMessage?: string | null;
  data?: unknown;
}

export interface PluggyItemWarning {
  code?: string;
  message?: string;
  providerMessage?: string | null;
}

export interface PluggyItemProductStatus {
  isUpdated?: boolean | null;
  lastUpdatedAt?: string | null;
  warnings?: PluggyItemWarning[] | null;
}

export interface PluggyItemStatusDetail {
  accounts?: PluggyItemProductStatus | null;
  creditCards?: PluggyItemProductStatus | null;
  transactions?: PluggyItemProductStatus | null;
  investments?: PluggyItemProductStatus | null;
  investmentsTransactions?: PluggyItemProductStatus | null;
  identity?: PluggyItemProductStatus | null;
  paymentData?: PluggyItemProductStatus | null;
  loans?: PluggyItemProductStatus | null;
}

export interface PluggyItem {
  id: string;
  connector: PluggyConnector;
  status: PluggyItemStatus;
  executionStatus: PluggyExecutionStatus;
  error?: PluggyItemError | null;
  statusDetail?: PluggyItemStatusDetail | null;
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

export interface PluggyReservedBalanceAmount {
  amount: number;
  currencyCode?: string | null;
  remuneration?: unknown;
}

export interface PluggyReservedBalance {
  name?: string | null;
  identification?: string | null;
  availableAmounts?: PluggyReservedBalanceAmount[] | null;
}

export interface PluggyBankData {
  transferNumber?: string | null;
  closingBalance?: number | null;
  automaticallyInvestedBalance?: number | null;
  overdraftContractedLimit?: number | null;
  overdraftUsedLimit?: number | null;
  unarrangedOverdraftAmount?: number | null;
  hasReservedBalance?: boolean | null;
  reservedBalances?: PluggyReservedBalance[] | null;
}

export interface PluggyDisaggregatedCreditLimit {
  creditLineLimitType?: string | null;
  consolidationType?: string | null;
  lineName?: string | null;
  usedAmount?: number | null;
  limitAmount?: number | null;
  availableAmount?: number | null;
  isLimitFlexible?: boolean | null;
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
  isLimitFlexible?: boolean | null;
  status?: string | null;
  holderType?: 'MAIN' | 'ADDITIONAL' | (string & {}) | null;
  additionalCards?: Array<{ number?: string | null }> | null;
  disaggregatedCreditLimits?: PluggyDisaggregatedCreditLimit[] | null;
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

export type PluggyPaymentType =
  | 'SINGLE'
  | 'INSTALLMENT'
  | 'A_VISTA'
  | 'A_PRAZO'
  | (string & {});

export interface PluggyCreditCardMetadata {
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  totalAmount?: number | null;
  purchaseDate?: string | null;
  payeeMCC?: number | null;
  cardNumber?: string | null;
  billId?: string | null;
  billForecastDate?: string | null;
  billPostDate?: string | null;
  paymentType?: PluggyPaymentType | null;
  transactionDateTime?: string | null;
  feeType?: string | null;
  feeTypeAdditionalInfo?: string | null;
  otherCreditsType?: string | null;
  otherCreditsAdditionalInfo?: string | null;
}

export interface PluggyPaymentParty {
  name?: string | null;
  branchNumber?: string | null;
  accountNumber?: string | null;
  routingNumber?: string | null;
  routingNumberISPB?: string | null;
  documentNumber?: {
    type?: 'CPF' | 'CNPJ' | (string & {}) | null;
    value?: string | null;
  } | null;
}

export interface PluggyBoletoMetadata {
  digitableLine?: string | null;
  barcode?: string | null;
  baseAmount?: number | null;
  interestAmount?: number | null;
  penaltyAmount?: number | null;
  discountAmount?: number | null;
}

export interface PluggyPaymentData {
  payer?: PluggyPaymentParty | null;
  receiver?: PluggyPaymentParty | null;
  paymentMethod?: 'PIX' | 'TED' | 'DOC' | 'TEV' | 'BOLETO' | (string & {}) | null;
  referenceNumber?: string | null;
  receiverReferenceId?: string | null;
  authenticationCode?: string | null;
  reason?: string | null;
  boletoMetadata?: PluggyBoletoMetadata | null;
}

export interface PluggyMerchant {
  name?: string | null;
  businessName?: string | null;
  cnpj?: string | null;
  cnae?: string | null;
  category?: string | null;
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
  paymentData?: PluggyPaymentData | null;
  merchant?: PluggyMerchant | null;
  operationType?: string | null;
  operationTypeAdditionalInfo?: string | null;
  providerId?: string | null;
  accountId: string;
  order?: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PluggyBillFinanceChargeType =
  | 'LATE_PAYMENT_REMUNERATIVE_INTEREST'
  | 'LATE_PAYMENT_FEE'
  | 'LATE_PAYMENT_INTEREST'
  | 'IOF'
  | 'OTHER'
  | (string & {});

export interface PluggyBillFinanceCharge {
  id?: string | null;
  type: PluggyBillFinanceChargeType;
  amount: number;
  currencyCode?: string | null;
  additionalInfo?: string | null;
}

export interface PluggyBillPayment {
  id?: string | null;
  valueType?: 'FULL_PAYMENT' | 'INSTALLMENT_PAYMENT' | 'OTHER_PAYMENT' | (string & {}) | null;
  paymentDate: string;
  paymentMode?: 'DEBIT_ACCOUNT' | 'BANK_SLIP' | 'PAYROLL_DEDUCTION' | 'PIX' | (string & {}) | null;
  amount: number;
  currencyCode?: string | null;
}

export interface PluggyBill {
  id: string;
  dueDate: string;
  billClosingDate?: string | null;
  totalAmount: number;
  totalAmountCurrencyCode: string;
  minimumPaymentAmount?: number | null;
  allowsInstallments?: boolean | null;
  financeCharges?: PluggyBillFinanceCharge[];
  payments?: PluggyBillPayment[];
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

export interface PluggyInvestmentInstitution {
  name: string;
  number?: string | null;
}

export interface PluggyInvestmentMetadata {
  taxRegime?: string | null;
  proposalNumber?: string | null;
  processNumber?: string | null;
  fundName?: string | null;
  insurer?: { name?: string | null; cnpj?: string | null } | null;
  anbimaCategory?: string | null;
  anbimaClass?: string | null;
  anbimaSubclass?: string | null;
  anbimaCode?: string | null;
  [key: string]: unknown;
}

export interface PluggyInvestment {
  id: string;
  itemId: string;
  type: PluggyInvestmentType;
  subtype?: PluggyInvestmentSubtype | null;
  number?: string | null;
  balance: number;
  name: string;
  institution?: PluggyInvestmentInstitution | null;
  metadata?: PluggyInvestmentMetadata | null;
  gracePeriodDate?: string | null;
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
  ratePeriodicity?: string | null;
  indexerAdditionalInfo?: string | null;
  couponPayment?: unknown | null;
  priceFactor?: number | null;
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

export interface PluggyInvestmentTransactionExpenses {
  serviceTax?: number | null;
  brokerageFee?: number | null;
  incomeTax?: number | null;
  tradingAssetsNoticeFee?: number | null;
  maintenanceFee?: number | null;
  settlementFee?: number | null;
  clearingFee?: number | null;
  stockExchangeFee?: number | null;
  custodyFee?: number | null;
  operatingFee?: number | null;
  registryFee?: number | null;
  exchangeFee?: number | null;
  iof?: number | null;
  iofProvision?: number | null;
  other?: number | null;
}

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
  expenses?: PluggyInvestmentTransactionExpenses | null;
}
