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
      await this.db.insert(appMeta).values({ key, value });
    } else {
      await this.db.update(appMeta).set({ value }).where(eq(appMeta.key, key));
    }
  }
}

export const appMetaRepository = new AppMetaRepository();
