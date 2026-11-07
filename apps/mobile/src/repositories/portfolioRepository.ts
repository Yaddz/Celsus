import { eq, and } from 'drizzle-orm';
import { getDatabase, onDatabaseReset } from '../db/client';
import {
  portfolios,
  portfolioClassTargets,
  assets,
  transactions,
  incomeEvents,
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
  private inMemoryCache: Portfolio[] = [];

  constructor() {
    onDatabaseReset(() => {
      this.inMemoryCache = [];
    });
  }

  protected get db() {
    return getDatabase();
  }

  getPortfoliosSync(): Portfolio[] {
    return this.inMemoryCache.filter((p) => p.is_archived === 0);
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
      patrimony_goal: null,
      monthly_contribution: null,
      is_archived: 0,
      created_at: now,
      updated_at: now,
    };

    await this.db.insert(portfolios).values(newPortfolio);
    this.inMemoryCache = this.inMemoryCache.filter((p) => p.id !== id);
    this.inMemoryCache.push(newPortfolio);

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
    let list: Portfolio[];
    if (includeArchived) {
      list = await this.db.select().from(portfolios);
    } else {
      list = await this.db
        .select()
        .from(portfolios)
        .where(eq(portfolios.is_archived, 0));
    }
    for (const item of list) {
      if (!this.inMemoryCache.some((c) => c.id === item.id)) {
        this.inMemoryCache.push(item);
      }
    }
    return list;
  }

  async getAllPortfolios(): Promise<Portfolio[]> {
    return this.listPortfolios(false);
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
      patrimony_goal: string | null;
      monthly_contribution: string | null;
    }>
  ): Promise<Portfolio | null> {
    const now = new Date().toISOString();
    await this.db
      .update(portfolios)
      .set({ ...params, updated_at: now })
      .where(eq(portfolios.id, id));
    const updated = await this.getPortfolioById(id);
    if (updated) {
      this.inMemoryCache = this.inMemoryCache.map((p) => (p.id === id ? updated : p));
    }
    return updated;
  }

  /** Define a meta de patrimônio (R$) e o aporte mensal planejado da carteira. */
  async setGoal(
    id: string,
    goal: { patrimonyGoal?: string | null; monthlyContribution?: string | null }
  ): Promise<Portfolio | null> {
    const params: Partial<{ patrimony_goal: string | null; monthly_contribution: string | null }> = {};
    if (goal.patrimonyGoal !== undefined) params.patrimony_goal = goal.patrimonyGoal;
    if (goal.monthlyContribution !== undefined) params.monthly_contribution = goal.monthlyContribution;
    return this.updatePortfolio(id, params);
  }

  async getClassTargets(portfolioId: string): Promise<PortfolioClassTarget[]> {
    return this.db
      .select()
      .from(portfolioClassTargets)
      .where(eq(portfolioClassTargets.portfolio_id, portfolioId));
  }

  async setClassTargets(
    portfolioId: string,
    targets: Array<{ asset_class: string; target_percentage: number; receives_contribution?: boolean }>
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
            ...(target.receives_contribution === undefined
              ? {}
              : { receives_contribution: target.receives_contribution ? 1 : 0 }),
            updated_at: now,
          })
          .where(eq(portfolioClassTargets.id, existing[0].id));
      } else {
        await this.db.insert(portfolioClassTargets).values({
          id: generateUUID(),
          portfolio_id: portfolioId,
          asset_class: target.asset_class,
          target_percentage: target.target_percentage,
          receives_contribution: target.receives_contribution === false ? 0 : 1,
          updated_at: now,
        });
      }
    }

    return this.getClassTargets(portfolioId);
  }
  async deletePortfolio(id: string): Promise<boolean> {
    await this.db.delete(incomeEvents).where(eq(incomeEvents.portfolio_id, id));
    await this.db.delete(transactions).where(eq(transactions.portfolio_id, id));
    await this.db.delete(assets).where(eq(assets.portfolio_id, id));
    await this.db.delete(portfolioClassTargets).where(eq(portfolioClassTargets.portfolio_id, id));
    await this.db.delete(portfolios).where(eq(portfolios.id, id));
    this.inMemoryCache = this.inMemoryCache.filter((p) => p.id !== id);
    return true;
  }
}

export const portfolioRepository = new PortfolioRepository();
