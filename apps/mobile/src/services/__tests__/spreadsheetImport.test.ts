import { spreadsheetImportService, describeImportReport, AUVP_SEED_FLAG } from '../spreadsheetImportService';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { resetDatabase } from '../../db/client';
import seed from '../../data/planilhaSeed.json';

describe('Importação da planilha na carteira AUVP', () => {
  beforeEach(() => resetDatabase());

  it('cria a carteira AUVP com todos os registros da fonte e confere os totais', async () => {
    const r = await spreadsheetImportService.importSeed();
    expect(r.portfolioName).toBe('AUVP');
    expect(r.portfolio).toBe('created');
    expect(r.failures).toEqual([]);
    expect(r.assets).toEqual({ expected: 17, inserted: 17, existing: 0 });
    expect(r.trades).toEqual({ expected: 20, inserted: 20, existing: 0 });
    expect(r.incomes).toEqual({ expected: 10, inserted: 10, existing: 0 });
    expect(r.verification.matches).toBe(true);
    expect(r.verification.buyTotalInDb).toBe(r.verification.buyTotalExpected);
    expect(r.verification.incomeTotalInDb).toBe(r.verification.incomeTotalExpected);

    const p = await portfolioRepository.getPortfolioById(r.portfolioId);
    expect(p?.name).toBe('AUVP');
    expect(p?.patrimony_goal).toBe('100000');
    const assets = await assetRepository.getAssetsByPortfolio(r.portfolioId);
    expect(assets.find((a) => a.ticker === 'MXRF11')?.quantity).toBe('637');
    expect(await transactionRepository.getTransactionsByPortfolio(r.portfolioId)).toHaveLength(20);
    expect(describeImportReport(r)).toContain('Conferência: OK');
  });

  it('é idempotente: reimportar não duplica nada', async () => {
    await spreadsheetImportService.importSeed();
    const again = await spreadsheetImportService.importSeed();
    expect(again.portfolio).toBe('reused');
    expect(again.assets.inserted + again.trades.inserted + again.incomes.inserted).toBe(0);
    expect(again.trades.existing).toBe(20);
    const list = (await portfolioRepository.listPortfolios(true)).filter((p) => p.name === 'AUVP');
    expect(list).toHaveLength(1);
    expect(await incomeRepository.listByPortfolio(again.portfolioId)).toHaveLength(10);
  });

  it('reaproveita uma AUVP existente sem apagar o que já tem nela', async () => {
    const mine = await portfolioRepository.createPortfolio({ name: 'auvp', docket_code: 'X-1' });
    await assetRepository.createAsset({ portfolio_id: mine.id, ticker: 'BTC', name: 'Bitcoin', asset_class: 'CRYPTO', quantity: '1', average_price: '100' });
    const r = await spreadsheetImportService.importSeed();
    expect(r.portfolioId).toBe(mine.id);
    const assets = await assetRepository.getAssetsByPortfolio(mine.id);
    expect(assets.some((a) => a.ticker === 'BTC')).toBe(true);
    expect(assets).toHaveLength(18);
  });

  it('renomeia uma importação antiga (docket PLANILHA-V2) em vez de duplicar', async () => {
    const legacy = await portfolioRepository.createPortfolio({ name: 'Controle de investimentos', docket_code: 'PLANILHA-V2' });
    const r = await spreadsheetImportService.importSeed();
    expect(r.portfolio).toBe('renamed');
    expect(r.portfolioId).toBe(legacy.id);
  });

  it('relata falhas por lançamento sem descartar em silêncio', async () => {
    const bad = {
      ...(seed as any),
      trades: [...(seed as any).trades, { ref: 'x:1', type: 'SELL', ticker: 'MXRF11', date: '2027-01-01', quantity: 99999, unitPrice: 9, broker: 'XP' }],
    };
    const r = await spreadsheetImportService.importSeed(bad);
    expect(r.failures.length).toBeGreaterThanOrEqual(1);
    expect(r.failures[0].kind).toBe('lançamento');
    expect(r.failures[0].reason.length).toBeGreaterThan(3);
  });

  it('semente inicial roda uma vez e grava a marca', async () => {
    const first = await spreadsheetImportService.runStartupSeedOnce();
    expect(first?.verification.matches).toBe(true);
    expect(await appMetaRepository.get(AUVP_SEED_FLAG)).not.toBeNull();
    expect(await spreadsheetImportService.runStartupSeedOnce()).toBeNull();
  });
});
