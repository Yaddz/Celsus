import { unzipSync, strFromU8 } from 'fflate';
import { resetDatabase } from '../../../db/client';
import { backupService } from '../../backupService';
import { InMemorySecureStorage, setSecureStorageProvider } from '../../secureStorage';
import {
  MAX_MEU_PLUGGY_ITEMS,
  MeuPluggyItemLimitError,
  openFinanceRepository,
} from '../../../repositories/openFinanceRepository';
import {
  PluggyAuthError,
  PluggyClient,
  pluggyCredentialsService,
} from '../pluggyClient';
import { FAKE_PLUGGY_CREDENTIALS } from './pluggyFixtures';

describe('Sprint 64 — Armazenamento seguro e repositório Open Finance (Fase A)', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    await resetDatabase();
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
  });

  afterEach(() => {
    setSecureStorageProvider(null);
  });

  it('S64-T09: credenciais ficam apenas no SecureStore, nunca em erro ou no backup .celsus.zip', async () => {
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
    await storage.setItem('pluggy.api_key', 'super-secret-api-key-999');

    // Adiciona item no SQLite para garantir que o banco tenha dados de Open Finance
    await openFinanceRepository.addItem('item-itau-001');
    await openFinanceRepository.recordSyncRun({
      id: 'run-1',
      item_id: 'item-itau-001',
      started_at: '2026-11-16T10:00:00.000Z',
      finished_at: '2026-11-16T10:00:02.000Z',
      status: 'SUCCESS',
      counts_json: JSON.stringify({ accounts: 1 }),
      error: null,
    });

    // Mensagem de erro de autenticação nunca deve vazar clientId, clientSecret ou apiKey
    const client = new PluggyClient({
      storage,
      baseDelayMs: 1,
      fetchImpl: (async () => ({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({ message: 'Invalid credentials' }),
        text: async () => '{"message":"Invalid credentials"}',
      })) as unknown as typeof fetch,
    });

    let caughtMessage = '';
    try {
      await client.authenticate(true);
    } catch (err) {
      expect(err).toBeInstanceOf(PluggyAuthError);
      caughtMessage = (err as Error).message;
    }
    expect(caughtMessage).not.toContain(FAKE_PLUGGY_CREDENTIALS.clientId);
    expect(caughtMessage).not.toContain(FAKE_PLUGGY_CREDENTIALS.clientSecret);
    expect(caughtMessage).not.toContain('super-secret-api-key-999');

    // Varre todos os arquivos do backup .celsus.zip gerado
    const exported = await backupService.exportDossierArchive();
    const unzipped = unzipSync(exported.zipBytes);
    const allTexts = Object.values(unzipped)
      .map((bytes) => strFromU8(bytes))
      .join('\n');

    expect(allTexts).not.toContain(FAKE_PLUGGY_CREDENTIALS.clientId);
    expect(allTexts).not.toContain(FAKE_PLUGGY_CREDENTIALS.clientSecret);
    expect(allTexts).not.toContain('super-secret-api-key-999');
  });

  it('S64-T10: of_items e of_sync_runs persistem no SQLite e respeitam limite de 5 itens do Meu Pluggy', async () => {
    expect(MAX_MEU_PLUGGY_ITEMS).toBe(5);

    for (let i = 1; i <= 5; i += 1) {
      await openFinanceRepository.addItem(`item-${i}`);
    }

    const items = await openFinanceRepository.listItems();
    expect(items).toHaveLength(5);

    await expect(openFinanceRepository.addItem('item-6')).rejects.toThrow(MeuPluggyItemLimitError);

    await openFinanceRepository.upsertItem({
      id: 'item-1',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: '2027-06-01T00:00:00.000Z',
      last_synced_at: '2026-11-16T10:00:00.000Z',
      last_error: null,
    });

    await openFinanceRepository.recordSyncRun({
      id: 'run-item-1',
      item_id: 'item-1',
      started_at: '2026-11-16T10:00:00.000Z',
      finished_at: '2026-11-16T10:00:01.000Z',
      status: 'SUCCESS',
      counts_json: JSON.stringify({ accounts: 2, cards: 1, bills: 1, investments: 3 }),
      error: null,
    });

    const runs = await openFinanceRepository.listSyncRuns('item-1');
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('SUCCESS');

    await openFinanceRepository.removeItem('item-5');
    expect(await openFinanceRepository.listItems()).toHaveLength(4);
  });
});
