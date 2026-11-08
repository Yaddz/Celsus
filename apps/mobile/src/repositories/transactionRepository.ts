import { eq, desc } from 'drizzle-orm';
import { getDatabase, onDatabaseReset } from '../db/client';
import { transactions, Transaction, NewTransaction } from '../db/schema';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class TransactionRepository {
  private inMemoryCache: Transaction[] = [];

  constructor() {
    onDatabaseReset(() => {
      this.inMemoryCache = [];
    });
  }

  protected get db() {
    return getDatabase();
  }

  getTransactionsByPortfolioSync(portfolioId: string): Transaction[] {
    return this.inMemoryCache
      .filter((t) => t.portfolio_id === portfolioId)
      .sort((a, b) => b.trade_date.localeCompare(a.trade_date));
  }

  async createTransaction(
    params: Omit<NewTransaction, 'id' | 'created_at'> & { id?: string }
  ): Promise<Transaction> {
    const now = new Date().toISOString();
    const id = params.id || generateUUID();

    const newTx: Transaction = {
      id,
      portfolio_id: params.portfolio_id,
      asset_id: params.asset_id,
      type: params.type,
      trade_date: params.trade_date,
      quantity: params.quantity,
      unit_price: params.unit_price,
      fees: params.fees ?? '0.00',
      total_amount: params.total_amount,
      notes: params.notes ?? null,
      source: params.source ?? 'MANUAL',
      external_id: params.external_id ?? null,
      created_at: now,
    };

    await this.db.insert(transactions).values(newTx);
    this.inMemoryCache = this.inMemoryCache.filter((t) => t.id !== id);
    this.inMemoryCache.push(newTx);
    return newTx;
  }

  async listByPortfolio(portfolioId: string): Promise<Transaction[]> {
    return this.getTransactionsByPortfolio(portfolioId);
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.db.delete(transactions).where(eq(transactions.id, id));
    this.inMemoryCache = this.inMemoryCache.filter((t) => t.id !== id);
  }

  async getTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]> {
    const list = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.portfolio_id, portfolioId))
      .orderBy(desc(transactions.trade_date));
    for (const item of list) {
      if (!this.inMemoryCache.some((c) => c.id === item.id)) {
        this.inMemoryCache.push(item);
      }
    }
    return list;
  }

  async getTransactionsByAsset(assetId: string): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.asset_id, assetId))
      .orderBy(desc(transactions.trade_date));
  }
}

export const transactionRepository = new TransactionRepository();
