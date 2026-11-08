import fs from 'fs';
import path from 'path';
import { profileStore } from '../../stores/profileStore';
import { deriveInitials } from '../../domain/profile';
import {
  normalizeInstitutionName,
  getDistinctBrokers,
  mergeAndSortStatementRows,
  buildImportPlan,
} from '../../domain/b3';
import { readStatementFile } from '../b3/readStatementFile';
import { b3ImportService } from '../b3ImportService';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';

describe('Sprint 48: Multi-File B3 Import, Broker Separation and Profile Initials', () => {
  const p1Path = path.resolve(__dirname, '../../../../../docs/exemplos/b3-mov-p1-2025-2026.xlsx');
  const p2Path = path.resolve(__dirname, '../../../../../docs/exemplos/b3-mov-p2-2025.xlsx');
  const p3Path = path.resolve(__dirname, '../../../../../docs/exemplos/b3-mov-p3-2023-2024.xlsx');

  const p1Bytes = new Uint8Array(fs.readFileSync(p1Path));
  const p2Bytes = new Uint8Array(fs.readFileSync(p2Path));
  const p3Bytes = new Uint8Array(fs.readFileSync(p3Path));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // S48-T01: Atualização síncrona/otimista de iniciais no profileStore
  // =========================================================================
  it('S48-T01: updates profileStore initials synchronously upon setName without fallback U', async () => {
    profileStore.reset();
    expect(profileStore.getState().initials).toBe('');

    // Chamada setName atualiza o estado em memória instantaneamente
    const promise = profileStore.setName('Pedro Alvares');
    expect(profileStore.getState().name).toBe('Pedro Alvares');
    expect(profileStore.getState().initials).toBe('PA');
    await promise;

    expect(deriveInitials('Pedro Alvares')).toBe('PA');
    expect(deriveInitials('Maria')).toBe('M');
    expect(deriveInitials('')).toBe('');
  });

  // =========================================================================
  // S48-T02: Normalização de instituições e detecção de corretoras distintas
  // =========================================================================
  it('S48-T02: normalizes broker names and detects distinct institutions correctly', () => {
    expect(normalizeInstitutionName('BANCO BTG PACTUAL S/A.')).toBe('BTG Pactual');
    expect(normalizeInstitutionName('XP INVESTIMENTOS CCTVM S/A.')).toBe('XP Investimentos');
    expect(normalizeInstitutionName('XP INVESTIMENTOS CCTVM S/A')).toBe('XP Investimentos');
    expect(normalizeInstitutionName('RICO CORRETORA DE VALORES')).toBe('Rico');

    const sampleRows = [
      { instituicao: 'BANCO BTG PACTUAL S/A.', data: '28/10/2026' },
      { instituicao: 'XP INVESTIMENTOS CCTVM S/A', data: '14/11/2025' },
      { instituicao: 'BANCO BTG PACTUAL S/A.', data: '28/10/2026' },
    ];

    const distinct = getDistinctBrokers(sampleRows);
    expect(distinct).toEqual(['BTG Pactual', 'XP Investimentos']);
  });

  // =========================================================================
  // S48-T03: Mesclagem multi-arquivo e ordenação cronológica eliminando falsos déficits
  // =========================================================================
  it('S48-T03: merges multiple statement files and eliminates phantom deficits via chronological ordering', async () => {
    const rows1 = await readStatementFile(p1Bytes, 'p1.xlsx');
    const rows2 = await readStatementFile(p2Bytes, 'p2.xlsx');
    const rows3 = await readStatementFile(p3Bytes, 'p3.xlsx');

    expect(rows1.length).toBe(40);
    expect(rows2.length).toBe(18);
    expect(rows3.length).toBe(19);

    // Se arquivo 1 fosse importado isoladamente, geraria déficit artificial de 491 cotas de MXRF11
    const isolatedPlan1 = buildImportPlan({ rows: rows1 });
    expect(isolatedPlan1.openingBalances.length).toBe(1);
    expect(isolatedPlan1.openingBalances[0].ticker).toBe('MXRF11');
    expect(isolatedPlan1.openingBalances[0].missingQuantity).toBe('491');

    // Ao mesclar os 3 arquivos e ordenar cronologicamente:
    const mergedRows = mergeAndSortStatementRows([rows1, rows2, rows3]);
    expect(mergedRows.length).toBe(77);

    // Verifica que a ordenação colocou os lançamentos de 2023 antes dos de 2026
    const firstRowDate = mergedRows[0].data;
    const lastRowDate = mergedRows[mergedRows.length - 1].data;
    expect(firstRowDate).toBe('06/12/2023');
    expect(lastRowDate).toBe('28/10/2026');

    // O plano consolidado cronológico NÃO gera nenhum déficit (zero cotas fantasmas)
    const consolidatedPlan = buildImportPlan({ rows: mergedRows });
    expect(consolidatedPlan.openingBalances).toEqual([]);
    expect(consolidatedPlan.buys.length).toBe(26);
    expect(consolidatedPlan.sells.length).toBe(9);
    expect(consolidatedPlan.incomes.length).toBe(31);
  });

  // =========================================================================
  // S48-T04: Cálculo de valor e balanceamento real do patrimônio (~R$ 8.841,94)
  // =========================================================================
  it('S48-T04: calculates exact net shares and true portfolio value of R$ 8.841,94 instead of 13k', async () => {
    const rows1 = await readStatementFile(p1Bytes, 'p1.xlsx');
    const rows2 = await readStatementFile(p2Bytes, 'p2.xlsx');
    const rows3 = await readStatementFile(p3Bytes, 'p3.xlsx');

    const mergedRows = mergeAndSortStatementRows([rows1, rows2, rows3]);
    const plan = buildImportPlan({ rows: mergedRows });

    const netShares: Record<string, number> = {};
    const buysTotal: Record<string, number> = {};

    for (const b of plan.buys) {
      netShares[b.ticker] = (netShares[b.ticker] || 0) + Number(b.quantity);
      buysTotal[b.ticker] = (buysTotal[b.ticker] || 0) + Number(b.quantity) * Number(b.unitPrice);
    }
    for (const s of plan.sells) {
      netShares[s.ticker] = (netShares[s.ticker] || 0) - Number(s.quantity);
    }

    // MXRF11: 637 cotas remanescentes
    expect(netShares['MXRF11']).toBe(637);
    const avgMxrf = buysTotal['MXRF11'] / plan.buys.filter(b => b.ticker === 'MXRF11').reduce((a, b) => a + Number(b.quantity), 0);
    const costMxrf = netShares['MXRF11'] * avgMxrf;
    expect(Number(costMxrf.toFixed(2))).toBe(6014.89);

    // Total consolidado de todos os ativos remanescentes
    let totalInvestedCost = 0;
    for (const [ticker, qty] of Object.entries(netShares)) {
      if (qty > 0) {
        const totalQty = plan.buys.filter(b => b.ticker === ticker).reduce((a, b) => a + Number(b.quantity), 0);
        const avg = (buysTotal[ticker] || 0) / totalQty;
        totalInvestedCost += qty * avg;
      }
    }

    // Bate exatamente R$ 8.841,94
    expect(Number(totalInvestedCost.toFixed(2))).toBe(8841.94);
  });

  // =========================================================================
  // S48-T05: Separação de carteiras por corretora (splitByBroker: true)
  // =========================================================================
  it('S48-T05: imports into separate portfolios per broker when splitByBroker is true', async () => {
    const rows1 = await readStatementFile(p1Bytes, 'p1.xlsx');
    const rows2 = await readStatementFile(p2Bytes, 'p2.xlsx');
    const rows3 = await readStatementFile(p3Bytes, 'p3.xlsx');

    const mergedRows = mergeAndSortStatementRows([rows1, rows2, rows3]);
    const plan = buildImportPlan({ rows: mergedRows });

    const report = await b3ImportService.apply(plan, {
      splitByBroker: true,
    });

    expect(report.summary.totalTransactionsImported).toBe(35); // 26 compras + 9 vendas
    expect(report.summary.totalIncomesImported).toBe(31);

    // Valida que foram criadas ou mapeadas as duas carteiras: "BTG Pactual" e "XP Investimentos"
    const allPorts = await portfolioRepository.listPortfolios(false);
    const btgPort = allPorts.find(p => p.name.includes('BTG Pactual'));
    const xpPort = allPorts.find(p => p.name.includes('XP Investimentos'));

    expect(btgPort).toBeDefined();
    expect(xpPort).toBeDefined();

    if (btgPort && xpPort) {
      const btgAssets = await assetRepository.listByPortfolio(btgPort.id);
      const xpAssets = await assetRepository.listByPortfolio(xpPort.id);

      // BTG Pactual possui os 15 ativos comprados em 28/10/2026
      expect(btgAssets.length).toBe(15);

      // XP Investimentos possui MXRF11 (e MXRF12 histórico zerado)
      expect(xpAssets.some(a => a.ticker === 'MXRF11')).toBe(true);

      const btgTxs = await transactionRepository.listByPortfolio(btgPort.id);
      expect(btgTxs.length).toBe(15);
    }
  });
});
