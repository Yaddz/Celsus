import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { sandboxPortfolios, sandboxPortfolioItems } from '../db/schema';
import type { PaperPortfolioItemInput, PaperRebalanceMode } from '../domain/sandbox/paperPortfolio';
import { assetRepository } from './assetRepository';
import { portfolioRepository } from './portfolioRepository';

export interface SandboxPortfolioWithItems {
  id: string;
  name: string;
  start_date: string;
  initial_cents: number;
  monthly_cents: number;
  rebalance: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    sandbox_portfolio_id: string;
    ticker: string;
    asset_class: string;
    weight: number;
    created_at: string;
  }>;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRealClass(cls: string): 'FIXED_INCOME' | 'FII' | 'STOCK' | 'CRYPTO' | 'FUNDS' {
  const up = cls.toUpperCase();
  if (up === 'FIXED_INCOME' || up === 'FII' || up === 'STOCK' || up === 'CRYPTO' || up === 'FUNDS') {
    return up;
  }
  return 'STOCK';
}

export const sandboxPortfolioRepository = {
  async listPortfolios(): Promise<SandboxPortfolioWithItems[]> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(sandboxPortfolios)
      .orderBy(desc(sandboxPortfolios.updated_at));
    const result: SandboxPortfolioWithItems[] = [];
    for (const row of rows) {
      const items = await db
        .select()
        .from(sandboxPortfolioItems)
        .where(eq(sandboxPortfolioItems.sandbox_portfolio_id, row.id));
      result.push({ ...row, items });
    }
    return result;
  },

  async getPortfolioWithItems(id: string): Promise<SandboxPortfolioWithItems | null> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(sandboxPortfolios)
      .where(eq(sandboxPortfolios.id, id));
    if (!rows[0]) return null;
    const items = await db
      .select()
      .from(sandboxPortfolioItems)
      .where(eq(sandboxPortfolioItems.sandbox_portfolio_id, id));
    return { ...rows[0], items };
  },

  async savePortfolio(input: {
    id?: string;
    name: string;
    startDate: string;
    initialCents: number;
    monthlyCents: number;
    rebalance: PaperRebalanceMode;
    items: PaperPortfolioItemInput[];
  }): Promise<SandboxPortfolioWithItems> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = input.id ?? makeId('spx');
    const existing = input.id ? await this.getPortfolioWithItems(input.id) : null;

    if (existing) {
      await db
        .update(sandboxPortfolios)
        .set({
          name: input.name.trim() || existing.name,
          start_date: input.startDate,
          initial_cents: input.initialCents,
          monthly_cents: input.monthlyCents,
          rebalance: String(input.rebalance),
          updated_at: now,
        })
        .where(eq(sandboxPortfolios.id, id));
      await db
        .delete(sandboxPortfolioItems)
        .where(eq(sandboxPortfolioItems.sandbox_portfolio_id, id));
    } else {
      await db.insert(sandboxPortfolios).values({
        id,
        name: input.name.trim() || 'Carteira fictícia',
        start_date: input.startDate,
        initial_cents: input.initialCents,
        monthly_cents: input.monthlyCents,
        rebalance: String(input.rebalance),
        created_at: now,
        updated_at: now,
      });
    }

    const insertedItems = [];
    for (const item of input.items) {
      const row = {
        id: makeId('spi'),
        sandbox_portfolio_id: id,
        ticker: item.ticker.trim().toUpperCase(),
        asset_class: item.class,
        weight: item.weight,
        created_at: now,
      };
      await db.insert(sandboxPortfolioItems).values(row);
      insertedItems.push(row);
    }

    return {
      id,
      name: input.name.trim() || existing?.name || 'Carteira fictícia',
      start_date: input.startDate,
      initial_cents: input.initialCents,
      monthly_cents: input.monthlyCents,
      rebalance: String(input.rebalance),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      items: insertedItems,
    };
  },

  async deletePortfolio(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(sandboxPortfolioItems).where(eq(sandboxPortfolioItems.sandbox_portfolio_id, id));
    await db.delete(sandboxPortfolios).where(eq(sandboxPortfolios.id, id));
  },

  async copyFromRealPortfolio(portfolioId: string): Promise<PaperPortfolioItemInput[]> {
    const assets = await assetRepository.getAssetsByPortfolio(portfolioId);
    if (!assets || assets.length === 0) return [];

    const values = assets.map((a) => {
      const qty = parseFloat(a.quantity || '0') || 0;
      const price = parseFloat(a.manual_price_override || a.average_price || '0') || 0;
      const val = a.manual_position_value ? parseFloat(a.manual_position_value) || 0 : qty * price;
      return {
        ticker: a.ticker || a.name,
        class: a.asset_class,
        value: Math.max(0, val),
      };
    });

    const total = values.reduce((acc, v) => acc + v.value, 0);
    if (total <= 0) {
      const even = Number((100 / values.length).toFixed(2));
      return values.map((v, idx) => ({
        ticker: v.ticker,
        class: v.class,
        weight: idx === values.length - 1 ? Number((100 - even * (values.length - 1)).toFixed(2)) : even,
      }));
    }

    return values.map((v) => ({
      ticker: v.ticker,
      class: v.class,
      weight: Number(((v.value / total) * 100).toFixed(2)),
    }));
  },

  async convertToRealPortfolio(input: {
    name: string;
    items: PaperPortfolioItemInput[];
  }): Promise<{ portfolioId: string }> {
    const classSums = new Map<string, number>();
    for (const it of input.items) {
      const cls = normalizeRealClass(it.class);
      classSums.set(cls, (classSums.get(cls) ?? 0) + (Number(it.weight) || 0));
    }

    const ALL_CLASSES: Array<'FIXED_INCOME' | 'FII' | 'STOCK' | 'CRYPTO' | 'FUNDS'> = [
      'FIXED_INCOME',
      'FII',
      'STOCK',
      'CRYPTO',
      'FUNDS',
    ];
    const classTargets = ALL_CLASSES.map((cls) => ({
      asset_class: cls,
      target_percentage: Number((classSums.get(cls) ?? 0).toFixed(2)),
    }));

    const portfolio = await portfolioRepository.createPortfolio({
      name: input.name.trim() || 'Carteira fictícia',
      docket_code: `SBX-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      classTargets,
    });

    for (const it of input.items) {
      const cls = normalizeRealClass(it.class);
      const clsTotal = classSums.get(cls) ?? 0;
      const targetInClass = clsTotal > 0 ? Number(((it.weight / clsTotal) * 100).toFixed(2)) : 0;
      await assetRepository.createAsset({
        portfolio_id: portfolio.id,
        ticker: it.ticker.trim().toUpperCase(),
        name: it.ticker.trim().toUpperCase(),
        asset_class: cls,
        quantity: '0',
        average_price: '0',
        target_percentage_in_class: targetInClass,
      });
    }

    return { portfolioId: portfolio.id };
  },
};
