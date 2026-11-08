import { eq, and } from 'drizzle-orm';
import { getDatabase, onDatabaseReset } from '../db/client';
import { assets, Asset, NewAsset } from '../db/schema';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AssetRepository {
  private inMemoryCache: Asset[] = [];

  constructor() {
    onDatabaseReset(() => {
      this.inMemoryCache = [];
    });
  }

  protected get db() {
    return getDatabase();
  }

  getAssetsByPortfolioSync(portfolioId: string): Asset[] {
    return this.inMemoryCache.filter((a) => a.portfolio_id === portfolioId);
  }

  async createAsset(
    params: Omit<NewAsset, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<Asset> {
    const now = new Date().toISOString();
    const id = params.id || generateUUID();

    const newAsset: Asset = {
      id,
      portfolio_id: params.portfolio_id,
      asset_class: params.asset_class,
      ticker: params.ticker.toUpperCase(),
      name: params.name,
      target_percentage_in_class: params.target_percentage_in_class ?? 0.0,
      quantity: params.quantity ?? '0',
      average_price: params.average_price ?? '0.00',
      manual_price_override: params.manual_price_override ?? null,
      rf_indexer: params.rf_indexer ?? null,
      rf_rate: params.rf_rate ?? null,
      rf_maturity_date: params.rf_maturity_date ?? null,
      rf_is_tax_exempt: params.rf_is_tax_exempt ?? 0,
      source: params.source ?? 'MANUAL',
      external_id: params.external_id ?? null,
      institution_id: params.institution_id ?? null,
      last_synced_at: params.last_synced_at ?? null,
      created_at: now,
      updated_at: now,
    };

    await this.db.insert(assets).values(newAsset);
    this.inMemoryCache = this.inMemoryCache.filter((a) => a.id !== id);
    this.inMemoryCache.push(newAsset);
    return newAsset;
  }

  async listByPortfolio(portfolioId: string): Promise<Asset[]> {
    return this.getAssetsByPortfolio(portfolioId);
  }

  async addAsset(
    params: Omit<NewAsset, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<Asset> {
    return this.createAsset(params);
  }

  async getAssetsByPortfolio(portfolioId: string): Promise<Asset[]> {
    const list = await this.db
      .select()
      .from(assets)
      .where(eq(assets.portfolio_id, portfolioId));
    for (const item of list) {
      if (!this.inMemoryCache.some((c) => c.id === item.id)) {
        this.inMemoryCache.push(item);
      }
    }
    return list;
  }

  async getAssetsByClass(
    portfolioId: string,
    assetClass: string
  ): Promise<Asset[]> {
    return this.db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.portfolio_id, portfolioId),
          eq(assets.asset_class, assetClass)
        )
      );
  }

  async getAssetById(id: string): Promise<Asset | null> {
    const rows = await this.db.select().from(assets).where(eq(assets.id, id));
    return rows.length > 0 ? rows[0] : null;
  }

  async updateAsset(
    id: string,
    params: Partial<Omit<NewAsset, 'id' | 'created_at'>>
  ): Promise<Asset | null> {
    const now = new Date().toISOString();
    await this.db
      .update(assets)
      .set({ ...params, updated_at: now })
      .where(eq(assets.id, id));
    const updated = await this.getAssetById(id);
    if (updated) {
      this.inMemoryCache = this.inMemoryCache.map((a) => (a.id === id ? updated : a));
    }
    return updated;
  }

  async updateAssetTargetInClass(
    id: string,
    targetPercentageInClass: number
  ): Promise<Asset | null> {
    return this.updateAsset(id, {
      target_percentage_in_class: targetPercentageInClass,
    });
  }

  async deleteAsset(id: string): Promise<boolean> {
    await this.db.delete(assets).where(eq(assets.id, id));
    this.inMemoryCache = this.inMemoryCache.filter((a) => a.id !== id);
    return true;
  }
}

export const assetRepository = new AssetRepository();
