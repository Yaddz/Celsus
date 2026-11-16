import { InMemorySecureStorage } from '../../secureStorage';
import {
  assertItemConsentActive,
  PluggyAuthError,
  PluggyClient,
  PluggyConsentExpiredError,
  pluggyCredentialsService,
  PluggyNetworkError,
  PluggyRateLimitError,
} from '../pluggyClient';
import {
  FAKE_PLUGGY_CREDENTIALS,
  makePluggyAccounts,
  makePluggyBills,
  makePluggyInvestments,
  makePluggyInvestmentTransactions,
  makePluggyItem,
  makePluggyTransactions,
} from './pluggyFixtures';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('Sprint 64 — PluggyClient (Fase A)', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    storage = new InMemorySecureStorage();
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
  });

  it('S64-T01: POST /auth armazena apiKey em memória e SecureStore com validade de 2h e reutiliza antes de expirar', async () => {
    let nowMs = 1_700_000_000_000;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/auth')) {
        return jsonResponse({ apiKey: 'api-key-1' });
      }
      if (url.includes('/items/')) {
        return jsonResponse(makePluggyItem());
      }
      return jsonResponse({});
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      now: () => nowMs,
      baseDelayMs: 1,
    });

    await client.getItem('item-itau-001');
    await client.getItem('item-itau-001');

    const authCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth'));
    expect(authCalls).toHaveLength(1);
    expect(await storage.getItem('pluggy.api_key')).toBe('api-key-1');

    // Novo cliente com o mesmo storage ainda reutiliza a apiKey dentro das 2h
    nowMs += 60 * 60 * 1000; // +1h
    const client2 = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      now: () => nowMs,
      baseDelayMs: 1,
    });
    await client2.getItem('item-itau-001');
    const authCallsAfter = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth'));
    expect(authCallsAfter).toHaveLength(1);
  });

  it('S64-T02: renova apiKey automaticamente em 401 e falha com PluggyAuthError se persistir', async () => {
    let authCount = 0;
    let itemAttempt = 0;
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth')) {
        authCount += 1;
        return jsonResponse({ apiKey: `api-key-${authCount}` });
      }
      if (String(url).includes('/items/item-ok')) {
        itemAttempt += 1;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (itemAttempt === 1 && headers['X-API-KEY'] === 'api-key-1') {
          return jsonResponse({ message: 'Unauthorized' }, 401);
        }
        return jsonResponse(makePluggyItem({ id: 'item-ok' }));
      }
      return jsonResponse({ message: 'Unauthorized' }, 401);
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      baseDelayMs: 1,
    });

    const item = await client.getItem('item-ok');
    expect(item.id).toBe('item-ok');
    expect(authCount).toBe(2);

    await expect(client.getItem('item-always-401')).rejects.toThrow(PluggyAuthError);
  });

  it('S64-T03: listTransactions (/v2/transactions) percorre cursor next por 3 páginas', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/auth')) return jsonResponse({ apiKey: 'api-key-1' });
      if (u.includes('/v2/transactions')) {
        if (u.includes('after=cursor-page-2')) {
          return jsonResponse({ results: makePluggyTransactions(2, 2), next: '?accountId=acc-checking-1&after=cursor-page-3' });
        }
        if (u.includes('after=cursor-page-3')) {
          return jsonResponse({ results: makePluggyTransactions(3, 1), next: null });
        }
        return jsonResponse({ results: makePluggyTransactions(1, 2), next: '?accountId=acc-checking-1&after=cursor-page-2' });
      }
      return jsonResponse({});
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      baseDelayMs: 1,
    });

    const txs = await client.listTransactions('acc-checking-1');
    expect(txs).toHaveLength(5);
    expect(txs.map((t) => t.id)).toEqual([
      'tx-p1-1',
      'tx-p1-2',
      'tx-p2-1',
      'tx-p2-2',
      'tx-p3-1',
    ]);
  });

  it('S64-T04: aplica timeout via AbortController e lança PluggyNetworkError', async () => {
    const fetchMock = jest.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      timeoutMs: 25,
      maxRetries: 0,
      baseDelayMs: 1,
    });

    await expect(client.getItem('item-timeout')).rejects.toThrow(PluggyNetworkError);
  });

  it('S64-T05: faz retry com backoff em 429 e lança PluggyRateLimitError ao esgotar tentativas', async () => {
    let attempts = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'api-key-1' });
      attempts += 1;
      if (String(url).includes('/items/item-recover') && attempts >= 3) {
        return jsonResponse(makePluggyItem({ id: 'item-recover' }));
      }
      return jsonResponse({ message: 'Too Many Requests' }, 429, { 'retry-after': '0' });
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      maxRetries: 2,
      baseDelayMs: 1,
    });

    const item = await client.getItem('item-recover');
    expect(item.id).toBe('item-recover');
    expect(attempts).toBe(3);

    await expect(client.getItem('item-rate-limited')).rejects.toThrow(PluggyRateLimitError);
  });

  it('S64-T06: detecta consentimento expirado (USER_AUTHORIZATION_EXPIRED ou data vencida) e lança PluggyConsentExpiredError', () => {
    const expiredByStatus = makePluggyItem({
      status: 'LOGIN_ERROR',
      executionStatus: 'USER_AUTHORIZATION_EXPIRED',
      error: { code: 'USER_AUTHORIZATION_EXPIRED', message: 'Consent expired' },
    });
    expect(() => assertItemConsentActive(expiredByStatus, Date.parse('2026-11-16T00:00:00Z'))).toThrow(
      PluggyConsentExpiredError
    );

    const expiredByDate = makePluggyItem({
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      consentExpiresAt: '2026-10-01T00:00:00.000Z',
    });
    expect(() => assertItemConsentActive(expiredByDate, Date.parse('2026-11-16T00:00:00Z'))).toThrow(
      PluggyConsentExpiredError
    );
  });

  it('S64-T07: trata respostas vazias sem erro em accounts, v2/transactions, bills, investments e investmentTransactions', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth')) return jsonResponse({ apiKey: 'api-key-1' });
      if (String(url).includes('/v2/transactions')) return jsonResponse({ results: [], next: null });
      return jsonResponse({ page: 1, total: 0, totalPages: 1, results: [] });
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      baseDelayMs: 1,
    });

    expect(await client.listAccounts('item-1')).toEqual([]);
    expect(await client.listTransactions('acc-1')).toEqual([]);
    expect(await client.listBills('acc-1')).toEqual([]);
    expect(await client.listInvestments('item-1')).toEqual([]);
    expect(await client.listInvestmentTransactions('inv-1')).toEqual([]);
  });

  it('S64-T08: inspectItemCoverage contabiliza contas, cartões, faturas, investimentos e tipos/subtipos (B3)', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/auth')) return jsonResponse({ apiKey: 'api-key-1' });
      if (u.includes('/items/')) return jsonResponse(makePluggyItem());
      if (u.includes('/accounts')) return jsonResponse({ page: 1, total: 2, totalPages: 1, results: makePluggyAccounts() });
      if (u.includes('/bills')) return jsonResponse({ page: 1, total: 1, totalPages: 1, results: makePluggyBills() });
      if (u.includes('/investments/') && u.includes('/transactions')) {
        return jsonResponse({ page: 1, total: 1, totalPages: 1, results: makePluggyInvestmentTransactions() });
      }
      if (u.includes('/investments')) return jsonResponse({ page: 1, total: 3, totalPages: 1, results: makePluggyInvestments() });
      return jsonResponse({});
    });

    const client = new PluggyClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      storage,
      baseDelayMs: 1,
    });

    const summary = await client.inspectItemCoverage('item-itau-001');
    expect(summary.connectorName).toBe('Itaú');
    expect(summary.bankAccountsCount).toBe(1);
    expect(summary.creditCardsCount).toBe(1);
    expect(summary.billsCount).toBe(1);
    expect(summary.investmentsCount).toBe(3);
    expect(summary.hasB3VariableIncome).toBe(true);
    expect(summary.investmentKinds).toEqual(
      expect.arrayContaining([
        { type: 'FIXED_INCOME', subtype: 'CDB', count: 1 },
        { type: 'EQUITY', subtype: 'STOCK', count: 1 },
        { type: 'EQUITY', subtype: 'REAL_ESTATE_FUND', count: 1 },
      ])
    );
  });
});
