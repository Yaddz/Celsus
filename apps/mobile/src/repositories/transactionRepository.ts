import { eq, desc } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { transactions, Transaction, NewTransaction } from '../db/schema';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class TransactionRepository {
  protected get db() {
    return getDatabase();
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
    return newTx;
  }

  async getTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]> {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.portfolio_id, portfolioId))
      .orderBy(desc(transactions.trade_date));
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
