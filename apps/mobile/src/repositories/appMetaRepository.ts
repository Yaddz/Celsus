import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { appMeta } from '../db/schema';

/** Marcas de estado do app persistidas no SQLite (chave → valor). */
export class AppMetaRepository {
  protected get db() {
    return getDatabase();
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db.select().from(appMeta).where(eq(appMeta.key, key));
    return rows.length > 0 ? rows[0].value : null;
  }

  async set(key: string, value: string): Promise<void> {
    const existing = await this.get(key);
    if (existing === null) {
      try {
        await this.db.insert(appMeta).values({ key, value });
      } catch {
        await this.db.update(appMeta).set({ value }).where(eq(appMeta.key, key));
      }
    } else {
      await this.db.update(appMeta).set({ value }).where(eq(appMeta.key, key));
    }
  }

  async getRecentSearches(): Promise<string[]> {
    const raw = await this.get('recent_searches');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async addRecentSearch(ticker: string): Promise<void> {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return;
    const current = await this.getRecentSearches();
    const updated = [clean, ...current.filter((t) => t !== clean)].slice(0, 10);
    await this.set('recent_searches', JSON.stringify(updated));
  }

  async getWatchlist(): Promise<string[]> {
    const raw = await this.get('watchlist');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async isWatchlist(ticker: string): Promise<boolean> {
    const clean = ticker.trim().toUpperCase();
    const list = await this.getWatchlist();
    return list.includes(clean);
  }

  async toggleWatchlist(ticker: string): Promise<boolean> {
    const clean = ticker.trim().toUpperCase();
    if (!clean) return false;
    const list = await this.getWatchlist();
    let next: string[];
    let isNowFavorite = false;
    if (list.includes(clean)) {
      next = list.filter((t) => t !== clean);
      isNowFavorite = false;
    } else {
      next = [clean, ...list];
      isNowFavorite = true;
    }
    await this.set('watchlist', JSON.stringify(next));
    return isNowFavorite;
  }
}

export const appMetaRepository = new AppMetaRepository();
