import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/client';
import { incomeEvents, IncomeEvent } from '../db/schema';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class IncomeRepository {
  protected get db() {
    return getDatabase();
  }

  async addIncome(params: {
    portfolioId: string;
    ticker: string;
    payDate: string;
    amount: string;
    notes?: string;
    source?: string;
    externalId?: string;
    kind?: string;
    quantity?: string;
    unitAmount?: string;
  }): Promise<IncomeEvent> {
    const row: IncomeEvent = {
      id: generateUUID(),
      portfolio_id: params.portfolioId,
      ticker: params.ticker.trim().toUpperCase(),
      pay_date: params.payDate,
      amount: params.amount,
      notes: params.notes ?? null,
      source: params.source ?? 'MANUAL',
      external_id: params.externalId ?? null,
      kind: params.kind ?? null,
      quantity: params.quantity ?? null,
      unit_amount: params.unitAmount ?? null,
      created_at: new Date().toISOString(),
    };
    await this.db.insert(incomeEvents).values(row);
    return row;
  }

  async listByPortfolio(portfolioId: string): Promise<IncomeEvent[]> {
    return this.db.select().from(incomeEvents).where(eq(incomeEvents.portfolio_id, portfolioId));
  }

  async listAll(): Promise<IncomeEvent[]> {
    return this.db.select().from(incomeEvents);
  }

  async getByExternalId(externalId: string): Promise<IncomeEvent | null> {
    const rows = await this.db.select().from(incomeEvents).where(eq(incomeEvents.external_id, externalId));
    return rows[0] || null;
  }

  async listByExternalId(externalId: string): Promise<IncomeEvent[]> {
    return this.db.select().from(incomeEvents).where(eq(incomeEvents.external_id, externalId));
  }

  async deleteIncome(id: string): Promise<void> {
    await this.db.delete(incomeEvents).where(eq(incomeEvents.id, id));
  }
}

export const incomeRepository = new IncomeRepository();
