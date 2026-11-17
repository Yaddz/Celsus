import { PluggyClient } from './pluggyClient';

export interface AnonymizedPluggyDiagnosticsReport {
  generatedAt: string;
  items: Array<{
    itemHash: string;
    connectorName: string;
    accounts: Array<Record<string, unknown>>;
    investments: Array<{
      type: string;
      subtype: string | null;
      code: string | null;
      isin: string | null;
      quantity: number | null;
      value: number | null;
      amount: number | null;
      balance: number;
      amountOriginal: number | null;
      rate: number | null;
      rateType: string | null;
      fixedAnnualRate: number | null;
      priceFactor: number | null;
      status: string | null;
      transactionsSummary: {
        total: number;
        byType: Record<string, number>;
        valueQtyMismatchCount: number;
        withNetAmountCount: number;
        withPriceFactorCount: number;
        withExpensesCount: number;
      };
    }>;
  }>;
}

export const pluggyDiagnosticsService = {
  async generateAnonymizedPluggyDiagnostics(_options?: {
    client?: PluggyClient;
    itemIds?: string[];
  }): Promise<AnonymizedPluggyDiagnosticsReport> {
    return { generatedAt: new Date().toISOString(), items: [] };
  },
};
