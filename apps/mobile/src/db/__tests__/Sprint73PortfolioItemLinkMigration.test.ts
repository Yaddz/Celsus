import { getRawSqliteDatabase, resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { backupService } from '../../services/backupService';

describe('Sprint 73 — Migração of_item_id em portfolios e Backup (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S73-T07: portfolios possui coluna of_item_id e índice único parcial', async () => {
    const raw = getRawSqliteDatabase();
    const cols = raw.getAllSync<{ name: string }>('PRAGMA table_info(portfolios)');
    expect(cols.some((c) => c.name === 'of_item_id')).toBe(true);
  });

  it('S73-T08: backup (.celsus.zip) exporta e restaura of_item_id em portfolios', async () => {
    const p = await portfolioRepository.createPortfolio({
      name: 'XP Investimentos',
      docket_code: 'REV-CART-001',
    });
    await portfolioRepository.updatePortfolio(p.id, { of_item_id: 'item-xp-1' } as any);

    const zipBytes = await backupService.createBackupZip();
    await resetDatabase();
    await backupService.restoreFromZip(zipBytes);

    const restored = await portfolioRepository.listPortfolios(true);
    expect(restored).toHaveLength(1);
    expect(restored[0].of_item_id).toBe('item-xp-1');
  });
});
