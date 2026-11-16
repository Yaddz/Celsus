import { getSecureStorage, SecureStorage } from '../secureStorage';
import {
  PluggyAccount,
  PluggyAccountType,
  PluggyAuthResponse,
  PluggyBill,
  PluggyCursorPageResponse,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyInvestmentType,
  PluggyItem,
  PluggyPageResponse,
  PluggyTransaction,
} from './types';

const PLUGGY_BASE_URL = 'https://api.pluggy.ai';
const DEFAULT_TIMEOUT_MS = 10_000;
const API_KEY_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas conforme documentação Pluggy
const API_KEY_SAFETY_MARGIN_MS = 30_000;

const KEY_CLIENT_ID = 'pluggy.client_id';
const KEY_CLIENT_SECRET = 'pluggy.client_secret';
const KEY_API_KEY = 'pluggy.api_key';
const KEY_API_KEY_EXPIRES_AT = 'pluggy.api_key_expires_at';

export class PluggyAuthError extends Error {
  constructor(message = 'Falha na autenticação com a Pluggy. Verifique seu Client ID e Client Secret.') {
    super(message);
    this.name = 'PluggyAuthError';
  }
}

export class PluggyConsentExpiredError extends Error {
  readonly itemId: string;
  constructor(
    itemId: string,
    message = 'Autorização do Meu Pluggy expirada. Renove a conexão em Applications → Demo → Connect Account → MeuPluggy.'
  ) {
    super(message);
    this.name = 'PluggyConsentExpiredError';
    this.itemId = itemId;
  }
}

