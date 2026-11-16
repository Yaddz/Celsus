import { getSecureStorage, SecureStorage } from '../secureStorage';
import {
  PluggyAccount,
  PluggyAccountType,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyInvestmentType,
  PluggyItem,
  PluggyTransaction,
} from './types';

export class PluggyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluggyAuthError';
  }
}

export class PluggyConsentExpiredError extends Error {
  readonly itemId: string;
  constructor(itemId: string, message = 'Autorização do Meu Pluggy expirada. Renove a conexão no Dashboard.') {
    super(message);
    this.name = 'PluggyConsentExpiredError';
    this.itemId = itemId;
  }
}

export class PluggyRateLimitError extends Error {
  constructor(message = 'Limite de requisições da API Pluggy atingido (429).') {
    super(message);
    this.name = 'PluggyRateLimitError';
  }
}

export class PluggyNetworkError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PluggyNetworkError';
    this.status = status;
  }
}

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
}

export interface PluggyClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  storage?: SecureStorage;
  now?: () => number;
}

export interface PluggyCoverageInvestmentKind {
  type: PluggyInvestmentType;
  subtype: string | null;
  count: number;
}

export interface PluggyCoverageItemSummary {
  itemId: string;
  connectorName: string;
  status: string;
  executionStatus: string;
  consentExpiresAt: string | null;
  bankAccountsCount: number;
  creditCardsCount: number;
  billsCount: number;
  investmentsCount: number;
  investmentKinds: PluggyCoverageInvestmentKind[];
  hasB3VariableIncome: boolean;
  error?: string;
}

export interface PluggyCoverageReport {
  checkedAt: string;
  items: PluggyCoverageItemSummary[];
}

export const pluggyCredentialsService = {
  async saveCredentials(_creds: PluggyCredentials, _storage: SecureStorage = getSecureStorage()): Promise<void> {
    throw new Error('Not implemented');
  },
  async getCredentials(_storage: SecureStorage = getSecureStorage()): Promise<PluggyCredentials | null> {
    throw new Error('Not implemented');
  },
  async hasCredentials(_storage: SecureStorage = getSecureStorage()): Promise<boolean> {
    throw new Error('Not implemented');
  },
  async clearCredentials(_storage: SecureStorage = getSecureStorage()): Promise<void> {
    throw new Error('Not implemented');
  },
};

export function isConsentExpired(_item: PluggyItem, _nowMs: number = Date.now()): boolean {
  throw new Error('Not implemented');
}

export function assertItemConsentActive(_item: PluggyItem, _nowMs: number = Date.now()): void {
  throw new Error('Not implemented');
}

export class PluggyClient {
  constructor(_options: PluggyClientOptions = {}) {}

  async authenticate(_forceRefresh = false): Promise<string> {
    throw new Error('Not implemented');
  }

  async getItem(_itemId: string): Promise<PluggyItem> {
    throw new Error('Not implemented');
  }

  async listAccounts(_itemId: string, _type?: PluggyAccountType): Promise<PluggyAccount[]> {
    throw new Error('Not implemented');
  }

  async listTransactions(
    _accountId: string,
    _params?: { dateFrom?: string; dateTo?: string; createdAtFrom?: string }
  ): Promise<PluggyTransaction[]> {
    throw new Error('Not implemented');
  }

  async listBills(_accountId: string): Promise<PluggyBill[]> {
    throw new Error('Not implemented');
  }

  async listInvestments(_itemId: string, _type?: PluggyInvestmentType): Promise<PluggyInvestment[]> {
    throw new Error('Not implemented');
  }

  async listInvestmentTransactions(_investmentId: string): Promise<PluggyInvestmentTransaction[]> {
    throw new Error('Not implemented');
  }

  async inspectItemCoverage(_itemId: string): Promise<PluggyCoverageItemSummary> {
    throw new Error('Not implemented');
  }
}
