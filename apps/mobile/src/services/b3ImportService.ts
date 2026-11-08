import { ImportPlan } from '../domain/b3';

export interface B3ImportChoices {
  portfolioId?: string;
  newPortfolioName?: string;
  classOverrides?: Record<string, 'STOCK' | 'FII' | 'FIXED_INCOME' | 'CRYPTO'>;
  openingBalance?: Record<
    string,
    {
      mode: 'historical' | 'manual' | 'skip';
      price?: string;
    }
  >;
}

export interface B3ImportProgress {
  step: 'assets' | 'opening_balances' | 'transactions' | 'incomes' | 'verification';
  current: number;
  total: number;
  message: string;
}

export interface B3ImportReport {
  batchId: string;
  portfolioId: string;
  summary: {
    totalRowsRead: number;
    buysCount: number;
    sellsCount: number;
    incomesCount: number;
    ignoredCount: number;
    reviewCount: number;
  };
  imported: {
    buys: number;
    sells: number;
    incomes: number;
    openingBalances: number;
    assetsCreated: number;
  };
  duplicates: {
    buys: number;
    sells: number;
    incomes: number;
  };
  failures: Array<{
    item: any;
    reason: string;
  }>;
  verification: {
    matches: boolean;
    expectedBuys: string;
    actualBuys: string;
    expectedSells: string;
    actualSells: string;
    expectedIncomes: string;
    actualIncomes: string;
  };
}

export class B3ImportService {
  async preview(
    fileBytes: Uint8Array,
    fileName: string,
    options?: { portfolioId?: string; newPortfolioName?: string }
  ): Promise<ImportPlan> {
    throw new Error('Not implemented');
  }

  async apply(
    plan: ImportPlan,
    choices: B3ImportChoices,
    onProgress?: (progress: B3ImportProgress) => void
  ): Promise<B3ImportReport> {
    throw new Error('Not implemented');
  }

  async undoLastImport(): Promise<{ undone: boolean; batchId?: string; message: string }> {
    throw new Error('Not implemented');
  }
}

export const b3ImportService = new B3ImportService();