export class PluggyRateLimitError extends Error {
  constructor(message = 'Limite de requisições da API Pluggy atingido (429). Tente novamente em instantes.') {
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
  async saveCredentials(
    creds: PluggyCredentials,
    storage: SecureStorage = getSecureStorage()
  ): Promise<void> {
    const clientId = creds.clientId.trim();
    const clientSecret = creds.clientSecret.trim();
    if (!clientId || !clientSecret) {
      throw new PluggyAuthError('Client ID e Client Secret são obrigatórios.');
    }
    await storage.setItem(KEY_CLIENT_ID, clientId);
    await storage.setItem(KEY_CLIENT_SECRET, clientSecret);
    // Credenciais novas invalidam qualquer apiKey anterior em cache
    await storage.deleteItem(KEY_API_KEY);
    await storage.deleteItem(KEY_API_KEY_EXPIRES_AT);
  },

  async getCredentials(
    storage: SecureStorage = getSecureStorage()
  ): Promise<PluggyCredentials | null> {
    const [clientId, clientSecret] = await Promise.all([
      storage.getItem(KEY_CLIENT_ID),
      storage.getItem(KEY_CLIENT_SECRET),
    ]);
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  },

  async hasCredentials(storage: SecureStorage = getSecureStorage()): Promise<boolean> {
    const creds = await this.getCredentials(storage);
    return creds !== null;
  },

  async clearCredentials(storage: SecureStorage = getSecureStorage()): Promise<void> {
    await Promise.all([
      storage.deleteItem(KEY_CLIENT_ID),
      storage.deleteItem(KEY_CLIENT_SECRET),
      storage.deleteItem(KEY_API_KEY),
      storage.deleteItem(KEY_API_KEY_EXPIRES_AT),
    ]);
  },
};

export function isConsentExpired(item: PluggyItem, nowMs: number = Date.now()): boolean {
  if (
    item.executionStatus === 'USER_AUTHORIZATION_EXPIRED' ||
    item.error?.code === 'USER_AUTHORIZATION_EXPIRED'
  ) {
    return true;
  }
  if (item.consentExpiresAt) {
    const expMs = Date.parse(item.consentExpiresAt);
    if (Number.isFinite(expMs) && expMs <= nowMs) {
      return true;
    }
  }
  return false;
}

export function assertItemConsentActive(item: PluggyItem, nowMs: number = Date.now()): void {
  if (isConsentExpired(item, nowMs)) {
    throw new PluggyConsentExpiredError(item.id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeErrorStatusMessage(status: number, context: string): string {
  // Nunca inclui credenciais ou payloads brutos potencialmente sensíveis
  return `${context} (HTTP ${status}).`;
}

export class PluggyClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly storage?: SecureStorage;
  private readonly now: () => number;

  private memoryApiKey: string | null = null;
  private memoryApiKeyExpiresAt = 0;

  constructor(options: PluggyClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? PLUGGY_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 300;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage;
    this.now = options.now ?? (() => Date.now());
  }

  private getStorage(): SecureStorage {
    return this.storage ?? getSecureStorage();
  }

  private async clearCachedApiKey(): Promise<void> {
    this.memoryApiKey = null;
    this.memoryApiKeyExpiresAt = 0;
    const store = this.getStorage();
    await Promise.all([
      store.deleteItem(KEY_API_KEY),
      store.deleteItem(KEY_API_KEY_EXPIRES_AT),
    ]);
  }

  async authenticate(forceRefresh = false): Promise<string> {
    const nowMs = this.now();
    if (!forceRefresh && this.memoryApiKey && this.memoryApiKeyExpiresAt - API_KEY_SAFETY_MARGIN_MS > nowMs) {
      return this.memoryApiKey;
    }

    const store = this.getStorage();
    if (!forceRefresh) {
      const [storedKey, storedExp] = await Promise.all([
        store.getItem(KEY_API_KEY),
        store.getItem(KEY_API_KEY_EXPIRES_AT),
      ]);
      const expMs = storedExp ? Number(storedExp) : 0;
      if (storedKey && Number.isFinite(expMs) && expMs - API_KEY_SAFETY_MARGIN_MS > nowMs) {
        this.memoryApiKey = storedKey;
        this.memoryApiKeyExpiresAt = expMs;
        return storedKey;
      }
    }

    const creds = await pluggyCredentialsService.getCredentials(store);
    if (!creds) {
      throw new PluggyAuthError('Credenciais da Pluggy não configuradas.');
    }

    const res = await this.fetchWithTimeout(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }),
    });

    if (res.status === 401 || res.status === 403) {
      await this.clearCachedApiKey();
      throw new PluggyAuthError('Client ID ou Client Secret inválidos na Pluggy.');
    }
    if (res.status === 429) {
      throw new PluggyRateLimitError();
    }
    if (!res.ok) {
      throw new PluggyNetworkError(sanitizeErrorStatusMessage(res.status, 'Erro ao autenticar na Pluggy'), res.status);
    }

    const data = (await res.json()) as PluggyAuthResponse;
    if (!data?.apiKey) {
      throw new PluggyAuthError('Resposta de autenticação da Pluggy sem apiKey.');
    }

    const expiresAt = this.now() + API_KEY_TTL_MS;
    this.memoryApiKey = data.apiKey;
    this.memoryApiKeyExpiresAt = expiresAt;
    await Promise.all([
      store.setItem(KEY_API_KEY, data.apiKey),
      store.setItem(KEY_API_KEY_EXPIRES_AT, String(expiresAt)),
    ]);

    return data.apiKey;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new PluggyNetworkError(`Tempo limite de ${this.timeoutMs}ms excedido ao consultar a Pluggy.`);
      }
      throw new PluggyNetworkError('Falha de rede ao conectar à API Pluggy.');
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(pathAndQuery: string, retriedAuth = false): Promise<T> {
    const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${this.baseUrl}${pathAndQuery}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const apiKey = await this.authenticate(false);
      const res = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          Accept: 'application/json',
        },
      });

      if (res.status === 401) {
        if (!retriedAuth) {
          await this.clearCachedApiKey();
          await this.authenticate(true);
          return this.request<T>(pathAndQuery, true);
        }
        throw new PluggyAuthError('Sessão Pluggy rejeitada (401) mesmo após renovação da API Key.');
      }

      if (res.status === 403) {
        throw new PluggyAuthError('Acesso negado pela Pluggy (403).');
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt < this.maxRetries) {
          const retryAfter = res.headers?.get('retry-after');
          const retryAfterMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 5000) : 0;
          const backoffMs = Math.max(retryAfterMs, this.baseDelayMs * Math.pow(2, attempt));
          if (backoffMs > 0) {
            await sleep(backoffMs);
          }
          continue;
        }
        if (res.status === 429) {
          throw new PluggyRateLimitError();
        }
        throw new PluggyNetworkError(
          sanitizeErrorStatusMessage(res.status, 'Erro no servidor da Pluggy'),
          res.status
        );
      }

      if (!res.ok) {
        throw new PluggyNetworkError(
          sanitizeErrorStatusMessage(res.status, 'Erro na requisição Pluggy'),
          res.status
        );
      }

      return (await res.json()) as T;
    }

    throw new PluggyNetworkError('Falha inesperada ao consultar a Pluggy.');
  }

  async getItem(itemId: string): Promise<PluggyItem> {
    return this.request<PluggyItem>(`/items/${encodeURIComponent(itemId)}`);
  }

  async listAccounts(itemId: string, type?: PluggyAccountType): Promise<PluggyAccount[]> {
    const params = new URLSearchParams({ itemId });
    if (type) params.set('type', type);
    const data = await this.request<PluggyPageResponse<PluggyAccount>>(`/accounts?${params.toString()}`);
    return data.results ?? [];
  }

  async listTransactions(
    accountId: string,
    params?: { dateFrom?: string; dateTo?: string; createdAtFrom?: string }
  ): Promise<PluggyTransaction[]> {
    const query = new URLSearchParams({ accountId });
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.createdAtFrom) query.set('createdAtFrom', params.createdAtFrom);

    const all: PluggyTransaction[] = [];
    const seenCursors = new Set<string>();
    let nextPath: string | null = `/v2/transactions?${query.toString()}`;

    while (nextPath) {
      const page: PluggyCursorPageResponse<PluggyTransaction> =
        await this.request<PluggyCursorPageResponse<PluggyTransaction>>(nextPath);
      if (Array.isArray(page.results) && page.results.length > 0) {
        all.push(...page.results);
      }

      const rawNext = page.next;
      if (!rawNext || seenCursors.has(rawNext)) {
        break;
      }
      seenCursors.add(rawNext);

      if (rawNext.startsWith('?')) {
        nextPath = `/v2/transactions${rawNext}`;
      } else if (rawNext.startsWith('/') || rawNext.startsWith('http')) {
        nextPath = rawNext;
      } else {
        const nextQuery = new URLSearchParams(query);
        nextQuery.set('after', rawNext);
        nextPath = `/v2/transactions?${nextQuery.toString()}`;
      }
    }

    return all;
  }

  private async paginateAll<T>(basePath: string, baseParams: Record<string, string>): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({ ...baseParams, page: String(page), pageSize: '100' });
      const res = await this.request<PluggyPageResponse<T>>(`${basePath}?${params.toString()}`);
      if (Array.isArray(res.results) && res.results.length > 0) {
        all.push(...res.results);
      }
      totalPages = typeof res.totalPages === 'number' && res.totalPages > 0 ? res.totalPages : 1;
      page += 1;
    } while (page <= totalPages);

    return all;
  }

  async listBills(accountId: string): Promise<PluggyBill[]> {
    return this.paginateAll<PluggyBill>('/bills', { accountId });
  }

  async listInvestments(itemId: string, type?: PluggyInvestmentType): Promise<PluggyInvestment[]> {
    const params: Record<string, string> = { itemId };
    if (type) params.type = type;
    return this.paginateAll<PluggyInvestment>('/investments', params);
  }

  async listInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]> {
    return this.paginateAll<PluggyInvestmentTransaction>(
      `/investments/${encodeURIComponent(investmentId)}/transactions`,
      {}
    );
  }

  async inspectItemCoverage(itemId: string): Promise<PluggyCoverageItemSummary> {
    const item = await this.getItem(itemId);
    assertItemConsentActive(item, this.now());

    const [accounts, investments] = await Promise.all([
      this.listAccounts(itemId),
      this.listInvestments(itemId),
    ]);

    const bankAccounts = accounts.filter((a) => a.type === 'BANK');
    const creditCards = accounts.filter((a) => a.type === 'CREDIT');

    let billsCount = 0;
    for (const card of creditCards) {
      const bills = await this.listBills(card.id);
      billsCount += bills.length;
    }

    const kindsMap = new Map<string, PluggyCoverageInvestmentKind>();
    for (const inv of investments) {
      const subtype = inv.subtype ?? null;
      const key = `${inv.type}::${subtype ?? ''}`;
      const prev = kindsMap.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        kindsMap.set(key, { type: inv.type, subtype, count: 1 });
      }
    }

    const hasB3VariableIncome = investments.some(
      (inv) =>
        inv.type === 'EQUITY' ||
        inv.type === 'ETF' ||
        inv.subtype === 'STOCK' ||
        inv.subtype === 'REAL_ESTATE_FUND' ||
        inv.subtype === 'BDR'
    );

    return {
      itemId: item.id,
      connectorName: item.connector?.name ?? item.id,
      status: item.status,
      executionStatus: item.executionStatus,
      consentExpiresAt: item.consentExpiresAt ?? null,
      bankAccountsCount: bankAccounts.length,
      creditCardsCount: creditCards.length,
      billsCount,
      investmentsCount: investments.length,
      investmentKinds: Array.from(kindsMap.values()),
      hasB3VariableIncome,
    };
  }
}
