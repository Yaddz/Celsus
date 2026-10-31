import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import {
  portfolios,
  portfolioClassTargets,
  Portfolio,
  PortfolioClassTarget,
} from '../db/schema';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class PortfolioRepository {
  protected get db() {
    return getDatabase();
  }

  async createPortfolio(params: {
    name: string;
    description?: string;
    docket_code: string;
    classTargets?: Array<{ asset_class: string; target_percentage: number }>;
  }): Promise<Portfolio> {
    const now = new Date().toISOString();
    const id = generateUUID();

    const newPortfolio: Portfolio = {
      id,
      name: params.name,
      description: params.description || null,
      docket_code: params.docket_code,
      is_archived: 0,
      created_at: now,
      updated_at: now,
    };

    await this.db.insert(portfolios).values(newPortfolio);

    // Initial class targets (default to 4 classes if not specified)
    const targetsToInsert = params.classTargets || [
      { asset_class: 'FIXED_INCOME', target_percentage: 30.0 },
      { asset_class: 'FII', target_percentage: 20.0 },
      { asset_class: 'STOCK', target_percentage: 40.0 },
      { asset_class: 'CRYPTO', target_percentage: 10.0 },
    ];

    for (const ct of targetsToInsert) {
      await this.db.insert(portfolioClassTargets).values({
        id: generateUUID(),
        portfolio_id: id,
        asset_class: ct.asset_class,
        target_percentage: ct.target_percentage,
        updated_at: now,
      });
    }

    return newPortfolio;
  }

  async listPortfolios(includeArchived = false): Promise<Portfolio[]> {
    if (includeArchived) {
      return this.db.select().from(portfolios);
    }
    return this.db
      .select()
      .from(portfolios)
      .where(eq(portfolios.is_archived, 0));
  }

  async getPortfolioById(id: string): Promise<Portfolio | null> {
    const rows = await this.db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, id));
    return rows.length > 0 ? rows[0] : null;
  }

  async updatePortfolio(
    id: string,
    params: Partial<{
      name: string;
      description: string;
      docket_code: string;
      is_archived: number;
    }>
  ): Promise<Portfolio | null> {
    const now = new Date().toISOString();
    await this.db
      .update(portfolios)
      .set({ ...params, updated_at: now })
      .where(eq(portfolios.id, id));
    return this.getPortfolioById(id);
  }

  async getClassTargets(portfolioId: string): Promise<PortfolioClassTarget[]> {
    return this.db
      .select()
      .from(portfolioClassTargets)
      .where(eq(portfolioClassTargets.portfolio_id, portfolioId));
  }

  async setClassTargets(
    portfolioId: string,
    targets: Array<{ asset_class: string; target_percentage: number }>
  ): Promise<PortfolioClassTarget[]> {
    const now = new Date().toISOString();

    for (const target of targets) {
      const existing = await this.db
        .select()
        .from(portfolioClassTargets)
        .where(
          and(
            eq(portfolioClassTargets.portfolio_id, portfolioId),
            eq(portfolioClassTargets.asset_class, target.asset_class)
          )
        );

      if (existing.length > 0) {
        await this.db
          .update(portfolioClassTargets)
          .set({
            target_percentage: target.target_percentage,
            updated_at: now,
          })
          .where(eq(portfolioClassTargets.id, existing[0].id));
      } else {
        await this.db.insert(portfolioClassTargets).values({
          id: generateUUID(),
          portfolio_id: portfolioId,
          asset_class: target.asset_class,
          target_percentage: target.target_percentage,
          updated_at: now,
        });
      }
    }

    return this.getClassTargets(portfolioId);
  }
}

export const portfolioRepository = new PortfolioRepository();
