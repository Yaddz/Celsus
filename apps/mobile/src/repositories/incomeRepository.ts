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

  async listAllIncomes(): Promise<IncomeEvent[]> {
    return this.listAll();
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

  async getById(id: string): Promise<IncomeEvent | null> {
    const rows = await this.db.select().from(incomeEvents).where(eq(incomeEvents.id, id));
    return rows[0] || null;
  }

  async updateIncome(
    id: string,
    updates: Partial<{
      ticker: string;
      payDate: string;
      amount: string;
      notes: string | null;
      kind: string | null;
      quantity: string | null;
      unitAmount: string | null;
      portfolioId: string;
    }>
  ): Promise<IncomeEvent> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`IncomeEvent not found: ${id}`);
    const rowUpdates: Partial<IncomeEvent> = {};
    if (updates.ticker !== undefined) rowUpdates.ticker = updates.ticker.trim().toUpperCase();
    if (updates.payDate !== undefined) rowUpdates.pay_date = updates.payDate;
    if (updates.amount !== undefined) rowUpdates.amount = updates.amount;
    if (updates.notes !== undefined) rowUpdates.notes = updates.notes;
    if (updates.kind !== undefined) rowUpdates.kind = updates.kind;
    if (updates.quantity !== undefined) rowUpdates.quantity = updates.quantity;
    if (updates.unitAmount !== undefined) rowUpdates.unit_amount = updates.unitAmount;
    if (updates.portfolioId !== undefined) rowUpdates.portfolio_id = updates.portfolioId;

    await this.db.update(incomeEvents).set(rowUpdates).where(eq(incomeEvents.id, id));
    return (await this.getById(id))!;
  }

  async listFiltered(options?: {
    portfolioIds?: string[];
    from?: string;
    to?: string;
    ticker?: string;
    kind?: string;
  }): Promise<IncomeEvent[]> {
    const all = await this.listAll();
    return all.filter((item) => {
      if (options?.portfolioIds && options.portfolioIds.length > 0) {
        if (!options.portfolioIds.includes(item.portfolio_id)) return false;
      }
      if (options?.ticker) {
        if (item.ticker.toUpperCase() !== options.ticker.trim().toUpperCase()) return false;
      }
      if (options?.kind) {
        if (item.kind !== options.kind) return false;
      }
      if (options?.from) {
        const fromDate = options.from.length === 7 ? `${options.from}-01` : options.from;
        if (item.pay_date < fromDate) return false;
      }
      if (options?.to) {
        const toDate = options.to.length === 7 ? `${options.to}-31` : options.to;
        if (item.pay_date > toDate) return false;
      }
      return true;
    });
  }
}

export const incomeRepository = new IncomeRepository();
