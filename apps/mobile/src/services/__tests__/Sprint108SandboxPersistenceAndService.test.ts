import { getDatabase, resetDatabase } from '../../db/client';
import { sandboxScenarios } from '../../db/schema';
import { sandboxRepository, type TimeMachineScenarioSpec } from '../../repositories/sandboxRepository';
import { backupService } from '../backupService';
import { SandboxService } from '../sandboxService';
import type { IMarketApiService } from '../marketApi';

describe('Sprint 108 — Persistência (sandbox_scenarios), Backup e sandboxService (R47, R48)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  // S108-T20 sandbox_scenarios: CRUD, migração e backup
  test('S108-T20: sandbox_scenarios suporta CRUD, migração no schema e backup/restore sem gravar resultado calculado', async () => {
    const db = getDatabase();
    // Garante que a tabela existe após resetDatabase (migração/schema)
    const empty = await db.select().from(sandboxScenarios);
    expect(empty).toEqual([]);

    const spec: TimeMachineScenarioSpec = {
      legs: [
        {
          ticker: 'SYNB3',
          assetClass: 'STOCK',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
        },
      ],
      options: {
        reinvestDividends: true,
        taxEnabled: true,
      },
    };

    const created = await sandboxRepository.saveScenario({
      name: 'Cenário Teste 1',
      kind: 'time_machine',
      spec,
    });
    expect(created.id).toBeTruthy();
    expect(created.kind).toBe('time_machine');
    // Resultado NÃO é gravado no spec_json
    const parsedSpec = JSON.parse(created.spec_json);
    expect(parsedSpec.legs).toHaveLength(1);
    expect(parsedSpec.total).toBeUndefined();
    expect(parsedSpec.finalValueBRL).toBeUndefined();

    // Update
    const updated = await sandboxRepository.saveScenario({
      id: created.id,
      name: 'Cenário Renomeado',
      spec: {
        ...spec,
        options: { reinvestDividends: false, taxEnabled: false },
      },
    });
    expect(updated.name).toBe('Cenário Renomeado');
    expect(JSON.parse(updated.spec_json).options.taxEnabled).toBe(false);

    // List & Get
    const list = await sandboxRepository.listScenarios('time_machine');
    expect(list).toHaveLength(1);
    const fetched = await sandboxRepository.getScenarioById(created.id);
    expect(fetched?.name).toBe('Cenário Renomeado');

    // Backup & Restore
    const backupZip = await backupService.exportBackup();
    await sandboxRepository.deleteScenario(created.id);
    expect(await sandboxRepository.listScenarios()).toHaveLength(0);

    await backupService.importBackup(backupZip);
    const restored = await sandboxRepository.listScenarios();
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(created.id);
    expect(restored[0].name).toBe('Cenário Renomeado');
  });

  test('S108-T21: sandboxService busca séries com class, USDBRL e macro, usa cache local e chama o domínio', async () => {
    const getPriceHistory = jest.fn(async (ticker: string, _range?: string, options?: { assetClass?: string }) => {
      if (ticker === 'SYNUS' && options?.assetClass === 'US_STOCK') {
        return [
          { date: '2024-01-02', close: 100, currency: 'USD' },
          { date: '2024-06-03', close: 120, currency: 'USD' },
        ];
      }
      if (ticker === 'USDBRL') {
        return [
          { date: '2024-01-02', close: 5.0, currency: 'BRL' },
          { date: '2024-06-03', close: 5.5, currency: 'BRL' },
        ];
      }
      return [];
    });

    const fetchMacroRates = jest.fn(async () => [
      { date: '2024-02-01', cdi: 0.8, ipca: 0.4 },
      { date: '2024-03-01', cdi: 0.8, ipca: 0.4 },
    ]);

    const mockMarketApi: IMarketApiService = {
      getHistoricalPrice: jest.fn().mockResolvedValue(null),
      fetchQuotes: jest.fn().mockResolvedValue([]),
      getCachedQuote: jest.fn().mockResolvedValue(null),
      saveHistoricalPrice: jest.fn().mockResolvedValue(undefined),
      searchCatalog: jest.fn().mockResolvedValue([]),
      fetchMacroRates,
      getPriceHistory,
    };

    const service = new SandboxService(mockMarketApi);
    const spec: TimeMachineScenarioSpec = {
      legs: [
        {
          ticker: 'SYNUS',
          assetClass: 'US_STOCK',
          investedBRL: 10000,
          buyDate: '2024-01-02',
          sellDate: '2024-06-03',
        },
      ],
      options: { reinvestDividends: false, taxEnabled: true },
    };

    const res1 = await service.runTimeMachine(spec);
    expect(res1.status).toBe('ok');
    expect(res1.legs[0].finalValueBRL).toBeCloseTo(13200, 2);
    expect(getPriceHistory).toHaveBeenCalledWith('SYNUS', expect.any(String), { assetClass: 'US_STOCK' });
    expect(getPriceHistory).toHaveBeenCalledWith('USDBRL', expect.any(String), expect.anything());
    expect(fetchMacroRates).toHaveBeenCalledTimes(1);

    // Segunda chamada com o mesmo cenário deve reutilizar o cache local sem chamar API de novo
    const res2 = await service.runTimeMachine(spec);
    expect(res2.status).toBe('ok');
    expect(getPriceHistory).toHaveBeenCalledTimes(2); // apenas SYNUS + USDBRL da primeira chamada
    expect(fetchMacroRates).toHaveBeenCalledTimes(1);
  });
});
